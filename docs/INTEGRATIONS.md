# Provider configuration and integration contracts

All endpoints are on the Convex **site URL**, not Vercel. All secrets belong in Convex environment settings. Test these contracts with each configured account before launch.

## Stripe

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MEMBERSHIP_PRODUCT_ID`, and `SITE_URL`. Create a generic membership product and enable the hosted billing portal for payment-method updates, invoice recovery and the clinic's approved cancellation policy. The adapter pins API version `2024-06-20`; configure the event destination to use this shape, particularly `invoice.subscription` and `subscription_details.metadata`. A version change requires adapter contract tests.

POST `/webhooks/stripe` with Stripe's unmodified raw body and `Stripe-Signature` header. HMAC verification rejects timestamps outside five minutes. Store the verified event before returning success. Subscribe to:

- `checkout.session.completed`
- `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`
- `customer.subscription.deleted`
- `charge.refunded`

Checkout metadata contains opaque portal/GHL identifiers and generic kind labels. Browser return URLs do not mark a payment paid. Installment Checkout saves the method for subsequent charges; the adapter sets it as the customer's default invoice payment method. Later installments use individual invoices. Card entry stays on Stripe.

For a $4,400 plan: full-payment Checkout is $4,351.50 after the $48.50 deposit; installment Checkout is $2,481.50, then $1,265 on days 28 and 49 after the agreed start date. The total including the deposit is $5,060. Checkout attempts share durable keys and expirations. Repeated webhook effects share business keys. Provider objects are recovered on invoice/subscription job replay.

Membership uses setup-mode Checkout to record payment authorization without charging during care. Discharge schedules subscription activation once. Credits reserve atomically in the portal ledger, cap at the membership invoice amount, and carry the remainder forward. A subscription-specific first-invoice coupon or draft membership invoice adjustment applies credit; no customer-wide balance credit is used. A voided invoice reverses its reservation. Full referral-payment refunds reverse the associated referral award; obtain an approved policy for partial refunds before rollout.

Configure recovery for authentication-required invoices and rehearse with Stripe's test payment methods. Initial subscription events can arrive before the activation job commits; matched membership metadata causes a retry. Validate credit placement before invoice finalization in the actual account. A failure older than one hour appears in Admin → Sync & release.

## GoHighLevel

Set `GHL_ACCESS_TOKEN`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_EVAL_CALENDAR_ID`, `GHL_STATUS_FIELD_ID`, `GHL_WORKFLOW_SECRET`. Map `GHL_STAGE_IDS` as JSON using these application keys:

```json
{"deposit_paid":"stage-id","poc_engaged":"stage-id","eval_no_poc":"stage-id","no_review":"stage-id","no_membership":"stage-id","member":"stage-id","discharged":"stage-id"}
```

A declined plan of care proposal moves the opportunity to `eval_no_poc`. When the closer chooses *Text the payment link instead*, the portal creates the Stripe Checkout session and sends one SMS through GHL conversations (job `payment_link_text`) containing only a generic sentence and the Checkout URL; it defers to 8 a.m. Central during quiet hours like other portal texts.

Unknown/missing mappings fail visibly. GHL owns evaluation-booked/no-show stage transitions; its workflow sends the corresponding appointment update to this portal. `poc_engaged` is the accepted-plan stage.

Workflow requests require `Authorization: Bearer <GHL_WORKFLOW_SECRET>`. Configure a dedicated workflow secret and restrict who can edit the workflow; this is the authentication scheme for custom workflow calls, not a claim to verify GHL marketplace signatures.

POST `/ghl/deposit`:

```json
{"requestId":"stable-send-request-id","contactId":"ghl-contact-id","opportunityId":"ghl-opportunity-id","email":"test@example.com"}
```

Returns `{ "url": "https://checkout.stripe.com/..." }`. The GHL workflow must consume that URL and send the deposit text using its own SMS action and quiet-hours policy. Reuse `requestId` on network retry. This endpoint never sends a text itself.

POST `/webhooks/ghl`:

```json
{
  "eventId":"unique-event-id",
  "locationId":"configured-location-id",
  "appointment":{
    "id":"appointment-id",
    "contactId":"contact-id",
    "calendarId":"calendar-id",
    "kind":"eval",
    "startTime":"2026-11-04T15:00:00Z",
    "dateUpdated":"2026-11-01T18:20:00Z",
    "appointmentStatus":"confirmed",
    "address":"Clinic address"
  }
}
```

Statuses: `confirmed`/`new`, `showed`, `noshow`, `cancelled`/`canceled`. Include the actual source `dateUpdated` so stale updates are rejected. Missing timestamps fall back to receipt time, which cannot identify out-of-order upstream events. Manual intake matches email then phone, or accepts staff-supplied GHL IDs. Appointment changes made in the staff UI are sent to GHL and then normalized through the same inbound path.

The adapter sends only contact details, appointment details, stage, and generic status/alert text to GHL. It does not export SOAP notes, exercise programs, measurement values or portal conversation content. Check DND consent and test SMS delivery with the clinic's actual location.

## Paubox

Set `PAUBOX_API_URL` to the account's messages endpoint, `PAUBOX_API_KEY`, `EMAIL_FROM`, and `SITE_URL`. Requests use `Authorization: Token token=<key>` and the Paubox `data.message` envelope. Authenticate the clinic's sending domain. Magic links expire in 15 minutes and require an explicit click in the portal before verification. Test with actual Outlook/Gmail and security scanners, including cross-device opening.

Generic alerts use the durable outbox. SMTP/provider delivery has at-least-once semantics: if a provider accepts a request but the response is lost, a retry may produce a duplicate alert. Database effects and business jobs are deduplicated; this does not promise exactly-once external mail/SMS delivery. Portal text jobs defer to 8 a.m. Central during quiet hours, including retries and DST transitions. Email does not wait overnight.

## Mux

Upload the three approved pre-visit videos and exercise media outside the portal, add captions, then enter playback IDs, exact durations and captions-ready state in Admin → Library. No patient metadata is sent to the player. `disableTracking` and `disableCookies` are passed explicitly, following the [Mux player API](https://www.mux.com/docs/guides/player-api-reference/html). Watch/quiz progress lives in Convex. Staff inline playback does not falsely record patient completion.

The sample includes no actual clinical videos. Validate caption rendering, playback errors, seek restrictions, progress saving, and the two-second start target on representative phones before the pre-visit gate.

## Retries and operations

`webhookEvents` is the inbox; `integrationJobs` is the outbox; `notificationDeliveries` tracks alert state. Cron retries with backoff and recovers stale worker leases. Admin exposes unresolved jobs after an hour and an explicit replay action. Inspect the associated job/event in the restricted Convex dashboard; do not copy patient payloads into operational logs. Replay must be rehearsed after each provider's partial-success failure mode. Never manually delete ledger/audit/clinical rows to repair state.
