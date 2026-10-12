import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { identity, audit, setting } from "./access";
import { internal } from "./_generated/api";
import { localDate } from "../src/domain";
import { conditions, proposalGaps } from "../src/proposal";
async function admin(ctx: any) {
  const a = await identity(ctx);
  if (!a.roles.includes("admin")) throw new Error("Admin access required.");
  return a;
}
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await admin(ctx);
    const jobs = await ctx.db.query("integrationJobs").collect();
    return {
      settings: await ctx.db.query("settings").collect(),
      videos: await ctx.db.query("videos").collect(),
      quizzes: await ctx.db.query("quizzes").collect(),
      sequences: await ctx.db.query("sequences").collect(),
      exercises: await ctx.db.query("exercises").collect(),
      templates: await ctx.db.query("proposalTemplates").collect(),
      staff: await ctx.db.query("staff").collect(),
      syncErrors: jobs
        .filter(
          (j) =>
            j.status !== "done" &&
            j.status !== "cancelled" &&
            j.nextAt <= Date.now() && j.createdAt < Date.now() - 3_600_000,
        )
        .map((j) => ({
          _id: j._id,
          kind: j.kind,
          attempts: j.attempts,
          error: j.error,
          createdAt: j.createdAt,
          nextAt:j.nextAt,
          delayMs:Math.max(0,Date.now()-j.nextAt),
          failureCategory:j.failureCategory,
          history:j.history??[],
        })),
      gates: {
        realPatients: process.env.ALLOW_REAL_PATIENTS === "true",
        care: process.env.ENABLE_CARE === "true",
        retention: process.env.ENABLE_RETENTION === "true",
      },
    };
  },
});
export const saveSetting = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, { key, value }) => {
    const a = await admin(ctx);
    if (
      ![
        "clinic",
        "thresholds",
        "referralRules",
        "membershipPriceCents",
        "membershipTerms",
        "messageTemplates",
        "retentionYears",
        "referralWarningVisits",
        "businessHours",
        "holidays",
        "evalCalendarId",
      ].includes(key)
    )
      throw new Error("Unknown setting.");
    if (
      key === "membershipPriceCents" &&
      (!Number.isSafeInteger(value) || value <= 0)
    )
      throw new Error("Enter a positive price in cents.");
    if (
      key === "referralRules" &&
      (!Number.isSafeInteger(value.depositCents) ||
        !Number.isSafeInteger(value.planCents) ||
        value.depositCents < 0 ||
        value.planCents < 0)
    )
      throw new Error("Enter nonnegative whole cents.");
    if (
      ["retentionYears", "referralWarningVisits"].includes(key) &&
      (!Number.isInteger(value) || value < 1)
    )
      throw new Error("Enter a positive whole number approved for the clinic.");
    if (
      key === "thresholds" &&
      (typeof value !== "object" ||
        Object.values(value).some(
          (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0,
        ) ||
        (value.adherence !== undefined && value.adherence > 1))
    )
      throw new Error(
        "Thresholds must be nonnegative; adherence must be between 0 and 1.",
      );
    if (
      key === "businessHours" &&
      (!Number.isInteger(value.open) ||
        !Number.isInteger(value.close) ||
        value.open < 0 ||
        value.close > 24 ||
        value.open >= value.close ||
        !Array.isArray(value.days) ||
        !value.days.length ||
        value.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6))
    )
      throw new Error(
        "Choose valid opening hours and at least one business day.",
      );
    if (
      key === "holidays" &&
      (!Array.isArray(value) ||
        value.some(
          (d: any) => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d),
        ))
    )
      throw new Error("Use YYYY-MM-DD dates.");
    if (
      key === "messageTemplates" &&
      (typeof value !== "object" ||
        Object.values(value).some(
          (t) => typeof t !== "string" || t.length > 350 || /[{}<>]/.test(t),
        ))
    )
      throw new Error("Use plain generic text, without variables or markup.");
    const old = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const id = old?._id ?? (await ctx.db.insert("settings", { key, value }));
    if (old) await ctx.db.patch(id, { value });
    await audit(ctx, a.userId, "setting_updated", "settings", id);
  },
});
export const catalog = mutation({
  args: {
    table: v.union(
      v.literal("videos"),
      v.literal("quizzes"),
      v.literal("sequences"),
      v.literal("exercises"),
      v.literal("proposalTemplates"),
    ),
    id: v.optional(v.string()),
    data: v.any(),
  },
  handler: async (ctx, { table, id, data }) => {
    const a = await admin(ctx);
    if (
      table === "videos" &&
      (!data.title?.trim() ||
        !Number.isFinite(data.durationSec) ||
        data.durationSec <= 0)
    )
      throw new Error("Enter a title and valid duration.");
    if (
      table === "exercises" &&
      (!data.name?.trim() || !data.defaultCue?.trim())
    )
      throw new Error("Enter an exercise name and cue.");
    if (table === "quizzes") {
      const video = await ctx.db.get(data.videoId);
      if (!video) throw new Error("Choose an existing video.");
      if (
        !data.questions?.length ||
        data.questions.some(
          (q: any) =>
            !q.prompt?.trim() ||
            q.options?.length < 2 ||
            q.options.some((o: any) => typeof o !== "string" || !o.trim()) ||
            !Number.isInteger(q.correctIndex) ||
            q.correctIndex < 0 ||
            q.correctIndex >= q.options.length ||
            q.jumpToSec < 0 ||
            q.jumpToSec > video.durationSec,
        )
      )
        throw new Error(
          "Every quiz question needs answers, a correct choice, and a valid replay timestamp.",
        );
      const existing = await ctx.db
        .query("quizzes")
        .withIndex("by_video", (q) => q.eq("videoId", data.videoId))
        .unique();
      if (existing && existing._id !== id)
        throw new Error("Edit the existing quiz for this video.");
    }
    if (table === "sequences") {
      if (
        !data.name?.trim() ||
        !data.items?.length ||
        data.items.some(
          (i: any, n: number) =>
            !Number.isFinite(i.dueOffsetDays) ||
            i.dueOffsetDays < 1 ||
            (n > 0 && i.dueOffsetDays > data.items[n - 1].dueOffsetDays),
        )
      )
        throw new Error(
          "Sequence due offsets must descend toward the evaluation and remain at least one day before it.",
        );
      for (const i of data.items)
        if (!(await ctx.db.get(i.videoId)))
          throw new Error("Choose existing videos.");
      if (data.active)
        for (const old of await ctx.db.query("sequences").collect())
          if (old.active && old._id !== id)
            await ctx.db.patch(old._id, { active: false });
    }
    if (table === "proposalTemplates") {
      if (!data.name?.trim() || !conditions.includes(data.condition))
        throw new Error("Name the template and choose a condition.");
      const gaps = proposalGaps({
        ...data,
        mainPain: "Template",
        goal: "Template",
      });
      if (gaps.length) throw new Error(`Complete the template: ${gaps.join("; ")}.`);
      if (
        !Array.isArray(data.included) ||
        data.included.some((i: any) => typeof i !== "string" || !i.trim())
      )
        throw new Error("List what is included.");
    }
    // Convex schema validates the complete catalog record on every write.
    if (id) {
      if (!ctx.db.normalizeId(table, id))
        throw new Error("Invalid catalog identifier.");
      const old = await ctx.db.get(id as any);
      if (!old) throw new Error("Record unavailable.");
      await ctx.db.replace(id as any, data);
    } else id = await ctx.db.insert(table, data);
    await audit(ctx, a.userId, "catalog_updated", table, id!);
    return id;
  },
});
export const staff = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    roles: v.array(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const a = await admin(ctx);
    if (
      !args.roles.length ||
      args.roles.some((r) => !["admin", "pt", "closer", "sdr"].includes(r))
    )
      throw new Error("Choose valid roles.");
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email.");
    let user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    const userId =
      user?._id ?? (await ctx.db.insert("users", { email, name: args.name }));
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (
      existing?._id === a.staff._id &&
      (!args.active || !args.roles.includes("admin"))
    )
      throw new Error("Another admin must change your access.");
    const data = {
      userId,
      name: args.name,
      roles: args.roles,
      active: args.active,
    };
    const id = existing?._id ?? (await ctx.db.insert("staff", data));
    if (existing) await ctx.db.patch(id, data);
    if (!args.active)
      for (const session of await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect())
        await ctx.db.patch(session._id, { expirationTime: Date.now() });
    await audit(ctx, a.userId, "staff_updated", "staff", id);
  },
});
export const replay = mutation({
  args: { id: v.id("integrationJobs") },
  handler: async (ctx, { id }) => {
    const a = await admin(ctx);
    const job = await ctx.db.get(id);
    if (!job || job.status === "done" || job.status === "running")
      throw new Error("Job cannot be replayed.");
    await ctx.db.patch(id, { status: "pending", nextAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.integrations.run, { id });
    await audit(ctx, a.userId, "job_replayed", "integrationJobs", id);
  },
});
// Provision from the Convex dashboard/CLI only, never a public signup endpoint.
export const bootstrap = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    if ((await ctx.db.query("staff").collect()).length)
      throw new Error("Already initialized.");
    const userId = await ctx.db.insert("users", {
      email: email.toLowerCase(),
      name,
    });
    await ctx.db.insert("staff", {
      userId,
      name,
      roles: ["admin"],
      active: true,
    });
    await audit(ctx, "bootstrap", "first_admin", "users", userId);
  },
});
export const metrics = query({
  args: {
    cohort: v.union(
      v.literal("all"),
      v.literal("complete"),
      v.literal("incomplete"),
    ),
  },
  handler: async (ctx, { cohort }) => {
    await admin(ctx);
    const events = await ctx.db.query("events").collect(),
      appointments = await ctx.db.query("appointments").collect(),
      assignments = await ctx.db.query("videoAssignments").collect(),
      patients = await ctx.db.query("patients").collect();
    const selected = patients.filter((p) => {
      const evalAt = appointments
        .filter(
          (a) =>
            a.patientId === p._id &&
            a.kind === "eval" &&
            ["attended", "no_show"].includes(a.status),
        )
        .sort((a, b) => a.startsAt - b.startsAt)[0]?.startsAt;
      const own = assignments.filter((a) => a.patientId === p._id && !!evalAt && a._creationTime<=evalAt);
      const complete = p.evaluationCohort?.completedBefore ?? (
        !!evalAt &&
        own.length > 0 &&
        own.every((a) => a.quizPassedAt && a.quizPassedAt < evalAt));
      return cohort === "all" || (cohort === "complete" ? complete : !complete);
    });
    const ids = new Set(selected.map((p) => p._id));
    const counts: Record<string, number> = {};
    for (const e of events.filter((e) => ids.has(e.patientId)))
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    const weeks: Record<string, Record<string, number>> = {};
    for (const e of events.filter((e) => ids.has(e.patientId))) {
      const d = new Date(`${localDate(e.at)}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = d.toISOString().slice(0, 10);
      weeks[key] ??= {};
      weeks[key][e.type] = (weeks[key][e.type] ?? 0) + 1;
    }
    const plans = (await ctx.db.query("plansOfCare").collect()).filter(p=>ids.has(p.patientId));
    // Addendum 1 section 7 metrics.
    const produced = plans.filter((p) => ids.has(p.patientId) && p.producedAt),
      revealed = produced.filter((p) => p.priceRevealedAt),
      won = produced.filter((p) => p.acceptedAt),
      hours = won
        .map((p) => (p.acceptedAt! - p.producedAt!) / 3_600_000)
        .sort((a, b) => a - b),
      declineReasons: Record<string, number> = {};
    for (const p of produced)
      if (p.declineReason)
        declineReasons[p.declineReason] = (declineReasons[p.declineReason] ?? 0) + 1;
    const proposals = {
      produced: produced.length,
      scopeConfirmRate: produced.length
        ? produced.filter((p) => p.scopeConfirmedAt).length / produced.length
        : 0,
      acceptAfterRevealRate: revealed.length
        ? revealed.filter((p) => p.acceptedAt).length / revealed.length
        : 0,
      medianHoursToAccept: hours.length ? (hours[Math.floor((hours.length-1)/2)]+hours[Math.floor(hours.length/2)])/2 : null,
      declineReasons,
    };
    return {
      proposals,
      patients: selected.length,
      counts,
      weeks,
      installmentShare: plans.filter((p) =>
        ["accepted", "completed"].includes(p.status),
      ).length
        ? plans.filter(
            (p) =>
              ["accepted", "completed"].includes(p.status) && p.installments,
          ).length /
          plans.filter((p) => ["accepted", "completed"].includes(p.status))
            .length
        : 0,
    };
  },
});
