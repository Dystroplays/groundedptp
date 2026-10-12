import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { identity, scope, audit, event, forPatient, setting } from "./access";
import { enqueue, notify } from "./jobs";
import { normalizePhone } from "../src/domain";
export const intake = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    depositReference: v.string(),
    adultConfirmed: v.boolean(),
    evalAt: v.optional(v.number()),
    ghlContactId: v.optional(v.string()),
    ghlOpportunityId: v.optional(v.string()),
  },
  handler: async (ctx, x) => {
    const a = await identity(ctx);
    if (!a.roles.some((r: string) => ["admin", "sdr"].includes(r)))
      throw new Error("SDR or admin access required.");
    if (process.env.ALLOW_REAL_PATIENTS !== "true")
      throw new Error(
        "The real-patient release gate is closed. Use the seed tool for fake data.",
      );
    const email = x.email.trim().toLowerCase(),
      phone = normalizePhone(x.phone);
    if (
      !x.adultConfirmed ||
      x.name.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !x.depositReference.trim()
    )
      throw new Error(
        "Confirm adult status and provide patient and paid-deposit details.",
      );
    if (
      await ctx.db
        .query("patients")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique()
    )
      throw new Error("This patient already exists. Open their record.");
    const patientId = await ctx.db.insert("patients", {
      name: x.name.trim(),
      email,
      phone,
      stage: "deposit_paid",
      status: "on_track",
      goal: "",
      source: "manual",
      depositAt: Date.now(),
      referralToken: crypto.randomUUID(),
      ...(x.ghlContactId ? { ghlContactId: x.ghlContactId } : {}),
      ...(x.ghlOpportunityId ? { ghlOpportunityId: x.ghlOpportunityId } : {}),
    });
    await ctx.db.insert("payments", {
      patientId,
      kind: "deposit",
      amountCents: 4850,
      stripeId: `manual:${patientId}:${x.depositReference}`,
      status: "paid",
      at: Date.now(),
    });
    await audit(ctx, a.userId, "manual_paid_deposit", "patients", patientId);
    await event(ctx, patientId, "deposit_paid", { source: "manual" });
    await enqueue(
      ctx,
      "ghl_match",
      `match:${patientId}`,
      { ...(x.evalAt ? { evalAt: x.evalAt } : {}) },
      patientId,
    );
    await notify(ctx, patientId, "invite", `invite:${patientId}`);
    return patientId;
  },
});
export const update = mutation({
  args: {
    patientId: v.id("patients"),
    operation: v.union(
      v.literal("owners"),
      v.literal("appointment"),
      v.literal("superbill"),
      v.literal("review_request"),
    ),
    payload: v.any(),
  },
  handler: async (ctx, { patientId, operation, payload: x }) => {
    const a = await scope(ctx, patientId);
    if (!a.staff) throw new Error("Staff access required.");
    if (operation === "owners") {
      if (!a.roles.some((r: string) => ["admin", "sdr", "closer"].includes(r)))
        throw new Error("Assignment access required.");
      const pt = await ctx.db.get(x.ptId),
        closer = await ctx.db.get(x.closerId);
      if (
        !pt?.active ||
        !pt.roles.includes("pt") ||
        !closer?.active ||
        !closer.roles.includes("closer")
      )
        throw new Error("Choose an active PT and closer.");
      await ctx.db.patch(patientId, { ptId: pt._id, closerId: closer._id });
    } else if (operation === "appointment") {
      if (!a.roles.some((r: string) => ["admin", "sdr"].includes(r)))
        throw new Error("SDR or admin access required.");
      const appointment = await ctx.db.get(x.id);
      if (
        !appointment ||
        appointment.patientId !== patientId ||
        !appointment.ghlAppointmentId
      )
        throw new Error("A synced GHL appointment is required.");
      if (
        !["booked", "attended", "no_show", "cancelled"].includes(x.status) ||
        !Number.isFinite(x.startsAt)
      )
        throw new Error("Enter a valid appointment update.");
      await enqueue(
        ctx,
        "ghl_appointment_update",
        `appointment-update:${appointment._id}:${Date.now()}`,
        {
          appointmentId: appointment.ghlAppointmentId,
          status: x.status,
          startsAt: x.startsAt,
        },
        patientId,
      );
    } else if (operation === "superbill") {
      if (!a.roles.includes("admin") && !a.roles.includes("pt"))
        throw new Error("Clinical access required.");
      await scope(ctx, patientId, "clinical");
      const clinic = await setting(ctx, "clinic", {});
      if (!clinic.npi || !clinic.taxId)
        throw new Error(
          "Configure the provider NPI and tax ID before generating superbills.",
        );
      const notes = await forPatient(ctx, "clinicalNotes", patientId);
      if (!notes.some((n: any) => n.signedAt))
        throw new Error("A signed visit note is required.");
      await enqueue(
        ctx,
        "document",
        `superbill:${patientId}:${Date.now()}`,
        { kind: "superbill" },
        patientId,
      );
    } else {
      await notify(
        ctx,
        patientId,
        "review_request",
        `review-request:${patientId}`,
      );
      await event(ctx, patientId, "review_requested");
    }
    await audit(ctx, a.userId, operation, "patients", patientId);
  },
});
