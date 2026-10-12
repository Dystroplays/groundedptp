# PRD implementation and verification checklist

Generated from the supplied PRD and Addendum 1 IDs by `node scripts/requirements.mjs`. A source reference means code exists, not that the production acceptance line has passed. Automated tests use fake data. All external-provider and legal acceptance remains open in [RELEASE.md](RELEASE.md).

Overrides: PV-1 allows evaluations inside 24 hours with immediate due dates and one SDR follow-up, preserving sequential unlock. DC-1 enrollment opens week 4 but billing/benefits start at discharge. PY-1 applies the deposit after the 15% surcharge; per Addendum 1 (PP-10) the installment total rounds to the nearest dollar. EV-3 is replaced by the Addendum 1 proposal flow: the PT produces, the closer presents, and the PT signs after acceptance. Treatment and membership states are independent.

| PRD ID | Requirement | Phase | Implementation | Verification / remaining evidence |
| --- | --- | --- | --- | --- |
| GH-1 | Deposit link from GHL | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-2 | Contact matching | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-3 | Appointment sync, GHL to portal | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-4 | Stage moves, portal to GHL | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-5 | Status in GHL | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-6 | Texts through GHL | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-7 | Minimum data to GHL | 2 | convex/http.ts; webhooks.ts; integrations.ts | Implemented; staging acceptance pending |
| GH-8 | Reliable sync | 2 | convex/http.ts; webhooks.ts; integrations.ts | backend.test.ts: inbox/outbox deduplication; external retries pending |
| AUTH-1 | Email magic-link login for patients and staff (P1, P2) | 1 | convex/auth.ts; access.ts; src/ui.tsx | auth.test.ts: expiry, cross-device exchange and reuse |
| AUTH-2 | Same response whether or not the email is on file | 1 | convex/auth.ts; access.ts; src/ui.tsx | auth.test.ts: known/unknown response equality |
| AUTH-3 | Patient sessions last 30 days per device; staff sessions 12 hours | 1 | convex/auth.ts; access.ts; src/ui.tsx | backend.test.ts: 12-hour expiry and revocation |
| AUTH-4 | Rate limits | 1 | convex/auth.ts; access.ts; src/ui.tsx | auth.test.ts: resend preserves token; hourly quota staging rehearsal pending |
| IN-1 | A paid deposit creates the patient | 2 | convex/operations.ts; webhooks.ts; jobs.ts | Implemented; staging acceptance pending |
| IN-2 | SDR can create a patient and eval appointment by hand | 2 | convex/operations.ts; webhooks.ts; jobs.ts | Implemented; staging acceptance pending |
| IN-3 | Invite carries no clinical content | 2 | convex/operations.ts; webhooks.ts; jobs.ts | Implemented; staging acceptance pending |
| PV-1 | Booking the eval assigns the pre-visit sequence. v1 sequence: 3 videos of 5 to 8 minutes (why we're different, insurance vs. cash pay, why us) | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | domain.test.ts: compressed and short-notice dates |
| PV-2 | Videos unlock in order | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | e2e/portal.spec.ts: sequential quiz gate |
| PV-3 | Watch time is real | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | domain.test.ts: credible progress cap; Mux staging playback pending |
| PV-4 | Quiz proves understanding (P4) | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | e2e/portal.spec.ts: wrong/correct quiz answers |
| PV-5 | Rescheduling the eval moves the due dates | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | Implemented; staging acceptance pending |
| PV-6 | Appointment card (P3) | 2 | convex/webhooks.ts; portal.ts; src/ui.tsx | Implemented; staging acceptance pending |
| EV-1 | Eval-day view (T3) | 3 | src/team.tsx; proposal-ui.tsx; convex/portal.ts; proposals.ts | Implemented; staging acceptance pending |
| EV-2 | PT records the goal and baselines | 3 | src/team.tsx; proposal-ui.tsx; convex/portal.ts; proposals.ts | Implemented; staging acceptance pending |
| EV-3 | Closer builds and sends the plan of care | 3 | src/team.tsx; proposal-ui.tsx; convex/portal.ts; proposals.ts | Implemented; staging acceptance pending |
| EV-4 | PT builds the home program in the first session | 3 | src/team.tsx; proposal-ui.tsx; convex/portal.ts; proposals.ts | backend.test.ts: patient cannot publish |
| IC-1 | Today shows one next step (P5) | 3 | src/ui.tsx; convex/portal.ts; engine.ts | e2e/portal.spec.ts: Today to session |
| IC-2 | Session flow (P6) | 3 | src/ui.tsx; convex/portal.ts; engine.ts | e2e/portal.spec.ts: complete exercises, rate and message |
| IC-3 | Programs are versioned | 3 | src/ui.tsx; convex/portal.ts; engine.ts | backend.test.ts: started session remains version-pinned |
| IC-4 | Progress (P7) | 3 | src/ui.tsx; convex/portal.ts; engine.ts | domain.ts assignment denominator; staging change-week reconciliation pending |
| IC-5 | Visit summaries | 3 | src/ui.tsx; convex/portal.ts; engine.ts | Implemented; staging acceptance pending |
| MS-1 | One thread per patient (P8) | 3 | src/ui.tsx; convex/portal.ts; jobs.ts | Implemented; staging acceptance pending |
| MS-2 | Pain messages are flagged | 3 | src/ui.tsx; convex/portal.ts; jobs.ts | domain.test.ts: keyword boundaries; e2e pain message |
| MS-3 | New-message alerts | 3 | src/ui.tsx; convex/portal.ts; jobs.ts | Implemented; staging acceptance pending |
| RF-1 | Personal referral link (P9) | 4 | convex/retention.ts; payments.ts; webhooks.ts | Implemented; staging acceptance pending |
| RF-2 | Credit rules set by admin | 4 | convex/retention.ts; payments.ts; webhooks.ts | Implemented; staging acceptance pending |
| RF-3 | Credit balance | 4 | convex/retention.ts; payments.ts; webhooks.ts | backend.test.ts: capped once-only credit reservation; provider invoice tests pending |
| RF-4 | No gaming | 4 | convex/retention.ts; payments.ts; webhooks.ts | Implemented; staging acceptance pending |
| PY-1 | Stripe for deposits, plans of care, and membership | 3 | convex/payments.ts; webhooks.ts; documents.ts; integrations.ts | domain.test.ts: exact surcharge/deposit math; provider tests pending |
| PY-2 | Plan and payments (P10) | 3 | convex/payments.ts; webhooks.ts; documents.ts; integrations.ts | Implemented; staging acceptance pending |
| PY-3 | Documents | 3 | convex/payments.ts; webhooks.ts; documents.ts; integrations.ts | Implemented; staging acceptance pending |
| PY-4 | Failed payments | 3 | convex/payments.ts; webhooks.ts; documents.ts; integrations.ts | backend.test.ts: stale failure cannot undo paid installment |
| DC-1 | Membership offer from midway | 4 | convex/portal.ts; retention.ts; src/ui.tsx | Implemented; staging acceptance pending |
| DC-2 | Discharge | 4 | convex/portal.ts; retention.ts; src/ui.tsx | Implemented; staging acceptance pending |
| DC-3 | Access never ends | 4 | convex/portal.ts; retention.ts; src/ui.tsx | Implemented; staging acceptance pending |
| TM-1 | Dashboard (T1) | 1–3 | src/team.tsx; catalog.tsx; settings-ui.tsx; operations-ui.tsx | Implemented; staging acceptance pending |
| TM-2 | Patient detail (T2) | 1–3 | src/team.tsx; catalog.tsx; settings-ui.tsx; operations-ui.tsx | Implemented; staging acceptance pending |
| TM-3 | Admin | 1–3 | src/team.tsx; catalog.tsx; settings-ui.tsx; operations-ui.tsx | Implemented; staging acceptance pending |
| CH-1 | Note types | 2 | convex/portal.ts; documents.ts; src/team.tsx | Implemented; staging acceptance pending |
| CH-2 | Signing and locking | 2 | convex/portal.ts; documents.ts; src/team.tsx | backend.test.ts and e2e: locked note, audit, dated addendum |
| CH-3 | Plan of care in the chart | 2 | convex/portal.ts; documents.ts; src/team.tsx | Implemented; staging acceptance pending |
| CH-4 | Referral on file | 2 | convex/portal.ts; documents.ts; src/team.tsx | Implemented; staging acceptance pending |
| CH-5 | Retention and patient access | 2 | convex/portal.ts; documents.ts; src/team.tsx | pdf.test.ts: multi-page export/font/attachment; backend access checks; restore pending |
| CH-6 | Billing codes | 2 | convex/portal.ts; documents.ts; src/team.tsx | Implemented; staging acceptance pending |
| NT-1 | Email and text channels | 2 | convex/jobs.ts; integrations.ts; engine.ts | domain.test.ts: quiet hours and DST; transport tests pending |
| NT-2 | v1 reminders | 2 | convex/jobs.ts; integrations.ts; engine.ts | Implemented; staging acceptance pending |
| PP-1 | Condition templates | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | Admin condition-template editor; starter templates pending Jimmy and counsel |
| PP-2 | Proposal builder (T4) | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | e2e/portal.spec.ts: template pre-fill and goal carry-over |
| PP-3 | Validation before Produce | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts and e2e: missing-item list, gaps/overlaps |
| PP-4 | Produce | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: produced status; reactive tablet timing pending staging |
| PP-5 | Presentation mode (T3 update) | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | e2e/portal.spec.ts: one section per screen, no price in markup |
| PP-6 | Buy-in check | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: scopeConfirmedAt and scope_questions event |
| PP-7 | Price gate, server-enforced | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: presentation and staff/patient snapshots omit price before reveal |
| PP-8 | Show investment | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts closer-only reveal; e2e short press vs. hold |
| PP-9 | Investment section | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | e2e/portal.spec.ts: included, price, deposit credit, two options |
| PP-10 | Installment math | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: whole-dollar total, 50/25/25, deposit on first payment |
| PP-11 | Accept and pay | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: tablet acceptance and webhook; Stripe/GHL text rehearsal pending |
| PP-12 | Decline | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: reason, eval_no_poc stage, closer save |
| PP-13 | Follow-up send | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts and e2e: sent proposal visible with price |
| PP-14 | Becomes the plan of care | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: sign after acceptance, versioned revision with dated note |
| PP-15 | Portal view (P11) | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts and e2e: hidden before send/accept; PDF rendering pending staging |
| PP-16 | Wording guardrails | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | proposals.test.ts: wording guard; counsel review pending |
| PP-17 | Speed target | 3 | src/proposal.ts; proposal-ui.tsx; convex/proposals.ts | Timed session with Jimmy pending |

## Status engine

All rules are implemented in `src/domain.ts` and evaluated by `convex/engine.ts` on domain events and every 15 minutes: no_login, video_late, video_late_hard, eval_no_show, unbooked_after_buy, inactive, low_adherence, visit_missed, pain_flag, payment_failed, no_membership. Short-notice bookings add late_booking. Thresholds, business days and holidays are configurable. Backend tests cover no-answer remaining open and automatic closure. Every rule still needs staff acceptance with staged time/appointments, condition recurrence and owner assignment.

## Cross-cutting release evidence

- Patient/staff authorization, note/file restrictions, audit append-only behavior: local tests cover core paths; complete combined-role and hosted session matrix pending.
- Clinical retention: no public hard-delete endpoint; counsel-approved retention configuration and backup restoration pending.
- PWA: static assets only; final icon and installation checks on real devices pending.
- Accessibility: automated axe subset plus mobile/desktop browser journeys; manual keyboard, screen reader, captions and all target sizes pending.
- Speed: lazy Mux bundle and self-hosted fonts; representative 4G timing pending.
- Analytics: portal events, Central-calendar week grouping, and completion-before-evaluation cohorts; financial/cohort reconciliation pending.
- Deployment: CI source and static host configuration present; Convex/Vercel staging and production setup pending.
- Content/identity: current staff avatars use initials; photo integration remains open under MS-1.
