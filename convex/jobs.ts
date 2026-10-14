import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { nextTextTime } from "../src/domain";
import { setting, event } from "./access";
import { failureCategory } from './staging';
export async function enqueue(
  ctx: any,
  kind: string,
  key: string,
  payload: any,
  patientId?: string,
  nextAt = Date.now(),
) {
  const existing = await ctx.db
    .query("integrationJobs")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  if (existing) return existing._id;
  const id = await ctx.db.insert("integrationJobs", {
    kind,
    key,
    payload,
    ...(patientId ? { patientId } : {}),
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    nextAt,
  });
  if (kind === "ghl_stage" && patientId)
    await ctx.db.patch(patientId, { ghlDesiredStage: payload.stage });
  await ctx.scheduler.runAt(nextAt, internal.integrations.run, { id });
  return id;
}
export async function notify(
  ctx: any,
  patientId: string,
  template: string,
  key: string,
  dueAt = Date.now(),
) {
  for (const channel of ["email", "sms"]) {
    const deliveryKey = `${key}:${channel}`;
    if (
      await ctx.db
        .query("notificationDeliveries")
        .withIndex("by_key", (q: any) => q.eq("key", deliveryKey))
        .unique()
    )
      continue;
    const at = channel === "sms" ? nextTextTime(dueAt) : dueAt;
    const id = await ctx.db.insert("notificationDeliveries", {
      patientId,
      key: deliveryKey,
      channel,
      template,
      scheduledAt: at,
      status: "pending",
    });
    await enqueue(
      ctx,
      "notification",
      deliveryKey,
      { deliveryId: id },
      patientId,
      at,
    );
  }
}
export const claim = internalMutation({
  args: { id: v.id("integrationJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (
      !job ||
      job.status === "done" ||
      job.status === "cancelled" ||
      (job.status === "running" && job.nextAt > Date.now())
    )
      return null;
    await ctx.db.patch(id, {
      status: "running",
      attempts: job.attempts + 1,
      nextAt: Date.now() + 5 * 60_000,
      history:[...(job.history??[]).slice(-49),{at:Date.now(),outcome:'claimed'}],
    });
    return job;
  },
});
export const finish = internalMutation({
  args: { id: v.id("integrationJobs"), error: v.optional(v.string()) },
  handler: async (ctx, { id, error }) => {
    const job = await ctx.db.get(id);
    if (!job) return;
    if (!error) {
      await ctx.db.patch(id, { status: "done", error: undefined, failureCategory:undefined,history:[...(job.history??[]).slice(-49),{at:Date.now(),outcome:'completed'}] });
      return;
    }
    const nextAt =
      Date.now() + Math.min(3_600_000, 15_000 * 2 ** Math.min(job.attempts, 8));
    await ctx.db.patch(id, {
      status: "pending",
      error: "Provider request failed. Check configuration and retry.",
      failureCategory:failureCategory(error),
      history:[...(job.history??[]).slice(-49),{at:Date.now(),outcome:failureCategory(error)}],
      nextAt,
    });
    await ctx.scheduler.runAt(nextAt, internal.integrations.run, { id });
  },
});
export const defer = internalMutation({
  args: { id: v.id("integrationJobs"), nextAt: v.number() },
  handler: async (ctx, { id, nextAt }) => {
    await ctx.db.patch(id, { status: "pending", nextAt });
    await ctx.scheduler.runAt(nextAt, internal.integrations.run, { id });
  },
});
export const context = internalQuery({
  args: { id: v.id("integrationJobs") },
  handler: async (ctx, { id }):Promise<any> => {
    const job = await ctx.db.get(id);
    if (!job) return null;
    const patient = job.patientId ? await ctx.db.get(job.patientId) : null;
    const delivery =
      job.kind === "notification"
        ? await ctx.db.get(job.payload.deliveryId)
        : null;
    return {
      job,
      patient,
      delivery,
      templates: await setting(ctx, "messageTemplates", {}),
    };
  },
});
