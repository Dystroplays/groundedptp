import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { event, forPatient, setting } from "./access";
import { enqueue, notify } from "./jobs";
import { internal } from "./_generated/api";
import { DAY, sequenceDates, paymentSchedule } from "../src/domain";
import { snapshotPlan } from './agreements';
export const receive = internalMutation({
  args: { provider: v.string(), key: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("webhookEvents")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (old) return old._id;
    const id = await ctx.db.insert("webhookEvents", {
      ...args,
      status: "pending",
      attempts: 0,
      receivedAt: Date.now(),
    });
    await enqueue(ctx, "webhook", `webhook:${args.key}`, { eventId: id });
    return id;
  },
});
async function award(ctx: any, patientId: string, kind: "deposit" | "plan") {
  const p = await ctx.db.get(patientId),
    rules = await setting(ctx, "referralRules", { enabled: false });
  const referral =
    (await ctx.db
      .query("referrals")
      .withIndex("by_contact", (q: any) => q.eq("friendContact", p.email))
      .unique()) ??
    (await ctx.db
      .query("referrals")
      .withIndex("by_contact", (q: any) => q.eq("friendContact", p.phone))
      .unique());
  if (
    !referral ||
    referral.referrerId === patientId ||
    referral.status === "ineligible"
  )
    return;
  await ctx.db.patch(referral._id, {
    referredPatientId: patientId,
    status: kind === "deposit" ? "booked" : "started_plan",
  });
  await ctx.db.patch(patientId, { referredById: referral.referrerId });
  await event(
    ctx,
    referral.referrerId,
    kind === "deposit" ? "referral_booked" : "referral_started",
  );
  const key = `referral:${referral._id}:${kind}`,
    amountCents = kind === "deposit" ? rules.depositCents : rules.planCents;
  if (
    rules.enabled &&
    amountCents > 0 &&
    !(await ctx.db
      .query("creditLedger")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .unique())
  )
    await ctx.db.insert("creditLedger", {
      patientId: referral.referrerId,
      amountCents,
      reason:
        kind === "deposit" ? "Friend paid a deposit" : "Friend started a plan",
      referralId: referral._id,
      key,
      at: Date.now(),
    });
}
export const process = internalMutation({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, { id }) => {
    const e = await ctx.db.get(id);
    if (!e || e.status === "done") return;
    const now = Date.now(),
      object = e.payload.data?.object ?? e.payload;
    if (e.provider === "stripe") {
      const type = e.payload.type,
        meta = object.metadata ?? {};
      if (
        type === "checkout.session.completed" &&
        object.mode === "payment" &&
        object.payment_status === "paid"
      ) {
        if (
          globalThis.process.env.ALLOW_REAL_PATIENTS !== "true" &&
          e.payload.livemode
        )
          throw new Error("Production data gate is closed.");
        let patientId = meta.patientId;
        if (meta.kind === "deposit") {
          const email = String(
            object.customer_details?.email ?? meta.email ?? "",
          )
            .trim()
            .toLowerCase();
          if (!email) throw new Error("Missing deposit email.");
          const existing = await ctx.db
            .query("patients")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique();
          if (object.amount_total !== 4850)
            throw new Error("Unexpected deposit amount.");
          patientId =
            existing?._id ??
            (await ctx.db.insert("patients", {
              name: object.customer_details?.name ?? "New patient",
              email,
              phone: object.customer_details?.phone ?? meta.phone ?? "",
              stage: "deposit_paid",
              status: "on_track",
              goal: "",
              source: "ghl",
              depositAt: now,
              referralToken: crypto.randomUUID(),
              ghlContactId: meta.ghlContactId,
              ghlOpportunityId: meta.ghlOpportunityId,
              stripeCustomerId: object.customer,
            }));
        }
        if (!patientId || !(await ctx.db.get(patientId)))
          throw new Error("Patient match required.");
        const old = await ctx.db
          .query("payments")
          .withIndex("by_stripe", (q) =>
            q.eq("stripeId", object.payment_intent),
          )
          .unique();
        if (!old) {
          if (meta.kind === "plan") {
            const plan:any = await ctx.db.get(meta.planId);
            if (
              !plan ||
              plan.patientId !== patientId ||
              !plan.termsAcceptedAt ||
              !["price_revealed", "sent_to_portal"].includes(plan.status)
            )
              throw new Error("Plan payment requires reconciliation.");
            const agreement:any=meta.agreementId?await ctx.db.get(meta.agreementId):null;
            if(!agreement||agreement._id!==plan.agreementId||agreement.planId!==plan._id||agreement.status!=='accepted')throw new Error('Payment agreement requires reconciliation.');
            const deposit=agreement.depositCreditCents,schedule=agreement;
            if (object.amount_total !== schedule.charges[0].amountCents)
              throw new Error("Payment amount mismatch.");
            for(const allocation of agreement.deposits){const d:any=await ctx.db.get(allocation.id);if(!d||d.patientId!==patientId||d.appliedToId&&d.appliedToId!==plan._id||(d.amountCents-(d.refundedCents??0))!==allocation.amountCents)throw new Error('Deposit allocation requires reconciliation.');await ctx.db.patch(d._id,{appliedToId:plan._id});}
            // PP-11/PP-14: payment makes the proposal the plan of care; care starts now.
            await ctx.db.patch(plan._id, {
              status: "accepted",
              acceptedAt: now,
              startDate: agreement.startDate,
              installments: plan.paymentOption === "installments",
            });
            await ctx.db.patch(agreement._id,{status:'paid'});
            for(const attempt of await ctx.db.query('checkoutAttempts').withIndex('by_target',q=>q.eq('targetId',plan._id)).collect())if(attempt.agreementId===agreement._id)await ctx.db.patch(attempt._id,{status:'paid'});
            await ctx.db.patch(patientId, { stage: "in_care" });
            for (let i = 1; i < schedule.charges.length; i++)
              await ctx.db.insert("installmentSchedules", {
                patientId,
                planId: plan._id,
                ...schedule.charges[i],
                sequence: i + 1,
                status: "scheduled",
              });
            await event(ctx, patientId, "plan_accepted");
            await award(ctx, patientId, "plan");
            if (plan.paymentOption === "installments")
              await enqueue(
                ctx,
                "payment_method",
                `payment-method:${plan._id}`,
                { paymentIntent: object.payment_intent },
                patientId,
              );
            await enqueue(
              ctx,
              "ghl_stage",
              `plan:${plan._id}`,
              { stage: "poc_engaged" },
              patientId,
            );
            await snapshotPlan(ctx,await ctx.db.get(plan._id),'accepted');
            for(const save of await forPatient(ctx,'saves',patientId))if(save.rule==='plan_declined'&&!save.doneAt)await ctx.db.patch(save._id,{doneAt:now,outcome:'plan_accepted',conditionActive:false});
          } else {
            await event(ctx, patientId, "deposit_paid");
            await award(ctx, patientId, "deposit");
            await notify(ctx, patientId, "invite", `invite:${patientId}`);
            await enqueue(
              ctx,
              "ghl_stage",
              `deposit:${patientId}`,
              { stage: "deposit_paid" },
              patientId,
            );
          }
          await ctx.db.insert("payments", {
            patientId,
            kind: meta.kind === "plan" ? "plan_of_care" : "deposit",
            amountCents: object.amount_total,
            stripeId: object.payment_intent,
            status: "paid",
            at: now,
          });
          await ctx.db.patch(patientId, { stripeCustomerId: object.customer });
          await enqueue(
            ctx,
            "document",
            `receipt:${object.payment_intent}`,
            { kind: "receipt", amountCents: object.amount_total },
            patientId,
          );
        }
      } else if (
        type === "checkout.session.completed" &&
        object.mode === "setup" &&
        meta.membershipId
      ) {
        await enqueue(
          ctx,
          "membership_authorize",
          `authorize:${object.id}`,
          {
            membershipId: meta.membershipId,
            setupIntent: object.setup_intent,
            customer: object.customer,
          },
          meta.patientId,
        );
      } else if (type === "invoice.created" && object.subscription) {
        const member = await ctx.db
          .query("memberships")
          .withIndex("by_stripe", (q) =>
            q.eq("stripeSubscriptionId", object.subscription),
          )
          .unique();
        if (member)
          await enqueue(
            ctx,
            "membership_credit",
            `credit:${object.id}`,
            { invoiceId: object.id, amount: object.amount_due },
            member.patientId,
          );
      } else if (["invoice.paid", "invoice.payment_failed"].includes(type)) {
        const member = object.subscription
          ? await ctx.db
              .query("memberships")
              .withIndex("by_stripe", (q) =>
                q.eq("stripeSubscriptionId", object.subscription),
              )
              .unique()
          : null;
        const schedule:any = meta.scheduleId
          ? await ctx.db.get(meta.scheduleId)
          : null;
        const patientId = member?.patientId ?? schedule?.patientId;
        if(!member && object.subscription_details?.metadata?.membershipId)
          throw new Error('Membership activation is still processing. Retry this event.');
        if (patientId) {
          const old = await ctx.db
              .query("payments")
              .withIndex("by_stripe", (q) => q.eq("stripeId", object.id))
              .unique(),
            status = type === "invoice.paid" ? "paid" : "failed";
          // An older failure cannot undo a settled invoice.
          if(old?.status==='paid'&&status==='failed'){
            await ctx.db.patch(e._id,{status:'done'});return;
          }
          if (old) await ctx.db.patch(old._id, { status });
          else
            await ctx.db.insert("payments", {
              patientId,
              kind: member ? "membership" : "plan_of_care",
              amountCents: object.amount_paid || object.amount_due,
              stripeId: object.id,
              status,
              at: now,
            });
          if (schedule)
            await ctx.db.patch(schedule._id, {
              status: status === "paid" ? "paid" : "failed",
              stripeId: object.id,
            });
          const eventAt=(e.payload.created??Math.floor(now/1000))*1000;
          if (member && !member.cancelAt && eventAt >= (member.lastStripeEventAt??0))
            await ctx.db.patch(member._id, {
              status: status === "paid" ? "active" : "failed",
              lastStripeEventAt:eventAt,
            });
          if(member&&status==='paid'&&member.status==='failed'){
            await event(ctx,patientId,'membership_activation_recovered');
            await enqueue(ctx,'ghl_stage',`member-recovered:${member._id}`,{stage:'member'},patientId);
          }
          if(status==='paid')await enqueue(ctx,'document',`receipt:${object.id}`,{kind:'receipt'},patientId);
          if(!old||old.status!==status)await event(ctx,patientId,status==='paid'?'payment_succeeded':'payment_failed');
        }
      } else if (type === "customer.subscription.deleted") {
        const member = await ctx.db
          .query("memberships")
          .withIndex("by_stripe", (q) =>
            q.eq("stripeSubscriptionId", object.id),
          )
          .unique();
        if (member) {
          await ctx.db.patch(member._id, {
            status: "cancelled",
            cancelAt: now,
          });
          await event(ctx, member.patientId, "membership_cancelled");
        }
      } else if (type === "invoice.voided") {
        const member = object.subscription
          ? await ctx.db
              .query("memberships")
              .withIndex("by_stripe", (q) =>
                q.eq("stripeSubscriptionId", object.subscription),
              )
              .unique()
          : null;
        if (member) {
          const reservationKey =
            object.billing_reason === "subscription_create"
              ? `invoice:first:${member._id}`
              : `invoice:${object.id}`;
          const entry = await ctx.db
            .query("creditLedger")
            .withIndex("by_key", (q) => q.eq("key", reservationKey))
            .unique();
          const reversalKey = `reverse:${reservationKey}`;
          if (
            entry &&
            !(await ctx.db
              .query("creditLedger")
              .withIndex("by_key", (q) => q.eq("key", reversalKey))
              .unique())
          )
            await ctx.db.insert("creditLedger", {
              patientId: member.patientId,
              amountCents: -entry.amountCents,
              reason: "Voided membership invoice",
              appliedToPaymentId: object.id,
              key: reversalKey,
              at: now,
            });
        }
      } else if (type === "charge.refunded") {
        const payment = await ctx.db
          .query("payments")
          .withIndex("by_stripe", (q) =>
            q.eq("stripeId", object.payment_intent),
          )
          .unique();
        if (payment) {
          if(object.amount_refunded<(payment.refundedCents??0)){await ctx.db.patch(e._id,{status:'done'});return;}
          await ctx.db.patch(payment._id, {
            status: object.refunded ? "refunded" : "partially_refunded",
            refundedCents: object.amount_refunded,
          });
          if (
            object.refunded &&
            ["deposit", "plan_of_care"].includes(payment.kind)
          ) {
            const referral = await ctx.db
              .query("referrals")
              .filter((q) =>
                q.eq(q.field("referredPatientId"), payment.patientId),
              )
              .first();
            if (referral) {
              const awardKey = `referral:${referral._id}:${payment.kind === "deposit" ? "deposit" : "plan"}`,
                reversalKey = `reversal:${awardKey}`;
              const credit = await ctx.db
                .query("creditLedger")
                .withIndex("by_key", (q) => q.eq("key", awardKey))
                .unique();
              if (
                credit &&
                !(await ctx.db
                  .query("creditLedger")
                  .withIndex("by_key", (q) => q.eq("key", reversalKey))
                  .unique())
              )
                await ctx.db.insert("creditLedger", {
                  patientId: credit.patientId,
                  amountCents: -credit.amountCents,
                  reason: "Referral payment refunded",
                  referralId: referral._id,
                  key: reversalKey,
                  at: now,
                });
            }
          }
        }
      }
    } else if (e.provider === "ghl") {
      const a = object.appointment ?? object;
      const p = await ctx.db
        .query("patients")
        .withIndex("by_ghl", (q) => q.eq("ghlContactId", a.contactId))
        .unique();
      if (!p) throw new Error("GHL contact is not matched to a patient.");
      const existing = await ctx.db
        .query("appointments")
        .withIndex("by_ghl", (q) => q.eq("ghlAppointmentId", a.id))
        .unique();
      const updatedAt =
        Date.parse(a.dateUpdated ?? object.dateUpdated ?? "") || e.receivedAt;
      if (!existing || updatedAt >= existing.sourceUpdatedAt) {
        const status =
          (
            {
              showed: "attended",
              noshow: "no_show",
              cancelled: "cancelled",
              canceled: "cancelled",
              confirmed: "booked",
              new: "booked",
            } as Record<string, string>
          )[a.appointmentStatus] ?? "booked";
        const startsAt = Date.parse(a.startTime);
        if (!Number.isFinite(startsAt))
          throw new Error("Invalid appointment time.");
        const kind =
          existing?.kind ??
          (a.kind === "eval" ||
          a.calendarId ===
            (globalThis.process.env.GHL_EVAL_CALENDAR_ID ??
              (await setting(ctx, "evalCalendarId")))
            ? "eval"
            : a.kind === "retest"
              ? "retest"
              : "visit");
        const data = {
          patientId: p._id,
          kind,
          startsAt,
          location: a.address ?? "",
          status,
          ghlAppointmentId: a.id,
          sourceUpdatedAt: updatedAt,
          revision: (existing?.revision??0) + (!existing || existing.startsAt!==startsAt || existing.status!==status ? 1 : 0),
        };
        const appointmentId =
          existing?._id ?? (await ctx.db.insert("appointments", data));
        if (existing) await ctx.db.patch(existing._id, data);
        const changed=!existing||existing.startsAt!==startsAt||existing.status!==status;
        for (const n of changed ? await forPatient(ctx, "notificationDeliveries", p._id) : [])
          if (
            n.status === "pending" &&
            (n.key.startsWith(`appointment:${appointmentId}:`) ||
              (kind === "eval" && n.key.startsWith("video:")))
          )
            await ctx.db.patch(n._id, { status: "cancelled" });
        if (kind === "eval" && status === "booked") {
          const sequence = (await ctx.db.query("sequences").collect()).find(
            (s) => s.active,
          );
          if (!sequence)
            throw new Error("Configure an active pre-visit sequence.");
          const dates = sequenceDates(
              startsAt,
              sequence.items.map((i: any) => i.dueOffsetDays),
              now,
            ),
            assignments = await forPatient(ctx, "videoAssignments", p._id);
          for (let i = 0; i < sequence.items.length; i++) {
            const old = assignments.find((r: any) => r.order === i);
            if (old) await ctx.db.patch(old._id, { dueAt: dates[i] });
            else
              await ctx.db.insert("videoAssignments", {
                patientId: p._id,
                videoId: sequence.items[i].videoId,
                order: i,
                dueAt: dates[i],
                ...(i === 0 ? { unlockedAt: now } : {}),
                watchedSec: 0,
              });
          }
          if (p.stage === "deposit_paid")
            await ctx.db.patch(p._id, { stage: "pre_visit" });
          if (
            startsAt - now < DAY &&
            !(await forPatient(ctx, "saves", p._id)).some(
              (s: any) => s.rule === "late_booking" && !s.doneAt,
            )
          )
            await ctx.db.insert("saves", {
              patientId: p._id,
              rule: "late_booking",
              level: "watch",
              play: "Help prepare for a short-notice evaluation",
              ownerRole: "sdr",
              dueAt: now,
              conditionActive: true,
              attempts: [],
            });
        }
        if(kind==='eval'&&['attended','no_show'].includes(status)&&!p.evaluationCohort){
          const assigned=(await forPatient(ctx,'videoAssignments',p._id)).filter((r:any)=>r._creationTime<=startsAt);
          await ctx.db.patch(p._id,{evaluationCohort:{appointmentId,evaluatedAt:startsAt,completedBefore:assigned.length>0&&assigned.every((r:any)=>r.quizPassedAt&&r.quizPassedAt<startsAt)}});
        }
        if (
          kind === "eval" &&
          status !== existing?.status &&
          ["attended", "no_show"].includes(status)
        )
          await event(
            ctx,
            p._id,
            status === "attended" ? "eval_attended" : "eval_no_show",
          );
        if (kind === "visit" && status === "attended" && !p.reviewConfirmedAt)
          await enqueue(
            ctx,
            "ghl_stage",
            `first-visit:${p._id}`,
            { stage: "no_review" },
            p._id,
          );
      }
    }
    await ctx.db.patch(id, {
      status: "done",
      processedAt: now,
      attempts: e.attempts + 1,
    });
    await ctx.scheduler.runAfter(0, internal.engine.run, {});
  },
});
export const data = internalQuery({
  args: {
    patientId: v.id("patients"),
    table: v.optional(v.string()),
    id: v.optional(v.string()),
  },
  handler: async (ctx, { patientId, table, id }):Promise<any> => ({
    patient: await ctx.db.get(patientId),
    record: id ? await ctx.db.get(id as any) : null,
    rows: table ? await forPatient(ctx, table, patientId) : [],
  }),
});
export const updateExternal = internalMutation({
  args: { table: v.string(), id: v.string(), data: v.any() },
  handler: async (ctx, { id, data }) => {
    const old:any=await ctx.db.get(id as any);
    if(old?.template==='invite'&&old.channel==='email'&&old.status!=='sent'&&data.status==='sent')await event(ctx,old.patientId,'invite_sent');
    await ctx.db.patch(id as any, data);
  },
});
