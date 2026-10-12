import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { DAY, installmentTotal, paymentSchedule, addCentralDays, centralTimestamp } from "../src/domain";
import {
  investment,
  proposalGaps,
  redactPrice,
  canTransition,
  bannedWording,
  starterTemplates,
} from "../src/proposal";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ENABLE_CARE", "true");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const knee = starterTemplates[0];
const proposal = {
  mainPain: "My knee aches on the stairs.",
  goal: "Back to pickleball with my grandkids",
  findings: "Your quads are weaker on the right.",
  weeks: knee.weeks,
  visitsPerWeek: knee.visitsPerWeek,
  why: knee.why,
  programmingFocus: knee.programmingFocus,
  outcomes: knee.outcomes,
  phases: knee.phases,
  included: knee.included,
  priceCents: 440000,
};

describe("proposal rules", () => {
  it("rounds the installment total to the dollar and splits 50/25/25 (PP-10)", () => {
    expect(installmentTotal(440000)).toBe(506000);
    expect(installmentTotal(433333)).toBe(498300);
    const i = investment(440000);
    expect(i.installments.total).toBe(506000);
    // $2,530 / $1,265 / $1,265 before the $48.50 deposit credit.
    expect(i.installments.charges).toEqual([253000 - 4850, 126500, 126500]);
    expect(i.full.charges).toEqual([440000 - 4850]);
    for (const price of [433333, 100001, 999999]) {
      const s = paymentSchedule(price, 4850, true, 0);
      expect(s.total % 100).toBe(0);
      expect(s.charges.reduce((n, c) => n + c.amountCents, 4850)).toBe(s.total);
    }
  });
  it("lists every missing item before Produce (PP-3)", () => {
    expect(proposalGaps(proposal)).toEqual([]);
    expect(proposalGaps({ ...proposal, mainPain: " ", goal: "" })).toHaveLength(2);
    expect(
      proposalGaps({ ...proposal, outcomes: proposal.outcomes.slice(0, 1) }),
    ).toEqual([expect.stringContaining("2 outcomes")]);
    const gap = proposal.phases.map((p, i) =>
      i === 1 ? { ...p, weekStart: 4 } : p,
    );
    const overlap = proposal.phases.map((p, i) =>
      i === 1 ? { ...p, weekStart: 2 } : p,
    );
    const short = proposal.phases.slice(0, 2);
    for (const phases of [gap, overlap, short])
      expect(proposalGaps({ ...proposal, phases })).toEqual([
        expect.stringContaining("no gaps or overlaps"),
      ]);
    expect(
      proposalGaps({
        ...proposal,
        outcomes: [{ ...proposal.outcomes[0], retestWeek: 12 }, proposal.outcomes[1]],
      }),
    ).toHaveLength(1);
  });
  it("blocks promise wording but not ordinary words (PP-16)", () => {
    expect(bannedWording("We guarantee results")).toBe(true);
    expect(bannedWording("A promise to you")).toBe(true);
    expect(bannedWording("This will cure it")).toBe(true);
    expect(bannedWording("Feel secure on stairs, procure a band")).toBe(false);
    for (const t of starterTemplates)
      expect(proposalGaps({ ...t, mainPain: "x", goal: "x" })).toEqual([]);
  });
  it("strips price fields until reveal and follows allowed transitions", () => {
    const hidden = redactPrice({ ...proposal, status: "scope_confirmed" });
    expect(hidden.priceHidden).toBe(true);
    expect(hidden).not.toHaveProperty("priceCents");
    expect(hidden).not.toHaveProperty("included");
    expect(redactPrice({ ...proposal, status: "price_revealed", priceRevealedAt: 1 }).priceCents).toBe(440000);
    expect(canTransition("draft", "produced")).toBe(true);
    expect(canTransition("produced", "price_revealed")).toBe(false);
    expect(canTransition("produced", "accepted")).toBe(false);
    expect(canTransition("declined", "sent_to_portal")).toBe(true);
    expect(canTransition("sent_to_portal", "accepted")).toBe(true);
    expect(canTransition("scope_confirmed", "sent_to_portal")).toBe(true);
  });
});

const planOf = async (c: any, id: any): Promise<any> =>
  c.t.run((ctx: any) => ctx.db.get(id));
async function clinic() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const person = async (email: string, roles?: string[]) => {
      const userId = await ctx.db.insert("users", { email });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 30 * DAY,
      });
      const staffId = roles
        ? await ctx.db.insert("staff", { userId, name: email.split("@")[0], roles, active: true })
        : undefined;
      return { userId, sessionId, staffId };
    };
    const pt = await person("jimmy@example.test", ["pt"]),
      closer = await person("blake@example.test", ["closer"]),
      patient = await person("linda@example.test");
    const patientId = await ctx.db.insert("patients", {
      userId: patient.userId,
      name: "Linda Miller",
      email: "linda@example.test",
      phone: "+15555550100",
      stage: "pre_visit",
      status: "on_track",
      goal: "",
      source: "test",
      depositAt: Date.now(),
      referralToken: "linda-token",
      ptId: pt.staffId,
      closerId: closer.staffId,
    });
    await ctx.db.insert("payments", {
      patientId,
      kind: "deposit",
      amountCents: 4850,
      stripeId: "pi_deposit",
      status: "paid",
      at: Date.now(),
    });
    return { pt, closer, patient, patientId };
  });
  const as = (p: any) => t.withIdentity({ subject: `${p.userId}|${p.sessionId}` });
  const jimmy = as(ids.pt),
    blake = as(ids.closer),
    linda = as(ids.patient),
    patientId = ids.patientId;
  const act = (who: any, operation: string, payload: any = {}) =>
    who.mutation(api.proposals.act, { patientId, operation, payload });
  const produce = async () => {
    const id = await act(jimmy, "saveDraft", proposal);
    await act(jimmy, "produce", { id });
    return id;
  };
  return { t, jimmy, blake, linda, patientId, act, produce, ids };
}

describe("plan of care proposal flow", () => {
  it('restricts combined admin/PT/closer presentation sessions across every staff API',async()=>{
    const c=await clinic();await c.produce();
    await c.t.run(ctx=>ctx.db.patch(c.ids.closer.staffId!,{roles:['admin','pt','closer']}));
    await c.blake.mutation(api.presentation.lock,{patientId:c.patientId});
    for(const op of [api.portal.dashboard,api.admin.overview])await expect(c.blake.query(op,{})).rejects.toThrow('presentation mode');
    for(const op of [api.portal.snapshot,api.proposals.builder])await expect(c.blake.query(op,{patientId:c.patientId})).rejects.toThrow('presentation mode');
    const wire=JSON.stringify(await c.blake.query(api.proposals.presentation,{patientId:c.patientId}));
    for(const amount of ['440000','506000','4850'])expect(wire).not.toContain(amount);
    expect(await c.blake.query(api.portal.viewer,{})).toMatchObject({roles:[],presentationPatientId:c.patientId});
    const other=await c.t.run(async ctx=>{const p=(await ctx.db.get(c.patientId))!;const {_id,_creationTime,userId,...fields}=p;return ctx.db.insert('patients',{...fields,email:'other@example.test',referralToken:'other'});});
    await expect(c.blake.query(api.proposals.presentation,{patientId:other})).rejects.toThrow('Presentation patient');
    await expect(c.blake.mutation(api.presentation.lock,{patientId:other})).rejects.toThrow('Presentation patient');
  });
  it('allows undecided proposals to be sent without a false decline',async()=>{
    const c=await clinic(),id=await c.produce();await c.act(c.blake,'sendToPortal',{id});
    const p=await planOf(c,id);expect(p.declinedAt).toBeUndefined();expect(p.status).toBe('sent_to_portal');
    expect(await c.t.run(ctx=>ctx.db.query('saves').collect())).toHaveLength(0);
    const versions=await c.t.run(ctx=>ctx.db.query('planVersions').collect());expect(versions[0]).toMatchObject({planId:id,state:'proposal',snapshot:{priceCents:440000,depositCreditCents:4850}});
  });
  it('invalidates revealed prices, approval, and agreement on an audited assigned-PT edit',async()=>{
    const c=await clinic(),id=await c.produce();
    await c.act(c.blake,'approveInstallments',{id});await c.act(c.blake,'confirmScope',{id});await c.act(c.blake,'revealPrice',{id});await c.act(c.blake,'acceptTerms',{id,option:'installments',accepted:true});
    const old=await planOf(c,id);
    await c.act(c.jimmy,'updateOffer',{id,priceCents:450000,startDate:Date.now()+DAY,expectedOfferVersion:old.offerVersion});
    const p=await planOf(c,id);expect(p).toMatchObject({status:'scope_confirmed',priceCents:450000,installmentTotalCents:517500});
    for(const field of ['termsAcceptedAt','agreementId','priceRevealedAt','installmentsApprovedBy'])expect(p[field]).toBeUndefined();
    expect((await c.t.run(ctx=>ctx.db.get(old.agreementId)) as any).status).toBe('superseded');
    expect((await c.t.run(ctx=>ctx.db.query('auditLog').collect())).some(x=>x.action==='proposal_updateOffer'&&x.actorId===c.ids.pt.userId)).toBe(true);
    await expect(c.act(c.jimmy,'updateOffer',{id,priceCents:460000,expectedOfferVersion:old.offerVersion})).rejects.toThrow('offer changed');
  });
  it('requires closer approval and snapshots actual remaining deposits and DST-aware dates',async()=>{
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    const c=await clinic(),id=await c.produce(),start=centralTimestamp('2026-10-20',9);
    await c.act(c.jimmy,'updateOffer',{id,priceCents:440000,startDate:start});
    await expect(c.act(c.jimmy,'approveInstallments',{id})).rejects.toThrow('Closer approval');
    await c.act(c.blake,'confirmScope',{id});await c.act(c.blake,'revealPrice',{id});
    await expect(c.act(c.blake,'acceptTerms',{id,option:'installments',accepted:true})).rejects.toThrow('approve installments');
    await c.t.run(async ctx=>{const d=(await ctx.db.query('payments').collect())[0];await ctx.db.patch(d._id,{status:'partially_refunded',refundedCents:850});});
    await c.act(c.blake,'approveInstallments',{id});await c.act(c.blake,'revealPrice',{id});await c.act(c.blake,'acceptTerms',{id,option:'installments',accepted:true});
    const p=await planOf(c,id),a:any=await c.t.run(ctx=>ctx.db.get(p.agreementId));
    expect(a.depositCreditCents).toBe(4000);expect(a.charges.map((x:any)=>x.amountCents)).toEqual([249000,126500,126500]);
    expect(a.startDate).toBe(start);expect(a.charges[1].dueAt).toBe(centralTimestamp('2026-11-17',9));expect(a.charges[2].dueAt).toBe(centralTimestamp('2026-12-08',9));
    expect(a.charges[0].dueAt).toBe(Date.now());
  });
  it('blocks option and price edits while checkout settlement is unresolved, even after clock expiry',async()=>{
    const c=await clinic(),id=await c.produce();await c.act(c.blake,'approveInstallments',{id});await c.act(c.blake,'confirmScope',{id});await c.act(c.blake,'revealPrice',{id});await c.act(c.blake,'acceptTerms',{id,option:'full',accepted:true});
    const p=await planOf(c,id),attempt=await c.t.mutation(internal.payments.beginCheckout,{patientId:c.patientId,targetId:id,kind:'plan',agreementId:p.agreementId});
    await c.t.run(ctx=>ctx.db.patch(attempt._id,{expiresAt:Date.now()-1}));
    await expect(c.act(c.blake,'acceptTerms',{id,option:'installments',accepted:true})).rejects.toThrow('reconcile');
    await expect(c.act(c.jimmy,'updateOffer',{id,priceCents:450000})).rejects.toThrow('reconcile');
    await c.t.run(ctx=>ctx.db.patch(attempt._id,{status:'cancelled'}));
    await c.act(c.blake,'acceptTerms',{id,option:'installments',accepted:true});
    const updated=await planOf(c,id);expect(updated.agreementId).not.toBe(p.agreementId);
    const next=await c.t.mutation(internal.payments.beginCheckout,{patientId:c.patientId,targetId:id,kind:'plan',agreementId:updated.agreementId});expect(next._id).not.toBe(attempt._id);expect(next.previousSessionId).toBeUndefined();
  });
  it('keeps signed snapshots immutable and outcome completion attached to stable IDs',async()=>{
    const c=await clinic(),id=await c.produce();
    await c.t.run(async ctx=>{const p:any=(await ctx.db.get(id))!;await ctx.db.patch(id,{status:'accepted',outcomes:p.outcomes!.map((o:any,i:number)=>({...o,...(i===0?{doneAt:Date.now()}: {})}))});});
    await c.act(c.jimmy,'sign',{id});const signed=await planOf(c,id);
    await c.act(c.jimmy,'revise',{id,expectedVersion:1,note:'Clarified outcome wording',outcomes:signed.outcomes.map((o:any,i:number)=>({...o,label:i===0?'Clarified outcome':o.label}))});
    const current=await planOf(c,id);expect(current.outcomes[0].doneAt).toBe(signed.outcomes[0].doneAt);
    const versions=await c.t.run(ctx=>ctx.db.query('planVersions').collect());expect(versions).toHaveLength(2);expect(versions[0].snapshot.outcomes[0].label).toBe(signed.outcomes[0].label);expect(versions[0].snapshot.authorId).toBe(c.ids.pt.staffId);expect(versions[0].snapshot.signedBy).toBe(c.ids.pt.staffId);
    const source=await c.t.mutation(internal.documents.source,{patientId:c.patientId,kind:'plan_pdf',planId:id,snapshotKey:versions[0].key});expect(source.lines.join(' ')).toContain(signed.outcomes[0].label);expect(source.lines.join(' ')).not.toContain('Clarified outcome');
    await expect(c.act(c.jimmy,'revise',{id,expectedVersion:1,note:'Stale revision'})).rejects.toThrow('plan changed');
  });
  it("keeps price off the wire until the closer reveals it (PP-7, PP-8)", async () => {
    const c = await clinic();
    const id = await c.produce();
    const before = await c.blake.query(api.proposals.presentation, { patientId: c.patientId });
    expect(before.proposal.status).toBe("produced");
    expect(before.proposal.priceHidden).toBe(true);
    expect(before.investment).toBeNull();
    const wire = JSON.stringify(before);
    for (const amount of ["440000", "506000", "4850"]) expect(wire).not.toContain(amount);
    // Staff snapshots are redacted too, so the tablet cannot read price elsewhere.
    const staffSnapshot = await c.blake.query(api.portal.snapshot, { patientId: c.patientId });
    expect(staffSnapshot.plansOfCare[0]).not.toHaveProperty("priceCents");
    // Patient portal shows nothing about the proposal yet (PP-15).
    const portal = await c.linda.query(api.portal.snapshot, { patientId: c.patientId });
    expect(portal.plansOfCare).toEqual([]);
    expect(portal.events.some((e: any) => e.type === "proposal_produced")).toBe(false);

    await expect(c.act(c.blake, "revealPrice", { id })).rejects.toThrow("confirm");
    await c.act(c.blake, "scopeQuestions", { id });
    await expect(c.act(c.jimmy, "revealPrice", { id })).rejects.toThrow("access");
    await expect(c.act(c.linda, "revealPrice", { id })).rejects.toThrow("access");
    await c.act(c.blake, "confirmScope", { id });
    expect(
      (await c.blake.query(api.proposals.presentation, { patientId: c.patientId })).investment,
    ).toBeNull();
    await c.act(c.blake, "revealPrice", { id });
    const after = await c.blake.query(api.proposals.presentation, { patientId: c.patientId });
    expect(after.proposal.priceCents).toBe(440000);
    expect(after.investment.installments.total).toBe(506000);
    const events = await c.t.run((ctx) => ctx.db.query("events").collect());
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["proposal_produced", "scope_questions", "scope_confirmed", "price_revealed"]),
    );
  });

  it("refuses Produce until PP-3 passes and locks content once scope is confirmed", async () => {
    const c = await clinic();
    const id = await c.act(c.jimmy, "saveDraft", { ...proposal, outcomes: [] });
    await expect(c.act(c.jimmy, "produce", { id })).rejects.toThrow("2 outcomes");
    await c.act(c.jimmy, "saveDraft", { ...proposal, id });
    vi.stubEnv("ENABLE_CARE", "false");
    await expect(c.act(c.jimmy, "produce", { id })).rejects.toThrow("not enabled");
    vi.stubEnv("ENABLE_CARE", "true");
    await c.act(c.jimmy, "produce", { id });
    // Edits after Produce stay live until scope is confirmed.
    await c.act(c.jimmy, "saveDraft", { ...proposal, id, findings: "Updated" });
    await c.act(c.blake, "confirmScope", { id });
    await expect(c.act(c.jimmy, "saveDraft", { ...proposal, id })).rejects.toThrow("locked");
    await expect(c.act(c.blake, "produce", { id })).rejects.toThrow("access");
  });

  it("accepts and pays on the tablet, then the PT signs and revises (PP-11, PP-14)", async () => {
    const c = await clinic();
    const id = await c.produce();
    await c.act(c.blake, 'approveInstallments', { id });
    await c.act(c.blake, "confirmScope", { id });
    await expect(
      c.act(c.blake, "acceptTerms", { id, option: "installments", accepted: true }),
    ).rejects.toThrow("not ready");
    await c.act(c.blake, "revealPrice", { id });
    await c.act(c.blake, "acceptTerms", { id, option: "installments", accepted: true });
    await expect(c.act(c.jimmy, "sign", { id })).rejects.toThrow("after the patient accepts");
    const event = await c.t.mutation(internal.webhooks.receive, {
      provider: "stripe",
      key: "stripe:evt_plan",
      payload: {
        id: "evt_plan",
        type: "checkout.session.completed",
        data: {
          object: {
            mode: "payment",
            payment_status: "paid",
            payment_intent: "pi_plan",
            amount_total: 253000 - 4850,
            metadata: { kind: "plan", patientId: c.patientId, planId: id, agreementId:(await planOf(c,id)).agreementId, depositCents: "4850" },
          },
        },
      },
    });
    await c.t.mutation(internal.webhooks.process, { id: event });
    const plan = await planOf(c, id);
    expect(plan!.status).toBe("accepted");
    expect(plan!.acceptedAt).toBeDefined();
    const schedules = await c.t.run((ctx) => ctx.db.query("installmentSchedules").collect());
    expect(schedules.map((s) => s.amountCents)).toEqual([126500, 126500]);
    expect(schedules[0].dueAt).toBe(addCentralDays(plan!.startDate,28));

    await c.act(c.jimmy, "sign", { id });
    await expect(c.act(c.jimmy, "sign", { id })).rejects.toThrow("already signed");
    await expect(c.act(c.jimmy, "revise", { id, weeks: 10 })).rejects.toThrow();
    await c.act(c.jimmy, "revise", {
      id,
      note: "Added a balance outcome after the week 4 re-test.",
      outcomes: [...proposal.outcomes, { label: "Stand on one leg for 30 seconds", measure: "Balance", target: "30 s", retestWeek: 6 }],
    });
    const revised = await planOf(c, id);
    expect(revised!.version).toBe(2);
    expect(revised!.outcomes).toHaveLength(3);
    expect(revised!.revisions![0].previous.outcomes).toHaveLength(2);
    expect(revised!.priceCents).toBe(440000);
    const portal = await c.linda.query(api.portal.snapshot, { patientId: c.patientId });
    expect(portal.plansOfCare[0].priceCents).toBe(440000);
    expect(portal.plansOfCare[0].revisions[0].note).toContain("balance");
  });

  it("declines with a reason, opens a closer save, and sends to the portal (PP-12, PP-13)", async () => {
    const c = await clinic();
    const id = await c.produce();
    await expect(c.act(c.blake, "decline", { id, reason: "because" })).rejects.toThrow("reason");
    await c.act(c.blake, "decline", { id, reason: "needs_to_talk_to_spouse", note: "Call Thursday" });
    const saves = await c.t.run((ctx) => ctx.db.query("saves").collect());
    expect(saves).toEqual([
      expect.objectContaining({ rule: "plan_declined", ownerRole: "closer", ownerId: c.ids.closer.staffId }),
    ]);
    const jobs = await c.t.run((ctx) => ctx.db.query("integrationJobs").collect());
    expect(jobs.some((j) => j.kind === "ghl_stage" && j.payload.stage === "eval_no_poc")).toBe(true);
    // The engine must not auto-close a manual follow-up.
    await c.t.mutation(internal.engine.run, {});
    expect((await c.t.run((ctx) => ctx.db.get(saves[0]._id)))!.doneAt).toBeUndefined();

    await c.act(c.blake, "sendToPortal", { id });
    const portal = await c.linda.query(api.portal.snapshot, { patientId: c.patientId });
    expect(portal.plansOfCare[0]).toMatchObject({ status: "sent_to_portal", priceCents: 440000 });
    await c.act(c.linda, "acceptTerms", { id, option: "full", accepted: true });
    expect((await planOf(c, id))!.paymentOption).toBe("full");
  });

  it("does not let the patient accept from the tablet flow before it is sent", async () => {
    const c = await clinic();
    const id = await c.produce();
    await c.act(c.blake, "confirmScope", { id });
    await c.act(c.blake, "revealPrice", { id });
    await expect(
      c.act(c.linda, "acceptTerms", { id, option: "full", accepted: true }),
    ).rejects.toThrow("not ready");
    await expect(c.linda.query(api.proposals.presentation, { patientId: c.patientId })).rejects.toThrow("access");
    await expect(c.blake.query(api.proposals.builder, { patientId: c.patientId })).rejects.toThrow();
  });
});
