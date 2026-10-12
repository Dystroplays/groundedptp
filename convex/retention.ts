import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { enqueue } from "./jobs";
import { event, forPatient } from "./access";
import { normalizePhone } from "../src/domain";
export const disqualify = internalMutation({
  args: { id: v.id("referrals") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "ineligible" });
  },
});
export const activate = internalMutation({
  args: { patientId: v.id("patients"), membershipId: v.id("memberships") },
  handler: async (ctx, { patientId, membershipId }) => {
    await enqueue(
      ctx,
      "membership_start",
      `membership:${membershipId}`,
      { membershipId },
      patientId,
    );
  },
});
export const started = internalMutation({
  args: {
    patientId: v.id("patients"),
    id: v.id("memberships"),
    subscriptionId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, a) => {
    const m = await ctx.db.get(a.id);
    if (!m || m.stripeSubscriptionId) return;
    await ctx.db.patch(a.id, {
      stripeSubscriptionId: a.subscriptionId,
      status: a.status,
      startedAt: Date.now(),
    });
    if (a.status === "active") {
      await event(ctx, a.patientId, "membership_started");
      await enqueue(
        ctx,
        "ghl_stage",
        `member:${a.id}`,
        { stage: "member" },
        a.patientId,
      );
    }
  },
});
export const refer = mutation({
  args: { token: v.string(), name: v.string(), contact: v.string() },
  handler: async (ctx, args) => {
    const generic =
      "Thanks. The Grounded team will be in touch if we can help.";
    if (process.env.ENABLE_RETENTION !== "true")
      throw new Error("Referral submissions are not available yet.");
    if (
      args.token.length > 100 ||
      args.name.trim().length < 2 ||
      args.name.length > 100 ||
      args.contact.length > 200
    )
      throw new Error("Enter your name and contact details.");
    const contact = args.contact.includes("@")
      ? args.contact.trim().toLowerCase()
      : normalizePhone(args.contact);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) &&
      !/^\+?[\d ()-]{10,20}$/.test(contact)
    )
      throw new Error("Enter an email or phone number.");
    const referrer = await ctx.db
      .query("patients")
      .withIndex("by_referral", (q) => q.eq("referralToken", args.token))
      .unique();
    if (!referrer) return generic;
    const existing = await ctx.db
      .query("patients")
      .withIndex(contact.includes("@") ? "by_email" : "by_phone", (q) =>
        q.eq(contact.includes("@") ? "email" : "phone", contact),
      )
      .first();
    const duplicate = await ctx.db
      .query("referrals")
      .withIndex("by_contact", (q) => q.eq("friendContact", contact))
      .first();
    if (existing || duplicate) return generic;
    const recent = (
      await ctx.db
        .query("referrals")
        .withIndex("by_referrer", (q) => q.eq("referrerId", referrer._id))
        .collect()
    ).filter((r) => r.at > Date.now() - 3_600_000);
    if (recent.length >= 10) return generic;
    const id = await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      friendName: args.name.trim(),
      friendContact: contact,
      status: "invited",
      at: Date.now(),
    });
    await enqueue(ctx, "referral_lead", `referral:${id}`, {
      name: args.name,
      contact,
      referralId: id,
    });
    await event(ctx, referrer._id, "referral_created");
    return generic;
  },
});
