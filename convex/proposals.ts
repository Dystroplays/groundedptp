import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { outcome, phase } from './schema';
import { scope, audit, event, forPatient } from "./access";
import { enqueue, notify } from "./jobs";
import { internal } from "./_generated/api";
import { DAY, allowed, installmentTotal } from "../src/domain";
import { quote,acceptAgreement,invalidateAgreement,snapshotPlan } from './agreements';
import {
  DEPOSIT_CENTS,
  canTransition,
  declineReasons,
  investment,
  proposalGaps,
  redactPrice,
  priceVisible,
} from "../src/proposal";

const open = ["draft", "produced", "scope_confirmed", "price_revealed"];
const latest = (plans: any[], statuses?: string[]) =>
  plans
    .filter((p) => !statuses || statuses.includes(p.status))
    .sort((a, b) => b._creationTime - a._creationTime)[0] ?? null;

/** T4: the PT's working copy, including price. */
export const builder = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const a = await scope(ctx, patientId, "clinical");
    const plans = await forPatient(ctx, "plansOfCare", patientId);
    return {
      patient: {
        name: a.target.name,
        goal: a.target.goal,
        mainPain: a.target.mainPain ?? "",
      },
      templates: (await ctx.db.query("proposalTemplates").collect()).filter(
        (t) => t.active,
      ),
      proposal: latest(plans, [...open, "declined", "sent_to_portal"]),
      plan: latest(plans, ["accepted", "completed"]),
    };
  },
});

/** T3 presentation mode. Price fields never leave the server before the reveal (PP-7). */
export const presentation = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const a = await scope(ctx, patientId, "finance",true);
    const plan = latest(
      (await forPatient(ctx, "plansOfCare", patientId)).filter(
        (p: any) => p.status !== "draft",
      ),
    );
    const firstName = a.target.name.split(" ")[0];
    if (!plan) return { firstName, proposal: null, investment: null };
    const author:any = plan.authorId ? await ctx.db.get(plan.authorId) : null;
    const priced=priceVisible(plan)?await quote(ctx,plan):plan;
    return {
      firstName,
      ptName: author?.name ?? "Your PT",
      proposal: redactPrice(priced),
      investment: priceVisible(plan)
        ? investment(priced.priceCents, priced.depositCreditCents)
        : null,
    };
  },
});

const operations = [
  "saveDraft",
  "produce",
  "confirmScope",
  "scopeQuestions",
  "revealPrice",
  "acceptTerms",
  "decline",
  "sendToPortal",
  "sign",
  "revise",
  "updateOffer",
  "approveInstallments",
] as const;
export const act = mutation({
  args: {
    patientId: v.id("patients"),
    operation: v.union(...operations.map(v.literal)),
    payload: v.object({id:v.optional(v.id('plansOfCare')),templateId:v.optional(v.id('proposalTemplates')),expectedOfferVersion:v.optional(v.number()),expectedVersion:v.optional(v.number()),mainPain:v.optional(v.string()),goal:v.optional(v.string()),findings:v.optional(v.string()),weeks:v.optional(v.number()),visitsPerWeek:v.optional(v.number()),why:v.optional(v.string()),programmingFocus:v.optional(v.string()),outcomes:v.optional(v.array(outcome)),phases:v.optional(v.array(phase)),included:v.optional(v.array(v.string())),priceCents:v.optional(v.number()),startDate:v.optional(v.number()),option:v.optional(v.union(v.literal('full'),v.literal('installments'))),accepted:v.optional(v.boolean()),reason:v.optional(v.string()),note:v.optional(v.string())}),
  },
  handler: async (ctx, { patientId, operation, payload: x }) => {
    const permission = (
      {
        saveDraft: "clinical",
        produce: "clinical",
        sign: "clinical",
        revise: "clinical",
        confirmScope: "finance",
        scopeQuestions: "finance",
        revealPrice: "finance",
        decline: "finance",
        sendToPortal: "finance",
      } as const
    )[operation as string] as "clinical" | "finance" | undefined;
    const limitedOperations=['confirmScope','scopeQuestions','revealPrice','acceptTerms','decline','sendToPortal','approveInstallments'];
    const a = await scope(ctx, patientId, permission,limitedOperations.includes(operation));
    if(operation==='updateOffer'&&!a.roles.includes('admin')&&!a.roles.includes('closer')&&!(a.roles.includes('pt')&&a.target.ptId===a.staff?._id))throw new Error('Assigned PT or closer access required.');
    if(operation==='approveInstallments'&&!allowed(a.roles,'finance'))throw new Error('Closer approval required.');
    const now = Date.now();
    const text = (value: unknown, max = 2000, required = true) => {
      if (typeof value !== "string" || value.length > max)
        throw new Error("Enter valid text.");
      if (required && !value.trim()) throw new Error("Enter valid text.");
      return value.trim();
    };
    const whole = (value: unknown, min: number, max: number) => {
      if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
        throw new Error("Enter a valid whole number.");
      return value as number;
    };
    const get = async () => {
      const id = ctx.db.normalizeId("plansOfCare", x?.id ?? "");
      const plan = id ? await ctx.db.get(id) : null;
      if (!plan || plan.patientId !== patientId)
        throw new Error("Proposal unavailable.");
      if (x.expectedOfferVersion !== undefined && x.expectedOfferVersion !== (plan.offerVersion ?? 1)) throw new Error('This offer changed. Reload it before continuing.');
      if (x.expectedVersion !== undefined && x.expectedVersion !== (plan.version ?? 1)) throw new Error('This plan changed. Reload it before continuing.');
      return plan;
    };
    const move = async (plan: any, to: any, fields: any = {}) => {
      if (!canTransition(plan.status, to))
        throw new Error("This step is not available for the proposal right now.");
      await ctx.db.patch(plan._id, { status: to, ...fields });
    };
    // Clinical content fields, validated as text/numbers; completeness is PP-3.
    const content = (x: any) => ({
      mainPain: text(x.mainPain ?? "", 1000, false),
      goal: text(x.goal ?? "", 500, false),
      findings: text(x.findings ?? "", 1000, false),
      weeks: whole(x.weeks, 1, 104),
      visitsPerWeek: whole(x.visitsPerWeek, 1, 7),
      why: text(x.why ?? "", 1000, false),
      programmingFocus: text(x.programmingFocus ?? "", 500, false),
      outcomes: (Array.isArray(x.outcomes) ? x.outcomes : [])
        .slice(0, 6)
        .map((o: any) => ({
          id:typeof o.id==='string'?o.id:crypto.randomUUID(),
          label: text(o.label ?? "", 300, false),
          measure: text(o.measure ?? "", 200, false),
          target: text(o.target ?? "", 200, false),
          retestWeek: whole(o.retestWeek, 1, 104),
        })),
      phases: (Array.isArray(x.phases) ? x.phases : [])
        .slice(0, 6)
        .map((p: any) => ({
          name: text(p.name ?? "", 120, false),
          weekStart: whole(p.weekStart, 1, 104),
          weekEnd: whole(p.weekEnd, 1, 104),
          focus: text(p.focus ?? "", 500, false),
          visits: whole(p.visits, 0, 100),
          milestone: text(p.milestone ?? "", 200, false),
        })),
    });
    const visits = (c: any) =>
      c.phases.reduce((n: number, p: any) => n + p.visits, 0) ||
      c.weeks * c.visitsPerWeek;
    let result: any = null;

    if(operation==='updateOffer'||operation==='approveInstallments'){
      const plan=await get();
      if(['accepted','completed'].includes(plan.status)||plan.signedAt)throw new Error('Accepted financial terms are locked.');
      await invalidateAgreement(ctx,plan);
      const changes=operation==='approveInstallments'?{installmentsApprovedBy:a.staff._id,installmentsApprovedAt:now}:{priceCents:whole(x.priceCents,4851,10_000_000),installmentTotalCents:installmentTotal(whole(x.priceCents,4851,10_000_000)),startDate:typeof x.startDate==='number'&&Number.isFinite(x.startDate)?x.startDate:plan.startDate,installmentsApprovedBy:undefined,installmentsApprovedAt:undefined};
      await ctx.db.patch(plan._id,{...changes,offerVersion:(plan.offerVersion??1)+1,agreementId:undefined,termsAcceptedAt:undefined,terms:undefined,paymentOption:undefined,priceRevealedAt:undefined,sentToPortalAt:undefined,status:plan.status==='draft'?'draft':plan.scopeConfirmedAt?'scope_confirmed':'produced'});
      await event(ctx,patientId,operation==='updateOffer'?'offer_updated':'installments_approved',{planId:plan._id});
    }else if (operation === "saveDraft") {
      const fields: any = {
        ...content(x),
        included: (Array.isArray(x.included) ? x.included : [])
          .slice(0, 12)
          .map((i: any) => text(i, 300)),
        priceCents: whole(x.priceCents, 0, 10_000_000),
        ...(typeof x.startDate==='number'&&Number.isFinite(x.startDate)?{startDate:x.startDate}:{}),
      };
      if (x.templateId) {
        const templateId = ctx.db.normalizeId("proposalTemplates", x.templateId);
        if (!templateId || !(await ctx.db.get(templateId)))
          throw new Error("Template unavailable.");
        fields.templateId = templateId;
      }
      fields.visits = visits(fields);
      fields.installmentTotalCents =
        fields.priceCents > 0 ? installmentTotal(fields.priceCents) : 0;
      if (x.id) {
        const plan = await get();
        await invalidateAgreement(ctx,plan);
        fields.offerVersion=(plan.offerVersion??1)+1;
        // Edits after Produce stay live on the tablet until the patient confirms scope.
        if (!["draft", "produced"].includes(plan.status))
          throw new Error("This proposal is locked. Start a new one or revise the signed plan.");
        if (plan.status === "produced") {
          const gaps = proposalGaps(fields);
          if (gaps.length) throw new Error(`Before saving: ${gaps.join("; ")}.`);
        }
        await ctx.db.patch(plan._id, fields);
        result = plan._id;
      } else {
        const plans = await forPatient(ctx, "plansOfCare", patientId);
        const existing = plans.find((p: any) => p.status === "draft");
        if (existing) {
          await invalidateAgreement(ctx,existing);
          await ctx.db.patch(existing._id, {...fields,offerVersion:(existing.offerVersion??1)+1});
          result = existing._id;
        } else
          result = await ctx.db.insert("plansOfCare", {
            patientId,
            ...fields,
            startDate: fields.startDate??now,
            status: "draft",
            installments: false,
            authorId: a.staff._id,
            depositCreditCents: DEPOSIT_CENTS,
            version: 1,
            offerVersion:1,
            revisions: [],
          });
      }
      await ctx.db.patch(patientId, {
        ...(fields.goal ? { goal: fields.goal } : {}),
        ...(fields.mainPain ? { mainPain: fields.mainPain } : {}),
      });
    } else if (operation === "produce") {
      if (process.env.ENABLE_CARE !== "true")
        throw new Error("Care release is not enabled.");
      const plan = await get();
      const gaps = proposalGaps(plan);
      if (gaps.length) throw new Error(`Before Produce: ${gaps.join("; ")}.`);
      const others = (await forPatient(ctx, "plansOfCare", patientId)).filter(
        (p: any) =>
          p._id !== plan._id &&
          ["produced", "scope_confirmed", "price_revealed"].includes(p.status),
      );
      if (others.length)
        throw new Error("Another proposal is being presented. Decline it before producing a new one.");
      await move(plan, "produced", {
        producedAt: now,
        authorId: a.staff._id,
      });
      await event(ctx, patientId, "proposal_produced", { planId: plan._id });
    } else if (operation === "confirmScope") {
      const plan = await get();
      await move(plan, "scope_confirmed", { scopeConfirmedAt: now });
      await event(ctx, patientId, "scope_confirmed", { planId: plan._id });
    } else if (operation === "scopeQuestions") {
      const plan = await get();
      if (plan.status !== "produced")
        throw new Error("Questions are recorded before the plan is confirmed.");
      await event(ctx, patientId, "scope_questions", { planId: plan._id });
    } else if (operation === "revealPrice") {
      const plan = await get();
      if (!plan.scopeConfirmedAt)
        throw new Error("The patient must confirm the plan first.");
      await move(plan, "price_revealed", { priceRevealedAt: now });
      await event(ctx, patientId, "price_revealed", { planId: plan._id });
    } else if (operation === "acceptTerms") {
      if (process.env.ENABLE_CARE !== "true")
        throw new Error("Care release is not enabled.");
      const plan = await get();
      const patientActing = a.patient?._id === patientId;
      if (
        !(
          (patientActing && plan.status === "sent_to_portal") ||
          (a.staff &&
            allowed(a.roles, "finance") &&
            ["price_revealed", "sent_to_portal"].includes(plan.status))
        )
      )
        throw new Error("This plan is not ready for acceptance.");
      if ((x.option !== 'full' && x.option !== 'installments') || x.accepted !== true)
        throw new Error("Choose a payment option and accept the plan to continue.");
      await acceptAgreement(ctx,plan,x.option,a.userId);
      result = { checkoutPlanId: plan._id };
    } else if (operation === "decline") {
      const plan = await get();
      if (!x.reason || !declineReasons.includes(x.reason))
        throw new Error("Choose a reason.");
      await move(plan, "declined", {
        declinedAt: now,
        declineReason: x.reason,
        declineNote: text(x.note ?? "", 2000, false),
      });
      await enqueue(
        ctx,
        "ghl_stage",
        `decline:${plan._id}`,
        { stage: "eval_no_poc" },
        patientId,
      );
      // A manual save: the rules engine never auto-closes it.
      if(!(await forPatient(ctx,'saves',patientId)).some((s:any)=>s.rule==='plan_declined'&&!s.doneAt))await ctx.db.insert("saves", {
        patientId,
        rule: "plan_declined",
        level: "watch",
        play: "Follow up on the plan of care",
        ownerRole: "closer",
        ...(a.target.closerId ? { ownerId: a.target.closerId } : {}),
        dueAt: now + DAY,
        conditionActive: false,
        attempts: [],
      });
      await event(ctx, patientId, "plan_declined", { planId: plan._id, reason: x.reason });
    } else if (operation === "sendToPortal") {
      const plan = await get();
      await move(plan, "sent_to_portal", { sentToPortalAt: now });
      await snapshotPlan(ctx,{...await quote(ctx,plan),status:'sent_to_portal',sentToPortalAt:now},'proposal');
      await notify(ctx, patientId, "plan_ready", `proposal:${plan._id}`);
      await event(ctx, patientId, "proposal_sent_to_portal", { planId: plan._id });
    } else if (operation === "sign") {
      const plan = await get();
      if (!["accepted", "completed"].includes(plan.status))
        throw new Error("Sign the plan of care after the patient accepts it.");
      if (plan.signedAt) throw new Error("Plan already signed.");
      await ctx.db.patch(plan._id, { signedAt: now, signedBy: a.staff._id });
      await snapshotPlan(ctx,{...plan,signedAt:now,signedBy:a.staff._id},'signed');
      await event(ctx, patientId, "plan_signed", { planId: plan._id });
    } else if (operation === "revise") {
      const plan = await get();
      if (!plan.signedAt || !["accepted", "completed"].includes(plan.status))
        throw new Error("Only a signed plan of care can be revised.");
      const note = text(x.note, 1000);
      await snapshotPlan(ctx,plan,'signed');
      const fields = content({ ...plan, ...x });
      fields.outcomes = fields.outcomes.map((o: any) => {
        const old = plan.outcomes?.find((p: any) => p.id&&p.id===o.id);
        return old?.doneAt ? { ...o, doneAt: old.doneAt } : o;
      });
      const gaps = proposalGaps({ ...plan, ...fields });
      if (gaps.length) throw new Error(`Before saving: ${gaps.join("; ")}.`);
      const previous: any = {};
      for (const key of Object.keys(fields)) previous[key] = (plan as any)[key];
      const version = (plan.version ?? 1) + 1;
      await ctx.db.patch(plan._id, {
        ...fields,
        visits: visits(fields),
        version,
        signedAt: now,
        signedBy: a.staff._id,
        revisions: [
          ...(plan.revisions ?? []),
          {
            version,
            at: now,
            authorId: a.staff._id,
            authorName: a.staff.name,
            note,
            previous,
          },
        ],
      });
      await event(ctx, patientId, "plan_revised", { planId: plan._id, version });
      await snapshotPlan(ctx,await ctx.db.get(plan._id),'signed');
    }
    if (a.staff) await audit(ctx, a.userId, `proposal_${operation}`, "plansOfCare", x?.id ?? result ?? patientId);
    await ctx.scheduler.runAfter(0, internal.engine.run, {});
    return result;
  },
});
