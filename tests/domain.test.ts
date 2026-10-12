import { describe, it, expect } from "vitest";
import {
  paymentSchedule,
  sequenceDates,
  nextTextTime,
  DAY,
  hasPain,
  credibleProgress,
  creditToApply,
  evaluateRules,
  statusOf,
  allowed,
  centralTimestamp,
  normalizePhone,
} from "../src/domain";
describe("payment accounting", () => {
  it("credits the deposit after the surcharge, conserving cents", () => {
    const p = paymentSchedule(440000, 4850, true, 0);
    expect(p.total).toBe(506000);
    expect(p.charges).toEqual([
      { amountCents: 248150, dueAt: 0 },
      { amountCents: 126500, dueAt: 28 * DAY },
      { amountCents: 126500, dueAt: 49 * DAY },
    ]);
    expect(p.charges.reduce((n, c) => n + c.amountCents, 4850)).toBe(p.total);
  });
  it("handles odd-cent rounding and full payments", () => {
    for (const cents of [10001, 10003, 440001]) {
      const p = paymentSchedule(cents, 4850, true, 0);
      expect(p.charges.reduce((n, c) => n + c.amountCents, 4850)).toBe(p.total);
    }
    expect(paymentSchedule(440000, 4850, false, 0).charges[0].amountCents).toBe(
      435150,
    );
  });
  it("rejects invalid money and limits credits", () => {
    expect(() => paymentSchedule(100, 101, false, 0)).toThrow();
    expect(() => paymentSchedule(100.5, 0, false, 0)).toThrow();
    expect(creditToApply(15000, 10000)).toBe(10000);
    expect(creditToApply(-10, 10000)).toBe(0);
  });
});
describe("Central scheduling", () => {
  it("preserves sequence order and the one-day cutoff", () => {
    expect(sequenceDates(5 * DAY, [3, 2, 1], 0)).toEqual([
      2 * DAY,
      3 * DAY,
      4 * DAY,
    ]);
    const compressed = sequenceDates(2 * DAY, [3, 2, 1], 0);
    expect(compressed.at(-1)).toBe(DAY);
    expect(compressed[0]).toBeLessThan(compressed[1]);
  });
  it("makes short-notice assignments due now", () =>
    expect(sequenceDates(DAY / 2, [3, 2, 1], 0)).toEqual([0, 0, 0]));
  it("respects quiet hours through spring DST", () => {
    const now = Date.parse("2026-03-08T06:00:00Z");
    expect(nextTextTime(now)).toBe(Date.parse("2026-03-08T13:00:00Z"));
  });
  it("respects quiet hours through autumn DST", () => {
    expect(nextTextTime(Date.parse("2026-11-01T05:00:00Z"))).toBe(
      Date.parse("2026-11-01T14:00:00Z"),
    );
  });
  it("converts clinic wall-clock appointments without a fixed UTC offset", () => {
    expect(centralTimestamp("2026-07-01", 9)).toBe(
      Date.parse("2026-07-01T14:00:00Z"),
    );
    expect(centralTimestamp("2026-12-01", 9)).toBe(
      Date.parse("2026-12-01T15:00:00Z"),
    );
  });
  it("normalizes equivalent US phone formats", () => {
    expect(normalizePhone("(214) 555-1234")).toBe("+12145551234");
    expect(normalizePhone("1-214-555-1234")).toBe("+12145551234");
  });
});
describe("care rules", () => {
  const context = {
    now: 10 * DAY,
    stage: "in_care" as const,
    depositAt: 0,
    overdueHours: 0,
    incompleteVideos: false,
    evalNoShow: false,
    missedVisit: false,
    pain: false,
    paymentFailed: false,
    membershipActive: false,
  };
  it("opens every applicable rule with the correct severity", () => {
    const r = evaluateRules({
      ...context,
      pain: true,
      paymentFailed: true,
      adherence: 0.2,
    });
    expect(r.map((x) => x.rule)).toEqual(
      expect.arrayContaining([
        "inactive",
        "low_adherence",
        "unbooked_after_buy",
        "pain_flag",
        "payment_failed",
      ]),
    );
    expect(statusOf(r)).toBe("at_risk");
    expect(statusOf(r.map((s) => ({ ...s, doneAt: 1 })))).toBe("on_track");
  });
  it("keeps discharge rules separate from membership", () => {
    expect(
      evaluateRules({
        ...context,
        stage: "discharged",
        dischargedAt: DAY,
        now: 32 * DAY,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "no_membership" }),
      ]),
    );
    expect(
      evaluateRules({
        ...context,
        stage: "discharged",
        dischargedAt: DAY,
        now: 32 * DAY,
        membershipActive: true,
      }),
    ).toHaveLength(0);
  });
  it("flags word variants and excludes incidental substrings", () => {
    expect(hasPain("My knee is swollen and hurts")).toBe(true);
    expect(hasPain("I fell yesterday")).toBe(true);
    expect(hasPain("Finished painting")).toBe(false);
  });
  it("caps invented progress against elapsed time", () => {
    expect(credibleProgress(10, 200, 10_000, 360)).toBe(20);
    expect(credibleProgress(100, 20, 10_000, 360)).toBe(100);
    expect(() => credibleProgress(0, NaN, 10_000, 360)).toThrow();
  });
  it("clinical and financial capabilities are distinct", () => {
    expect(allowed(["closer", "sdr"], "clinical")).toBe(false);
    expect(allowed(["pt"], "finance")).toBe(false);
    expect(allowed(["admin"], "clinical")).toBe(true);
  });
});
