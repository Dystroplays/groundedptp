import { action, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { scope, forPatient, audit } from "./access";
import { enqueue } from "./jobs";
import { paymentSchedule, creditToApply, allowed } from "../src/domain";
import { eligibleDeposits } from './agreements';
export async function stripe(
  path: string,
  fields: Record<string, string>,
  key?: string,
  method = "POST",
) {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Payments are not configured.");
  if(process.env.ALLOW_REAL_PATIENTS!=='true'&&!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))throw new Error('Staging requires a Stripe test key.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": "2024-06-20",
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(method === "POST" ? { body: new URLSearchParams(fields) } : {}),
  });
  if (!response.ok)
    throw new Error(`Payment provider request failed (${response.status}).`);
  return response.json();
}
export const checkoutContext = internalQuery({
  args: {
    patientId: v.id("patients"),
    kind: v.string(),
    id: v.optional(v.string()),
  },
  handler: async (ctx, { patientId, kind, id }) => {
    const a = await scope(ctx, patientId,undefined,kind==='plan');
    const patientActing = a.patient?._id === patientId;
    if (kind === "plan") {
      // PP-11: the closer may open Checkout on the tablet or text the link.
      const planId = ctx.db.normalizeId("plansOfCare", id ?? "");
      const plan = planId ? await ctx.db.get(planId) : null;
      const closer = !!a.staff && allowed(a.roles, "finance");
      if (
        !plan ||
        plan.patientId !== patientId ||
        !plan.termsAcceptedAt ||
        !plan.paymentOption ||
        !(
          (patientActing && plan.status === "sent_to_portal") ||
          (closer && ["price_revealed", "sent_to_portal"].includes(plan.status))
        )
      )
        throw new Error("Accept the plan first.");
      const agreement=plan.agreementId?await ctx.db.get(plan.agreementId):null;
      if(!agreement||agreement.status!=='accepted')throw new Error('Accept the current payment agreement first.');
      const deposits=await eligibleDeposits(ctx,patientId,plan._id);
      if(deposits.reduce((n:number,p:any)=>n+p.amountCents,0)!==agreement.depositCreditCents)throw new Error('Your deposit balance changed. Review and accept the updated agreement.');
      return {
        patient: a.target,
        plan,
        agreement,
        staff: !patientActing,
        deposit: deposits.reduce((n: number, p: any) => n + p.amountCents, 0),
      };
    }
    if (!patientActing) throw new Error("Patient authorization required.");
    if (kind === "membership") {
      const member:any = await ctx.db.get(id as any);
      if (
        !member ||
        member.patientId !== patientId ||
        member.status !== "pending_authorization"
      )
        throw new Error("Enrollment unavailable.");
      return { patient: a.target, member };
    }
    if (kind !== "manage") throw new Error("Invalid payment action.");
    return { patient: a.target };
  },
});
export const checkout = action({
  args: {
    patientId: v.id("patients"),
    kind: v.union(
      v.literal("plan"),
      v.literal("membership"),
      v.literal("manage"),
    ),
    id: v.optional(v.string()),
    deliver: v.optional(v.union(v.literal("redirect"), v.literal("text"))),
  },
  handler: async (ctx, { deliver = "redirect", ...args }): Promise<string> => {
    const data: any = await ctx.runQuery(internal.payments.checkoutContext, args);
    if (deliver === "text" && !data.staff)
      throw new Error("Only the team can text a payment link.");
    if(deliver==='text'){
      await ctx.runMutation(internal.payments.textPaymentLink,{patientId:args.patientId,agreementId:data.agreement._id});
      return '';
    }
    return createCheckout(ctx,args,data);
  },
});
async function createCheckout(ctx:any,args:any,data:any):Promise<string>{
    const origin = process.env.SITE_URL!;
    if (args.kind === "manage") {
      if (!data.patient.stripeCustomerId)
        throw new Error("No payment account yet.");
      return (
        await stripe("billing_portal/sessions", {
          customer: data.patient.stripeCustomerId,
          return_url: `${origin}/more/payments`,
        })
      ).url;
    }
    const back =
      data.staff
        ? `${origin}/team/patients/${args.patientId}/present`
        : `${origin}/more/plan`;
    const fields: Record<string, string> = {
      success_url: `${back}?result=success`,
      cancel_url: `${back}?result=cancelled`,
      "metadata[patientId]": args.patientId,
      "metadata[kind]": args.kind,
    };
    if (data.patient.stripeCustomerId)
      fields.customer = data.patient.stripeCustomerId;
    else {
      fields.customer_email = data.patient.email;
      fields.customer_creation = "always";
    }
    if (args.kind === "membership") {
      fields.mode = "setup";
      delete fields.customer_creation;
      fields["metadata[membershipId]"] = args.id!;
      fields["setup_intent_data[metadata][membershipId]"] = args.id!;
    } else {
      if (process.env.ENABLE_CARE !== "true")
        throw new Error("Care payments are not enabled.");
      const schedule=data.agreement;
      Object.assign(fields, {
        mode: "payment",
        "metadata[planId]": args.id!,
        "metadata[agreementId]":data.agreement._id,
        "metadata[depositCents]": String(data.deposit),
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": "Grounded services",
        "line_items[0][price_data][unit_amount]": String(
          schedule.charges[0].amountCents,
        ),
        "line_items[0][quantity]": "1",
      });
      if (data.plan.paymentOption === "installments")
        fields["payment_intent_data[setup_future_usage]"] = "off_session";
    }
    const attempt=await ctx.runMutation(internal.payments.beginCheckout,{patientId:args.patientId,targetId:args.id!,kind:args.kind,...(data.agreement?{agreementId:data.agreement._id}:{})});
    for(const sessionId of [attempt.sessionId,attempt.previousSessionId].filter(Boolean)){
      const session=await stripe(`checkout/sessions/${sessionId}`,{},undefined,'GET');
      if(session.status==='complete')throw new Error('Payment is processing. Your portal will update after confirmation.');
      if(session.status==='open')return session.url;
    }
    fields.expires_at=String(Math.floor(attempt.expiresAt/1000));
    fields['metadata[attemptId]']=attempt._id;
    const result = await stripe(
      "checkout/sessions",
      fields,
      `checkout:${attempt._id}`,
    );
    await ctx.runMutation(internal.payments.recordCheckout,{id:attempt._id,sessionId:result.id});
    return result.url;
}
export const beginCheckout=internalMutation({args:{patientId:v.id('patients'),targetId:v.string(),kind:v.string(),agreementId:v.optional(v.id('paymentAgreements'))},handler:async(ctx,args)=>{
  if(args.agreementId){const a=await ctx.db.get(args.agreementId),p=a?await ctx.db.get(a.planId):null;if(!a||a.status!=='accepted'||p?.agreementId!==a._id||!['price_revealed','sent_to_portal'].includes(p.status))throw new Error('Agreement unavailable.');}
  const old=await ctx.db.query('checkoutAttempts').withIndex('by_target',q=>q.eq('targetId',args.targetId)).order('desc').first();
  if(old&&!['expired','cancelled'].includes(old.status??'open')){
    if(old.agreementId!==args.agreementId)throw new Error('Cancel or reconcile the earlier checkout first.');
    if(old.expiresAt<=Date.now()&&!old.sessionId)throw new Error('An earlier checkout needs reconciliation before retrying.');
    if(old.expiresAt>Date.now())return old;
  }
  const id=await ctx.db.insert('checkoutAttempts',{...args,status:'open',expiresAt:Date.now()+3_600_000,...(old?.sessionId&&old.agreementId===args.agreementId?{previousSessionId:old.sessionId}:{})});
  return (await ctx.db.get(id))!;
}});
/** PP-11 / GH-6: the payment link goes to the patient's phone through GHL. */
export const textPaymentLink = internalMutation({
  args: { patientId: v.id("patients"), agreementId:v.id('paymentAgreements') },
  handler: async (ctx, { patientId, agreementId }) => {
    const a = await scope(ctx, patientId, "finance",true);
    if (!a.target.phone && !a.target.ghlContactId)
      throw new Error("Add the patient's phone number first.");
    await enqueue(ctx, "payment_link_text", `paylink:${agreementId}`, { agreementId }, patientId);
  },
});
export const deliveryContext=internalQuery({args:{agreementId:v.id('paymentAgreements')},handler:async(ctx,{agreementId})=>{
  const agreement=await ctx.db.get(agreementId),plan=agreement?await ctx.db.get(agreement.planId):null;
  if(!agreement||agreement.status!=='accepted'||plan?.agreementId!==agreementId||!['price_revealed','sent_to_portal'].includes(plan.status))return null;
  const deposits=await eligibleDeposits(ctx,agreement.patientId,plan._id);
  if(deposits.reduce((n:number,p:any)=>n+p.amountCents,0)!==agreement.depositCreditCents)throw new Error('Deposit balance changed; a new agreement is required.');
  const patient=await ctx.db.get(agreement.patientId);if(!patient)return null;return{patient,plan,agreement,deposit:agreement.depositCreditCents,staff:false};
}});
export const deliveryCheckout=internalAction({args:{agreementId:v.id('paymentAgreements')},handler:async(ctx,args):Promise<string|null>=>{
  const data=await ctx.runQuery(internal.payments.deliveryContext,args);if(!data)return null;
  return createCheckout(ctx,{kind:'plan',patientId:data.patient._id,id:data.plan._id},data);
}});
export const cancellationContext=internalQuery({args:{patientId:v.id('patients'),planId:v.id('plansOfCare')},handler:async(ctx,{patientId,planId})=>{
  const a=await scope(ctx,patientId,undefined,true);if(a.patient?._id!==patientId&&!allowed(a.roles,'finance')&&!(a.roles.includes('pt')&&a.target.ptId===a.staff?._id))throw new Error('Staff access required.');
  const plan=await ctx.db.get(planId);if(plan?.patientId!==patientId)throw new Error('Plan unavailable.');
  return (await ctx.db.query('checkoutAttempts').withIndex('by_target',q=>q.eq('targetId',planId)).collect()).filter(a=>!['cancelled','expired','paid'].includes(a.status??'open'));
}});
export const markCancelled=internalMutation({args:{id:v.id('checkoutAttempts')},handler:async(ctx,{id})=>{const attempt=await ctx.db.get(id);if(!attempt)throw new Error('Checkout unavailable.');const a=await scope(ctx,attempt.patientId,undefined,true);await ctx.db.patch(id,{status:'cancelled'});if(a.staff)await audit(ctx,a.userId,'checkout_cancelled','checkoutAttempts',id);}});
export const cancelCheckout=action({args:{patientId:v.id('patients'),planId:v.id('plansOfCare')},handler:async(ctx,args):Promise<void>=>{
  const attempts=await ctx.runQuery(internal.payments.cancellationContext,args);
  for(const a of attempts){
    if(!a.sessionId)throw new Error('Checkout creation is unresolved. Reconcile the provider request before editing.');
    const session=await stripe(`checkout/sessions/${a.sessionId}`,{},undefined,'GET');
    if(session.status==='complete')throw new Error('Payment is settling. Wait for confirmation before making changes.');
    if(session.status==='open')await stripe(`checkout/sessions/${a.sessionId}/expire`,{},`cancel:${a._id}`);
    await ctx.runMutation(internal.payments.markCancelled,{id:a._id});
  }
}});
export const recordCheckout=internalMutation({args:{id:v.id('checkoutAttempts'),sessionId:v.string()},handler:async(ctx,{id,sessionId})=>{await ctx.db.patch(id,{sessionId});}});
export const reserveCredit = internalMutation({
  args: {
    patientId: v.id("patients"),
    invoiceId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, { patientId, invoiceId, amount }) => {
    const key = `invoice:${invoiceId}`;
    const old = await ctx.db
      .query("creditLedger")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (old) return -old.amountCents;
    const balance = (await forPatient(ctx, "creditLedger", patientId)).reduce(
        (n: number, c: any) => n + c.amountCents,
        0,
      ),
      applied = creditToApply(balance, amount);
    if (applied)
      await ctx.db.insert("creditLedger", {
        patientId,
        amountCents: -applied,
        reason: "Membership invoice credit",
        appliedToPaymentId: invoiceId,
        key,
        at: Date.now(),
      });
    return applied;
  },
});
