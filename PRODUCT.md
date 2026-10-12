# Grounded Portal

Build authority: `Grounded Portal — PRD v1.md`, the user's approved implementation plan, and `Portal Patient Screens.dc.html`. The plan overrides the PRD: monthly membership enrollment opens week 4 but benefits/billing start at discharge; the installment surcharge is calculated before applying the deposit. Preserve the supplied visual identity.

Adults with individual email logins use a mobile-first patient portal. PTs, SDRs, closers and admins use a responsive staff console. One clinic, English, USD, America/Chicago. No minors, proxy logins, claims processing, native apps, patient AI, legacy migration or Stage 8 notification cadence.

The patient should see one next action within three seconds: prepare for evaluation, complete today's movements, or keep the program after discharge. Calm, plain language, large controls, readable content. Staff should identify the person, the reason for a follow-up, who owns it, and the next action without reading clinical details unnecessarily. The design mode is Operate.

Patient routes: Today, Progress, Messages, More (plan/payments/documents, referral, account). Staff routes: Dashboard, Patients, Evaluations, Admin. Sensitive chart reads require audited backend authorization; the frontend does not decide access rights.

Production is gated. This build is locally reviewable with synthetic in-memory data and has Convex backend/provider adapters; no vendor accounts are connected. Final identity assets, staff photos, captions/videos/quizzes, clinic contact details and approved terms are pending. The supplied reference, rather than a generated comp, governs design. No redesign or new style tournament is authorized.
