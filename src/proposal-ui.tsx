import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { usePortal } from "./store";
import { Button, Empty, Field, Header } from "./ui";
import { allowed, dateLabel, money, paymentSchedule, localDate, centralTimestamp } from "./domain";
import {
  DEPOSIT_CENTS,
  conditions,
  conditionLabel,
  declineReasons,
  investment,
  proposalGaps,
} from "./proposal";

const statusLabel: Record<string, string> = {
  draft: "Draft",
  produced: "Live on the tablet",
  scope_confirmed: "Plan confirmed",
  price_revealed: "Investment shown",
  accepted: "Accepted",
  declined: "Declined",
  sent_to_portal: "Sent to portal",
  completed: "Completed",
};
const reasonLabel = (r: string) =>
  ({
    price: "Price",
    timing: "Timing",
    needs_to_talk_to_spouse: "Needs to talk to spouse",
    not_convinced: "Not convinced",
    other: "Other",
  })[r] ?? r;

/** Sections 1–5, in presentation order. Never includes price. */
function sections(plan: any, ptName = "Your PT") {
  return [
    {
      kicker: "What’s going on",
      title: plan.mainPain ? `“${plan.mainPain}”` : "Your main concern",
      body: plan.findings ? <p>{plan.findings}</p> : null,
    },
    {
      kicker: "Your goal",
      title: plan.goal ? `“${plan.goal}”` : "Your goal",
      body: <p>Everything in this plan points here.</p>,
    },
    {
      kicker: `${ptName}’s recommendation`,
      title: `${plan.weeks || "?"} weeks, ${plan.visitsPerWeek || "?"} visits a week`,
      body: (
        <>
          {plan.why && <p>{plan.why}</p>}
          {plan.programmingFocus && (
            <p className="proposal-focus">
              <span className="small-label">Programming focus</span>
              {plan.programmingFocus}
            </p>
          )}
        </>
      ),
    },
    {
      kicker: "What you’ll be able to do",
      title: "Checkable outcomes, re-tested along the way",
      body: (
        <ul className="proposal-outcomes">
          {(plan.outcomes ?? []).map((o: any, i: number) => (
            <li key={i}>
              <span className={`milestone-check ${o.doneAt ? "done" : ""}`}>
                {o.doneAt && <Check size={16} />}
              </span>
              <span>
                <strong>{o.label || "Outcome"}</strong>
                {(o.measure || o.target) && (
                  <small>
                    {o.measure}
                    {o.measure && o.target ? ": " : ""}
                    {o.target}
                  </small>
                )}
              </span>
              <span className="ordinal">Re-test week {o.retestWeek || "?"}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      kicker: "Your roadmap",
      title: `${(plan.phases ?? []).length} phases to get there`,
      body: (
        <ol className="proposal-phases">
          {(plan.phases ?? [])
            .slice()
            .sort((a: any, b: any) => a.weekStart - b.weekStart)
            .map((ph: any, i: number) => (
              <li key={i}>
                <span className="ordinal">
                  Weeks {ph.weekStart}
                  {ph.weekEnd !== ph.weekStart ? `–${ph.weekEnd}` : ""}
                </span>
                <div>
                  <h3>{ph.name || "Phase"}</h3>
                  {ph.focus && <p>{ph.focus}</p>}
                  <small>
                    {ph.visits} visits
                    {ph.milestone ? ` · Check: ${ph.milestone}` : ""}
                  </small>
                </div>
              </li>
            ))}
        </ol>
      ),
    },
  ];
}
export function PlanSections({ plan, ptName }: { plan: any; ptName?: string }) {
  return (
    <div className="proposal-sections">
      {sections(plan, ptName).map((s, i) => (
        <section key={i} className="proposal-section">
          <span className="ordinal">
            {i + 1} · {s.kicker}
          </span>
          <h2>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}
const dueLabels = ["Today", "Week 4", "Week 7"];
export function Investment({
  priceCents,
  depositCents = DEPOSIT_CENTS,
  included,
  option,
  setOption,
  installmentsApproved = false,
  startDate = Date.now(),
  agreement,
}: {
  priceCents: number;
  depositCents?: number;
  included: string[];
  option: "full" | "installments";
  setOption?: (o: "full" | "installments") => void;
  installmentsApproved?: boolean;
  startDate?: number;
  agreement?: any;
}) {
  const inv = investment(priceCents, depositCents),
    chosen = inv[option],
    schedule = agreement?.option === option ? agreement.charges : paymentSchedule(priceCents, depositCents, option === 'installments', startDate).charges;
  return (
    <div className="investment">
      <div>
        <span className="small-label">What’s included</span>
        <ul className="included-list">
          {included.map((item, i) => (
            <li key={i}>
              <Check size={17} />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="investment-price">
        <span className="small-label">Your plan</span>
        <strong className="price">{money(inv.priceCents)}</strong>
        <p>
          Your {money(inv.depositCreditCents)} deposit is credited to your
          first payment.
        </p>
        {setOption ? (
          <div className="option-toggle" role="radiogroup" aria-label="Payment option">
            {((installmentsApproved ? ["full", "installments"] : ["full"]) as ("full" | "installments")[]).map((o) => (
              <label key={o} className={`choice ${option === o ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="payment-option"
                  checked={option === o}
                  onChange={() => setOption(o)}
                />
                <span>
                  <strong>{o === "full" ? "Paid in full" : "3 payments"}</strong>
                  <small>
                    {o === "full"
                      ? money(inv.full.total)
                      : `${money(inv.installments.total)} total, 15% more`}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p>
            <strong>
              {option === "full"
                ? "Paid in full"
                : `3 payments totaling ${money(inv.installments.total)}`}
            </strong>
          </p>
        )}
        <dl className="schedule">
          {schedule.map((c: {amountCents: number; dueAt: number}, i: number) => (
            <div key={i}>
              <dt>{i === 0 ? "At acceptance" : dateLabel(c.dueAt)}</dt>
              <dd>
                {money(c.amountCents)}
                {i === 0 && <small> after {money(inv.depositCreditCents)} credit</small>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const blankForm = (patient: any) => ({
  templateId: "",
  mainPain: patient?.mainPain ?? "",
  goal: patient?.goal ?? "",
  findings: "",
  weeks: 8,
  visitsPerWeek: 2,
  why: "",
  programmingFocus: "",
  outcomes: [] as any[],
  phases: [] as any[],
  included: [] as string[],
  priceCents: 0,
  startDate: centralTimestamp(localDate(Date.now())),
});
const editable = (plan: any) => ({
  templateId: plan.templateId ?? "",
  mainPain: plan.mainPain ?? "",
  goal: plan.goal ?? "",
  findings: plan.findings ?? "",
  weeks: plan.weeks,
  visitsPerWeek: plan.visitsPerWeek ?? 2,
  why: plan.why ?? "",
  programmingFocus: plan.programmingFocus ?? "",
  outcomes: structuredClone(plan.outcomes ?? []),
  phases: structuredClone(plan.phases ?? []),
  included: [...(plan.included ?? [])],
  priceCents: plan.priceCents ?? 0,
  startDate: plan.startDate,
});
const int = (v: string) => (v === "" ? 0 : Math.trunc(Number(v)) || 0);


const rowEditor = (rows: any[], onChange: (rows: any[]) => void) => (
  i: number,
  field: string,
  value: any,
) => onChange(rows.map((r, n) => (n === i ? { ...r, [field]: value } : r)));
export function OutcomeEditor({
  rows,
  weeks,
  onChange,
}: {
  rows: any[];
  weeks: number;
  onChange: (rows: any[]) => void;
}) {
  const cell = rowEditor(rows, onChange);
  return (
    <>
            {rows.map((o: any, i: number) => (
              <div className="builder-row" key={i}>
                <Field label={`Outcome ${i + 1}`}>
                  <input
                    value={o.label}
                    onChange={(e) => cell(i, "label", e.target.value)}
                  />
                </Field>
                <Field label="Measure">
                  <input
                    value={o.measure}
                    onChange={(e) => cell(i, "measure", e.target.value)}
                  />
                </Field>
                <Field label="Target">
                  <input
                    value={o.target}
                    onChange={(e) => cell(i, "target", e.target.value)}
                  />
                </Field>
                <Field label="Re-test week">
                  <input
                    type="number"
                    min="1"
                    value={o.retestWeek || ""}
                    onChange={(e) => cell(i, "retestWeek", int(e.target.value))}
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove outcome ${i + 1}`}
                  onClick={() =>
                    onChange(rows.filter((_: any, n: number) => n !== i))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {rows.length < 4 && (
              <Button
                className="outline small-button"
                onClick={() =>
                  onChange([
                    ...rows,
                    { label: "", measure: "", target: "", retestWeek: weeks },
                  ])
                }
              >
                <Plus size={16} /> Add outcome
              </Button>
            )}
    </>
  );
}
export function PhaseEditor({
  rows,
  weeks,
  onChange,
}: {
  rows: any[];
  weeks: number;
  onChange: (rows: any[]) => void;
}) {
  const cell = rowEditor(rows, onChange);
  return (
    <>
            {rows.map((ph: any, i: number) => (
              <div className="builder-row phase-row" key={i}>
                <Field label={`Phase ${i + 1} name`}>
                  <input
                    value={ph.name}
                    onChange={(e) => cell(i, "name", e.target.value)}
                  />
                </Field>
                <Field label="From week">
                  <input
                    type="number"
                    min="1"
                    value={ph.weekStart || ""}
                    onChange={(e) => cell(i, "weekStart", int(e.target.value))}
                  />
                </Field>
                <Field label="To week">
                  <input
                    type="number"
                    min="1"
                    value={ph.weekEnd || ""}
                    onChange={(e) => cell(i, "weekEnd", int(e.target.value))}
                  />
                </Field>
                <Field label="Visits">
                  <input
                    type="number"
                    min="0"
                    value={ph.visits}
                    onChange={(e) => cell(i, "visits", int(e.target.value))}
                  />
                </Field>
                <Field label="What happens">
                  <input
                    value={ph.focus}
                    onChange={(e) => cell(i, "focus", e.target.value)}
                  />
                </Field>
                <Field label="Milestone check">
                  <input
                    value={ph.milestone}
                    onChange={(e) => cell(i, "milestone", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove phase ${i + 1}`}
                  onClick={() =>
                    onChange(rows.filter((_: any, n: number) => n !== i))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {rows.length < 4 && (
              <Button
                className="outline small-button"
                onClick={() => {
                  const last = rows.at(-1);
                  const start = last ? last.weekEnd + 1 : 1;
                  onChange([
                    ...rows,
                    {
                      name: "",
                      weekStart: start,
                      weekEnd: Math.max(start, weeks),
                      focus: "",
                      visits: 0,
                      milestone: "",
                    },
                  ]);
                }}
              >
                <Plus size={16} /> Add phase
              </Button>
            )}
    </>
  );
}

/** T4: Jimmy edits a condition template and produces the proposal. */
export function ProposalBuilder() {
  const { id } = useParams(),
    p = usePortal(),
    [search] = useSearchParams(),
    revise = search.get("revise") === "1";
  useEffect(() => {
    if (id) p.select(id);
    p.watchProposal("builder");
    return () => p.watchProposal(null);
  }, [id]);
  const b = p.builder,
    [form, setForm] = useState<any>(null),
    [planId, setPlanId] = useState<string | undefined>(),
    [note, setNote] = useState(""),
    [saved, setSaved] = useState(""),
    [fresh, setFresh] = useState(false);
  const current = revise ? b?.plan : b?.proposal;
  const editing =
    revise ||
    fresh ||
    !current ||
    ["draft", "produced"].includes(current.status);
  useEffect(() => {
    if (!b || form) return;
    if (current && editing) {
      setForm(editable(current));
      setPlanId(current._id);
    } else setForm(blankForm(b.patient));
  }, [b, current?._id]);
  if (!b || !form) return <Empty title="Opening the proposal builder…" />;
  const set = (key: string, value: any) => {
    setForm((f: any) => ({ ...f, [key]: value }));
    setSaved("");
  };
  const applyTemplate = (templateId: string) => {
    const t = b.templates.find((t: any) => t._id === templateId);
    if (!t) return set("templateId", "");
    setForm((f: any) => ({
      ...f,
      templateId,
      weeks: t.weeks,
      visitsPerWeek: t.visitsPerWeek,
      why: t.why,
      programmingFocus: t.programmingFocus,
      outcomes: structuredClone(t.outcomes),
      phases: structuredClone(t.phases),
      included: [...t.included],
      priceCents: t.priceCents,
    }));
    setSaved("");
  };
  const payload = () => {
    const { templateId, ...rest } = form;
    return { ...rest, ...(templateId ? { templateId } : {}), ...(planId ? { id: planId } : {}) };
  };
  const gaps = proposalGaps(form),
    live = current?.status === "produced" && planId === current._id;
  const save = async () => {
    const saved = await p.proposal("saveDraft", payload());
    setPlanId(saved);
    return saved;
  };
  if (!editing)
    return (
      <>
        <Link to={`/team/patients/${id}`} className="back-link">
          Patients / {b.patient.name}
        </Link>
        <Header
          title="This proposal is with the patient."
          description={`${statusLabel[current.status]}. Content is locked once the patient confirms the plan.`}
        />
        <div className="button-row">
          <Link className="button outline" to={`/team/patients/${id}/present`}>
            Open presentation <ArrowUpRight size={17} />
          </Link>
          {["declined", "sent_to_portal"].includes(current.status) && (
            <Button
              onClick={() => {
                setForm(blankForm(b.patient));
                setPlanId(undefined);
                setNote("");
                setFresh(true);
              }}
            >
              Start a new proposal
            </Button>
          )}
        </div>
      </>
    );
  return (
    <>
      <Link to={`/team/patients/${id}`} className="back-link">
        Patients / {b.patient.name}
      </Link>
      <Header
        title={revise ? "Revise the signed plan." : "Build the plan of care."}
        description={
          revise
            ? "Changes save as a new version with a dated note. Your signature is applied to the new version."
            : "Start from a condition template. Every field stays editable."
        }
      />
      {!revise && (
        <div className="template-picker">
          <Field label="Condition template">
            <select
              value={form.templateId}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Choose a template</option>
              {b.templates.map((t: any) => (
                <option key={t._id} value={t._id}>
                  {t.name} · {conditionLabel(t.condition)}
                </option>
              ))}
            </select>
          </Field>
          {live && (
            <p className="notice success" role="status">
              <CheckCircle2 size={19} /> Live on Blake’s tablet. Saved edits
              update it until the patient confirms.
            </p>
          )}
        </div>
      )}
      <div className="builder-layout">
        <div className="builder-form">
          <fieldset className="builder-group">
            <legend>1 · What’s going on</legend>
            <Field label="Main pain, in the patient’s words">
              <textarea
                rows={2}
                value={form.mainPain}
                disabled={revise}
                onChange={(e) => set("mainPain", e.target.value)}
              />
            </Field>
            <Field label="What you found, in plain language (1–2 lines)">
              <textarea
                rows={2}
                value={form.findings}
                onChange={(e) => set("findings", e.target.value)}
              />
            </Field>
          </fieldset>
          <fieldset className="builder-group">
            <legend>2 · Their goal</legend>
            <Field label="Goal, word for word">
              <input
                value={form.goal}
                disabled={revise}
                onChange={(e) => set("goal", e.target.value)}
              />
            </Field>
          </fieldset>
          <fieldset className="builder-group">
            <legend>3 · Recommendation</legend>
            <div className="form-grid">
              <Field label="Weeks">
                <input
                  type="number"
                  min="1"
                  max="104"
                  value={form.weeks || ""}
                  onChange={(e) => set("weeks", int(e.target.value))}
                />
              </Field>
              <Field label="Visits per week">
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={form.visitsPerWeek || ""}
                  onChange={(e) => set("visitsPerWeek", int(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Why (short)">
              <textarea
                rows={3}
                value={form.why}
                onChange={(e) => set("why", e.target.value)}
              />
            </Field>
            <Field label="Programming focus (one sentence)">
              <input
                value={form.programmingFocus}
                onChange={(e) => set("programmingFocus", e.target.value)}
              />
            </Field>
          </fieldset>
          <fieldset className="builder-group">
            <legend>4 · Outcomes</legend>
            <OutcomeEditor
              rows={form.outcomes}
              weeks={form.weeks}
              onChange={(rows) => set("outcomes", rows)}
            />
          </fieldset>
          <fieldset className="builder-group">
            <legend>5 · Roadmap</legend>
            <PhaseEditor
              rows={form.phases}
              weeks={form.weeks}
              onChange={(rows) => set("phases", rows)}
            />
          </fieldset>
          {!revise && (
            <fieldset className="builder-group">
              <legend>Investment (shown only after the patient says yes)</legend>
              <Field label="Agreed care start date"><input type="date" required value={localDate(form.startDate)} onChange={e => { if(e.target.value) set('startDate', centralTimestamp(e.target.value)); }} /></Field>
              <Field label="What’s included (one per line)">
                <textarea
                  rows={4}
                  value={form.included.join("\n")}
                  onChange={(e) =>
                    set(
                      "included",
                      e.target.value.split("\n").map((s) => s.trimStart()),
                    )
                  }
                  onBlur={() => set("included", form.included.filter((s: string) => s.trim()))}
                />
              </Field>
              <Field label="Plan price ($)">
                <input
                  type="number"
                  min="48.51"
                  step="1"
                  value={form.priceCents ? form.priceCents / 100 : ""}
                  onChange={(e) =>
                    set("priceCents", Math.round(Number(e.target.value || 0) * 100))
                  }
                />
              </Field>
              {form.priceCents > DEPOSIT_CENTS && (
                <p className="muted small">
                  3 payments total {money(investment(form.priceCents).installments.total)}.
                </p>
              )}
            </fieldset>
          )}
          {revise && (
            <Field label="What changed, and why (dated in the chart)">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
          <div className="produce-bar">
            {gaps.length > 0 && (
              <div className="missing" role="status">
                <strong>Before you can {revise ? "save" : "produce"}:</strong>
                <ul>
                  {gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {revise ? (
              <Button
                className="rust"
                disabled={gaps.length > 0 || !note.trim()}
                onClick={async () => {
                  const { mainPain, goal, included, priceCents, templateId, ...changes } = form;
                  await p.proposal("revise", { id: planId, note, ...changes });
                  setNote("");
                  setSaved("Saved as a new signed version.");
                }}
              >
                Sign new version
              </Button>
            ) : (
              <div className="button-row">
                <Button className="outline" onClick={async () => {
                  await save();
                  setSaved(live ? "Live proposal updated." : "Draft saved.");
                }}>
                  {live ? "Update live proposal" : "Save draft"}
                </Button>
                {!live && (
                  <Button
                    className="rust"
                    disabled={gaps.length > 0}
                    onClick={async () => {
                      const id = await save();
                      await p.proposal("produce", { id });
                      setSaved("Live on Blake’s tablet.");
                    }}
                  >
                    Produce
                  </Button>
                )}
              </div>
            )}
            {saved && (
              <p className="notice success" role="status">
                {saved}
              </p>
            )}
          </div>
        </div>
        <aside
          className="builder-preview"
          aria-label="Patient-facing preview"
          tabIndex={0}
        >
          <span className="small-label">Patient view</span>
          <PlanSections plan={form} ptName={p.viewer?.name} />
        </aside>
      </div>
    </>
  );
}

/** PP-8: a quiet ~1 second press-and-hold so a patient tapping around can't trigger it. */
function HoldButton({
  disabled,
  onComplete,
  children,
}: {
  disabled: boolean;
  onComplete: () => Promise<any>;
  children: ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined),
    [holding, setHolding] = useState(false),
    [busy, setBusy] = useState(false);
  const start = () => {
    if (disabled || busy) return;
    setHolding(true);
    timer.current = window.setTimeout(async () => {
      setHolding(false);
      setBusy(true);
      try {
        await onComplete();
      } catch {
        // The store surfaces the error banner.
      } finally {
        setBusy(false);
      }
    }, 1000);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  return (
    <button
      type="button"
      className={`hold-button ${holding ? "is-holding" : ""}`}
      disabled={disabled || busy}
      aria-label={`${children} (press and hold)`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
    >
      <span className="hold-fill" aria-hidden />
      <span>{children}</span>
    </button>
  );
}

function CloserOptions({ plan, firstName }: { plan: any; firstName: string }) {
  const p = usePortal(),
    [reason, setReason] = useState("price"),
    [note, setNote] = useState("");
  const canDecline = ["produced", "scope_confirmed", "price_revealed"].includes(plan.status),
    canSend = ["produced", "scope_confirmed", "declined", "price_revealed"].includes(plan.status);
  if (!canDecline && !canSend) return null;
  return (
    <details className="closer-options">
      <summary>Closer options</summary>
      {!plan.installmentsApprovedBy && <Button className="outline" onClick={() => p.proposal('approveInstallments', {id:plan._id,expectedOfferVersion:plan.offerVersion??1})}>Approve 3 payments for this proposal</Button>}
      {canDecline && (
        <div className="closer-form">
          <Field label="Reason">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {declineReasons.map((r) => (
                <option key={r} value={r}>
                  {reasonLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button
            className="outline"
            onClick={() => p.proposal("decline", { id: plan._id, reason, note })}
          >
            Mark declined
          </Button>
        </div>
      )}
      {canSend && (
        <Button
          className="outline"
          onClick={() => p.proposal("sendToPortal", { id: plan._id })}
        >
          Send to {firstName}’s portal
        </Button>
      )}
    </details>
  );
}

/** T3 update: full-screen, patient-facing presentation on the closer's tablet. */
export function Presentation() {
  const { id } = useParams(),
    p = usePortal(),
    [search] = useSearchParams();
  useEffect(() => {
    if (id) p.select(id);
    p.watchProposal("present");
    return () => p.watchProposal(null);
  }, [id]);
  const view = p.presentation,
    plan = view?.proposal,
    [step, setStep] = useState(0),
    [asked, setAsked] = useState(false),
    [option, setOption] = useState<"full" | "installments">("full"),
    [consent, setConsent] = useState(false),
    [texted, setTexted] = useState(false);
  useEffect(() => {
    setStep(plan?.priceRevealedAt ? 6 : 0);
    setAsked(false);
    setConsent(false);
    setTexted(false);
  }, [plan?._id, plan?.offerVersion]);
  useEffect(() => {
    if (plan?.priceRevealedAt) setStep(6);
  }, [plan?.priceRevealedAt]);
  const exit = p.demo ? (
    <Link to={`/team/patients/${id}`} className="presentation-exit">
      <X size={16} /> Exit
    </Link>
  ) : <button className="presentation-exit" onClick={async () => { await p.signOut(); window.location.assign('/login'); }}><X size={16} /> Exit to sign in</button>;
  const shell = (children: ReactNode, footer?: ReactNode) => (
    <div className="presentation" role="dialog" aria-modal="true" aria-label="Plan of care presentation">
      <div className="presentation-top">
        {exit}
        {p.error && (
          <span className="inline-error" role="alert">
            {p.error}
            <button
              type="button"
              className="presentation-dismiss"
              aria-label="Dismiss error"
              onClick={p.clearError}
            >
              <X size={14} />
            </button>
          </span>
        )}
      </div>
      <div className="presentation-body">{children}</div>
      {footer && <div className="presentation-foot">{footer}</div>}
    </div>
  );
  if (!view) return shell(<h1>One moment…</h1>);
  if (!plan)
    return shell(
      <div className="presentation-wait">
        <span className="ordinal">Waiting for {view.ptName ?? "your PT"}</span>
        <h1>Your plan is coming together, {view.firstName}.</h1>
        <p>It will appear here as soon as it’s ready.</p>
      </div>,
    );
  if (["accepted", "completed"].includes(plan.status))
    return shell(
      <div className="presentation-wait">
        <CheckCircle2 size={40} />
        <h1>You’re all set, {view.firstName}.</h1>
        <p>Your plan of care is accepted. It’s in your portal whenever you want to look back at it.</p>
      </div>,
    );
  if (plan.status === "declined" || plan.status === "sent_to_portal")
    return shell(
      <div className="presentation-wait">
        <span className="ordinal">{statusLabel[plan.status]}</span>
        <h1>Thank you for your time today, {view.firstName}.</h1>
        <p>
          {plan.status === "sent_to_portal"
            ? "Your full plan is in your portal, ready whenever you are."
            : "Take the time you need. We’re here when you have questions."}
        </p>
        <CloserOptions plan={plan} firstName={view.firstName} />
      </div>,
    );
  const all = sections(plan, view.ptName),
    confirmed = !!plan.scopeConfirmedAt;
  let body: ReactNode;
  if (step < 5) {
    const s = all[step];
    body = (
      <section className="presentation-section" aria-live="polite">
        <span className="ordinal">{s.kicker}</span>
        <h1>{s.title}</h1>
        {s.body}
      </section>
    );
  } else if (step === 5) {
    body = (
      <section className="presentation-section" aria-live="polite">
        <span className="ordinal">The plan</span>
        <h1>Does this plan get you where you want to be?</h1>
        {confirmed ? (
          <p className="buy-in-done">
            <CheckCircle2 size={22} /> That’s the plan.
          </p>
        ) : (
          <>
            <div className="buy-in">
              <Button
                className="big-choice"
                onClick={() => p.proposal("confirmScope", { id: plan._id })}
              >
                Yes, that’s the plan
              </Button>
              <Button
                className="big-choice outline"
                onClick={async () => {
                  await p.proposal("scopeQuestions", { id: plan._id });
                  setAsked(true);
                }}
              >
                I have questions
              </Button>
            </div>
            {asked && (
              <p className="muted" role="status">
                Good. Ask anything. We can come back to this whenever you’re ready.
              </p>
            )}
          </>
        )}
      </section>
    );
  } else {
    body = view.investment ? (
      <section className="presentation-section" aria-live="polite">
        <span className="ordinal">Your investment</span>
        <h1>What it takes to get you there.</h1>
        <Investment
          priceCents={view.investment.priceCents}
          depositCents={view.investment.depositCreditCents}
          included={plan.included ?? []}
          option={option}
          setOption={setOption}
          installmentsApproved={!!plan.installmentsApprovedBy}
          startDate={plan.startDate}
        />
        {search.get("result") === "success" && (
          <p className="notice success" role="status">
            Payment received. The plan updates as soon as Stripe confirms it.
          </p>
        )}
        <label className="choice">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {option === "installments"
            ? "I accept this plan and authorize the three payments shown above."
            : "I accept this plan and the payment shown above."}
        </label>
        <div className="button-row">
          <Button
            className="rust"
            disabled={!consent}
            onClick={async () => {
              await p.proposal("acceptTerms", { id: plan._id, option, accepted: true });
              await p.checkout("plan", plan._id);
            }}
          >
            Accept and pay <ArrowUpRight size={17} />
          </Button>
          <Button
            className="outline"
            disabled={!consent}
            onClick={async () => {
              await p.proposal("acceptTerms", { id: plan._id, option, accepted: true });
              await p.checkout("plan", plan._id, "text");
              setTexted(true);
            }}
          >
            Text the payment link instead
          </Button>
        </div>
        {texted && (
          <p className="notice success" role="status">
            Payment link queued for {view.firstName}’s phone. We respect messaging preferences and quiet hours.
          </p>
        )}
      </section>
    ) : (
      <section className="presentation-section">
        <h1>Let’s look at this together.</h1>
      </section>
    );
  }
  const footer = (
    <>
      <Button className="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
        <ArrowLeft size={17} /> Back
      </Button>
      <span className="ordinal step-count">
        {step < 6 ? `${step + 1} OF 6` : "INVESTMENT"}
      </span>
      {step < 5 ? (
        <Button onClick={() => setStep(step + 1)}>
          Next <ArrowRight size={17} />
        </Button>
      ) : step === 5 && plan.priceRevealedAt ? (
        <Button onClick={() => setStep(6)}>
          Next <ArrowRight size={17} />
        </Button>
      ) : (
        <span className="step-spacer" />
      )}
    </>
  );
  return shell(
    <>
      {body}
      <div className="presentation-corner">
        {!plan.priceRevealedAt && step === 5 && (
          <HoldButton
            disabled={!confirmed}
            onComplete={() => p.proposal("revealPrice", { id: plan._id })}
          >
            Show investment
          </HoldButton>
        )}
        <CloserOptions plan={plan} firstName={view.firstName} />
      </div>
    </>,
    footer,
  );
}

/** Patient detail, Plan & payments tab: proposal status and next actions. */
export function ProposalPanel() {
  const p = usePortal(),
    d = p.data,
    id = d.patient._id,
    canChart = allowed(p.viewer.roles, "clinical"),
    canFinance = allowed(p.viewer.roles, "finance");
  const plans = (d.plansOfCare ?? [])
    .slice()
    .sort((a: any, b: any) => (b._creationTime ?? b.createdAt ?? 0) - (a._creationTime ?? a.createdAt ?? 0));
  const latest = plans[0];
  return (
    <section className="section">
      <div className="section-top">
        <h2>Plan of care</h2>
        <div className="button-row">
          {canChart && (
            <Link className="button outline" to={`/team/patients/${id}/proposal`}>
              Proposal builder <ArrowUpRight size={17} />
            </Link>
          )}
          {canFinance && (
            <Link className="button" to={`/team/patients/${id}/present`}>
              Present on tablet <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
      </div>
      {!latest && (
        <Empty title="No proposal yet">
          After the evaluation, the PT produces a proposal from a condition template.
        </Empty>
      )}
      {plans.map((plan: any) => (
        <div className="list-row proposal-row" key={plan._id}>
          <div>
            <strong>{plan.goal || "Untitled proposal"}</strong>
            <p>
              {plan.weeks} weeks · {plan.visits} visits
              {plan.priceHidden ? " · Price shown after the patient says yes" : plan.priceCents ? ` · ${money(plan.priceCents)}` : ""}
              {plan.version > 1 ? ` · Version ${plan.version}` : ""}
            </p>
            {plan.declineReason && (
              <p>
                Declined: {reasonLabel(plan.declineReason)}
                {plan.declineNote ? ` · ${plan.declineNote}` : ""}
              </p>
            )}
            {plan.revisions?.length > 0 && (
              <p>
                Updated {dateLabel(plan.revisions.at(-1).at)} by {plan.revisions.at(-1).authorName}:{" "}
                {plan.revisions.at(-1).note}
              </p>
            )}
            <small>
              {plan.signedAt
                ? `PT signed ${dateLabel(plan.signedAt)}`
                : ["accepted", "completed"].includes(plan.status)
                  ? "Awaiting PT signature"
                  : ""}
            </small>
          </div>
          <div className="button-row">
            <span className={`status proposal-status ${plan.status}`}>
              {statusLabel[plan.status] ?? plan.status}
            </span>
            {canChart && ["accepted", "completed"].includes(plan.status) && !plan.signedAt && (
              <Button onClick={() => p.proposal("sign", { id: plan._id })}>
                Sign plan of care
              </Button>
            )}
            {canChart && plan.signedAt && plan._id === plans.find((x: any) => ["accepted", "completed"].includes(x.status))?._id && (
              <Link className="button outline small-button" to={`/team/patients/${id}/proposal?revise=1`}>
                Revise
              </Link>
            )}
            {(canChart || canFinance) && !['accepted','completed'].includes(plan.status) && <OfferEditor plan={plan} canFinance={canFinance} />}
            {canFinance && ["produced", "scope_confirmed", "declined", "price_revealed"].includes(plan.status) && (
              <Button
                className="outline small-button"
                onClick={() => p.proposal("sendToPortal", { id: plan._id })}
              >
                Send to portal
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function OfferEditor({plan,canFinance}:{plan:any;canFinance:boolean}) {
  const p=usePortal(),[price,setPrice]=useState(''),[date,setDate]=useState(localDate(plan.startDate)),[busy,setBusy]=useState(false);
  return <details><summary>Edit offer</summary><Field label="New plan price ($)"><input type="number" min="48.51" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} /></Field><Field label="Agreed care start date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><p className="small muted">Saving cancels unpaid Checkout links and requires a new reveal, installment approval, and acceptance.</p><Button disabled={busy||!price||!date} onClick={async()=>{setBusy(true);try{await p.proposal('updateOffer',{id:plan._id,priceCents:Math.round(Number(price)*100),startDate:centralTimestamp(date),expectedOfferVersion:plan.offerVersion??1});setPrice('');}finally{setBusy(false);}}}>Save offer</Button>{canFinance&&!plan.installmentsApprovedBy&&<Button className="outline" onClick={()=>p.proposal('approveInstallments',{id:plan._id,expectedOfferVersion:plan.offerVersion??1})}>Approve 3 payments</Button>}</details>;
}

/** P11: the patient's record of what they agreed to. */
export function YourPlan() {
  const p = usePortal(),
    d = p.data,
    [search] = useSearchParams(),
    plans = (d.plansOfCare ?? []).slice().sort(
      (a: any, b: any) => (b._creationTime ?? b.createdAt ?? 0) - (a._creationTime ?? a.createdAt ?? 0),
    ),
    pending = plans.find((x: any) => x.status === "sent_to_portal"),
    current = plans.find((x: any) => ["accepted", "completed"].includes(x.status)),
    plan = pending ?? current,
    [option, setOption] = useState<"full" | "installments">("full"),
    [consent, setConsent] = useState(false);
  useEffect(()=>{setConsent(false);setOption('full');},[plan?._id,plan?.offerVersion]);
  if (!plan)
    return (
      <>
        <Header title="Your plan" />
        <Empty title="Your plan is coming together">
          You’ll walk through it with your team after the evaluation.
        </Empty>
      </>
    );
  const pdf = d.documents
    .filter((doc: any) => doc.kind === "plan_pdf" && doc.planId === plan._id && doc.planVersion === (plan.version ?? 1) && (!plan.signedAt || doc.documentState === 'signed'))
    .sort((a: any, b: any) => b.at - a.at)[0];
  const revision = plan.revisions?.at(-1);
  return (
    <>
      <Link to="/more" className="back-link">
        More / Your plan
      </Link>
      <Header
        title={pending ? "Your plan, ready when you are." : "Your plan."}
        description={
          pending
            ? "Everything you talked through at your evaluation, including price. Share it with anyone who helps you decide."
            : `What you agreed to${plan.acceptedAt ? ` on ${dateLabel(plan.acceptedAt)}` : ""}. Easy to share with someone at home.`
        }
        action={
          pdf ? (
            <button className="button outline" onClick={() => p.download(pdf._id)}>
              <FileText size={17} /> Download PDF
            </button>
          ) : undefined
        }
      />
      {search.get("result") === "success" && (
        <p className="notice success" role="status">
          Payment received. Your plan updates as soon as it’s confirmed.
        </p>
      )}
      {revision && !pending && (
        <p className="notice" role="note">
          Plan updated {dateLabel(revision.at)} by {revision.authorName}: {revision.note}
        </p>
      )}
      <div className="your-plan">
        <PlanSections plan={plan} ptName={d.ptName} />
        <section className="proposal-section">
          <span className="ordinal">6 · Your investment</span>
          <Investment
            priceCents={plan.priceCents}
            depositCents={plan.depositCreditCents ?? 0}
            included={plan.included ?? []}
            option={pending ? option : (plan.paymentOption ?? (plan.installments ? "installments" : "full"))}
            setOption={pending ? setOption : undefined}
            installmentsApproved={!!plan.installmentsApprovedBy}
            startDate={plan.startDate}
            agreement={(d.paymentAgreements??[]).find((a:any)=>a._id===plan.agreementId)}
          />
          {pending && (
            <>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {option === "installments"
                  ? "I accept this plan and authorize the three payments shown above."
                  : "I accept this plan and the payment shown above."}
              </label>
              <Button
                className="rust"
                disabled={!consent}
                onClick={async () => {
                  await p.proposal("acceptTerms", { id: plan._id, option, accepted: true });
                  await p.checkout("plan", plan._id);
                }}
              >
                Accept and pay <ArrowUpRight size={17} />
              </Button>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** PP-1: admin editor for a condition template. */
export function TemplateFields({
  value,
  update,
}: {
  value: any;
  update: (key: string, v: any) => void;
}) {
  const gaps = proposalGaps({ ...value, mainPain: "-", goal: "-" });
  return (
    <>
      <Field label="Condition">
        <select value={value.condition} onChange={(e) => update("condition", e.target.value)}>
          {conditions.map((c) => (
            <option key={c} value={c}>
              {conditionLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Default weeks">
          <input
            type="number"
            min="1"
            value={value.weeks || ""}
            onChange={(e) => update("weeks", int(e.target.value))}
          />
        </Field>
        <Field label="Visits per week">
          <input
            type="number"
            min="1"
            max="7"
            value={value.visitsPerWeek || ""}
            onChange={(e) => update("visitsPerWeek", int(e.target.value))}
          />
        </Field>
        <Field label="Default price ($)">
          <input
            type="number"
            min="48.51"
            value={value.priceCents ? value.priceCents / 100 : ""}
            onChange={(e) =>
              update("priceCents", Math.round(Number(e.target.value || 0) * 100))
            }
          />
        </Field>
      </div>
      <Field label="Why (default prognosis rationale)">
        <textarea rows={3} value={value.why} onChange={(e) => update("why", e.target.value)} />
      </Field>
      <Field label="Programming focus">
        <input
          value={value.programmingFocus}
          onChange={(e) => update("programmingFocus", e.target.value)}
        />
      </Field>
      <fieldset className="builder-group">
        <legend>Outcomes</legend>
        <OutcomeEditor
          rows={value.outcomes}
          weeks={value.weeks}
          onChange={(rows) => update("outcomes", rows)}
        />
      </fieldset>
      <fieldset className="builder-group">
        <legend>Roadmap phases</legend>
        <PhaseEditor
          rows={value.phases}
          weeks={value.weeks}
          onChange={(rows) => update("phases", rows)}
        />
      </fieldset>
      <Field label="What’s included (one per line)">
        <textarea
          rows={4}
          value={value.included.join("\n")}
          onChange={(e) => update("included", e.target.value.split("\n"))}
          onBlur={() =>
            update(
              "included",
              value.included.map((s: string) => s.trim()).filter(Boolean),
            )
          }
        />
      </Field>
      <label className="choice">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Offer this template in the proposal builder
      </label>
      {gaps.length > 0 && (
        <div className="missing" role="status">
          <strong>Before saving:</strong>
          <ul>
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">
        Wording is reviewed by counsel before launch. Avoid “guarantee,” “promise,” and “cure.”
      </p>
    </>
  );
}
