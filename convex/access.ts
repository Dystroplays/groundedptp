import { getAuthUserId, getAuthSessionId } from "@convex-dev/auth/server";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { allowed, DAY } from "../src/domain";
export async function identity(ctx: any, allowPresentation=false) {
  const userId = await getAuthUserId(ctx),
    sessionId = await getAuthSessionId(ctx);
  if (!userId || !sessionId) throw new Error("Please sign in.");
  const session = await ctx.db.get(sessionId);
  if (!session || session.expirationTime <= Date.now())
    throw new Error("Your session has expired.");
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .unique();
  if (staff && (!staff.active || Date.now() - session._creationTime >= DAY / 2))
    throw new Error("Please sign in again.");
  const patient = await ctx.db
    .query("patients")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .unique();
  if (!staff && !patient) throw new Error("Account access unavailable.");
  const presentation=await ctx.db.query('presentationSessions').withIndex('by_session',(q:any)=>q.eq('sessionId',sessionId)).unique();
  if(presentation&&!allowPresentation)throw new Error('This device is locked to presentation mode. Sign in again to open the staff workspace.');
  return {
    userId,
    sessionId,
    staff,
    patient,
    roles: staff?.roles ?? ["patient"],
    presentation,
  };
}
export async function scope(
  ctx: any,
  patientId: string,
  permission?: "clinical" | "care" | "finance" | "admin",
  allowPresentation=false,
) {
  const actor = await identity(ctx,allowPresentation);
  if(actor.presentation&&actor.presentation.patientId!==patientId)throw new Error('Presentation patient unavailable.');
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new Error("Record unavailable.");
  if (permission && !allowed(actor.roles, permission))
    throw new Error("You do not have access to this action.");
  if (!actor.staff && actor.patient?._id !== patientId)
    throw new Error("Record unavailable.");
  if (
    actor.staff &&
    !actor.roles.some((r: string) => ["admin", "sdr", "closer"].includes(r)) &&
    patient.ptId !== actor.staff._id
  )
    throw new Error("Record unavailable.");
  // Clinical access stays assignment-scoped even when PT is also an SDR or closer.
  if (
    (permission === "clinical" || permission === "care") &&
    !actor.roles.includes("admin") &&
    patient.ptId !== actor.staff?._id
  )
    throw new Error("Record unavailable.");
  return { ...actor, target: patient };
}
export async function audit(
  ctx: any,
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string,
) {
  await ctx.db.insert("auditLog", {
    actorId,
    action,
    targetTable,
    targetId,
    at: Date.now(),
  });
}
export async function event(
  ctx: any,
  patientId: string,
  type: string,
  data: any = {},
) {
  await ctx.db.insert("events", { patientId, type, data, at: Date.now() });
}
export async function setting(ctx: any, key: string, fallback: any = null) {
  return (
    (
      await ctx.db
        .query("settings")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .unique()
    )?.value ?? fallback
  );
}
export async function forPatient(ctx: any, table: string, patientId: string) {
  return ctx.db
    .query(table)
    .withIndex("by_patient", (q: any) => q.eq("patientId", patientId))
    .collect();
}
export const loginAllowance = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .collect();
    for (const user of users) {
      const staff = await ctx.db
        .query("staff")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (staff?.active) return true;
    }
    return !!patient;
  },
});
