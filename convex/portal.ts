import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { identity, scope, audit, event, setting, forPatient } from "./access";
import { enqueue, notify } from "./jobs";
import { internal } from "./_generated/api";
import {
  DAY,
  credibleProgress,
  hasPain,
  localDate,
  allowed,
} from "../src/domain";
import { patientCanSee, redactPrice } from "../src/proposal";
import { quote } from './agreements';

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const a = await identity(ctx,true);
    if(a.presentation)return {name:a.staff.name,roles:[],presentationPatientId:a.presentation.patientId};
    return {
      name: a.staff?.name ?? a.patient.name,
      roles: a.roles,
      patientId: a.patient?._id,
      staffId: a.staff?._id,
      sessions:(await ctx.db.query('authSessions').filter(q=>q.eq(q.field('userId'),a.userId)).collect()).filter(s=>s.expirationTime>Date.now()).map(s=>({id:s._id,createdAt:s._creationTime,current:s._id===a.sessionId})),
    };
  },
});
export const snapshot = query({
  args: { patientId: v.optional(v.id("patients")) },
  handler: async (ctx, args):Promise<any> => {
    const a = await identity(ctx),
      id = args.patientId ?? a.patient?._id;
    if (!id) return null;
    const actor = await scope(ctx, id);
    const p = actor.target;
    const limited =
      actor.staff &&
      !actor.roles.some((r: string) => ["admin", "pt", "closer"].includes(r));
    const patient = limited
      ? {
          _id: p._id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          stage: p.stage,
          status: p.status,
        }
      : p;
    const appointments = await forPatient(ctx, "appointments", id);
    const videos = await ctx.db.query("videos").collect();
    const assignments = await forPatient(ctx, "videoAssignments", id);
    const quizzes = (await ctx.db.query("quizzes").collect()).map((q) => ({
      _id: q._id,
      videoId: q.videoId,
      questions: q.questions.map((x: any) => ({
        prompt: x.prompt,
        options: x.options,
        jumpToSec: x.jumpToSec,
      })),
    }));
    const messages = await forPatient(ctx, "messages", id);
    const saves = await forPatient(ctx, "saves", id);
    const pt:any = p.ptId ? await ctx.db.get(p.ptId) : null;
    const base = {
      patient,
      ptName: pt?.name ?? "Your PT",
      ptPhotoUrl:pt?.photoId?await ctx.storage.getUrl(pt.photoId):null,
      appointments,
      videos,
      assignments,
      quizzes,
      messages,
      readCursors: await forPatient(ctx,'messageReads',id),
      saves: actor.staff ? saves : [],
      clinic: await setting(ctx, "clinic", {
        name: "Grounded",
        phone: "",
        address: "",
        wear: "Wear comfortable clothes you can move in.",
      }),
      membershipPrice: await setting(ctx, "membershipPriceCents", 0),
      membershipTerms: await setting(ctx, "membershipTerms", ""),
      referralRules: await setting(ctx, "referralRules", {
        enabled: false,
        depositCents: 0,
        planCents: 0,
      }),
    };
    if (limited) return { ...base, restricted: true };
    const tables = [
      "plansOfCare",
      "programs",
      "sessionLogs",
      "sessionAssignments",
      "measurements",
      "visitSummaries",
      "payments",
      "documents",
      "creditLedger",
      "memberships",
      "installmentSchedules",
      "events",
      "planVersions",
      "paymentAgreements",
    ];
    const data: Record<string, any> = {};
    for (const table of tables) data[table] = await forPatient(ctx, table, id);
    // PP-7/PP-15: price leaves the server only after the reveal; patients see only sent or accepted plans.
    data.plansOfCare = await Promise.all(data.plansOfCare
      .filter((plan: any) => actor.staff || patientCanSee(plan))
      .map(async (plan:any) => redactPrice(['accepted','completed'].includes(plan.status)?plan:await quote(ctx,plan))));
    const visiblePlanIds=new Set(data.plansOfCare.filter((p:any)=>!p.priceHidden).map((p:any)=>p._id));
    data.paymentAgreements=data.paymentAgreements.filter((r:any)=>visiblePlanIds.has(r.planId));
    data.planVersions=data.planVersions.filter((r:any)=>visiblePlanIds.has(r.planId));
    if (!actor.staff)
      data.events = data.events.filter(
        (e: any) =>
          ![
            "proposal_produced",
            "scope_confirmed",
            "scope_questions",
            "price_revealed",
            "plan_declined",
          ].includes(e.type),
      );
    data.documents = data.documents.filter(
      (d: any) =>
        (!d.planId || visiblePlanIds.has(d.planId)) && (!d.staffOnly ||
        (allowed(actor.roles, "clinical") &&
          (actor.roles.includes("admin") || p.ptId === actor.staff?._id))),
    );
    const referralLimit = await setting(ctx, "referralWarningVisits", null);
    const attended = appointments.filter(
      (a: any) => a.status === "attended",
    ).length;
    data.referralWarning =
      actor.staff &&
      !p.physicianReferral &&
      typeof referralLimit === "number" &&
      attended >= referralLimit - 1;
    const referrals = (
      await ctx.db
        .query("referrals")
        .withIndex("by_referrer", (q) => q.eq("referrerId", id))
        .collect()
    ).map((r) => ({
      _id: r._id,
      friendName: r.friendName,
      status: r.status,
      at: r.at,
    }));
    return {
      ...base,
      ...data,
      exercises: await ctx.db.query("exercises").collect(),
      referrals,
      restricted: false,
    };
  },
});
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const a = await identity(ctx);
    if (!a.staff) throw new Error("Staff access required.");
    const all = await ctx.db.query("patients").collect();
    const patients = all.filter(
      (p) =>
        a.roles.some((r: string) => ["admin", "sdr", "closer"].includes(r)) ||
        p.ptId === a.staff._id,
    );
    const ids = new Set(patients.map((p) => p._id));
    const referrals=await ctx.db.query('referrals').collect();
    const referralLeads=a.roles.some((r:string)=>['admin','sdr'].includes(r))?await Promise.all(referrals.map(async r=>({ ...r,referrerName:(await ctx.db.get(r.referrerId))?.name??'Patient'}))):[];
    return {
      patients: patients.map((p) => ({
        _id: p._id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        stage: p.stage,
        status: p.status,
        ptId: p.ptId,
        closerId: p.closerId,
      })),
      saves: (await ctx.db.query("saves").collect()).filter((s) =>
        ids.has(s.patientId),
      ),
      appointments: (await ctx.db.query("appointments").collect()).filter((s) =>
        ids.has(s.patientId),
      ),
      assignments: (await ctx.db.query("videoAssignments").collect()).filter(
        (s) => ids.has(s.patientId),
      ),
      referralLeads,
      unmatchedReferrals:(await ctx.db.query('integrationJobs').collect()).filter(j=>j.kind==='referral_lead'&&j.status!=='done'&&j.status!=='cancelled').map(j=>({id:j._id,referralId:j.payload.referralId,status:j.status,attempts:j.attempts,error:j.error,failureCategory:j.failureCategory})),
      staff: (await ctx.db.query("staff").collect()).map((s) => ({
        _id: s._id,
        name: s.name,
        roles: s.roles,
        active: s.active,
      })),
    };
  },
});
export const chart = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const a = await scope(ctx, patientId, "clinical");
    const notes = await forPatient(ctx, "clinicalNotes", patientId);
    for (const n of notes)
      await audit(ctx, a.userId, "read", "clinicalNotes", n._id);
    return Promise.all(notes.map(async(n:any)=>{const author:any=await ctx.db.get(n.authorId);return {...n,authorName:author?.name??'Staff',addenda:await Promise.all(n.addenda.map(async(d:any)=>{const addendumAuthor:any=await ctx.db.get(d.authorId);return {...d,authorName:addendumAuthor?.name??'Staff'};}))};}));
  },
});
const operations = [
  "sendMessage",
  "readMessages",
  "startVideo",
  "videoProgress",
  "quiz",
  "startSession",
  "completeExercise",
  "finishSession",
  "saveNote",
  "signNote",
  "addendum",
  "summary",
  "measurement",
  "publishProgram",
  "discharge",
  "enrollMembership",
  "resolveSave",
  "requestVisit",
  "confirmReview",
  "revokeSessions",
  "revokeSession",
  "updateReferral",
  "completeMilestone",
  "exportChart",
  "updateGoal",
] as const;
export const command = mutation({
  args: {
    patientId: v.id("patients"),
    operation: v.union(...operations.map(v.literal)),
    payload: v.any(),
  },
  handler: async (ctx, { patientId, operation, payload: x }) => {
    const permissions: Record<string, "clinical" | "care" | "finance"> = {
      saveNote: "clinical",
      signNote: "clinical",
      addendum: "clinical",
      exportChart: "clinical",
      updateReferral: "clinical",
      summary: "care",
      measurement: "care",
      updateGoal: "care",
      publishProgram: "care",
      discharge: "clinical",
      completeMilestone: "care",
    };
    const a = await scope(ctx, patientId, permissions[operation]);
    const now = Date.now();
    const text = (value: unknown, max = 5000) => {
      if (typeof value !== "string" || !value.trim() || value.length > max)
        throw new Error("Enter valid text.");
      return value.trim();
    };
    const number = (value: unknown, min = 0, max = 10_000_000) => {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
      )
        throw new Error("Enter a valid number.");
      return value;
    };
    const owned = async (id: string):Promise<any> => {
      const record:any = await ctx.db.get(id as any);
      if (!record || record.patientId !== patientId)
        throw new Error("Record unavailable.");
      return record;
    };
    if (
      [
        "startVideo",
        "videoProgress",
        "quiz",
        "startSession",
        "completeExercise",
        "finishSession",
        "enrollMembership",
      ].includes(operation) &&
      a.patient?._id !== patientId
    )
      throw new Error("This action must be completed by the patient.");
    let result: any = null;
    if(operation==='updateGoal')await ctx.db.patch(patientId,{goal:text(x.goal,500),...(typeof x.mainPain==='string'?{mainPain:x.mainPain.trim().slice(0,1000)}:{})});
    else if (operation === "sendMessage" || operation === "requestVisit") {
      const body =
        operation === "requestVisit"
          ? "I would like to request a visit. Please help me find a time."
          : text(x.body);
      const painFlag = !a.staff && hasPain(body);
      result = await ctx.db.insert("messages", {
        patientId,
        senderKind: a.staff ? "staff" : "patient",
        senderId: a.userId,
        senderName: a.staff?.name ?? a.target.name,
        body,
        painFlag,
        at: now,
      });
      if (a.staff)
        await notify(ctx, patientId, "new_message", `message:${result}`);
    } else if (operation === "readMessages") {
      const cursor = (await forPatient(ctx, "messageReads", patientId)).find(
        (r: any) => r.userId === a.userId,
      );
      if (cursor) await ctx.db.patch(cursor._id, { readAt: now });
      else
        await ctx.db.insert("messageReads", {
          patientId,
          userId: a.userId,
          readAt: now,
        });
    } else if (["startVideo", "videoProgress", "quiz"].includes(operation)) {
      const assignment = await owned(x.id);
      if (assignment.unlockedAt === undefined)
        throw new Error("Complete the previous video first.");
      const video:any = await ctx.db.get(assignment.videoId);
      if (operation === "startVideo") {
        await ctx.db.patch(assignment._id, { lastProgressAt: now });
        await event(ctx, patientId, "video_started", { videoId: video!._id });
      }
      if (operation === "videoProgress") {
        if (!assignment.lastProgressAt)
          throw new Error("Start playback first.");
        const watchedSec = credibleProgress(
          assignment.watchedSec,
          number(x.seconds),
          Math.min(15_000, now - assignment.lastProgressAt),
          video!.durationSec,
        );
        const completedAt =
          watchedSec >= video!.durationSec * 0.9
            ? (assignment.completedAt ?? now)
            : undefined;
        await ctx.db.patch(assignment._id, {
          watchedSec,
          lastProgressAt: now,
          completedAt,
        });
        if (completedAt && !assignment.completedAt)
          await event(ctx, patientId, "video_completed", {
            videoId: video!._id,
          });
      }
      if (operation === "quiz") {
        if (!assignment.completedAt)
          throw new Error("Watch at least 90% of the video first.");
        const quiz = await ctx.db
          .query("quizzes")
          .withIndex("by_video", (q) => q.eq("videoId", assignment.videoId))
          .unique();
        if (!quiz || !Array.isArray(x.answers))
          throw new Error("Quiz unavailable.");
        const wrong = quiz.questions
          .map((q: any, i: number) =>
            x.answers[i] === q.correctIndex
              ? null
              : { index: i, jumpToSec: q.jumpToSec },
          )
          .filter(Boolean);
        result = { passed: wrong.length === 0, wrong };
        if (!wrong.length && !assignment.quizPassedAt) {
          await ctx.db.patch(assignment._id, { quizPassedAt: now });
          const next = (
            await forPatient(ctx, "videoAssignments", patientId)
          ).find((r: any) => r.order === assignment.order + 1);
          if (next) await ctx.db.patch(next._id, { unlockedAt: now });
          await event(ctx, patientId, "quiz_passed", { videoId: video!._id });
        }
      }
    } else if (operation === "startSession") {
      const today = localDate(now),
        sessions = await forPatient(ctx, "sessionLogs", patientId);
      const current = sessions.find((s: any) => s.date === today);
      if (current) result = current._id;
      else {
        const program = (await forPatient(ctx, "programs", patientId)).find(
          (p: any) => p.active,
        );
        if (!program)
          throw new Error("Your PT has not published a program yet.");
        const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
        const itemIds = program.items
          .filter((i: any) => i.days.includes(weekday))
          .map((i: any) => i.id);
        if (!itemIds.length) throw new Error("Today is a rest day.");
        result = await ctx.db.insert("sessionLogs", {
          patientId,
          programId: program._id,
          programVersion: program.version,
          date: today,
          startedAt: now,
          doneItemIds: [],
        });
      }
    } else if (
      operation === "completeExercise" ||
      operation === "finishSession"
    ) {
      const session = await owned(x.id);
      if (session.completedAt) throw new Error("This session is complete.");
      const program:any = await ctx.db.get(session.programId);
      const weekday = new Date(`${session.date}T12:00:00Z`).getUTCDay();
      const ids = program!.items
        .filter((i: any) => i.days.includes(weekday))
        .map((i: any) => i.id);
      if (operation === "completeExercise") {
        if (!ids.includes(x.itemId)) throw new Error("Exercise unavailable.");
        await ctx.db.patch(session._id, {
          doneItemIds: [...new Set([...session.doneItemIds, x.itemId])],
        });
      } else {
        if (
          !["easy", "about_right", "too_much"].includes(x.feel) ||
          ids.some((id: string) => !session.doneItemIds.includes(id))
        )
          throw new Error("Complete the exercises and choose how it felt.");
        await ctx.db.patch(session._id, {
          feel: x.feel,
          note: typeof x.note === "string" ? x.note.slice(0, 5000) : "",
          completedAt: now,
        });
        await event(ctx, patientId, "session_completed", {
          programVersion: session.programVersion,
        });
      }
    } else if (operation === "saveNote") {
      if (x.appointmentId) await owned(x.appointmentId);
      const fields = {
        kind: text(x.kind, 100),
        subjective: text(x.subjective),
        objective: text(x.objective),
        assessment: text(x.assessment),
        plan: text(x.plan),
        icd10: text(x.icd10 || "Not coded", 500)
          .split(",")
          .map((s) => s.trim()),
        cpt: text(x.cpt || "Not coded", 500)
          .split(",")
          .map((s) => s.trim()),
        ...(x.services?{services:x.services.map((s:any)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isSafeInteger(s.units)||s.units<1||!Number.isSafeInteger(s.feeCents)||s.feeCents<0)throw new Error('Enter a valid service date, units, and fee.');return {date:s.date,code:text(s.code,20),units:s.units,feeCents:s.feeCents,modifiers:text(s.modifiers||' ',100).trim()};})}:{}),
      };
      if (x.id) {
        const note = await owned(x.id);
        if (note.signedAt || note.authorId !== a.staff._id)
          throw new Error("This note cannot be edited.");
        await ctx.db.patch(note._id, {...fields,...(x.appointmentId?{appointmentId:x.appointmentId}:{})});
        result = note._id;
      } else
        result = await ctx.db.insert("clinicalNotes", {
          patientId,
          ...fields,
          ...(x.appointmentId ? { appointmentId: x.appointmentId } : {}),
          authorId: a.staff._id,
          addenda: [],
        });
    } else if (operation === "signNote" || operation === "addendum") {
      const note = await owned(x.id);
      if (operation === "signNote") {
        if (note.signedAt || note.authorId !== a.staff._id)
          throw new Error("Only the author can sign an unsigned note.");
        await ctx.db.patch(note._id, { signedAt: now });
      } else {
        if (!note.signedAt) throw new Error("Addenda belong to signed notes.");
        await ctx.db.patch(note._id, {
          addenda: [
            ...note.addenda,
            { body: text(x.body), authorId: a.staff._id, at: now },
          ],
        });
      }
    } else if (operation === "summary") {
      result = await ctx.db.insert("visitSummaries", {
        patientId,
        body: text(x.body),
        authorId: a.staff._id,
        at: now,
      });
    } else if (operation === "measurement") {
      result = await ctx.db.insert("measurements", {
        patientId,
        label: text(x.label, 120),
        unit: typeof x.unit === "string" ? x.unit.slice(0, 40) : "",
        value:
          typeof x.value === "number"
            ? number(x.value, -1e6, 1e6)
            : text(x.value, 500),
        kind: x.kind === "baseline" ? "baseline" : "retest",
        takenAt: now,
      });
      await event(ctx, patientId, "retest_recorded");
    } else if (operation === "publishProgram") {
      if (!Array.isArray(x.items) || !x.items.length || x.items.length > 30)
        throw new Error("Choose 1–30 exercises.");
      const items = [];
      for (const i of x.items) {
        if (!(await ctx.db.get(i.exerciseId)))
          throw new Error("Exercise unavailable.");
        if (
          !Array.isArray(i.days) ||
          !i.days.length ||
          i.days.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6)
        )
          throw new Error("Choose valid exercise days.");
        items.push({
          id: crypto.randomUUID(),
          exerciseId: i.exerciseId,
          sets: number(i.sets, 1, 20),
          reps: number(i.reps, 0, 100),
          holdSec: number(i.holdSec, 0, 600),
          cue: text(i.cue, 500),
          days: i.days,
        });
      }
      const programs = await forPatient(ctx, "programs", patientId);
      for (const p of programs.filter((p: any) => p.active))
        await ctx.db.patch(p._id, { active: false });
      result = await ctx.db.insert("programs", {
        patientId,
        version: Math.max(0, ...programs.map((p: any) => p.version)) + 1,
        active: true,
        publishedAt: now,
        items,
      });
      await event(ctx, patientId, "program_published");
      await ctx.scheduler.runAfter(0, internal.engine.run, {});
    } else if (operation === "enrollMembership") {
      if (process.env.ENABLE_RETENTION !== "true")
        throw new Error("Membership enrollment is not enabled.");
      const plan = (await forPatient(ctx, "plansOfCare", patientId)).find(
        (p: any) => p.status === "accepted" || p.status === "completed",
      );
      if (!plan || now < plan.startDate + 21 * DAY || x.accepted !== true)
        throw new Error(
          "Enrollment opens in week 4. Accept the terms to enroll.",
        );
      const priceCents = await setting(ctx, "membershipPriceCents", 0),
        terms = await setting(ctx, "membershipTerms", "");
      if (!priceCents || !terms)
        throw new Error("Membership terms are not configured yet.");
      const existing = (await forPatient(ctx, "memberships", patientId)).find(
        (m: any) => m.status !== "cancelled",
      );
      result =
        existing?._id ??
        (await ctx.db.insert("memberships", {
          patientId,
          status: "pending_authorization",
          priceCents,
          terms,
          acceptedAt: now,
        }));
    } else if (operation === "discharge") {
      const notes = await forPatient(ctx, "clinicalNotes", patientId);
      if (!notes.some((n: any) => n.kind === "discharge" && n.signedAt))
        throw new Error("Sign the discharge summary first.");
      if (a.target.stage === "discharged") return null;
      await ctx.db.patch(patientId, { stage: "discharged", dischargedAt: now });
      for (const p of await forPatient(ctx, "plansOfCare", patientId))
        if (p.status === "accepted") {
          await ctx.db.patch(p._id, { status: "completed" });
          await event(ctx,patientId,'plan_completed',{planId:p._id});
        }
      const membership = (await forPatient(ctx, "memberships", patientId)).find(
        (m: any) => m.status === "enrolled",
      );
      if (membership)
        await enqueue(
          ctx,
          "membership_start",
          `membership:${membership._id}`,
          { membershipId: membership._id },
          patientId,
        );
      else
        await enqueue(
          ctx,
          "ghl_stage",
          `discharged:${patientId}:${now}`,
          { stage: "discharged" },
          patientId,
        );
      await event(ctx, patientId, "discharged");
    } else if (operation === "resolveSave") {
      if (!a.staff) throw new Error("Staff access required.");
      const save = await owned(x.id);
      if (
        !["reached", "rescheduled", "no_answer", "resolved"].includes(x.outcome)
      )
        throw new Error("Choose an outcome.");
      await ctx.db.patch(save._id, {
        attempts: [
          ...save.attempts,
          { at: now, outcome: x.outcome, actorId: a.userId },
        ],
        ...(x.outcome === "no_answer"
          ? {}
          : { doneAt: now, outcome: x.outcome }),
      });
      if (save.rule === "pain_flag" && x.outcome !== "no_answer") {
        if (!allowed(a.roles, "clinical"))
          throw new Error("The PT must resolve clinical follow-up.");
        await ctx.db.patch(patientId, { painResolvedAt: now });
      }
      if (x.outcome !== "no_answer")
        await event(ctx, patientId, "save_closed", {
          rule: save.rule,
          outcome: x.outcome,
        });
    } else if (operation === "confirmReview") {
      if (!a.staff) throw new Error("Staff access required.");
      await ctx.db.patch(patientId, { reviewConfirmedAt: now });
      await event(ctx, patientId, "review_confirmed");
      await enqueue(
        ctx,
        "ghl_stage",
        `review:${patientId}`,
        { stage: "no_membership" },
        patientId,
      );
    } else if(operation==='revokeSession'){
      const id=ctx.db.normalizeId('authSessions',x.id);
      const session=id?await ctx.db.get(id):null;
      if(!session||session.userId!==a.userId)throw new Error('Session unavailable.');
      await ctx.db.patch(session._id,{expirationTime:now});
    } else if (operation === "revokeSessions") {
      if (!a.staff && a.patient?._id !== patientId)
        throw new Error("Not allowed.");
      if (a.target.userId)
        for (const session of await ctx.db
          .query("authSessions")
          .filter((q) => q.eq(q.field("userId"), a.target.userId))
          .collect())
          await ctx.db.patch(session._id, { expirationTime: now });
    } else if (operation === "updateReferral") {
      await ctx.db.patch(patientId, {
        physicianReferral: text(x.body, 500),
        physicianReferralAt: now,
      });
    } else if (operation === "completeMilestone") {
      // Addendum 1: Progress milestones read from the plan's outcomes.
      const plan = await owned(x.id);
      const key = plan.outcomes ? "outcomes" : "milestones";
      await ctx.db.patch(plan._id, {
        [key]: (plan[key] ?? []).map((m: any, i: number) =>
          i === x.index ? { ...m, doneAt: now } : m,
        ),
      });
    } else if (operation === "exportChart") {
      result = await enqueue(
        ctx,
        "document",
        `chart:${patientId}:${now}`,
        { kind: "chart_export" },
        patientId,
      );
    }
    if (a.staff) await audit(ctx, a.userId, operation, "patients", patientId);
    else await ctx.db.patch(patientId, { lastActivityAt: now });
    if (!["videoProgress", "readMessages", "startVideo"].includes(operation))
      await ctx.scheduler.runAfter(0, internal.engine.run, {});
    return result;
  },
});
