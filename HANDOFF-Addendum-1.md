# Handoff: Addendum 1 (Plan of Care Proposal)

**Date:** October 12, 2026
**Picks up from:** the point where the Codex session stopped, while it was testing the app in the browser. The base PRD v1 build was already in place and its tests were passing.

## Summary

Addendum 1 is implemented: all 17 PP requirements. The old plan-of-care flow is replaced. That flow was "closer creates a plan, the PT signs it, then the closer sends it to the portal." It is now proposal → presentation → buy-in → price reveal → accept and pay → PT signs.

All tests pass, and the production build succeeds. Everything has been verified in sample mode and against Convex's local test harness only. Nothing has run against a hosted Convex deployment, Stripe or GHL.

## What was built

| Area | What it does |
| --- | --- |
| **T4 Proposal builder** (`/team/patients/:id/proposal`) | The PT picks a condition template and every field fills in. The patient's main pain and goal carry over. A live preview shows the patient's version. **Produce** stays disabled, with a list of what's missing, until the PP-3 checks pass. After Produce, edits stay live on the tablet until the patient confirms the plan. |
| **T3 Presentation mode** (`/team/patients/:id/present`) | Full screen and patient-facing. One section per screen, labeled "1 OF 6" through "6 OF 6". Section 6 has **Yes, that's the plan** and **I have questions**. **Show investment** needs a 1-second press-and-hold and only works after the yes. The investment screen offers paid in full or 3 payments, **Accept and pay**, or **Text the payment link instead**. A quiet "Closer options" menu holds decline (with reason and note) and send to portal. |
| **Price gate (PP-7)** | Enforced on the server. Price fields are removed from every client response until the reveal, the send to portal, or acceptance. This covers both the presentation query and the patient record snapshot. Patients receive no proposal data at all until it is sent or accepted. |
| **P11 Your plan** (`/more/plan`) | Shows all sections, the price and payment schedule, and a PDF download. If the plan was sent for follow-up, it also shows Accept and pay. If the plan was revised, it shows the version note. |
| **Signing and revisions (PP-14)** | The PT signs after payment. Later edits are saved as a new signed version with a dated note on what changed and who changed it. The previous content is kept on the record. |
| **Admin** | A condition-template editor under Admin → Library → Condition templates, with the wording guard (PP-16). |
| **Payments** | The closer can open Stripe Checkout on the tablet, or the payment link is texted through GHL. The Stripe payment webhook marks the proposal `accepted`. Installment total = plan price × 1.15, rounded to the nearest dollar. Payments are 50% at acceptance, then weeks 4 and 7. The deposit comes off the first payment. |
| **Decline (PP-12)** | Moves the GHL opportunity to `eval_no_poc` and opens a follow-up task for the closer. The rules engine never closes that task on its own. |
| **Analytics** | Six new events are logged: `proposal_produced`, `scope_confirmed`, `scope_questions`, `price_revealed`, `plan_declined`, `proposal_sent_to_portal`. The Metrics page shows four rates (scope-confirm rate, accept rate after reveal, median time from Produce to accept) and a count of decline reasons. |
| **Progress (P7)** | Milestones now come from the plan's outcomes. |

## Files

**New**
- `src/proposal.ts`: shared rules used by the UI and Convex. Covers PP-3 validation, PP-10 math, the wording guard, status transitions, price redaction and the starter templates.
- `src/proposal-ui.tsx`: the builder, presentation mode, the plan tab panel, Your plan, and the template editor.
- `src/proposal.css`
- `convex/proposals.ts`: the `builder` and `presentation` queries and the `act` mutation.
- `tests/proposals.test.ts`

**Changed**
- `convex/schema.ts`: adds the `proposalTemplates` table, extends `plansOfCare`, adds `patients.mainPain`, and removes `planTemplates`.
- `convex/portal.ts`: removes the old plan operations, adds snapshot redaction and patient filtering, and adds `ptName`.
- Other Convex files:
  - `convex/payments.ts`: closer checkout and texted payment links.
  - `convex/webhooks.ts`: plan acceptance on payment.
  - `convex/integrations.ts`: the GHL text job and the plan PDF job.
  - `convex/documents.ts`: plan PDF content.
  - `convex/admin.ts`: template validation and the new metrics.
  - `convex/seed.ts`: starter templates.
- Frontend:
  - `src/store.tsx`: sample and live proposal wiring.
  - `src/sample.ts`: sample data.
  - `src/ui.tsx`: routes, More, Progress and Payments.
  - `src/team.tsx`: plan tab, Evaluations links and Metrics.
  - `src/catalog.tsx`: template editor.
  - `src/domain.ts`: installment rounding.
  - `src/main.tsx`: imports the new styles.
- Tests and docs:
  - `tests/e2e/portal.spec.ts`
  - `README.md`, `CLAUDE.md`, `docs/RELEASE.md`, `docs/INTEGRATIONS.md`
  - `scripts/requirements.mjs`, which now also reads the addendum's PP rows, and the regenerated `docs/REQUIREMENTS.md`

**Removed**
- `src/plan-builder.tsx`, the old EV-3 builder.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (TypeScript) | Clean |
| `npm test` (Vitest) | 39 passed (9 new) |
| `npm run test:e2e` (Playwright, desktop + mobile) | 16 passed (3 new) |
| `npm run build` | Succeeds. The large-bundle warning was there before this work. |
| Manual run in the browser (sample mode) | Full flow works, including the builder, presentation, reveal, decline, send to portal, Your plan, revise and the template editor |

The new tests check that:
- no price appears in the page markup on sections 1–6;
- a short press doesn't reveal the price, but a full hold does;
- the PT, the patient and the closer can each do only their own steps;
- the PP-10 example works out to $5,060 → $2,530 / $1,265 / $1,265;
- the patient never sees a proposal before it is sent;
- the payment webhook marks the proposal accepted;
- signing and revision work, and outcome completion dates survive a revision.

Bugs found and fixed while testing:
- In sample mode, "save then produce" read stale state.
- The error message in presentation mode couldn't be dismissed.
- The scrollable preview panel wasn't reachable by keyboard (an accessibility failure).

## Decisions made (please confirm)

1. **Who edits the price** is an open item in the addendum. For now the PT sets it in the builder, and the closer can't change it after Produce.
2. **Produce and acceptance both require `ENABLE_CARE`**, matching the existing rule that no care is sold until that gate is on.
3. **Installment due dates count from the payment date**, not from when the proposal was produced.
4. **The investment screen always shows the $48.50 deposit credit.** Checkout subtracts only deposits actually paid, so a manually added patient with no deposit would see a $48.50 difference.
5. **Sample mode doesn't take payments**, so Accept and pay stops at a "sample mode" message there. Payment and signing are covered by backend tests.

## Still open before launch

All of these are also in `docs/RELEASE.md`.

- Jimmy writes the real condition templates. The four shipped ones (knee, shoulder, low back, hip) are placeholders.
- The lawyer reviews template wording (PP-16).
- Time a returning user producing a proposal in 5 minutes or less (PP-17).
- Measure how long Produce takes to reach the tablet on clinic Wi-Fi; the target is under 2 seconds (PP-4).
- Before any real patient sees a proposal, check in staging that:
  - the tablet's network traffic carries no price before the reveal (PP-7);
  - the signed plan and its PDF appear in the chart (PP-14).
- Rehearse tablet Checkout and the texted payment link with Stripe test mode and the GHL sandbox.

## Try it locally

```bash
npm ci
npm run dev
```

1. Open http://127.0.0.1:5173.
2. Click **View team console**, then open **Linda Miller** and the **Plan & payments** tab.
3. Click **Proposal builder**, pick the knee template, and press **Produce**.
4. Go back to the patient and click **Present on tablet**.
5. Step through the sections, tap **Yes, that's the plan**, and hold **Show investment** for one second.
6. Under **Closer options**, try decline and then **Send to Linda's portal**.
7. Switch to the patient portal and open **More → Your plan**.

Sample data resets when you refresh the page.
