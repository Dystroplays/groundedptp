import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { internal } from "./_generated/api";
import { DAY } from "../src/domain";
import { assertRecipient } from './staging';
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Email({
      id: "paubox",
      maxAge: 15 * 60,
      authorize: undefined,
      async sendVerificationRequest({ identifier, token }, ctx?: any) {
        const email = identifier.trim().toLowerCase();
        const eligible = await ctx.runMutation(internal.access.loginAllowance, {
          email,
        });
        if (!eligible) return;
        // A fragment never reaches host logs. Verification requires an explicit user click.
        const url = `${process.env.SITE_URL}/login#token=${encodeURIComponent(token)}`;
        try {
          assertRecipient('email',email);
          const response = await fetch(process.env.PAUBOX_API_URL!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token token=${process.env.PAUBOX_API_KEY}`,
            },
            body: JSON.stringify({
              data: {
                message: {
                  recipients: [email],
                  headers: {
                    subject: "Your Grounded portal link",
                    from: process.env.EMAIL_FROM,
                  },
                  content: {
                    "text/plain": `Open your Grounded portal: ${url}\nThis link works once and expires in 15 minutes. If you did not request it, ignore this email.`,
                  },
                },
              },
            }),
          });
          if (!response.ok) throw new Error("Delivery unavailable");
        } catch {
          console.error("Authentication email delivery failed");
        }
      },
    }),
  ],
  session: { totalDurationMs: 30 * DAY, inactiveDurationMs: 30 * DAY },
  callbacks: {
    async createOrUpdateUser(ctx: any, args) {
      const email = String(args.profile.email ?? "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Unable to request a link.");
      // Runs in the verification-code transaction, before replacing an existing token.
      // Throttled requests cannot invalidate a previously emailed link.
      if (args.type === "email") {
        const emailHash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(email),
            ),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const recent = (
          await ctx.db
            .query("loginRequests")
            .withIndex("by_email", (q: any) => q.eq("emailHash", emailHash))
            .collect()
        ).filter((r: any) => r.at > Date.now() - 3_600_000);
        if (
          recent.length >= 5 ||
          recent.some((r: any) => r.at > Date.now() - 30_000)
        )
          throw new Error("Please wait before requesting another link.");
        await ctx.db.insert("loginRequests", { emailHash, at: Date.now() });
      }
      const existing =
        args.existingUserId ??
        (
          await ctx.db
            .query("users")
            .filter((q: any) => q.eq(q.field("email"), email))
            .first()
        )?._id;
      // A user identity alone grants no portal access. Only an existing patient/staff record does.
      return existing ?? (await ctx.db.insert("users", { email }));
    },
    async beforeSessionCreation(ctx: any, { userId }) {
      const user = await ctx.db.get(userId);
      const staff = await ctx.db
        .query("staff")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .unique();
      const patient = await ctx.db
        .query("patients")
        .withIndex("by_email", (q: any) =>
          q.eq("email", user!.email!.toLowerCase()),
        )
        .unique();
      if ((!staff || !staff.active) && !patient)
        throw new Error("Unable to sign in. Request a new link.");
      if (staff && !staff.active)
        throw new Error("Unable to sign in. Contact the clinic.");
      if (patient) {
        await ctx.db.insert("events", {
          patientId: patient._id,
          type: "link_opened",
          data: {},
          at: Date.now(),
        });
        await ctx.db.patch(patient._id, {
          userId,
          lastLoginAt: Date.now(),
          lastActivityAt: Date.now(),
        });
        await ctx.db.insert("events", {
          patientId: patient._id,
          type: "logged_in",
          data: {},
          at: Date.now(),
        });
        await ctx.scheduler.runAfter(0,internal.engine.run,{});
      }
    },
  },
});
