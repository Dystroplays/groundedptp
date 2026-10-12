import { internalMutation } from "./_generated/server";
import { forPatient, setting, event } from "./access";
import { enqueue, notify } from "./jobs";
import {
  DAY,
  evaluateRules,
  localDate,
  statusOf,
  businessDue,
} from "../src/domain";
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now(),
      today = localDate(now),
      weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const thresholds = await setting(ctx, "thresholds", {});
    const businessHours = await setting(ctx, "businessHours", {
      open: 8,
      close: 17,
      days: [1, 2, 3, 4, 5],
    });
    const holidays = await setting(ctx, "holidays", []);
    for (const p of await ctx.db.query("patients").collect()) {
      const appointments = await forPatient(ctx, "appointments", p._id);
      const assignments = await forPatient(ctx, "videoAssignments", p._id);
      const incomplete = assignments.filter((a: any) => !a.quizPassedAt);
      const evalAppointment = appointments
        .filter((a: any) => a.kind === "eval" && a.status === "booked")
        .sort((a: any, b: any) => a.startsAt - b.startsAt)[0];
      const visits = appointments
        .filter(
          (a: any) =>
            a.kind !== "eval" && a.status === "booked" && a.startsAt >= now,
        )
        .sort((a: any, b: any) => a.startsAt - b.startsAt);
      const sessions = (await forPatient(ctx, "sessionLogs", p._id))
        .filter((s: any) => s.completedAt)
        .sort((a: any, b: any) => b.completedAt - a.completedAt);
      const programs = await forPatient(ctx, "programs", p._id);
      const active = programs.find((x: any) => x.active);
      const scheduled = await forPatient(ctx, "sessionAssignments", p._id);
      if (active && p.stage === "in_care") {
        // Materialize a week, replacing only future unstarted assignments after a publication.
        for (let n = 0; n < 7; n++) {
          const date = localDate(now + n * DAY),
            day = new Date(`${date}T12:00:00Z`).getUTCDay();
          const items = active.items
            .filter((i: any) => i.days.includes(day))
            .map((i: any) => i.id);
          const old = scheduled.find((s: any) => s.date === date);
          const started = (await forPatient(ctx, "sessionLogs", p._id)).some(
            (s: any) => s.date === date,
          );
          if (old && !started)
            await ctx.db.patch(old._id, {
              programId: active._id,
              itemIds: items,
            });
          else if (!old && items.length)
            await ctx.db.insert("sessionAssignments", {
              patientId: p._id,
              programId: active._id,
              date,
              itemIds: items,
            });
        }
      }
      // Prior completed Monday–Sunday, independent of the current weekday.
      const sinceMonday = (weekday + 6) % 7;
      const monday = localDate(now - sinceMonday * DAY),
        priorMonday = localDate(now - (sinceMonday + 7) * DAY);
      const lastWeek = scheduled.filter(
        (s: any) =>
          s.date >= priorMonday && s.date < monday && s.itemIds.length,
      );
      const done = new Set(sessions.map((s: any) => s.date));
      const messages = await forPatient(ctx, "messages", p._id);
      const payments = await forPatient(ctx, "payments", p._id);
      const memberships = await forPatient(ctx, "memberships", p._id);
      const rules = evaluateRules({
        now,
        stage: p.stage as any,
        depositAt: p.depositAt,
        lastLoginAt: p.lastLoginAt,
        lastActivityAt: p.lastActivityAt,
        overdueHours: incomplete.length
          ? Math.max(...incomplete.map((a: any) => (now - a.dueAt) / 3_600_000))
          : 0,
        evalAt: evalAppointment?.startsAt,
        incompleteVideos: incomplete.length > 0,
        evalNoShow:
          appointments.some(
            (a: any) => a.kind === "eval" && a.status === "no_show",
          ) && !evalAppointment,
        nextVisitAt: visits[0]?.startsAt,
        adherence: lastWeek.length
          ? lastWeek.filter((s: any) => done.has(s.date)).length /
            lastWeek.length
          : undefined,
        missedVisit:
          appointments.some(
            (a: any) => a.kind !== "eval" && a.status === "no_show",
          ) && !visits.length,
        pain:
          messages.some(
            (m: any) => m.painFlag && m.at > (p.painResolvedAt ?? 0),
          ) ||
          (sessions.length > 1 &&
            sessions
              .slice(0, 2)
              .every(
                (s: any) =>
                  s.feel === "too_much" &&
                  s.completedAt > (p.painResolvedAt ?? 0),
              )),
        paymentFailed:
          payments.some((r: any) => r.status === "failed") ||
          memberships.some((m: any) => m.status === "failed"),
        dischargedAt: p.dischargedAt,
        membershipActive: memberships.some((m: any) => m.status === "active"),
        thresholds,
      });
      const saves = await forPatient(ctx, "saves", p._id);
      for (const s of saves) {
        if (s.rule === "late_booking") {
          if(!s.doneAt&&(!incomplete.length||!evalAppointment||evalAppointment.startsAt-now>=DAY||evalAppointment.startsAt<now))await ctx.db.patch(s._id,{doneAt:now,conditionActive:false,outcome:'condition_cleared'});
          continue;
        }
        if (!rules.some((r) => r.rule === s.rule) && s.conditionActive) {
          await ctx.db.patch(s._id, {
            conditionActive: false,
            doneAt: s.doneAt ?? now,
            outcome: s.outcome ?? "condition_cleared",
          });
          if (!s.doneAt)
            await event(ctx, p._id, "save_closed", { rule: s.rule });
        }
      }
      for (const r of rules) {
        // Explicit resolutions stay suppressed until this condition clears, then recurs.
        if (saves.some((s: any) => s.rule === r.rule && s.conditionActive))
          continue;
        const ownerId =
          r.ownerRole === "pt"
            ? p.ptId
            : r.ownerRole === "closer"
              ? p.closerId
              : undefined;
        if (r.rule !== "eval_no_show")
          r.dueAt =
            r.rule === "low_adherence" && visits[0]
              ? visits[0].startsAt
              : businessDue(
                  now,
                  r.rule === "inactive" || r.rule === "low_adherence",
                  businessHours,
                  holidays,
                );
        await ctx.db.insert("saves", {
          patientId: p._id,
          ...r,
          ...(ownerId ? { ownerId } : {}),
          conditionActive: true,
          attempts: [],
        });
        await event(ctx, p._id, "save_opened", { rule: r.rule });
      }
      const status = statusOf(await forPatient(ctx, "saves", p._id));
      if (p.status !== status) {
        await ctx.db.patch(p._id, { status });
        await enqueue(
          ctx,
          "ghl_status",
          `status:${p._id}:${now}`,
          { status },
          p._id,
        );
      }
      for (const a of appointments.filter(
        (a: any) => a.status === "booked" && a.startsAt > now,
      ))
        await notify(
          ctx,
          p._id,
          "appointment_reminder",
          `appointment:${a._id}:r${a.revision??0}:${a.startsAt}`,
          Math.max(now, a.startsAt - DAY),
        );
      for (const a of incomplete.filter((a: any) => a.dueAt > now))
        await notify(
          ctx,
          p._id,
          "video_reminder",
          `video:${a._id}:r${evalAppointment?.revision??0}:${a.dueAt}`,
          Math.max(now, a.dueAt - DAY),
        );
      for (const s of await forPatient(ctx, "installmentSchedules", p._id))
        if (s.status === "scheduled" && s.dueAt <= now)
          await enqueue(
            ctx,
            "installment",
            `installment:${s._id}`,
            { scheduleId: s._id },
            p._id,
          );
    }
    // Reclaim jobs whose worker terminated before recording a result.
    for (const job of await ctx.db
      .query("integrationJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect())
      if (job.nextAt <= now)
        await ctx.scheduler.runAfter(
          0,
          (await import("./_generated/api")).internal.integrations.run,
          { id: job._id },
        );
  },
});
