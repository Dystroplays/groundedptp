# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Grounded Portal: a mobile-first patient portal plus a responsive staff console for a single physical-therapy clinic (English, USD, America/Chicago). React 19 + TypeScript + Vite + React Router on the frontend; Convex + Convex Auth (pinned to beta `0.0.96`) on the backend. Static frontend hosting (Vercel); Convex deployed separately.

## Sources of truth (read before changing behavior)

- `Grounded Portal — PRD v1.md` — requirements, identified by IDs like `PV-2`, `EV-1`, `PY-1`.
- `Addendum 1.md` — Plan of Care Proposal (screen T4, presentation mode on T3, price hidden until buy-in). **Wins over the PRD for the plan-of-care flow.** Implemented; the old EV-3 "create → sign → send" plan builder and `planTemplates` table are gone.
- The approved implementation plan **overrides the PRD** in two places: monthly membership enrollment opens in week 4 but billing/benefits start at discharge; the 15% installment surcharge is calculated *before* the deposit is applied. Treatment and membership states are independent. PV-1 also allows evals inside 24 hours (immediate due dates, sequential unlock preserved).
- `PRODUCT.md` — scope and UX intent (out of scope: minors, proxy logins, claims, native apps, patient AI, legacy migration, Stage 8 notification cadence).
- `DESIGN.md` + `Portal Patient Screens.dc.html` — the visual identity (forest/cream/rust tokens, Sora / DM Sans / Barlow Condensed). Preserve it; no redesigns are authorized.
- `docs/REQUIREMENTS.md` — PRD ID → implementation/test map, **generated** by `node scripts/requirements.mjs` (edit the script's `groups`/`tests` maps, not the table).
- `docs/INTEGRATIONS.md`, `docs/RELEASE.md` — provider contracts and release-gate evidence.

## Commands

```bash
npm ci
npm run dev            # Vite on http://127.0.0.1:5173 (sample mode unless VITE_CONVEX_URL is set)
npm run check          # tsc --noEmit
npm test               # Vitest (tests/**/*.test.ts, edge-runtime env)
npx vitest run tests/domain.test.ts           # single file
npx vitest run tests/backend.test.ts -t "name" # single test by name
npx playwright install chromium
npm run test:e2e       # Playwright (tests/e2e), desktop + mobile projects; auto-starts dev server
npx playwright test --project=desktop -g "name"
npm run build          # tsc + vite build -> dist/
npm run backend:dev    # convex dev (regenerates convex/_generated, deploys to dev)
npm run backend:deploy
```

Requires Node 22.12+. CI (`.github/workflows/check.yml`) runs build, Vitest, then Playwright.

## Architecture

**Two runtime modes, one UI.** `src/main.tsx` picks a provider from `src/store.tsx`:
- `DemoProvider` (no `VITE_CONVEX_URL`): in-memory sample data from `src/sample.ts`, resets on refresh, with a preview bar to switch patient stages / team console. E2E tests and `scripts/audit-ui.mjs` run against this mode.
- `LiveProvider`: Convex queries/mutations/actions via `convex/_generated/api`.

Both expose the same `usePortal()` interface (`data`, `command(operation, payload)`, `adminCommand`, `checkout`, `download`, `fetchChart`, …). UI components must go through `usePortal()` rather than calling Convex directly, so new operations need both a demo implementation and a live one.

**Shared domain logic.** `src/domain.ts` (money/installments, Central-time dates, quiet hours/DST, adherence, pain keywords, role `allowed()` permissions) is imported by **both** the frontend and `convex/`. Keep it pure and runtime-agnostic.

**Backend access control.** Every authenticated Convex function goes through `convex/access.ts`: `identity(ctx)` enforces session expiry (patients 30 days, staff 12 hours, inactive staff rejected) and `scope(ctx, patientId, permission)` enforces `clinical | care | finance | admin` and patient self-access, with audit helpers for sensitive reads. The frontend never decides access rights.

**Plan of care proposals (Addendum 1).** Pure rules in `src/proposal.ts` (PP-3 `proposalGaps`, PP-10 `investment`, status `canTransition`, `redactPrice`/`patientCanSee`) are shared by `convex/proposals.ts` (`builder` and `presentation` queries, `act` mutation) and the sample store. The price gate (PP-7) is server-side: `redactPrice` strips price fields in both `proposals.presentation` and `portal.snapshot` until `priceRevealedAt`/`sentToPortalAt`/acceptance, and patients only receive `sent_to_portal`/`accepted`/`completed` plans. Do not add price data to events, snapshots, or templates sent to the tablet. Payment flips the record to `accepted` in `convex/webhooks.ts`; the accepted proposal *is* the plan of care (signed after acceptance, revised via versioned `revisions`). In the store, the builder/presentation queries only run while a page calls `watchProposal(...)`.

**Integrations are event-driven and durable.** Inbound webhooks (Stripe, GHL, Mux) hit `convex/http.ts` → verified and deduplicated in `convex/webhooks.ts`. Outbound work is written to an outbox and executed by `convex/jobs.ts` / provider adapters in `convex/integrations.ts` (Paubox email, Stripe, GHL). `convex/engine.ts` evaluates workflow rules on events and every 15 minutes (`convex/crons.ts`). Payment/credit/membership logic lives in `convex/payments.ts` and `convex/retention.ts`; PDFs via `convex/documents.ts` + `convex/pdf.ts` (font embedded in `convex/documentFont.ts`, regenerated by `scripts/embed-font.mjs`).

**Release gates.** Server-side env flags `ALLOW_REAL_PATIENTS`, `ENABLE_CARE`, `ENABLE_RETENTION` default closed; `seed:sample` refuses deployments with real data enabled. Only `VITE_CONVEX_URL` belongs in frontend env — all secrets go in the Convex deployment environment (see `.env.example`).

**Auth.** Magic links via a custom Paubox provider in `convex/auth.ts`. Tokens travel in the URL fragment and are exchanged only after the user presses Continue; unknown emails get an identical response. Preserve the custom provider/callbacks if re-running Convex Auth setup.

## Testing notes

- Backend tests use `convex-test` with `import.meta.glob("../convex/**/*.ts")`; see the `fixture()` helper in `tests/backend.test.ts` for inserting users/sessions/staff/patients.
- `convex/_generated` is checked in as local bootstrap bindings; regenerate with `npm run backend:dev` after schema/function signature changes.
- `test-results/` (screenshots, traces) is ignored output.

## Gotchas

- In sample mode, sequential store actions in one handler (e.g. save then produce) need the latest state; `DemoProvider`'s proposal handler reads from a ref for this reason. `command` still closes over render-time `data`.
- `scripts/refine*.mjs` and `scripts/finish.mjs` are one-off codemods that were already applied to the source. Don't re-run them.
- The service worker (`public/sw.js`) caches only versioned `/assets/` — never API responses, documents, or patient data. Keep it that way.
- Never put secrets or patient content in frontend env vars, URLs, telemetry, fixtures, or static assets. Sample data uses `.test` emails.
