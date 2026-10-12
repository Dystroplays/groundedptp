# Grounded Portal

Patient portal and staff console built from the supplied PRD and HTML reference. React, TypeScript, Vite, React Router, Convex, and Convex Auth; static frontend hosting. The approved implementation plan overrides the PRD where membership timing and installment arithmetic differ.

## Run locally

Requires Node 22.12+ and npm.

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. With no `VITE_CONVEX_URL`, the app runs an explicitly labelled sample experience. Its data stays in React memory and resets on refresh. Switch between patient stages and the team console using the preview bar. Linda's record is editable; other sample names illustrate the team queue. Payments and real email delivery are unavailable in this mode.

Patient navigation: Today, Progress, Messages, More (Your plan, Payments, Refer a friend). Staff navigation: Dashboard, Patients, Evaluations, Admin. Admin includes content (including condition templates), clinic settings, staff access, integration errors, release gates, and metrics.

**Plan of care proposals ([Addendum 1](Addendum%201.md)).** On a patient's *Plan & payments* tab, the PT opens the **Proposal builder** (`/team/patients/:id/proposal`), picks a condition template, edits it, and presses **Produce**. The closer opens **Present on tablet** (`/team/patients/:id/present`), walks through sections 1–6, gets a yes, and holds **Show investment** for one second to reveal price. Price fields never leave the server before that reveal. The closer can accept and pay on the tablet, text a payment link, mark the proposal declined, or send it to the patient's portal (*More → Your plan*). After payment, the PT signs it; later changes are saved as signed versions with a dated note. In the sample, Accept and pay stops at the payments-unavailable message.

## Connect a development backend

1. Create separate Convex development, staging, and production deployments. Use fake records in development/staging. Run `npm run backend:dev` to select the development project, generate authoritative Convex bindings, and deploy the schema/functions. The checked-in `_generated` files are local bootstrap bindings, not evidence of a cloud deployment.
2. Complete [Convex Auth setup](https://labs.convex.dev/auth/setup/manual). Set backend `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`. Convex supplies `CONVEX_SITE_URL`. Preserve this project's custom Paubox provider and callbacks if using the Auth initialization utility. Auth is pinned to **0.0.96**; the [official documentation identifies it as beta](https://docs.convex.dev/auth/convex-auth).
3. Copy `.env.example` to `.env.local`. The only frontend value is `VITE_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud`. Set every other secret/configuration value in the **Convex deployment environment**, not Vite or a public hosting variable. Restart Vite after changing the URL.
4. Before seeding staff, invoke internal `admin:bootstrap` from the Convex dashboard with your test inbox and name. This creates the first admin and refuses a second bootstrap. Then run `npx convex run seed:sample` for fake content/patients, or create test records through intake. `.test` sample inboxes do not receive email. The seed refuses deployments with real data enabled.
5. Configure Paubox and request a sign-in link. Tokens are carried in the URL fragment, cleared from the address bar, and exchanged only after the user presses Continue. Unknown inboxes receive the same UI response and cannot create patient records.
6. Configure Stripe test mode, GHL staging workflows, captioned Mux playback IDs, clinic details and content. See [integration contracts](docs/INTEGRATIONS.md). Re-run the staging acceptance gates before enabling any production flag.

No hosted Convex project, provider credentials, domain, or production deployment has been configured by this implementation. Local tests use Convex's test harness and fake browser data; they do not certify provider integration.

## Verify

```powershell
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Vitest covers money, Central time, rule evaluation, access boundaries, session expiry/revocation, magic-link expiry/reuse/cross-device exchange, chart integrity, program version pinning, save closure, webhook deduplication and stale invoice failures. PDF generation is also exercised. Playwright covers patient sessions, quiz gates, messaging, signed notes/addenda, responsive overflow, and selected axe accessibility checks at desktop and mobile sizes. These checks do not replace manual assistive-technology testing or vendor sandbox rehearsals.

CI runs the same build and tests in `.github/workflows/check.yml`. Screenshots and traces are ignored build artifacts under `test-results/`.

## Deploy

Use Vercel's Vite preset with `npm run build`, output `dist`, and only the environment-specific `VITE_CONVEX_URL`. `vercel.json` provides SPA routing and security headers. Deploy Convex separately with `npm run backend:deploy`. Do not put secrets or patient content in frontend environment variables, URLs, telemetry, fixtures, or static assets.

Server flags start closed: `ALLOW_REAL_PATIENTS`, `ENABLE_CARE`, `ENABLE_RETENTION`. Flags are operational controls, not a claim that legal or clinical approval has occurred. The [release checklist](docs/RELEASE.md) defines the required evidence for each gate. No care is sold until the care gate is enabled.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/ui.tsx`, `src/team.tsx` | Patient journeys, team dashboard and patient detail |
| `src/catalog.tsx`, `src/settings-ui.tsx`, `src/operations-ui.tsx` | Content/settings administration and staff workflows |
| `src/store.tsx`, `src/sample.ts` | Explicitly separate live Convex and in-memory sample modes |
| `src/domain.ts` | Shared money, date, adherence, permission and status rules |
| `convex/schema.ts`, `convex/access.ts`, `convex/auth.ts` | Data model, access checks, audit helpers, authentication |
| `convex/portal.ts`, `convex/operations.ts`, `convex/admin.ts` | Authenticated application operations |
| `convex/http.ts`, `convex/webhooks.ts`, `convex/jobs.ts`, `convex/integrations.ts` | Verified inbound events, durable outbox and provider adapters |
| `convex/payments.ts`, `convex/retention.ts` | Checkout, credit ledger and membership activation |
| `convex/documents.ts`, `convex/pdf.ts` | Audited exports and authenticated downloads |
| `src/proposal.ts`, `src/proposal-ui.tsx`, `convex/proposals.ts` | Addendum 1 plan of care proposals: templates, validation, price gate, builder, presentation, Your plan |
| `convex/engine.ts`, `convex/crons.ts` | Event-driven and 15-minute workflow evaluation |
| `docs/REQUIREMENTS.md` | PRD requirement-to-implementation/test checklist |

The PWA caches only versioned static `/assets/` requests. It does not cache API responses, documents, patient records, or an offline portal shell. Session tokens are managed by Convex Auth; local device security still matters. The icon is provisional until the final Planted G artwork is supplied.
