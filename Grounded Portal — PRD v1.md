# Grounded Portal — PRD v1

Oct 11, 2026 · @Blake Jackson

The Grounded Portal is a patient portal and team console built on Convex. It carries a patient from paid deposit through discharge and beyond, behind an email magic-link login. Strategy, customer success rules, and screen specs live in [Grounded PTP — The Engine](https://claude.ai/code/artifact/d623e238-6e6a-4853-a13d-2acd97df3745); this doc is what to build.

## Goals

1. Patients arrive at the eval having watched every pre-visit video, proven by a quiz.
2. Patients in care do their home program, and the team knows within a day when they stop.
3. Every referral is logged to the patient who made it and turned into membership credit.
4. Patients keep their program and a direct line to the clinic after discharge.
5. Login is one field: enter email, tap the link, you're in.

## Non-goals for v1

- Booking and scheduling. Appointments sync from GoHighLevel; patients don't self-book in the portal.
- Insurance billing of any kind.
- A native app. The portal is a mobile web app, installable to the home screen.
- Stage 8 reminder cadence. Deferred until after v1; the plumbing for scheduled messages ships, the cadence doesn't.
- AI-generated content of any kind in front of patients.

## What v1 must prove

After the first 20 patients: higher eval show rates and close rates for patients who finished their videos, and weekly program adherence the team can act on.

## Users and roles

Five roles. One person can hold several (Blake is closer and admin). Every staff action is logged with who did it.

| Role | Who | Can see | Can do |
| --- | --- | --- | --- |
| Patient | Anyone with a paid deposit | Only their own record | Watch videos, take quizzes, log sessions, message the team, refer friends, view plan, payments, and documents |
| SDR | Booking staff | Contact info, stage, status, watch status, appointments, messages. No clinical notes | Create patients, send invites, run pre-visit saves, rebook visits, message patients |
| PT | Jimmy and future PTs | Full record for their patients, including clinical notes | Write notes, build and edit programs, set goals and baselines, record re-tests, reply to messages, discharge |
| Closer | Blake | Full record except clinical notes | Use the eval-day view, create and send plans of care, apply deposits, run membership and referral saves |
| Admin | Founders | Everything | Manage staff and roles, the video and exercise libraries, pre-visit sequences, credit rules, and settings |

## Architecture

&#91;embedded content: Portal architecture · vendors and data flow\]

Convex is the single source of truth: database, server functions, the status engine and reminders as scheduled jobs, and magic-link auth. The web app is client-only: the host serves code, and every read and write of patient data goes from the browser straight to Convex. Stripe sends payment events into Convex by webhook; videos stream straight from the video host because they carry nothing patient-specific.

| Vendor | Role | Holds health data | BAA needed |
| --- | --- | --- | --- |
| Convex | Database, functions, jobs, auth, files | Yes | Yes; offered on paid plans |
| Front-end host | Serves the app's code only | No, by design | No, once the lawyer confirms |
| Paubox (email) | Magic links and alerts | Email addresses tied to a clinic | Yes |
| GoHighLevel (texts) | Invites and alerts | Phone numbers tied to a clinic | Yes |
| Stripe | Deposits, plans of care, membership | Payment records only, no clinical detail | Confirm with the lawyer |
| Video host | Pre-visit and exercise videos | No | No |

GoHighLevel sits beside the portal as the CRM. It holds leads before deposit and the SDR pipeline, syncs appointments into Convex, and sends text messages. It needs its HIPAA add-on and BAA.

## GoHighLevel integration

GHL owns everything before the deposit; the portal owns everything after it. The portal moves the GHL pipeline from "Paid deposit - Eval Set" onward, so the SDR's board stays accurate without anyone dragging cards.

### Pipeline stages

| GHL stage | Moved by | What happens in the portal |
| --- | --- | --- |
| Submitted Lead form | GHL, from the Meta form | Nothing; leads never enter the portal |
| Contacted Phase 1 | SDR | Nothing |
| Contacted Phase 2 | SDR | Nothing |
| Phase 3 outreach | SDR | Nothing |
| Disco Call - no deposit | SDR | Nothing |
| Paid deposit - Eval Set | Portal, when Stripe confirms the deposit | Patient created, pre-visit sequence assigned, invite sent (IN-1) |
| Eval Completed - POC Engaged | Portal, when the patient accepts and pays for the plan of care | Stage becomes in\_care; Today and the program go live |
| Eval Completed - no POC | Portal, when the closer marks the plan declined in the eval-day view | Patient keeps portal access; follow-up save for the closer |
| POC - No Review | Portal, on the first in-care visit | In care with no review yet; review ask goes into the stage 6 flow |
| POC - No Membership | Portal, when staff confirm a review was left | Review is in, not yet a member; membership offer shows from week 4 (DC-1) |
| POC Completed - Membership | Portal, when the membership subscription starts | Stage becomes member; Today becomes "Keep it going" with membership active |
| POC Completed - Discharged | Portal, when the PT discharges a patient who hasn't joined | Today becomes "Keep it going" (DC-2); 30-day membership check-in save (no\_membership rule) |

### How data moves

| ID | Requirement | Done when |
| --- | --- | --- |
| GH-1 | Deposit link from GHL | A "Send deposit link" action in GHL calls the portal, which creates a Stripe Checkout for $48.50 tagged with the GHL contact ID and texts the link through GHL |
| GH-2 | Contact matching | The patient record stores the GHL contact and opportunity IDs from the Checkout tag. Patients created by hand (IN-2) match on email, then phone, or the SDR picks the contact |
| GH-3 | Appointment sync, GHL to portal | GHL workflow webhooks fire on appointment booked, moved, cancelled, showed, and no-show. The portal updates the matching appointment within a minute, and moving the eval recomputes video due dates (PV-5) |
| GH-4 | Stage moves, portal to GHL | The portal moves the opportunity to the stage in the table above through the GHL API |
| GH-5 | Status in GHL | The portal writes the patient's status (On track, Watch, At risk) to a GHL custom field, so the SDR sees it on the card |
| GH-6 | Texts through GHL | Every portal text (NT-1) goes out through GHL's messaging API to the matched contact, using portal templates with nothing clinical |
| GH-7 | Minimum data to GHL | GHL gets contact details, stage, appointments, and status label only. Notes, programs, measurements, and messages never leave the portal |
| GH-8 | Reliable sync | Webhooks are processed once even if GHL sends them twice. Failed calls retry with backoff, and anything still failing after an hour shows on an admin sync-errors list |

Data model additions: `patients.ghlContactId`, `patients.ghlOpportunityId`, `appointments.ghlAppointmentId`.

## Data model

The Convex schema starts with 22 tables. Money is stored in cents and times in UTC milliseconds. Every patient-scoped table carries `patientId` and an index on it.

| Table | Key fields | Notes |
| --- | --- | --- |
| patients | name, email, phone, stage, status, goal, ptId, closerId, referredById, source | stage: deposit\_paid, pre\_visit, in\_care, member, discharged. status: on\_track, watch, at\_risk |
| staff | userId, name, roles\[\], photoId | roles: sdr, pt, closer, admin |
| appointments | patientId, kind, startsAt, location, status | kind: eval, visit, retest. status: booked, attended, no\_show, cancelled |
| payments | patientId, kind, amountCents, stripeId, status, appliedToId | kind: deposit, plan\_of\_care, membership |
| videos | title, playbackId, durationSec, whyLine, category | Hosted on a video service; same for every patient |
| quizzes | videoId, questions\[{prompt, options\[\], correctIndex, jumpToSec}\] | One quiz per pre-visit video |
| sequences | name, items\[{videoId, dueOffsetDays}\] | Due dates computed back from the eval date |
| videoAssignments | patientId, videoId, order, dueAt, unlockedAt, watchedSec, completedAt, quizPassedAt | Watch progress saved every 10 seconds |
| plansOfCare | patientId, goal, weeks, visits, priceCents, startDate, status, milestones\[{label, week, doneAt}\] | status: draft, sent, accepted, completed |
| exercises | name, videoId, defaultCue, tags\[\] | The exercise library |
| programs | patientId, version, active, items\[{exerciseId, sets, reps, holdSec, cue, days\[\]}\] | A new version on each edit; old versions kept |
| sessionLogs | patientId, programVersion, date, doneItemIds\[\], feel, note | feel: easy, about\_right, too\_much |
| measurements | patientId, label, unit, value, kind, takenAt | kind: baseline, retest |
| clinicalNotes | patientId, appointmentId, kind, subjective, objective, assessment, plan, icd10\[\], cpt\[\], authorId, signedAt, addenda\[\] | Staff only. Never sent to patients |
| visitSummaries | patientId, appointmentId, body, authorId | Plain-language summary the patient sees |
| messages | patientId, senderKind, senderId, body, readAt, painFlag | One thread per patient |
| referrals | referrerId, friendName, friendContact, referredPatientId, status | status: invited, booked, started\_plan |
| creditLedger | patientId, amountCents, reason, referralId, appliedToPaymentId | Balance = sum of entries |
| saves | patientId, rule, level, play, ownerRole, ownerId, dueAt, doneAt, outcome | Created by the status engine |
| events | patientId, type, data, at | Feeds the patient timeline and analytics |
| documents | patientId, kind, fileId | kind: plan\_pdf, receipt, superbill |
| auditLog | actorId, action, targetTable, targetId, at | Every staff read of a clinical note and every write |

## Functional requirements

Screen IDs (P1–P10, T1–T3) refer to the Portal screens tab of the Engine doc. Each requirement is done when its acceptance line is true.

### Login

| ID | Requirement | Done when |
| --- | --- | --- |
| AUTH-1 | Email magic-link login for patients and staff (P1, P2) | A link is single-use and expires after 15 minutes |
| AUTH-2 | Same response whether or not the email is on file | P1 always says "If that email is on file, a link is on its way." This replaces the "email not found" state in the screen spec, since confirming someone is a patient is itself a disclosure |
| AUTH-3 | Patient sessions last 30 days per device; staff sessions 12 hours | The portal address never changes; a patient can request a new link any time, including years after discharge |
| AUTH-4 | Rate limits | Resend available after 30 seconds; at most 5 links per email per hour |

### Intake and invite

| ID | Requirement | Done when |
| --- | --- | --- |
| IN-1 | A paid deposit creates the patient | Stripe's payment-succeeded webhook creates or activates the patient at stage deposit\_paid and sends the invite by email and text within 1 minute |
| IN-2 | SDR can create a patient and eval appointment by hand | Same invite flow as IN-1 once the deposit is marked paid |
| IN-3 | Invite carries no clinical content | Email and text say only that their Grounded portal is ready, with the link |

### Before the visit

| ID | Requirement | Done when |
| --- | --- | --- |
| PV-1 | Booking the eval assigns the pre-visit sequence. v1 sequence: 3 videos of 5 to 8 minutes (why we're different, insurance vs. cash pay, why us) | Due dates are set back from the eval date. If the eval is sooner than the sequence allows, dates compress evenly and all fall at least 24 hours before the eval |
| PV-2 | Videos unlock in order | Video n+1 unlocks when video n is at least 90% watched and its quiz is passed |
| PV-3 | Watch time is real | Progress saves every 10 seconds; seeking past the furthest point watched is blocked |
| PV-4 | Quiz proves understanding (P4) | All answers must be correct to pass; a wrong answer offers a jump to the timestamp that covers it; retries are unlimited |
| PV-5 | Rescheduling the eval moves the due dates | Dates recompute and the patient sees the new ones |
| PV-6 | Appointment card (P3) | Shows date, time, address with map link, and what to wear |

### Eval day

| ID | Requirement | Done when |
| --- | --- | --- |
| EV-1 | Eval-day view (T3) | Lists today's evals with watch status and quiz results; any unwatched video plays inline |
| EV-2 | PT records the goal and baselines | Goal is saved in the patient's words; baseline measurements saved with units |
| EV-3 | Closer builds and sends the plan of care | Built from a template (goal, weeks, visits, price, milestones); "Send" puts it in the portal; patient accepts and pays through Stripe; deposit is credited against it |
| EV-4 | PT builds the home program in the first session | Picked from the exercise library with sets, reps, hold, cue, and days; publishing shows it on Today (P5) |

### In care

| ID | Requirement | Done when |
| --- | --- | --- |
| IC-1 | Today shows one next step (P5) | One primary card: today's session, a rest-day note, or the next unwatched video |
| IC-2 | Session flow (P6) | One exercise at a time; marked done; ends with a feel rating; "too much" opens a message to the PT |
| IC-3 | Programs are versioned | Each edit makes a new version; the patient gets it at their next session; old versions stay readable to staff |
| IC-4 | Progress (P7) | Baseline next to latest re-test, milestone checklist with dates, weekly sessions done |
| IC-5 | Visit summaries | A plain-language summary the PT posts after a visit appears for the patient; SOAP notes never do |

### Messages

| ID | Requirement | Done when |
| --- | --- | --- |
| MS-1 | One thread per patient (P8) | Staff replies show name and photo; patient sees "We reply the same business day" |
| MS-2 | Pain messages are flagged | Words like pain, sharp, swelling, flare, or fell set a pain flag, create an at-risk save for the PT, and show "If it's severe or sudden, call us" with the number |
| MS-3 | New-message alerts | Patient gets a generic email or text: "You have a new message in your Grounded portal" |

### Referrals and credit

| ID | Requirement | Done when |
| --- | --- | --- |
| RF-1 | Personal referral link (P9) | Each patient has a link; a friend submits name and phone or email; the referral appears for the SDR and for the referrer as "invited" |
| RF-2 | Credit rules set by admin | One amount when the friend pays a deposit, a larger amount when they start a plan of care; amounts are settings, not code, with placeholder values until set |
| RF-3 | Credit balance | Shown as one number from the credit ledger; applies only to membership charges; no cash value |
| RF-4 | No gaming | No self-referral; a contact already in the system can't be referred again |

### Payments and documents

| ID | Requirement | Done when |
| --- | --- | --- |
| PY-1 | Stripe for deposits, plans of care, and membership | Deposit ($48.50, non-refundable) and plan of care through Checkout. Plan of care paid in full by default, or 3 installments totaling 15% more (50% at start, then equal payments at weeks 4 and 7). Membership as a subscription |
| PY-2 | Plan and payments (P10) | Shows paid so far, remaining, and next charge date as one clear balance |
| PY-3 | Documents | Plan of care PDF, receipts, and superbills downloadable by the patient |
| PY-4 | Failed payments | Patient sees an update-card banner; closer gets a save |

### Discharge and membership

| ID | Requirement | Done when |
| --- | --- | --- |
| DC-1 | Membership offer from midway | From week 4 of the plan of care, Progress shows the membership card; joining starts the subscription with credit applied |
| DC-2 | Discharge | PT discharges the patient; Today becomes "Keep it going" with the saved program, membership status, and credit balance |
| DC-3 | Access never ends | Discharged patients keep login, program, documents, and messaging, and can request a visit |

### Team console

| ID | Requirement | Done when |
| --- | --- | --- |
| TM-1 | Dashboard (T1) | Saves due today at the top; patients grouped by stage with status; filter by owner; updates live without refresh |
| TM-2 | Patient detail (T2) | Timeline, watch status, adherence, program builder, measurements, notes, and messages on one page |
| TM-3 | Admin | Manage videos, quizzes, sequences, the exercise library, plan of care templates, credit rules, message templates, and staff |

### Clinical chart

The portal is the clinic's official record, so notes follow charting rules, not just app rules.

| ID | Requirement | Done when |
| --- | --- | --- |
| CH-1 | Note types | Initial eval, daily note, progress note (re-eval), and discharge summary, each with a SOAP template the PT can fill fast |
| CH-2 | Signing and locking | A signed note can't be edited; corrections are dated addenda showing who wrote them; the original stays visible |
| CH-3 | Plan of care in the chart | Goals, frequency, and duration signed by the PT; the patient's acceptance is recorded with a timestamp |
| CH-4 | Referral on file | A field to record a physician referral and its date, plus a warning when a patient nears the limit for treatment without one. The lawyer confirms the Texas rules |
| CH-5 | Retention and patient access | No hard deletes; records kept for the period the lawyer sets; the full chart exports as a PDF when a patient requests it |
| CH-6 | Billing codes | Diagnosis (ICD-10) and procedure (CPT) codes on each visit note, so superbills (PY-3) generate straight from the chart |

### Notifications

| ID | Requirement | Done when |
| --- | --- | --- |
| NT-1 | Email and text channels | Templates editable by admin; nothing clinical in any message; no texts between 8pm and 8am Central |
| NT-2 | v1 reminders | A reminder the day before each video is due and 24 hours before each appointment. Everything else waits for the stage 8 cadence |

## Status engine

The engine runs as a Convex scheduled job every 15 minutes and on every relevant event. Each rule that fires opens a save; a patient's status is the highest level among their open saves (none open = On track). A rule never opens a second save while one for the same rule is still open, and a save closes itself when its condition clears.

| Rule | Fires when | Level | Play | Owner | Due |
| --- | --- | --- | --- | --- | --- |
| no\_login | No login 24 hours after deposit | Watch | Text about checking spam; resend link | SDR | Same day |
| video\_late | A pre-visit video is 24 hours past due | Watch | Text a direct link to that video | SDR | Same day |
| video\_late\_hard | A video is 48 hours past due, or the eval is under 24 hours away with videos unwatched | At risk | Call; offer to reschedule | SDR | Same day |
| eval\_no\_show | Eval marked no-show | At risk | Call to rebook; deposit policy applies | SDR | 2 hours |
| unbooked\_after\_buy | Plan of care accepted with no next visit booked | At risk | Book or call | Closer | Same day |
| inactive | No portal activity for 5 days while in care | Watch | Personal text, not a template | PT | Next business day |
| low\_adherence | Under half of the week's assigned sessions done (checked Monday) | Watch | Ask at the next visit; shorten the program if needed | PT | Next visit |
| visit\_missed | Visit marked no-show | At risk | Call to rebook | SDR | Same day |
| pain\_flag | Message with a pain flag, or a session rated "too much" twice in a row | At risk | PT replies | PT | Same business day |
| payment\_failed | Stripe reports a failed charge | At risk | Reach out about the card | Closer | Same day |
| no\_membership | 30 days after discharge without a membership | Watch | Check-in with progress recap and credit balance | Closer | Day 30 |

Thresholds live in settings, not code, so they can be tuned after the first 20 patients. Closing a save asks for a one-tap outcome (reached, rescheduled, no answer, resolved).

## Security and compliance

The portal is built as if HIPAA and Texas medical privacy law both apply. No real patient data goes in until the lawyer has signed off and every vendor that stores or sends it has signed a BAA.

- **BAAs before data.** Signed with Convex, GoHighLevel, and the email provider before the first real patient. The front-end host needs none because it never sees patient data, pending the lawyer's confirmation. Test data only until then.
- **Access by role, enforced on the server.** Every Convex query and mutation checks the caller's role and patient scope. The front end never decides what someone may see.
- **Clinical notes are the most locked-down data.** PT and admin only. Every read is written to the audit log.
- **Nothing clinical leaves the portal.** Emails, texts, push notifications, and Stripe descriptions never name a condition, body part, or exercise.
- **Login hygiene.** Single-use 15-minute links; staff sessions expire after 12 hours; staff can sign out every device for a patient.
- **Encryption.** In transit everywhere (TLS); at rest by Convex and the hosting providers.
- **Logging.** The audit log is append-only, keeps who did what and when, and is never shown to patients.
- **Data export and deletion.** Admin can export a patient's full record. Deletion follows the retention period the lawyer sets for PT records.
- **Video content is not health data.** Pre-visit and exercise videos are the same for everyone and can be hosted anywhere. What a specific patient watched is health data and stays in Convex.
- **Payments.** Card data never touches the portal; Stripe handles it. The portal stores only Stripe IDs and amounts.
- **Analytics.** No third-party trackers (Meta pixel, Google Analytics) inside the logged-in portal. Product analytics come from the `events` table.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Browsers | Latest two versions of Safari on iPhone and iPad, Chrome on Android, and Chrome, Safari, and Edge on desktop |
| Speed | Patient screens usable within 3 seconds on a mid-range phone over 4G; videos start within 2 seconds |
| Accessibility | WCAG 2.1 AA, using the brand guide's approved contrast pairs; tap targets at least 44px; captions on every video |
| Installable | Adds to the home screen with the Planted G icon; opens without browser bars |
| Time zone | All due dates, reminders, and quiet hours run on Central time |
| Environments | Separate dev and staging Convex deployments with fake data only, plus a seed script of sample patients. Production takes real data only after BAAs and lawyer sign-off |
| Backups | Daily backups; a restore is tested once before launch |
| Error tracking | Errors are logged with patient data stripped, or sent to a tool under a BAA |
| URLs | No names, emails, or conditions in any URL |

## Analytics events

Every metric on the Customer success tab is computed from these events in the `events` table. An admin metrics page shows them by week, with a filter for patients who did and didn't finish their videos.

| Event | Logged when | Feeds |
| --- | --- | --- |
| deposit\_paid | Stripe confirms the deposit | Activation, show rate |
| invite\_sent, link\_opened, logged\_in | Invite goes out; link is tapped; session starts | Portal activation |
| video\_started, video\_completed, quiz\_passed | Watch reaches 0% / 90%; quiz passed | Pre-visit completion |
| eval\_attended, eval\_no\_show | Appointment status set | Show rate |
| plan\_sent, plan\_accepted | Closer sends; patient accepts and pays | Close rate, split by video completion |
| program\_published | PT publishes a program version | Adherence baseline |
| session\_completed | Patient finishes a session | Adherence |
| retest\_recorded | A re-test measurement is saved | Progress |
| plan\_completed, discharged | Plan of care ends; PT discharges | Plan of care completion |
| membership\_started, membership\_cancelled | Stripe subscription starts or ends | Membership conversion |
| referral\_created, referral\_booked, referral\_started | Friend submits; pays deposit; starts plan of care | Referrals per patient |
| review\_requested, review\_confirmed | Review ask sent; staff confirms it was left | Reviews per patient |
| save\_opened, save\_closed | Status engine opens; staff closes with outcome | Save performance |

## Build phases

Four phases, ordered so the pre-visit flow is live when ads start. Each phase ends at a gate that must be met before the next begins.

1. **Foundation.** Convex project, schema, roles, audit log, magic-link login (AUTH-1 to AUTH-4), admin screens for videos, quizzes, and sequences (part of TM-3).
   - Gate: BAAs signed with every vendor; a test patient can log in end to end.
2. **Before the visit.** Deposit webhook and invite (IN-1 to IN-3), the GoHighLevel integration (GH-1 to GH-8), pre-visit sequence, video player, and quiz (PV-1 to PV-6), the dashboard for pre-visit patients (TM-1), pre-visit status rules, and NT-1 and NT-2.
   - Gate: lawyer sign-off; the first real deposit-paid patients use it.
3. **Eval day and in care.** Eval-day view and plan of care checkout (EV-1 to EV-4), Today, Session, Progress, and visit summaries (IC-1 to IC-5), messages (MS-1 to MS-3), patient detail with program builder and the clinical chart (TM-2, CH-1 to CH-6), plan and payments (PY-1, PY-2, PY-4), and the remaining status rules.
   - Gate: first patients complete two weeks of home programs in the portal.
4. **Retention.** Referrals and credit (RF-1 to RF-4), membership and discharge (DC-1 to DC-3), documents and superbills (PY-3), and the metrics page.
   - Gate: first discharged patient lands on "Keep it going" with a credit balance.

## Open decisions

All eleven decisions are made. Choosing the portal as the official chart adds the clinical chart requirements (CH-1 to CH-6). The options considered are kept below for reference.

### Decided

| Decision | Detail |
| --- | --- |
| CRM | GoHighLevel custom build. Leads before deposit and the SDR's work live in a GHL pipeline with kanban stages |
| Appointments | Synced from GHL into the portal |
| Deposit | $48.50, non-refundable, taken through Stripe (could move to another processor later) |
| Plan of care payment | Paid in full by default. Installments only as an exception: 3 payments totaling 15% more (e.g., $4,400 becomes $5,060: $2,530 at start, $1,265 at week 4, $1,265 at week 7). Keep installment plans under 20% of plans sold |
| Referral credit | Amounts TBD; placeholder values in settings |
| Pre-visit videos | 3 videos, 5 to 8 minutes each: why we're different, insurance vs. cash pay, why us. Quiz questions to come |
| First-visit copy | The Jimmy-to-Blake handoff stays; brand copy gets rewritten to fit it |
| Stage 8 reminders | Deferred past v1 |

### Still to choose

**1. Front-end host (decided: option A).** The host is the server that delivers the app's code to the phone. It needs a BAA only if patient data passes through it. With Convex, the browser can talk to the database directly, so the host never has to see patient data.

| Option | How it works | Cost |
| --- | --- | --- |
| A. Client-only app (recommended) | The app is built so the host serves only code; all patient data goes browser to Convex. No server rendering of patient data, nothing patient-specific in host logs. Lawyer confirms no host BAA is needed | Free to $20/mo |
| B. Vercel with a BAA | Vercel Pro plus its HIPAA BAA add-on, signed self-serve in the dashboard ([Vercel docs](https://vercel.com/docs/plans/pro-plan)) | $20/mo + $350/mo |
| C. AWS with a BAA | Host on an AWS service covered by AWS's free BAA; confirm the service is on AWS's HIPAA-eligible list | Usage-based, low; more setup |

Chosen: A. If the lawyer won't clear it, fall back to B.

**2. Email and text providers (decided: texts through GHL, login email through Paubox).**

- **GHL works for the CRM, with its HIPAA add-on.** The add-on adds a signed BAA and is reported at $297/mo on top of your GHL plan; once bought, it can't be removed without canceling the account ([GHL HIPAA guide](https://www.ghlexperts.com/guides/gohighlevel-hipaa-compliance)). Lead and appointment data in GHL is health data once a patient books, so the add-on is required, not optional.
- **Texts: send them through GHL** (recommended). Its texting is covered by the same BAA, so the portal triggers GHL to send invites and alerts and there's no second text vendor.
- **Magic-link email: Paubox** (recommended). Its email API includes a BAA on every plan, with a free tier of 300 emails a month ([Paubox](https://paubox.com/solutions/email-api)). Alternative: Amazon SES under AWS's BAA. Login emails come straight from Convex instead of through GHL, so a GHL delay never blocks someone from logging in.

Rough monthly floor for the stack: GHL plan + $297 HIPAA add-on, Convex Professional, Paubox free tier, and the host from option 1.

**3. Clinical record of record (decided: option A, the portal is the chart).** The record of record is the official chart the clinic must keep by law: evals, daily notes, plan of care, discharge summary, signed, locked against silent edits, and kept for the required retention period.

| Option | What it means | Tradeoff |
| --- | --- | --- |
| A. The portal is the chart | Build SOAP notes with signing, locking, amendments, retention, and export | More to build and more legal exposure in custom code; one fewer tool |
| B. A cash-pay PT EMR holds the chart (recommended for v1) | Jimmy writes notes in an EMR built for PTs; the portal holds goals, programs, measurements, and patient-facing visit summaries | One more subscription and some double entry; the documentation burden sits with a vendor built for it |

Chosen: A, to avoid a second tool and double entry. The lawyer reviews the chart build against Texas PT documentation and retention rules before launch. Had we picked option B, the `clinicalNotes` table would have dropped out of v1.
