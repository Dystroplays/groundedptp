# Staging evidence

Last updated: 2026-10-12. This is a synthetic-data staging record, not production approval.

## Connected now

- Convex deployment: `posh-parrot-426` (`https://posh-parrot-426.convex.cloud`, HTTP actions at `https://posh-parrot-426.convex.site`).
- The deployment contained no tables before the schema push. No legacy records were reset or migrated.
- Hosted schema, indexes, functions, generated API bindings, and Convex Auth signing keys are deployed. The JWKS endpoint returned HTTP 200 after key rotation.
- Synthetic seed: one patient using the approved test inbox/phone, three staff roles, three pre-visit videos/quizzes, one sequence, three exercises, four placeholder proposal templates, and disabled referral awards.
- Safety gates: `ALLOW_REAL_PATIENTS=false`; care and retention are enabled for the synthetic rehearsal; outbound email/SMS fail closed outside the approved allowlists.

## Automated evidence

- TypeScript: passing against generated Convex bindings.
- Vitest/convex-test: 45 passing.
- Playwright: 16 passing across desktop and mobile, including representative axe accessibility scans and no-horizontal-overflow checks.
- Production build: passing. Mux remains a lazy large chunk and needs real-network measurement.
- Impeccable mechanical detector: no blocking findings. It reports four existing advisory type/radius values in `details.css`; these are the same small-metadata drift already recorded in `DESIGN.md`.

## Still required for a complete connected journey

- Vercel: `https://groundedptp.vercel.app/` responds, but the saved local Vercel credential is expired. Reauthenticate, link the existing project, configure the Convex URL, and deploy this build.
- Paubox: configure endpoint/key/from address and deliver magic links to the approved test inbox.
- Stripe: refresh the expired CLI/test credential, configure a test secret and webhook signing secret, then rehearse the exact deposit and agreement amounts.
- GHL: configure the location, pipeline/stages, calendar, workflow secret, contact matching, and approved test phone.
- Mux: provide the three captioned playback IDs and verify progress, seeking, captions, and startup time.
- Add at least two approved staff test inboxes for separate PT and closer device sessions. The single approved inbox can test the patient session but cannot prove the required separate-device role journey.
- Record provider event/session IDs, screenshots/network inspection, proposal timing, backup restoration, and reviewer names without copying patient content into this repository.

Production stays disabled until the clinical-content, counsel, BAA/vendor, and real-patient pilot gates in `RELEASE.md` are approved.
