# Release evidence and open gates

This is an implementation and local verification record, **not production acceptance**. No cloud deployment, real provider transaction, BAA, legal approval, backup restoration, Safari run, or mobile-network timing benchmark has been performed. Do not infer those from a passing local build.

## Phase 1 — Foundation

- [x] React/Vite patient and staff shells, supplied design language, local fake-data mode.
- [x] Convex schema, role/scope checks, audited clinical reads and staff writes, admin provisioning, settings, seed and CI source.
- [x] Local tests for patient isolation, unassigned PT/closer chart denial, staff expiry, revoked sessions, link expiry and reuse, cross-device token exchange, generic unknown-email responses and resend preservation.
- [x] Deploy the isolated Convex staging backend to `posh-parrot-426`, inspect the empty database first, regenerate bindings, resolve generated-type failures, configure staging auth keys, and seed synthetic data.
- [ ] Reauthenticate the Vercel CLI, link `groundedptp`, set `VITE_CONVEX_URL=https://posh-parrot-426.convex.cloud`, and deploy this frontend build.
- [ ] Provision actual test inboxes for each role; exercise combined roles, individual device revocation and staff deactivation on the hosted app.
- [ ] Configure hosted operational alerts, backup schedule and access-controlled support procedures.

## Phase 2 — Pre-visit and charting

- [x] Durable deposit/GHL event handlers, invites, sequential education and server quiz grading, rescheduling, short-notice follow-up, reminders, status saves.
- [x] SOAP note types, signing/locking, attributed addenda, separate summaries, referral field/warning, chart export and authenticated download.
- [ ] Run deposit → appointment → invitation → cross-device login → three videos/quizzes → evaluation with actual Stripe test mode, GHL sandbox and Paubox delivery.
- [ ] Replay duplicate/stale appointment and deposit events; cancel an appointment and verify cancelled reminders stay cancelled.
- [ ] Verify Mux duration/captions, ten-second progress, recovery after disconnect, forward seek blocking, real phone startup speed.
- [ ] Clinical owner reviews export completeness, billing-code workflow, author/date attribution and signed-note/addendum behavior, including simultaneous signing attempts.
- [ ] Provide final clinic contact details, approved content, staff photos, final install icon and consent copy.
- [ ] Counsel approves vendor/data flows, retention policy and physician-referral thresholds; execute required vendor agreements. These settings intentionally have no presumed legal default.
- [ ] Configure daily backups and restore a copy to an isolated deployment. Compare note/addendum, file, ledger and audit counts plus record digests; verify role restrictions still hold; record evidence and destroy only the approved test copy afterward.

Enable `ALLOW_REAL_PATIENTS` only after the gate is approved. The manual-intake mutation also uses this gate. To rehearse manual intake in staging, enable it temporarily only in that isolated fake-data deployment; disable it after the rehearsal. Do not add actual patients to staging.

## Phase 3 — Evaluation and active care

- [x] Goal/baseline entry, plan templates, PT signatures, acceptance and schedule terms, Checkout/installment adapters, program versions, sessions, adherence, summaries, messaging and payment recovery links.
- [x] Local tests conserve exact cents, keep a started session on its original version, protect signed notes, and prevent a stale invoice failure from reverting a paid installment.
- [ ] Rehearse full payment and installment plans with concurrent Checkout attempts, delayed events, authentication-required/declined charges, retries after partial provider success, refunds and explicit payment reconciliation.
- [ ] Verify first-payment saved method and day-28/day-49 invoices against the exact example in INTEGRATIONS.md. Inspect receipt/plan documents.
- [ ] Pilot patients complete two weeks; staff review actual assignment-based adherence and all 11 save rules. Verify no-answer attempts, suppression until the condition clears, and recurrence.
- [ ] Keyboard/screen-reader walkthroughs and 44px target check across every screen/state. Automated axe checks cover a representative subset only. Test latest two required browser versions on real iOS/Android devices.
- [ ] Measure three-second screen usability and two-second video startup on representative mobile connections; the large Mux chunk is lazy-loaded but not a proven performance pass.

### Addendum 1 — Plan of care proposals

- [x] Condition templates, proposal builder (T4), presentation mode (T3), server-side price gate, press-and-hold reveal, investment section, decline with closer save, send to portal, Your plan (P11), versioned post-signing revisions, analytics events and metrics.
- [x] Local tests: price omitted from every client payload before reveal, transition rules, PP-10 arithmetic, closer-only reveal, tablet acceptance through the payment webhook, decline/send-to-portal, signing and revisions.
- [ ] PP-7 and PP-14 must pass staging review before any real patient sees a proposal: inspect network payloads on the tablet before reveal; confirm the signed plan in the chart and its PDF.
- [ ] Jimmy writes the first condition templates (the shipped four are placeholders). Counsel reviews template wording (PP-16).
- [x] Assigned PTs and closers can edit price. Edits are audited and invalidate reveal, approval, consent, and unpaid Checkout attempts. Installments require closer/admin approval per proposal.
- [ ] Time a returning user producing a proposal in 5 minutes or less (PP-17). Measure Produce-to-tablet latency on clinic Wi-Fi (PP-4: under 2 seconds).
- [ ] Rehearse Accept and pay on the tablet and the texted payment link with Stripe test mode and the GHL sandbox.

Enable `ENABLE_CARE` only after acceptance. No live care sales before this. Produce and acceptance are both behind this gate.

## Phase 4 — Retention and measurement

- [x] Opaque public referrals, duplicate checks, configurable disabled-by-default awards, credit ledger, enrollment terms, discharge activation job, saved-program access, review confirmation, metrics and document generation.
- [ ] Approve referral award amounts, membership price/terms, billing cancellation policy and partial-refund treatment.
- [ ] Rehearse one discharge activation despite concurrent retries; failed activation creates a follow-up without removing access. Verify first and recurring invoice credits, carrying excess forward and reversing a voided invoice exactly once.
- [ ] Test external duplicate/referral matching, same-contact race, reconciling unmatched GHL contact records, and referral source attribution in the actual account.
- [ ] Verify historical video cohorts against first evaluation time; reconcile deposits, plans, installment share and weekly event counts with provider records.
- [ ] Approve superbill layout/content with the clinic's biller. Current export lists signed visit codes and payment history; assess whether payer-specific fields or line-item allocations are required before offering it as a submission-ready superbill.

Enable `ENABLE_RETENTION` only after acceptance. Referral awards separately remain disabled in settings until approved.

## Implementation limits to resolve in staging

- Provider adapters are implemented against documented shapes but have not been exercised with actual account configurations. GHL workflows must supply the documented envelope and source timestamps; they must send the returned deposit URL themselves.
- Clinical document text is embedded in the PDF as UTF-8. The bundled DM Sans Latin font renders common English/Latin text; names or notes outside that glyph set require a broader approved font and visual review. Exact source remains attached rather than silently removed.
- Staff photo upload/display is implemented with initials as fallback. Approved final photos remain a production content input.
- The public referral route uses live Convex. The sample referral link is illustrative and cannot submit a lead.
- Complete end-to-end provider automation, signing-race tests, network-fault injection, exhaustive combined-role coverage and all browser engines remain release work. The automated suite is a foundation, not the full matrix in the approved plan.
- Authoritative Convex API bindings were regenerated on 2026-10-12. Public proposal payloads now use explicit validators; a few internal dynamic record helpers remain intentionally runtime-validated.
- External email/SMS transport is at-least-once. Do not interpret deduplicated database jobs as proof of exactly-once provider delivery. Validate provider object recovery before replaying old financial jobs, including provider pagination limits.
- The implementation scans small tables for the first-20-patient pilot. Before growth, add bounded pagination/retention of operational events and narrower aggregate queries; do not hard-delete clinical records.

Record dated reviewer names, deployment IDs, test payment/event IDs, and sanitized evidence next to every checked production gate. Keep patient content out of this repository and operational logs.
