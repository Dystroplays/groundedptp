# Addendum 1 — Plan of Care Proposal

**Applies to:** Grounded Portal — PRD v1
**Date:** October 12, 2026
**Type:** New scope added after PRD v1. Nothing in v1 was missed or is being corrected; this adds a feature on top of it.

Where this addendum touches existing v1 requirements (EV-3, CH-3, PY-1, T3, P10, the `plansOfCare` table), it extends them. If anything here conflicts with v1, this addendum wins for the plan of care flow only.

---

## 1. Summary

On eval day, Jimmy fills in a short, pre-filled template while the patient watches the video with Blake. He presses **Produce**, and a plan of care **proposal** appears live on Blake's tablet. Blake walks the patient through it one section at a time: what's going on, their goal, Jimmy's recommendation, the outcome, and the roadmap. Then he gets a yes on the plan. Only after that does Blake reveal the price.

The accepted proposal *is* the plan of care. There is one record, not a proposal plus a separate chart entry.

**Goals**

1. Jimmy can produce a proposal in about 5 minutes, editing a template rather than writing from scratch.
2. The patient agrees to the scope before they see a price.
3. The price cannot be seen early, including by scrolling ahead or inspecting the page.
4. The accepted proposal becomes the signed plan of care in the chart.

---

## 2. Flow

1. Jimmy finishes the eval and records the patient's main pain and goal in their own words.
2. The patient watches the eval-day video with Blake on the tablet (existing T3 flow).
3. Jimmy opens the **Proposal builder** (new screen T4), picks a condition template, edits it, and presses **Produce**.
4. Blake's tablet updates live with the proposal in **Presentation mode** (T3 update).
5. Blake walks through sections 1–5, then reaches the buy-in check (section 6).
6. If the patient says yes, Blake reveals the price (section 7). If they say not yet, Blake handles questions and can return to the buy-in check.
7. The patient picks paid in full or 3 payments, then accepts and pays.
8. Jimmy signs the plan of care. It now lives in the chart and in the patient's portal.

---

## 3. Proposal sections (in presentation order)

| # | Section | Content | Source |
|---|---|---|---|
| 1 | What's going on | Main pain in the patient's words, plus 1–2 plain-language lines on what Jimmy found | Jimmy, during eval |
| 2 | Your goal | The patient's goal, word for word (e.g., "Back to pickleball with my grandkids") | Jimmy, during eval |
| 3 | Jimmy's recommendation | Prognosis: length and frequency (e.g., 8 weeks, 2 visits/week), a short why, and one sentence on programming focus | Template, edited by Jimmy |
| 4 | What you'll be able to do | 2–4 concrete, checkable outcomes, each tied to a re-test week (e.g., "Two full games with pain at 2/10 or less — re-test week 8") | Template, edited by Jimmy |
| 5 | Your roadmap | 3–4 phases, not one line per week. Each phase: name, week range, what happens, visits, milestone check | Template, edited by Jimmy |
| 6 | Buy-in check | "Does this plan get you where you want to be?" Buttons: **Yes, that's the plan** / **I have questions** | Fixed |
| 7 | Investment (gated) | What's included, price, deposit credit, payment options, Accept and pay | Template price, edited by Jimmy or Blake |

Example roadmap phases for a knee template:

- Weeks 1–2: Calm it down
- Weeks 3–5: Build strength
- Weeks 6–8: Return to play

---

## 4. Requirements

| ID | Requirement | Done when |
|---|---|---|
| PP-1 | Condition templates | Admin can create and edit templates per condition (e.g., knee, shoulder, low back, hip). Each template holds default prognosis, why, programming focus, outcomes, phases, included items, and price |
| PP-2 | Proposal builder (T4) | Jimmy picks a template; all template fields pre-fill and stay editable. Main pain and goal carry over from the eval (EV-2). A live preview shows the patient-facing version |
| PP-3 | Validation before Produce | Main pain, goal, prognosis, at least 2 outcomes with a re-test week each, and phases covering week 1 through the last week with no gaps or overlaps. Produce is disabled until these are met, with the missing items listed |
| PP-4 | Produce | Pressing Produce saves the proposal at status `produced` and pushes it live to Blake's tablet within 2 seconds (Convex reactive query, no refresh) |
| PP-5 | Presentation mode (T3 update) | Full-screen, patient-facing, one section per screen with Next and Back. No price anywhere in sections 1–6 |
| PP-6 | Buy-in check | "Yes, that's the plan" sets `scopeConfirmedAt`. "I have questions" logs the tap and keeps the proposal on section 6 so Blake can return to it |
| PP-7 | Price gate, server-enforced | Price fields are **not sent to the client** until the closer reveals them. The Convex query for a proposal omits price, included-items pricing, and payment amounts while `priceRevealedAt` is empty. Hiding them with CSS or client logic does not meet this requirement |
| PP-8 | Show investment | A closer-only control, a press-and-hold of about 1 second labeled "Show investment," so a patient tapping around can't trigger it. It is enabled only after `scopeConfirmedAt` is set, and sets `priceRevealedAt` |
| PP-9 | Investment section | Shows what's included (visits, portal programming, messaging with the team, re-tests), the plan price, the $48.50 deposit credit, and two options: paid in full, or 3 payments totaling 15% more |
| PP-10 | Installment math | Installment total = plan price × 1.15, rounded to the nearest dollar. 50% due at acceptance, the rest split evenly at weeks 4 and 7, with any odd cent on the last payment. The deposit credit comes off the first payment in both options. Example: $4,400 → $5,060 → $2,530 / $1,265 / $1,265 before deposit credit |
| PP-11 | Accept and pay | Accept opens Stripe Checkout on the tablet, or texts a payment link to the patient's phone through GHL (GH-6). On payment, status becomes `accepted` and the existing EV-3 / PY-1 flow continues |
| PP-12 | Decline | Closer can mark the proposal declined with a reason (price, timing, needs to talk to spouse, not convinced, other) and a note. This moves GHL to "Eval Completed - no POC" (existing GH-4) and opens a follow-up save for the closer |
| PP-13 | Follow-up send | For a declined or undecided proposal, the closer can "Send to portal." The patient then sees the full proposal, including price, with an Accept and pay button |
| PP-14 | Becomes the plan of care | On acceptance, the proposal is the plan of care record (CH-3). Jimmy signs it from T2 or T4. After signing it is locked; changes are made as a new version with a dated note on what changed and who changed it |
| PP-15 | Portal view (P11) | After acceptance (or after PP-13), the patient sees "Your plan" in the portal with all sections and price, plus a PDF download. Before that, nothing about the proposal shows in the portal |
| PP-16 | Wording guardrails | Templates never use "guarantee," "promise," or "cure." Outcomes read as measurable goals. Template wording is reviewed by the lawyer before launch |
| PP-17 | Speed target | A returning user can produce a proposal from a template in 5 minutes or less. Test this with Jimmy before launch |

---

## 5. Data model changes

### New table: `proposalTemplates`

| Field | Type | Notes |
|---|---|---|
| name | string | e.g., "Knee — return to sport" |
| condition | string | knee, shoulder, low_back, hip, other |
| weeks | number | Default length |
| visitsPerWeek | number | |
| why | string | Default prognosis rationale |
| programmingFocus | string | |
| outcomes | array of { label, measure, target, retestWeek } | |
| phases | array of { name, weekStart, weekEnd, focus, visits, milestone } | |
| included | array of string | |
| priceCents | number | Default price |
| active | boolean | |

### Changes to `plansOfCare`

Add these fields:

| Field | Type | Notes |
|---|---|---|
| templateId | id | Template it started from |
| mainPain | string | Patient's words |
| findings | string | Jimmy's plain-language summary |
| visitsPerWeek | number | |
| why | string | |
| programmingFocus | string | |
| outcomes | array of { label, measure, target, retestWeek } | Replaces the earlier `milestones` field for proposals; milestones on the Progress screen (P7) read from here |
| phases | array of { name, weekStart, weekEnd, focus, visits, milestone } | |
| included | array of string | |
| installmentTotalCents | number | Computed per PP-10 |
| depositCreditCents | number | 4850 |
| paymentOption | "full" or "installments" | Set on acceptance |
| producedAt, scopeConfirmedAt, priceRevealedAt, acceptedAt, declinedAt, sentToPortalAt, signedAt | timestamps | |
| declineReason, declineNote | string | |
| version | number | Increments on post-signing changes |

Replace the `status` values with: `draft`, `produced`, `scope_confirmed`, `price_revealed`, `accepted`, `declined`, `sent_to_portal`, `completed`.

Allowed transitions: draft → produced → scope_confirmed → price_revealed → accepted. Declined is reachable from produced, scope_confirmed, or price_revealed. Sent_to_portal is reachable from declined or price_revealed, and leads to accepted.

---

## 6. Screens (for design)

Same brand rules as v1: Bone background, Stone cards, Forest headlines, Copper only on the single next action or key number, Sora / DM Sans / Barlow Condensed, no gradients, shadows, emoji, or stock imagery.

### T4. Proposal builder (Jimmy, laptop or tablet)

- **Job:** produce a proposal in 5 minutes.
- Template picker at the top. Selecting one fills every field.
- Left column: editable fields grouped by section 1–5, then included items and price.
- Right column: live patient-facing preview.
- **Produce** button in Copper, disabled with a checklist of missing items until PP-3 passes.
- **States:** empty, template applied, missing fields, produced (shows "Live on Blake's tablet").

### T3 update. Presentation mode (Blake's tablet, patient-facing)

- **Job:** walk the patient through scope, get a yes, then reveal price.
- One section per screen, large type, progress shown as a Barlow label ("2 OF 6").
- Section 6 has two large buttons: **Yes, that's the plan** and **I have questions**.
- The **Show investment** press-and-hold control sits in a corner, styled quietly so a patient doesn't notice it, and stays disabled until the yes.
- Investment screen: what's included, price as the one Copper number, deposit credit line, paid in full / 3 payments toggle, **Accept and pay**.
- **States:** waiting for Jimmy (before Produce), presenting, questions raised, price revealed, accepted, declined.

### P11. Your plan (patient portal)

- **Job:** a record of what they agreed to, easy to show a spouse.
- Same sections as the presentation, all visible, with price and payment schedule.
- Download PDF.
- **States:** accepted, sent for follow-up (with Accept and pay), plan updated (shows the version note).

---

## 7. Analytics events (add to v1 `events`)

| Event | Logged when |
|---|---|
| proposal_produced | Jimmy presses Produce |
| scope_confirmed | Patient taps "Yes, that's the plan" |
| scope_questions | Patient taps "I have questions" |
| price_revealed | Closer completes Show investment |
| plan_declined | Closer marks declined (with reason) |
| proposal_sent_to_portal | Closer sends for follow-up |

`plan_accepted` already exists in v1.

Metrics this enables: time from Produce to accept, scope-confirm rate, accept rate after price reveal, and decline reasons.

---

## 8. Build phase

Build in **Phase 3** (eval day and in care), alongside EV-1 to EV-4 and CH-1 to CH-6. PP-7 and PP-14 must be done before any real patient sees a proposal.

## 9. Open items

- Jimmy writes the first set of condition templates (prognosis, outcomes, phases, price).
- The lawyer reviews template wording (PP-16).
- Confirm whether Jimmy or only Blake can edit the price on a proposal.
