import { paymentSchedule } from "./domain";

// Addendum 1: plan of care proposals. Shared by the UI and Convex functions.
export const DEPOSIT_CENTS = 4850;
export type Outcome = {
  id?: string;
  label: string;
  measure: string;
  target: string;
  retestWeek: number;
  doneAt?: number;
};
export type Phase = {
  name: string;
  weekStart: number;
  weekEnd: number;
  focus: string;
  visits: number;
  milestone: string;
};
export type ProposalStatus =
  | "draft"
  | "produced"
  | "scope_confirmed"
  | "price_revealed"
  | "accepted"
  | "declined"
  | "sent_to_portal"
  | "completed";
export const conditions = ["knee", "shoulder", "low_back", "hip", "other"];
export const declineReasons = [
  "price",
  "timing",
  "needs_to_talk_to_spouse",
  "not_convinced",
  "other",
];
const transitions: Record<string, ProposalStatus[]> = {
  draft: ["produced"],
  produced: ["scope_confirmed", "declined", "sent_to_portal"],
  scope_confirmed: ["price_revealed", "declined", "sent_to_portal"],
  price_revealed: ["accepted", "declined", "sent_to_portal"],
  declined: ["sent_to_portal"],
  sent_to_portal: ["accepted"],
  accepted: ["completed"],
};
export const canTransition = (from: string, to: ProposalStatus) =>
  !!transitions[from]?.includes(to);

/** PP-16: templates and proposals never promise results. */
export const bannedWording = (text: string) =>
  /\b(guarantee\w*|promis\w*|cur(?:e|es|ed|ing))\b/i.test(text);

/** PP-10: whole-dollar installment total; 50% at acceptance, then weeks 4 and 7. */
export function investment(priceCents: number, depositCents = DEPOSIT_CENTS) {
  const full = paymentSchedule(priceCents, depositCents, false, 0),
    installments = paymentSchedule(priceCents, depositCents, true, 0);
  return {
    priceCents,
    depositCreditCents: depositCents,
    full: { total: full.total, charges: full.charges.map((c) => c.amountCents) },
    installments: {
      total: installments.total,
      charges: installments.charges.map((c) => c.amountCents),
    },
  };
}

/** PP-3: every reason Produce stays disabled, in builder order. */
export function proposalGaps(x: any): string[] {
  const gaps: string[] = [];
  const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const whole = (v: unknown, min: number, max: number) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!filled(x.mainPain)) gaps.push("Main pain, in the patient’s words");
  if (!filled(x.goal)) gaps.push("The patient’s goal, word for word");
  if (
    !whole(x.weeks, 1, 104) ||
    !whole(x.visitsPerWeek, 1, 7) ||
    !filled(x.why)
  )
    gaps.push("Prognosis: weeks, visits per week, and a short why");
  const outcomes: any[] = Array.isArray(x.outcomes) ? x.outcomes : [];
  if (
    outcomes.length < 2 ||
    outcomes.length > 4 ||
    outcomes.some(
      (o) => !filled(o.label) || !filled(o.measure) || !filled(o.target) || !whole(o.retestWeek, 1, x.weeks ?? 104),
    )
  )
    gaps.push("At least 2 outcomes, each with a re-test week inside the plan");
  const phases: any[] = (Array.isArray(x.phases) ? x.phases : [])
    .slice()
    .sort((a: any, b: any) => a.weekStart - b.weekStart);
  let next = 1;
  for (const ph of phases) {
    if (
      !filled(ph.name) ||
      !Number.isInteger(ph.weekStart) ||
      !Number.isInteger(ph.weekEnd) ||
      ph.weekStart !== next ||
      ph.weekEnd < ph.weekStart
    ) {
      next = -1;
      break;
    }
    next = ph.weekEnd + 1;
  }
  if (phases.length<3 || phases.length > 4 || next !== (x.weeks ?? 0) + 1)
    gaps.push(
      `Roadmap phases covering week 1 through week ${x.weeks || "?"} with no gaps or overlaps`,
    );
  if (!Number.isSafeInteger(x.priceCents) || x.priceCents <= DEPOSIT_CENTS)
    gaps.push("A price greater than the $48.50 deposit");
  const words = [
    x.findings,
    x.why,
    x.programmingFocus,
    ...outcomes.flatMap((o) => [o.label, o.measure, o.target]),
    ...phases.flatMap((p) => [p.name, p.focus, p.milestone]),
    ...(Array.isArray(x.included) ? x.included : []),
  ].join(" ");
  if (bannedWording(words))
    gaps.push("Remove “guarantee,” “promise,” or “cure” from the wording");
  return gaps;
}

/** Whether price fields may leave the server for this record (PP-7, PP-13, PP-15). */
export const priceVisible = (plan: any) =>
  !!plan.priceRevealedAt ||
  !!plan.sentToPortalAt ||
  ["accepted", "completed"].includes(plan.status);

const priceFields = [
  "priceCents",
  "installmentTotalCents",
  "depositCreditCents",
  "paymentOption",
  "installments",
  "included",
  "termsAcceptedAt",
  "agreementId",
  "agreement",
  "deposits",
  "terms",
];
export function redactPrice(plan: any) {
  if (priceVisible(plan)) return { ...plan, priceHidden: false };
  const copy = { ...plan, priceHidden: true };
  for (const f of priceFields) delete copy[f];
  return copy;
}
export const patientCanSee = (plan: any) =>
  ["sent_to_portal", "accepted", "completed"].includes(plan.status);

export const conditionLabel = (c: string) =>
  ({
    knee: "Knee",
    shoulder: "Shoulder",
    low_back: "Low back",
    hip: "Hip",
    other: "Other",
  })[c] ?? c;

const included = [
  "One-on-one visits with your physical therapist",
  "Your movement program in the portal, updated as you progress",
  "Messaging with the team between visits",
  "Scheduled re-tests to measure progress",
];
/** Starter templates for Jimmy to replace; wording pending legal review (PP-16). */
export const starterTemplates = [
  {
    name: "Knee — return to sport",
    condition: "knee",
    weeks: 8,
    visitsPerWeek: 2,
    why: "Your knee is irritated, and the muscles around it have lost strength. Calming it first, then loading it steadily, gives it the best chance to handle sport again.",
    programmingFocus:
      "Strength through the hips and legs, then controlled speed and change of direction.",
    outcomes: [
      {
        label: "Walk 30 minutes without stopping",
        measure: "Pain during walk (0–10)",
        target: "2/10 or less",
        retestWeek: 4,
      },
      {
        label: "Two full games with pain at 2/10 or less",
        measure: "Pain after play (0–10)",
        target: "2/10 or less",
        retestWeek: 8,
      },
    ],
    phases: [
      {
        name: "Calm it down",
        weekStart: 1,
        weekEnd: 2,
        focus: "Settle pain and restore easy movement.",
        visits: 4,
        milestone: "Stairs feel easier",
      },
      {
        name: "Build strength",
        weekStart: 3,
        weekEnd: 5,
        focus: "Progressive strength for the legs and hips.",
        visits: 6,
        milestone: "Single-leg strength re-test",
      },
      {
        name: "Return to play",
        weekStart: 6,
        weekEnd: 8,
        focus: "Speed, cutting, and practice games.",
        visits: 6,
        milestone: "Two full games",
      },
    ],
    included,
    priceCents: 440000,
    active: true,
  },
  {
    name: "Shoulder — reach and lift",
    condition: "shoulder",
    weeks: 8,
    visitsPerWeek: 2,
    why: "Your shoulder has lost range and strength. Restoring motion first, then rebuilding strength, prepares it for everyday lifting.",
    programmingFocus: "Range of motion, then shoulder blade and rotator cuff strength.",
    outcomes: [
      {
        label: "Reach the top shelf without pain",
        measure: "Pain on reach (0–10)",
        target: "1/10 or less",
        retestWeek: 4,
      },
      {
        label: "Lift a 20 lb bag overhead",
        measure: "Overhead lift",
        target: "20 lb, 5 times",
        retestWeek: 8,
      },
    ],
    phases: [
      {
        name: "Restore motion",
        weekStart: 1,
        weekEnd: 3,
        focus: "Gentle range of motion and pain relief.",
        visits: 6,
        milestone: "Full reach overhead",
      },
      {
        name: "Build strength",
        weekStart: 4,
        weekEnd: 6,
        focus: "Rotator cuff and shoulder blade strength.",
        visits: 6,
        milestone: "Strength re-test",
      },
      {
        name: "Load and return",
        weekStart: 7,
        weekEnd: 8,
        focus: "Heavier lifting and daily tasks.",
        visits: 4,
        milestone: "Overhead lift",
      },
    ],
    included,
    priceCents: 440000,
    active: true,
  },
  {
    name: "Low back — move with confidence",
    condition: "low_back",
    weeks: 6,
    visitsPerWeek: 2,
    why: "Your back is sensitive, not damaged. Gradual movement and strength reduce that sensitivity and rebuild trust in bending and lifting.",
    programmingFocus: "Graded movement, trunk and hip strength, and lifting practice.",
    outcomes: [
      {
        label: "Sit through a 60-minute drive",
        measure: "Pain after sitting (0–10)",
        target: "2/10 or less",
        retestWeek: 3,
      },
      {
        label: "Lift a laundry basket from the floor",
        measure: "Floor-to-waist lift",
        target: "15 lb, comfortably",
        retestWeek: 6,
      },
    ],
    phases: [
      {
        name: "Settle it",
        weekStart: 1,
        weekEnd: 2,
        focus: "Comfortable movement and walking.",
        visits: 4,
        milestone: "Morning stiffness eases",
      },
      {
        name: "Build capacity",
        weekStart: 3,
        weekEnd: 4,
        focus: "Trunk and hip strength.",
        visits: 4,
        milestone: "Sitting re-test",
      },
      {
        name: "Lift and live",
        weekStart: 5,
        weekEnd: 6,
        focus: "Lifting practice and daily tasks.",
        visits: 4,
        milestone: "Floor lift",
      },
    ],
    included,
    priceCents: 330000,
    active: true,
  },
  {
    name: "Hip — walk and climb",
    condition: "hip",
    weeks: 8,
    visitsPerWeek: 2,
    why: "Your hip is stiff and the muscles that support it are weak. Restoring motion and strength makes walking and stairs easier.",
    programmingFocus: "Hip mobility, glute strength, and balance.",
    outcomes: [
      {
        label: "Climb two flights of stairs without stopping",
        measure: "Stair climb",
        target: "Two flights, no rail",
        retestWeek: 4,
      },
      {
        label: "Walk 2 miles comfortably",
        measure: "Pain during walk (0–10)",
        target: "2/10 or less",
        retestWeek: 8,
      },
    ],
    phases: [
      {
        name: "Ease the stiffness",
        weekStart: 1,
        weekEnd: 2,
        focus: "Hip mobility and pain relief.",
        visits: 4,
        milestone: "Easier sit-to-stand",
      },
      {
        name: "Build strength",
        weekStart: 3,
        weekEnd: 5,
        focus: "Glute and leg strength, balance.",
        visits: 6,
        milestone: "Stair re-test",
      },
      {
        name: "Go the distance",
        weekStart: 6,
        weekEnd: 8,
        focus: "Longer walks and endurance.",
        visits: 6,
        milestone: "2-mile walk",
      },
    ],
    included,
    priceCents: 440000,
    active: true,
  },
];
