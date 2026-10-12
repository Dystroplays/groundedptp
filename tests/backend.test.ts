import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { DAY } from "../src/domain";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.useRealTimers());
async function fixture(role = "pt", age = 0) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: `${role}@example.test`,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 30 * DAY,
    });
    const staffId =
      role === "patient"
        ? undefined
        : await ctx.db.insert("staff", {
            userId,
            name: "Test clinician",
            roles: [role],
            active: true,
          });
    const patientId = await ctx.db.insert("patients", {
      name: "Test patient",
      email: "patient@example.test",
      phone: "",
      stage: "in_care",
      status: "on_track",
      goal: "Walk comfortably",
      source: "test",
      depositAt: Date.now(),
      referralToken: "test-token",
      ...(staffId ? { ptId: staffId } : { userId }),
    });
    const otherId = await ctx.db.insert("patients", {
      name: "Other patient",
      email: "other@example.test",
      phone: "",
      stage: "in_care",
      status: "on_track",
      goal: "",
      source: "test",
      depositAt: Date.now(),
      referralToken: "other-token",
    });
    return { userId, sessionId, staffId, patientId, otherId };
  });
  if (age) {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + age);
  }
  return {
    t,
    a: t.withIdentity({ subject: `${ids.userId}|${ids.sessionId}` }),
    ...ids,
  };
}
describe("authorization and chart integrity", () => {
  it("isolates patients and excludes clinical notes from reactive snapshots", async () => {
    const f = await fixture("patient");
    await expect(
      f.a.query(api.portal.snapshot, { patientId: f.otherId }),
    ).rejects.toThrow("unavailable");
    await expect(
      f.a.mutation(api.portal.chart, { patientId: f.patientId }),
    ).rejects.toThrow("access");
    const snapshot = await f.a.query(api.portal.snapshot, {
      patientId: f.patientId,
    });
    expect(snapshot).not.toHaveProperty("clinicalNotes");
  });
  it("blocks an unassigned PT and financial users from chart access", async () => {
    const pt = await fixture();
    await expect(
      pt.a.mutation(api.portal.chart, { patientId: pt.otherId }),
    ).rejects.toThrow();
    const closer = await fixture("closer");
    await expect(
      closer.a.mutation(api.portal.chart, { patientId: closer.patientId }),
    ).rejects.toThrow();
  });
  it("expires staff at 12 hours despite a longer auth session", async () => {
    const f = await fixture("pt", DAY / 2 + 1);
    await expect(f.a.query(api.portal.viewer, {})).rejects.toThrow(
      "sign in again",
    );
  });
  it("revoked sessions reject existing identities", async () => {
    const f = await fixture("patient");
    await f.t.run((ctx) =>
      ctx.db.patch(f.sessionId, { expirationTime: Date.now() - 1 }),
    );
    await expect(f.a.query(api.portal.viewer, {})).rejects.toThrow("expired");
  });
  it("locks signed notes and records reads and dated addenda", async () => {
    vi.useFakeTimers();
    const f = await fixture();
    const payload = {
      kind: "eval",
      subjective: "A",
      objective: "B",
      assessment: "C",
      plan: "D",
      icd10: "M25.5",
      cpt: "97110",
    };
    const id = await f.a.mutation(api.portal.command, {
      patientId: f.patientId,
      operation: "saveNote",
      payload,
    });
    await f.a.mutation(api.portal.command, {
      patientId: f.patientId,
      operation: "signNote",
      payload: { id },
    });
    await expect(
      f.a.mutation(api.portal.command, {
        patientId: f.patientId,
        operation: "saveNote",
        payload: { ...payload, id, subjective: "Changed" },
      }),
    ).rejects.toThrow("cannot be edited");
    await f.a.mutation(api.portal.command, {
      patientId: f.patientId,
      operation: "addendum",
      payload: { id, body: "Dated correction" },
    });
    const notes = await f.a.mutation(api.portal.chart, {
      patientId: f.patientId,
    });
    expect(notes[0].subjective).toBe("A");
    expect(notes[0].addenda).toHaveLength(1);
    const logs = await f.t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(logs.some((l) => l.action === "read" && l.targetId === id)).toBe(
      true,
    );
  });
});

describe('care and payment transitions',()=>{
  it('pins a started session while a new program takes effect next time',async()=>{
    vi.useFakeTimers();const f=await fixture('patient');
    const old=await f.t.run(async ctx=>{
      const exerciseId=await ctx.db.insert('exercises',{name:'Test movement',defaultCue:'Steady',tags:[],archived:false});
      const program=await ctx.db.insert('programs',{patientId:f.patientId,version:1,active:true,publishedAt:Date.now(),items:[{id:'original',exerciseId,sets:1,reps:5,holdSec:0,cue:'Steady',days:[0,1,2,3,4,5,6]}]});
      return{exerciseId,program};
    });
    const id=await f.a.mutation(api.portal.command,{patientId:f.patientId,operation:'startSession',payload:{}});
    await f.t.run(async ctx=>{await ctx.db.patch(old.program,{active:false});await ctx.db.insert('programs',{patientId:f.patientId,version:2,active:true,publishedAt:Date.now(),items:[{id:'replacement',exerciseId:old.exerciseId,sets:2,reps:5,holdSec:0,cue:'Steady',days:[0,1,2,3,4,5,6]}]});});
    await expect(f.a.mutation(api.portal.command,{patientId:f.patientId,operation:'completeExercise',payload:{id,itemId:'replacement'}})).rejects.toThrow('unavailable');
    await f.a.mutation(api.portal.command,{patientId:f.patientId,operation:'completeExercise',payload:{id,itemId:'original'}});
    await f.a.mutation(api.portal.command,{patientId:f.patientId,operation:'finishSession',payload:{id,feel:'about_right'}});
    expect((await f.t.run(ctx=>ctx.db.get(ctx.db.normalizeId('sessionLogs',id)!)))!.programVersion).toBe(1);
  });
  it('keeps no-answer saves open, then automatically closes a cleared condition',async()=>{
    vi.useFakeTimers();const f=await fixture();
    await f.t.run(ctx=>ctx.db.patch(f.patientId,{stage:'pre_visit',depositAt:Date.now()-2*DAY}));
    await f.t.mutation(internal.engine.run,{});
    const save=await f.t.run(ctx=>ctx.db.query('saves').filter(q=>q.and(q.eq(q.field('patientId'),f.patientId),q.eq(q.field('rule'),'no_login'))).first());
    await f.a.mutation(api.portal.command,{patientId:f.patientId,operation:'resolveSave',payload:{id:save!._id,outcome:'no_answer'}});
    expect((await f.t.run(ctx=>ctx.db.get(save!._id)))!.doneAt).toBeUndefined();
    await f.t.run(ctx=>ctx.db.patch(f.patientId,{lastLoginAt:Date.now()}));
    await f.t.mutation(internal.engine.run,{});
    expect((await f.t.run(ctx=>ctx.db.get(save!._id)))!.outcome).toBe('condition_cleared');
  });
  it('does not regress a paid installment when an older failure arrives',async()=>{
    vi.useFakeTimers();const f=await fixture();
    const scheduleId=await f.t.run(async ctx=>{const planId=await ctx.db.insert('plansOfCare',{patientId:f.patientId,goal:'Goal',weeks:8,visits:12,priceCents:440000,startDate:Date.now(),status:'accepted',installments:true,milestones:[]});return ctx.db.insert('installmentSchedules',{patientId:f.patientId,planId,amountCents:126500,dueAt:Date.now(),sequence:2,status:'pending'});});
    for(const type of ['invoice.paid','invoice.payment_failed']){
      const id=await f.t.mutation(internal.webhooks.receive,{provider:'stripe',key:type,payload:{id:type,type,data:{object:{id:'in_paid',amount_paid:126500,amount_due:126500,metadata:{scheduleId}}}}});
      await f.t.mutation(internal.webhooks.process,{id});
    }
    expect((await f.t.run(ctx=>ctx.db.get(scheduleId)))!.status).toBe('paid');
  });
});
describe("durable event processing", () => {
  it("stores duplicate webhook deliveries once", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = {
      provider: "stripe",
      key: "stripe:evt_test",
      payload: { id: "evt_test", type: "test" },
    };
    const one = await t.mutation(internal.webhooks.receive, args),
      two = await t.mutation(internal.webhooks.receive, args);
    expect(one).toBe(two);
    expect(
      await t.run((ctx) => ctx.db.query("webhookEvents").collect()),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("integrationJobs").collect()),
    ).toHaveLength(1);
  });
  it("reserves membership credit once and cannot overspend concurrently", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.insert("creditLedger", {
        patientId: f.patientId,
        amountCents: 15000,
        reason: "Test",
        key: "award",
        at: Date.now(),
      }),
    );
    const args = { patientId: f.patientId, invoiceId: "in_1", amount: 10000 };
    expect(await f.t.mutation(internal.payments.reserveCredit, args)).toBe(
      10000,
    );
    expect(await f.t.mutation(internal.payments.reserveCredit, args)).toBe(
      10000,
    );
    expect(
      await f.t.mutation(internal.payments.reserveCredit, {
        ...args,
        invoiceId: "in_2",
      }),
    ).toBe(5000);
  });
  it("does not permit patient-driven publication", async () => {
    const f = await fixture("patient");
    await expect(
      f.a.mutation(api.portal.command, {
        patientId: f.patientId,
        operation: "publishProgram",
        payload: { items: [] },
      }),
    ).rejects.toThrow("access");
  });
});
