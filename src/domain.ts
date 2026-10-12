export const DAY = 86_400_000;
export const TZ = "America/Chicago";
export type Role = "patient" | "sdr" | "pt" | "closer" | "admin";
export type Stage = "deposit_paid" | "pre_visit" | "in_care" | "discharged";
export type Status = "on_track" | "watch" | "at_risk";
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const localDate = (time: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
export const dateLabel = (time: number, withTime = false) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(time);
export function centralTimestamp(date: string, hour = 12, minute = 0) {
  const nominal = Date.parse(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  if (!Number.isFinite(nominal)) throw new Error("Enter a valid date.");
  let utc = nominal + 6 * 3_600_000;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(utc)
        .map((p) => [p.type, p.value]),
    );
    const local = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
    );
    utc += nominal - local;
  }
  return utc;
}
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10
    ? `+1${digits}`
    : digits.length === 11 && digits.startsWith("1")
      ? `+${digits}`
      : value.trim();
}
export function weeklyAdherence(
  assignments: any[],
  sessions: any[],
  now = Date.now(),
) {
  const today = localDate(now),
    weekday = new Date(`${today}T12:00:00Z`).getUTCDay(),
    monday = centralTimestamp(today) - ((weekday + 6) % 7) * DAY;
  return Array.from({ length: 8 }, (_, index) => {
    const start = localDate(monday - (7 - index) * 7 * DAY),
      end = localDate(monday - (6 - index) * 7 * DAY);
    const expected = assignments.filter(
      (a) => a.date >= start && a.date < end && a.itemIds.length,
    );
    const done = expected.filter((a) =>
      sessions.some((s) => s.date === a.date && s.completedAt),
    ).length;
    return { start, assigned: expected.length, done };
  });
}
/** PP-10: plan price plus 15%, rounded to the nearest dollar. */
export const installmentTotal = (price: number) =>
  Math.round((price * 115) / 10_000) * 100;
export function addCentralDays(at:number,days:number){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
  const day=new Date(`${localDate(at)}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+days);
  return centralTimestamp(day.toISOString().slice(0,10),Number(parts.hour),Number(parts.minute))+Number(parts.second)*1000+((at%1000)+1000)%1000;
}
export function paymentSchedule(
  price: number,
  deposit: number,
  installments: boolean,
  startsAt: number,
) {
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(deposit) ||
    deposit < 0 ||
    deposit > price
  )
    throw new Error("Enter a valid price and deposit in cents.");
  const total = installments ? installmentTotal(price) : price;
  if (!installments)
    return {
      total,
      charges: [{ amountCents: total - deposit, dueAt: startsAt }],
    };
  const first = Math.round(total / 2),
    second = Math.floor((total - first) / 2);
  if (first <= deposit)
    throw new Error("The first installment must exceed the paid deposit.");
  return {
    total,
    charges: [
      { amountCents: first - deposit, dueAt: startsAt },
      { amountCents: second, dueAt: addCentralDays(startsAt,28) },
      { amountCents: total - first - second, dueAt: addCentralDays(startsAt,49) },
    ],
  };
}
export function sequenceDates(evalAt: number, offsets: number[], now: number) {
  const deadline = evalAt - DAY;
  if (deadline <= now) return offsets.map(() => now);
  const earliest = evalAt - Math.max(...offsets) * DAY;
  return offsets.map((offset, i) =>
    earliest >= now
      ? evalAt - Math.max(1, offset) * DAY
      : Math.round(now + ((deadline - now) * (i + 1)) / offsets.length),
  );
}
export function nextTextTime(now: number) {
  // Walk real UTC minutes to respect Central daylight-saving transitions.
  const hour = (t: number) =>
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        hour: "numeric",
        hourCycle: "h23",
      }).format(t),
    );
  if (hour(now) >= 8 && hour(now) < 20) return now;
  let t = now - (now % 60_000) + 60_000;
  while (hour(t) !== 8) t += 60_000;
  return t;
}
export function nextBusinessDay(now: number) {
  let t = now + DAY;
  while (
    ["Sat", "Sun"].includes(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        weekday: "short",
      }).format(t),
    )
  )
    t += DAY;
  return nextTextTime(t);
}
export function businessDue(
  now: number,
  nextDay = false,
  hours = { open: 8, close: 17, days: [1, 2, 3, 4, 5] },
  holidays: string[] = [],
) {
  let date = localDate(now + (nextDay ? DAY : 0));
  for (let i = 0; i < 370; i++) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const open = centralTimestamp(date, hours.open),
      close = centralTimestamp(
        date,
        hours.close === 24 ? 23 : hours.close,
        hours.close === 24 ? 59 : 0,
      );
    if (hours.days.includes(day) && !holidays.includes(date) && close >= now)
      return nextDay ? close : Math.max(now, close);
    date = localDate(centralTimestamp(date) + DAY);
  }
  throw new Error("Configure at least one business day.");
}
export const hasPain = (body: string) =>
  /\b(pain(?:s|ful)?|sharp|swell\w*|swollen|flare\w*|fell|hurts?)\b/i.test(
    body,
  );
export function creditToApply(balance: number, invoice: number) {
  return Math.max(0, Math.min(balance, invoice));
}
export function allowed(
  roles: string[],
  action: "clinical" | "care" | "finance" | "admin",
) {
  if (roles.includes("admin")) return true;
  return action === "clinical" || action === "care"
    ? roles.includes("pt")
    : action === "finance"
      ? roles.includes("closer")
      : false;
}
export function credibleProgress(
  previous: number,
  requested: number,
  elapsedMs: number,
  duration: number,
) {
  if (
    ![previous, requested, elapsedMs, duration].every(Number.isFinite) ||
    requested < 0
  )
    throw new Error("Invalid playback progress.");
  return Math.min(
    duration,
    Math.max(
      previous,
      Math.min(requested, previous + Math.max(0, elapsedMs) / 1000),
    ),
  );
}
export type Rule =
  | "no_login"
  | "video_late"
  | "video_late_hard"
  | "eval_no_show"
  | "unbooked_after_buy"
  | "inactive"
  | "low_adherence"
  | "visit_missed"
  | "pain_flag"
  | "payment_failed"
  | "no_membership"
  | "late_booking";
export const ruleLabels: Record<Rule, string> = {
  no_login: "Help with the first sign-in",
  video_late: "Check in on a video",
  video_late_hard: "Help finish pre-visit videos",
  eval_no_show: "Rebook the evaluation",
  unbooked_after_buy: "Book the next visit",
  inactive: "A personal check-in",
  low_adherence: "Make the program manageable",
  visit_missed: "Rebook the missed visit",
  pain_flag: "Check in about discomfort",
  payment_failed: "Help update payment details",
  no_membership: "Check in after discharge",
  late_booking: "Prepare for a short-notice evaluation",
};
export type RuleContext = {
  now: number;
  stage: Stage;
  depositAt: number;
  lastLoginAt?: number;
  lastActivityAt?: number;
  overdueHours: number;
  evalAt?: number;
  incompleteVideos: boolean;
  evalNoShow: boolean;
  nextVisitAt?: number;
  adherence?: number;
  missedVisit: boolean;
  pain: boolean;
  paymentFailed: boolean;
  dischargedAt?: number;
  membershipActive: boolean;
  thresholds?: {
    inactiveDays?: number;
    noLoginHours?: number;
    videoLateHours?: number;
    videoHardHours?: number;
    adherence?: number;
    membershipDays?: number;
  };
};
export function evaluateRules(c: RuleContext) {
  const t = c.thresholds ?? {};
  const pre = ["deposit_paid", "pre_visit"].includes(c.stage),
    care = c.stage === "in_care";
  const flags: Partial<Record<Rule, boolean>> = {
    no_login:
      pre &&
      !c.lastLoginAt &&
      c.now - c.depositAt >= (t.noLoginHours ?? 24) * 3_600_000,
    video_late:
      pre && c.incompleteVideos && c.overdueHours >= (t.videoLateHours ?? 24),
    video_late_hard:
      pre &&
      c.incompleteVideos &&
      (c.overdueHours >= (t.videoHardHours ?? 48) ||
        (!!c.evalAt && c.evalAt - c.now < DAY && c.evalAt >= c.now)),
    eval_no_show: pre && c.evalNoShow,
    unbooked_after_buy: care && !c.nextVisitAt,
    inactive:
      care &&
      c.now - (c.lastActivityAt ?? c.depositAt) >= (t.inactiveDays ?? 5) * DAY,
    low_adherence:
      care && c.adherence !== undefined && c.adherence < (t.adherence ?? 0.5),
    visit_missed: care && c.missedVisit,
    pain_flag: c.pain,
    payment_failed: c.paymentFailed,
    no_membership:
      c.stage === "discharged" &&
      !c.membershipActive &&
      !!c.dischargedAt &&
      c.now - c.dischargedAt >= (t.membershipDays ?? 30) * DAY,
  };
  return Object.entries(flags)
    .filter(([, yes]) => yes)
    .map(([rule]) => {
      const r = rule as Rule;
      const level: Status = [
        "video_late_hard",
        "eval_no_show",
        "unbooked_after_buy",
        "visit_missed",
        "pain_flag",
        "payment_failed",
      ].includes(r)
        ? "at_risk"
        : "watch";
      const ownerRole: Role = [
        "inactive",
        "low_adherence",
        "pain_flag",
      ].includes(r)
        ? "pt"
        : ["unbooked_after_buy", "payment_failed", "no_membership"].includes(r)
          ? "closer"
          : "sdr";
      return {
        rule: r,
        level,
        ownerRole,
        play: ruleLabels[r],
        dueAt:
          r === "eval_no_show"
            ? c.now + 2 * 3_600_000
            : ["inactive", "low_adherence"].includes(r)
              ? (c.nextVisitAt ?? nextBusinessDay(c.now))
              : nextTextTime(c.now),
      };
    });
}
export function statusOf(saves: { level: string; doneAt?: number }[]): Status {
  return saves.some((s) => !s.doneAt && s.level === "at_risk")
    ? "at_risk"
    : saves.some((s) => !s.doneAt)
      ? "watch"
      : "on_track";
}
