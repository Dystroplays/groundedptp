# Handoff: PRD v1 + Addendum 1 completion build

## Current result

The proposal/payment/chart gap build and the remaining local v1 behavior are implemented. Convex staging is deployed and seeded with synthetic data. The frontend is built and fully tested locally, but the existing Vercel CLI session must be reauthenticated before this build can replace the currently hosted frontend. Connected Stripe, GHL, Paubox, and Mux rehearsals remain provider gates.

## Material changes after the prior Claude handoff

- Restricted presentation sessions are bound to one patient and one auth session. Locked presentation clients cannot query the staff dashboard, admin data, chart, proposal builder, or another patient. Exit signs out and requires staff authentication.
- A versioned payment agreement is now authoritative for the investment screen, portal, Checkout, webhooks, schedules, and PDFs. It stores the agreed care start date, offer/plan versions, actual eligible deposit allocations, exact charges/dates, option, approval, terms, and accepting user.
- Assigned PTs and closers can edit offer price/start date. Changes are audited and invalidate reveal, installment approval, consent, agreement, and reusable Checkout attempts. Unresolved settlement blocks edits.
- Installments require explicit closer/admin approval. The exact $4,400 example remains $2,481.50 + $1,265 + $1,265 after the $48.50 deposit; later dates use Central calendar days 28 and 49 across DST.
- Undecided proposals can be sent to the portal without a false decline. Outcomes have stable IDs, and concurrent stale offer/plan edits are rejected.
- Signed plan snapshots contain complete immutable content, authorship, signature, and financial agreement. Documents carry exact plan/version/state associations, and the patient download filters to that association.
- Clinical draft editing, visible author/addendum attribution, structured superbill services, complete exports, staff photo upload/fallback, referral-lead queue, reminder revisions, stable evaluation cohorts, diagnostics history/categories, delivered-invitation events, plan-completion events, recovered-membership events, cohort installment share, and even-count medians are implemented.
- Staging outbound delivery uses explicit email/phone allowlists. Stripe rejects live keys while the real-patient gate is closed.
- Convex generated bindings replaced the old `anyApi` placeholder and exposed/fixed hidden type assumptions.

## Verification

- `npm run check`: passes.
- `npm test`: 45 pass.
- `npm run test:e2e`: 16 pass on desktop/mobile.
- `npm run build`: passes.
- Impeccable detector: no blocking findings; four pre-existing advisory type/radius values remain documented design drift.
- Convex `posh-parrot-426`: deployed; empty before migration; tables/functions/indexes verified; auth JWKS HTTP 200; synthetic seed completed.

See `docs/REQUIREMENTS.md` for each PRD/PP row split into implemented, automatically tested, staging verified, and production approval pending. See `docs/STAGING-EVIDENCE.md` for the provider and deployment evidence still needed.

## Next commands after Vercel reauthentication

1. Link the existing `groundedptp` project without creating a new project.
2. Set `VITE_CONVEX_URL` to `https://posh-parrot-426.convex.cloud` for the staging deployment.
3. Deploy the current build and verify `/login`, `/r/<token>`, deep-link rewrites, headers, and service-worker static-only behavior.
4. Configure provider test secrets only in Convex, then execute the synthetic deposit-to-discharge script and record sanitized evidence.

Do not enable `ALLOW_REAL_PATIENTS`, use live Stripe keys, or add unrestricted recipients during staging.
