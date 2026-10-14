import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DAY, localDate } from "../src/domain";
import { starterTemplates } from "../src/proposal";
export const sample = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_REAL_PATIENTS === "true")
      throw new Error("Sample seed is disabled on live deployments.");
    const sampleEmail=process.env.STAGING_TEST_EMAIL?.trim().toLowerCase()??"linda@example.test";
    const samplePhone=process.env.STAGING_TEST_PHONE?.trim()??"";
    if (
      await ctx.db
        .query("patients")
        .withIndex("by_email", (q) => q.eq("email", sampleEmail))
        .unique()
    )
      return "Sample patient already exists.";
    const userId = await ctx.db.insert("users", {
      email: sampleEmail,
      name: "Linda Miller",
    });
    const staff = [];
    for (const [email, name, roles] of [
      ["jimmy@example.test", "Jimmy", ["pt"]],
      ["blake@example.test", "Blake", ["closer", "admin"]],
      ["sdr@example.test", "Booking team", ["sdr"]],
    ] as const) {
      const uid = await ctx.db.insert("users", { email, name });
      staff.push(
        await ctx.db.insert("staff", {
          userId: uid,
          name,
          roles: [...roles],
          active: true,
        }),
      );
    }
    const patientId = await ctx.db.insert("patients", {
      userId,
      name: "Linda Miller",
      email: sampleEmail,
      phone: samplePhone,
      stage: "pre_visit",
      status: "on_track",
      goal: "Back to pickleball with the grandkids.",
      ptId: staff[0],
      closerId: staff[1],
      source: "fake_seed",
      depositAt: Date.now(),
      referralToken: crypto.randomUUID(),
    });
    const videos = [];
    for (const [i, title] of [
      "Why we’re different",
      "Insurance and cash-pay care",
      "Your team. Your next chapter.",
    ].entries()) {
      const videoId = await ctx.db.insert("videos", {
        title,
        playbackId: "",
        durationSec: 360,
        whyLine: "Sample content — replace before launch.",
        category: "pre_visit",
        captionsReady: false,
        archived: false,
      });
      videos.push(videoId);
      await ctx.db.insert("quizzes", {
        videoId,
        questions: [
          {
            prompt: "What is the next step?",
            options: [
              "Bring questions to your evaluation",
              "Skip the evaluation",
            ],
            correctIndex: 0,
            jumpToSec: 30,
          },
        ],
      });
      await ctx.db.insert("videoAssignments", {
        patientId,
        videoId,
        order: i,
        dueAt: Date.now() + (i + 1) * DAY,
        watchedSec: 0,
        ...(i === 0 ? { unlockedAt: Date.now() } : {}),
      });
    }
    await ctx.db.insert("sequences", {
      name: "Before your evaluation",
      active: true,
      items: videos.map((videoId, i) => ({ videoId, dueOffsetDays: 3 - i })),
    });
    for (const name of ["Sit-to-stand", "Glute bridge", "Single-leg balance"])
      await ctx.db.insert("exercises", {
        name,
        defaultCue: "Sample cue — replace with approved clinical instruction.",
        tags: ["Sample"],
        archived: false,
      });
    for (const template of starterTemplates)
      await ctx.db.insert("proposalTemplates", template);
    await ctx.db.insert("settings", {
      key: "referralRules",
      value: { enabled: false, depositCents: 0, planCents: 0 },
    });
    await ctx.db.insert("settings", {
      key: "clinic",
      value: {
        name: "Grounded",
        phone: "",
        address: "",
        wear: "Wear comfortable clothes you can move in.",
      },
    });
    return "Seeded fake patients, staff, and libraries. Configure Paubox with a real test inbox to test login.";
  },
});
