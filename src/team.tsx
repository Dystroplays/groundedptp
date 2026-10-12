import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Plus,
  FileText,
  LockKeyhole,
  RefreshCw,
  Users,
  Settings,
  TrendingUp,
  Check,
} from "lucide-react";
import { usePortal } from "./store";
import { ManualIntake, CareControls } from "./operations-ui";
import { Library } from "./catalog";
import { OperationalSettings } from "./settings-ui";
import { ProposalPanel } from "./proposal-ui";
import MuxPlayer from './Player';
import {
  Button,
  Header,
  Status,
  Empty,
  Field,
  Form,
  Messages,
  Payments,
} from "./ui";
import {
  DAY,
  allowed,
  dateLabel,
  localDate,
  money,
  centralTimestamp,
} from "./domain";
const stageNames: Record<string, string> = {
  deposit_paid: "Deposit paid",
  pre_visit: "Before the visit",
  in_care: "In care",
  discharged: "Discharged",
};
export function TeamDashboard({
  evaluations = false,
}: {
  evaluations?: boolean;
}) {
  const p = usePortal(),
    [owner, setOwner] = useState("all"),
    d = p.dashboard;
  if (!d) return <Empty title="Loading the team workspace…" />;
  const saves = d.saves.filter(
      (s: any) => !s.doneAt && (owner === "all" || s.ownerRole === owner),
    ),
    today = d.appointments.filter(
      (a: any) =>
        a.kind === "eval" && localDate(a.startsAt) === localDate(Date.now()),
    );
  return (
    <>
      <Header
        title={
          evaluations
            ? "Make the first visit count."
            : "Good care starts with a check-in."
        }
        description={
          evaluations
            ? "Today’s evaluations, with the context your team needs."
            : "A clear view of who needs you, and what comes next."
        }
        action={
          <Link className="button outline" to="/team/patients">
            View all patients <ArrowUpRight size={17} />
          </Link>
        }
      />
      {!evaluations && (
        <div className="team-counts">
          {[
            [
              "Patients in care",
              d.patients.filter((p: any) => p.stage === "in_care").length,
            ],
            [
              "Before the visit",
              d.patients.filter((p: any) => p.stage === "pre_visit").length,
            ],
            ["Open follow-ups", saves.length],
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      {evaluations ? (
        <section className="section">
          <h2>Today’s evaluations</h2>
          {today.length ? (
            today.map((a: any) => {
              const patient = d.patients.find(
                  (p: any) => p._id === a.patientId,
                ),
                assignments = d.assignments.filter(
                  (v: any) => v.patientId === a.patientId,
                );
              return (
                <div className="evaluation-row" key={a._id}>
                  <div>
                    <h3>{patient?.name}</h3>
                    <p>{dateLabel(a.startsAt, true)}</p>
                  </div>
                  <span>
                    {assignments.filter((v: any) => v.quizPassedAt).length}/
                    {assignments.length} videos complete
                  </span>
                  <div className="button-row">
                    <Link
                      to={`/team/patients/${a.patientId}`}
                      className="button outline"
                    >
                      Open evaluation <ArrowRight size={16} />
                    </Link>
                    {allowed(p.viewer.roles, "clinical") && (
                      <Link
                        to={`/team/patients/${a.patientId}/proposal`}
                        className="button outline"
                      >
                        Build proposal
                      </Link>
                    )}
                    {allowed(p.viewer.roles, "finance") && (
                      <Link
                        to={`/team/patients/${a.patientId}/present`}
                        className="button"
                      >
                        Present plan
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <Empty title="A little space in the calendar">
              Evaluations sync here from GoHighLevel.
            </Empty>
          )}
        </section>
      ) : (
        <>
          <section className="section">
            <div className="section-top">
              <div>
                <h2>People who need a hand</h2>
                <p className="muted">
                  Follow-ups stay here until the loop is closed.
                </p>
              </div>
              <select
                aria-label="Filter follow-ups by owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="all">Everyone</option>
                <option value="pt">PT</option>
                <option value="sdr">SDR</option>
                <option value="closer">Closer</option>
              </select>
            </div>
            {saves.length ? (
              <div className="saves-list">
                {saves.map((s: any) => {
                  const patient = d.patients.find(
                    (p: any) => p._id === s.patientId,
                  );
                  return (
                    <Link
                      className="save-row"
                      key={s._id}
                      to={`/team/patients/${s.patientId}`}
                    >
                      <span className={`save-icon ${s.level}`}>
                        {s.level === "at_risk" ? (
                          <AlertCircle size={22} />
                        ) : (
                          <Clock3 size={22} />
                        )}
                      </span>
                      <div>
                        <strong>{patient?.name}</strong>
                        <p>{s.play}</p>
                      </div>
                      <span className="save-owner">
                        {s.ownerRole.toUpperCase()}
                        <small>{dateLabel(s.dueAt)}</small>
                      </span>
                      <Status value={s.level} />
                      <ArrowUpRight size={19} />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty title="Everyone’s in a good place">
                No open follow-ups for this owner.
              </Empty>
            )}
          </section>
          <section className="section">
            <h2>Your patients, at a glance</h2>
            <PatientTable patients={d.patients} />
          </section>
        </>
      )}
    </>
  );
}
function PatientTable({ patients }: { patients: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>Where they are</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p._id}>
              <td>
                <Link aria-label={p.name} to={`/team/patients/${p._id}`}>
                  <span className="table-avatar">
                    {p.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <strong>{p.name}</strong>
                </Link>
              </td>
              <td>{stageNames[p.stage] ?? p.stage}</td>
              <td>
                <Status value={p.status} />
              </td>
              <td>
                <Link
                  aria-label={`Open ${p.name}`}
                  to={`/team/patients/${p._id}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!patients.length && (
        <Empty title="No patients match">Try another name or stage.</Empty>
      )}
    </div>
  );
}
export function PatientList() {
  const p = usePortal(),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState("all");
  if (!p.dashboard) return <Empty title="Loading patients…" />;
  const patients = p.dashboard.patients.filter(
    (p: any) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (stage === "all" || p.stage === stage),
  );
  return (
    <>
      <Header
        title="People, not a patient list."
        description="Find the person. Understand the next step."
      />
      <div className="filters">
        <label className="search">
          <Search size={19} />
          <input
            placeholder="Search patients"
            aria-label="Search patients"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="all">All stages</option>
          {Object.entries(stageNames).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <PatientTable patients={patients} />
      <ManualIntake />
    </>
  );
}
export function PatientDetail() {
  const { id } = useParams(),
    p = usePortal(),
    [tab, setTab] = useState("overview");
  useEffect(() => {
    if (id) p.select(id);
  }, [id]);
  const d = p.data;
  if (!d) return <Empty title="Loading patient details…" />;
  const canChart = allowed(p.viewer.roles, "clinical"),
    canCare = allowed(p.viewer.roles, "care");

  return (
    <>
      <Link to="/team/patients" className="back-link">
        Patients / {p.demo && id !== "linda" ? "Sample record" : d.patient.name}
      </Link>
      {p.demo && id !== "linda" && (
        <p className="notice">
          The sample opens Linda’s editable record. Other names illustrate the
          team queue.
        </p>
      )}
      <Header
        title={d.patient.name}
        description={`${stageNames[d.patient.stage]} · ${d.patient.email}`}
        action={<Status value={d.patient.status} />}
      />
      <div className="detail-tabs" role="tablist">
        {[
          "overview",
          ...(!d.restricted ? ["program", "measurements"] : []),
          ...(canChart ? ["chart"] : []),
          ...(!d.restricted ? ["plan"] : []),
          "messages",
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === "overview"
              ? "Overview"
              : t === "plan"
                ? "Plan & payments"
                : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "overview" && (
          <div className="patient-columns">
            <div>
              <section className="section">
                <h2>The next right step</h2>
                {d.saves.filter((s: any) => !s.doneAt).length ? (
                  d.saves
                    .filter((s: any) => !s.doneAt)
                    .map((s: any) => (
                      <div className="follow-up" key={s._id}>
                        <h3>{s.play}</h3>
                        <p>
                          <Status value={s.level} /> ·{" "}
                          {s.ownerRole.toUpperCase()} · Due {dateLabel(s.dueAt)}
                        </p>
                        <div className="button-row">
                          {[
                            "reached",
                            "rescheduled",
                            "no_answer",
                            "resolved",
                          ].map((outcome) => (
                            <Button
                              key={outcome}
                              className="outline small-button"
                              onClick={() =>
                                p.command("resolveSave", { id: s._id, outcome })
                              }
                            >
                              {outcome.replace("_", " ")}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))
                ) : (
                  <Empty title="No open follow-ups">
                    Keep the conversation going at the next visit.
                  </Empty>
                )}
              </section>
              <section className="section">
                <h2>Pre-visit preparation</h2>
                {d.assignments.map((a: any) => (
                  <div className="list-row" key={a._id}>
                    <div>
                      <strong>
                        {d.videos.find((v: any) => v._id === a.videoId)?.title}
                      </strong>
                      <p>
                        {a.quizPassedAt
                          ? "Quiz passed"
                          : `${Math.round(a.watchedSec)} seconds watched`}
                      </p>
                      {!a.quizPassedAt&&d.videos.find((v:any)=>v._id===a.videoId)?.playbackId&&<details><summary>Play video together</summary><MuxPlayer playbackId={d.videos.find((v:any)=>v._id===a.videoId).playbackId} disableTracking disableCookies/></details>}
                    </div>
                    {a.quizPassedAt ? (
                      <CheckCircle2 className="green" />
                    ) : (
                      <Status value="watch" />
                    )}
                  </div>
                ))}
              </section>
              {canCare && (
                <section className="section">
                  <h2>After-visit summary</h2>
                  <Form
                    onSubmit={async (f) =>
                      p.command("summary", { body: f.get("body") })
                    }
                  >
                    <Field label="A plain-language note the patient can read">
                      <textarea name="body" required rows={4} />
                    </Field>
                    <Button type="submit">
                      Publish summary <ArrowRight size={17} />
                    </Button>
                  </Form>
                </section>
              )}
              <CareControls />
            </div>
            <aside className="patient-aside">
              <section className="goal-block">
                <h3>What matters to them</h3>
                <h2>
                  {d.patient.goal || "Set this together at the evaluation."}
                </h2>
              </section>
              {canCare&&<Form className="section" onSubmit={async f=>p.command('updateGoal',{goal:f.get('goal')})}><Field label="Goal in the patient’s words"><textarea name="goal" required maxLength={500} defaultValue={d.patient.goal}/></Field><Button type="submit" className="outline">Save goal</Button></Form>}
              <section className="section">
                <h3>Recent activity</h3>
                <div className="timeline">
                  {d.events
                    ?.slice()
                    .reverse()
                    .slice(0, 8)
                    .map((e: any) => (
                      <div key={e._id}>
                        <span />
                        <p>
                          {e.type.replaceAll("_", " ")}
                          <small>{dateLabel(e.at, true)}</small>
                        </p>
                      </div>
                    ))}
                </div>
              </section>
              <Button
                className="outline"
                onClick={() => p.command("confirmReview")}
              >
                {d.patient.reviewConfirmedAt
                  ? "Review confirmed"
                  : "Confirm review received"}
              </Button>
            </aside>
          </div>
        )}
        {tab === "program" && (canCare ? <ProgramBuilder /> : <ProgramRead />)}
        {tab === "measurements" && <Measurements canEdit={canCare} />}{" "}
        {tab === "chart" && canChart && <Chart />}
        {tab === "plan" && (
          <>
            <ProposalPanel />
            <Payments />
          </>
        )}
        {tab === "messages" && <Messages />}
      </div>
    </>
  );
}
function ProgramRead() {
  const { data: d } = usePortal();
  return (
    <section className="section">
      <h2>Program history</h2>
      {d.programs.map((p: any) => (
        <div className="list-row" key={p._id}>
          <strong>Version {p.version}</strong>
          <span>
            {p.items.length} movements · {dateLabel(p.publishedAt)}{" "}
            {p.active ? "· Active" : ""}
          </span>
        </div>
      ))}
    </section>
  );
}
function ProgramBuilder() {
  const p = usePortal(),
    d = p.data,
    [items, setItems] = useState<any[]>(() =>
      structuredClone(d.programs.find((p: any) => p.active)?.items ?? []),
    ),
    [saved, setSaved] = useState(false);
  const update = (index: number, key: string, value: any) =>
    setItems((items) =>
      items.map((i, n) => (n === index ? { ...i, [key]: value } : i)),
    );
  return (
    <section className="section">
      <Header
        title="Build a manageable program."
        description="Edits create a new version. A session already underway keeps its original program."
      />
      <div className="builder-list">
        {items.map((i, index) => (
          <div className="builder-item" key={index}>
            <div className="section-top">
              <h3>Movement {index + 1}</h3>
              <button
                className="text-link"
                onClick={() =>
                  setItems((items) => items.filter((_, n) => n !== index))
                }
              >
                Remove
              </button>
            </div>
            <Field label="Exercise">
              <select
                value={i.exerciseId}
                onChange={(e) => update(index, "exerciseId", e.target.value)}
              >
                {d.exercises
                  .filter((e: any) => !e.archived)
                  .map((e: any) => (
                    <option value={e._id} key={e._id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              {[
                ["sets", "Sets"],
                ["reps", "Reps"],
                ["holdSec", "Hold (seconds)"],
              ].map(([key, label]) => (
                <Field label={label} key={key}>
                  <input
                    type="number"
                    min={key === "sets" ? 1 : 0}
                    max={key === "holdSec" ? 600 : 100}
                    value={i[key]}
                    onChange={(e) => update(index, key, Number(e.target.value))}
                  />
                </Field>
              ))}
            </div>
            <Field label="Personal cue">
              <textarea
                value={i.cue}
                onChange={(e) => update(index, "cue", e.target.value)}
                rows={2}
              />
            </Field>
            <fieldset className="day-picker">
              <legend>Days</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (label, day) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={i.days.includes(day)}
                      onChange={(e) =>
                        update(
                          index,
                          "days",
                          e.target.checked
                            ? [...i.days, day]
                            : i.days.filter((d: number) => d !== day),
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ),
              )}
            </fieldset>
          </div>
        ))}
      </div>
      <div className="button-row">
        <Button
          className="outline"
          onClick={() => {
            const e = d.exercises[0];
            if (!e) throw new Error("Add an exercise to the library first.");
            setItems((i) => [
              ...i,
              {
                exerciseId: e._id,
                sets: 2,
                reps: 10,
                holdSec: 0,
                cue: e.defaultCue,
                days: [1, 3, 5],
              },
            ]);
          }}
        >
          <Plus size={18} />
          Add movement
        </Button>
        <Button
          disabled={!items.length}
          onClick={async () => {
            await p.command("publishProgram", { items });
            setSaved(true);
          }}
        >
          Publish new version <Check size={18} />
        </Button>
      </div>
      {saved && (
        <p className="notice success" role="status">
          Program published. The patient will receive it at their next session.
        </p>
      )}
      <ProgramRead />
    </section>
  );
}
function Measurements({ canEdit }: { canEdit: boolean }) {
  const p = usePortal(),
    d = p.data;
  return (
    <section className="section">
      <h2>Small changes, made visible.</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Measurement</th>
              <th>Value</th>
              <th>Type</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {d.measurements.map((m: any) => (
              <tr key={m._id}>
                <td>{m.label}</td>
                <td>
                  {m.value} {m.unit}
                </td>
                <td>{m.kind}</td>
                <td>{dateLabel(m.takenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <Form
          className="section reading-width"
          onSubmit={async (f) =>
            p.command("measurement", {
              label: f.get("label"),
              unit: f.get("unit"),
              value: f.get("value"),
              kind: f.get("kind"),
            })
          }
        >
          <h3>Record a measurement</h3>
          <div className="form-grid">
            <Field label="Measurement">
              <input
                name="label"
                required
                placeholder="e.g. Single-leg balance"
              />
            </Field>
            <Field label="Value">
              <input name="value" required placeholder="e.g. 22" />
            </Field>
            <Field label="Unit">
              <input name="unit" placeholder="e.g. seconds" />
            </Field>
            <Field label="Type">
              <select name="kind">
                <option value="retest">Re-test</option>
                <option value="baseline">Baseline</option>
              </select>
            </Field>
          </div>
          <Button type="submit">
            Save measurement <Check size={17} />
          </Button>
        </Form>
      )}
    </section>
  );
}
function Chart() {
  const p = usePortal(),
    [notes, setNotes] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [kind, setKind] = useState("eval"),
    [editing,setEditing]=useState<any>(null),
    [services,setServices]=useState<any[]>([]),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    p.fetchChart()
      .then((n) => {
        if (!cancelled) setNotes(n);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, p.selected]);
  return (
    <section className="section">
      <div className="section-top">
        <div>
          <h2>Clinical chart</h2>
          <p className="muted">
            <LockKeyhole size={15} /> PT and admin only. Access is recorded.
          </p>
        </div>
        <Button className="outline" onClick={() => p.command("exportChart")}>
          <FileText size={17} />
          Export chart
        </Button>
      </div>
      {error && <p className="inline-error">{error}</p>}
      {loading ? (
        <p role="status">Opening the chart…</p>
      ) : (
        notes.map((n) => (
          <article className="chart-note" key={n._id}>
            <div className="section-top">
              <h3>{n.kind.replaceAll("_", " ")} note</h3>
              <Status value={n.signedAt ? "signed" : "draft"} />
            </div>
            {["subjective", "objective", "assessment", "plan"].map(
              (section) => (
                <div key={section}>
                  <strong>
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </strong>
                  <p>{n[section]}</p>
                </div>
              ),
            )}
            <p className="muted small">
              Author: {n.authorName??'Jimmy'} ·
              ICD-10: {Array.isArray(n.icd10) ? n.icd10.join(", ") : n.icd10} ·
              CPT: {Array.isArray(n.cpt) ? n.cpt.join(", ") : n.cpt}
            </p>
            {n.signedAt ? (
              <>
                <p className="muted small">
                  Signed by {n.authorName??'Jimmy'} {dateLabel(n.signedAt, true)}. Original content is
                  locked.
                </p>
                {n.addenda.map((a: any, i: number) => (
                  <div className="addendum" key={i}>
                    <strong>Addendum · {dateLabel(a.at, true)} · {a.authorName??'Jimmy'}</strong>
                    <p>{a.body}</p>
                  </div>
                ))}
                <Form
                  onSubmit={async (f) => {
                    await p.command("addendum", {
                      id: n._id,
                      body: f.get("body"),
                    });
                    setRefresh((r) => r + 1);
                  }}
                >
                  <Field label="Add a dated correction">
                    <textarea name="body" required rows={2} />
                  </Field>
                  <Button type="submit" className="outline">
                    Add addendum
                  </Button>
                </Form>
              </>
            ) : (
              <div className="button-row"><Button className="outline" onClick={()=>{setEditing(n);setKind(n.kind);setServices(n.services??[]);}}>Edit draft</Button><Button
                onClick={async () => {
                  await p.command("signNote", { id: n._id });
                  setRefresh((r) => r + 1);
                }}
              >
                Sign and lock note <LockKeyhole size={17} />
              </Button></div>
            )}
          </article>
        ))
      )}
      <Form
        key={editing?._id??'new-note'}
        className="chart-form"
        onSubmit={async (f) => {
          await p.command("saveNote", {
            kind,
            ...(editing?{id:editing._id}:{}),
            services,
            ...(f.get("appointmentId")
              ? { appointmentId: String(f.get("appointmentId")) }
              : {}),
            subjective: f.get("subjective"),
            objective: f.get("objective"),
            assessment: f.get("assessment"),
            plan: f.get("plan"),
            icd10: f.get("icd10"),
            cpt: f.get("cpt"),
          });
          setRefresh((r) => r + 1);
          setEditing(null);setServices([]);
        }}
      >
        <h2>{editing?'Edit draft note':'New note'}</h2>
        <Field label="Visit">
          <select name="appointmentId" defaultValue={editing?.appointmentId??''}>
            <option value="">General chart entry</option>
            {p.data.appointments.map((a: any) => (
              <option key={a._id} value={a._id}>
                {a.kind} · {dateLabel(a.startsAt, true)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="eval">Initial evaluation</option>
            <option value="daily">Daily note</option>
            <option value="progress">Progress / re-evaluation</option>
            <option value="discharge">Discharge summary</option>
          </select>
        </Field>
        <div className="form-grid">
          {[
            ["subjective", "Subjective", "What the patient reports"],
            ["objective", "Objective", "Findings and observations"],
            ["assessment", "Assessment", "Clinical interpretation"],
            ["plan", "Plan", "Next steps, frequency, and duration"],
          ].map(([name, label, placeholder]) => (
            <Field label={label} key={name}>
              <textarea
                name={name}
                placeholder={placeholder}
                required
                rows={4}
                defaultValue={editing?.[name]??''}
              />
            </Field>
          ))}
          <Field label="ICD-10 codes (comma-separated)">
            <input name="icd10" required defaultValue={editing?.icd10?.join(', ')??''} />
          </Field>
          <Field label="CPT codes (comma-separated)">
            <input name="cpt" required defaultValue={editing?.cpt?.join(', ')??''} />
          </Field>
        </div>
        <details><summary>Service details for superbill</summary>{services.map((s,i)=><div className="form-grid" key={i}>{[['date','Service date','date'],['code','Service CPT','text'],['units','Units','number'],['feeCents','Unit fee ($)','number'],['modifiers','Modifiers','text']].map(([key,label,type])=><Field key={key} label={`${label} ${i+1}`}><input type={type} required={key!=='modifiers'} step={key==='feeCents'?'0.01':undefined} min={key==='units'?1:key==='feeCents'?0:undefined} value={key==='feeCents'?s[key]/100:s[key]} onChange={e=>setServices(rows=>rows.map((r,j)=>i===j?{...r,[key]:key==='feeCents'?Math.round(Number(e.target.value)*100):key==='units'?Number(e.target.value):e.target.value}:r))}/></Field>)}<Button className="outline" onClick={()=>setServices(rows=>rows.filter((_,j)=>j!==i))}>Remove service {i+1}</Button></div>)}<Button className="outline" onClick={()=>setServices(rows=>[...rows,{date:localDate(Date.now()),code:'',units:1,feeCents:0,modifiers:''}])}>Add service</Button></details>
        {editing&&<Button className="outline" onClick={()=>{setEditing(null);setServices([]);setKind('eval');}}>Cancel draft edit</Button>}
        <Button type="submit">
          Save draft note <Check size={17} />
        </Button>
      </Form>
      <section className="section">
        <h3>Physician referral</h3>
        <p>{p.data.patient.physicianReferral || "No referral recorded."}</p>
        <Form
          onSubmit={async (f) =>
            p.command("updateReferral", { body: f.get("body") })
          }
        >
          <Field label="Referral details">
            <input name="body" required />
          </Field>
          <Button type="submit" className="outline">
            Record referral
          </Button>
        </Form>
      </section>
      <section className="section">
        <h3>Discharge</h3>
        <p>
          Sign a discharge summary first. The patient keeps their program,
          documents, and messages.
        </p>
        <Button
          className="outline"
          disabled={p.data.patient.stage === "discharged"}
          onClick={() => p.command("discharge")}
        >
          Complete discharge <ArrowRight size={17} />
        </Button>
      </section>
    </section>
  );
}
export function Admin() {
  const p = usePortal(),
    [tab, setTab] = useState("settings"),
    d = p.adminData;
  if (!d) return <Empty title="Loading administration…" />;
  return (
    <>
      <Header
        title="Make the care work."
        description="The people, content, and settings behind the patient experience."
        action={
          <Link to="/team/metrics" className="button outline">
            <TrendingUp size={17} />
            View metrics
          </Link>
        }
      />
      <div className="detail-tabs">
        {["settings", "library", "staff", "sync"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "sync"
              ? "Sync & release"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "settings" && (
        <div className="admin-grid">
          <Form
            onSubmit={async (f) => {
              await p.adminCommand("setting", {
                key: "clinic",
                value: {
                  name: f.get("name"),
                  phone: f.get("phone"),
                  address: f.get("address"),
                  wear: f.get("wear"),
                  npi: f.get("npi"),
                  taxId: f.get("taxId"),
                },
              });
            }}
          >
            <h2>Clinic details</h2>
            {[
              ["name", "Clinic name"],
              ["phone", "Phone"],
              ["address", "Address"],
              ["wear", "What to wear"],
              ["npi", "Provider NPI"],
              ["taxId", "Tax ID"],
            ].map(([name, label]) => (
              <Field key={name} label={label}>
                <input
                  name={name}
                  required
                  defaultValue={
                    d.settings.find((s: any) => s.key === "clinic")?.value?.[
                      name
                    ] ?? ""
                  }
                />
              </Field>
            ))}
            <Button type="submit">Save clinic details</Button>
          </Form>
          <Form
            onSubmit={async (f) => {
              await p.adminCommand("setting", {
                key: "membershipPriceCents",
                value: Math.round(Number(f.get("price")) * 100),
              });
              await p.adminCommand("setting", {
                key: "membershipTerms",
                value: String(f.get("terms")),
              });
            }}
          >
            <h2>Membership</h2>
            <p>Monthly billing begins at discharge.</p>
            <Field label="Monthly price ($)">
              <input name="price" type="number" min="1" step=".01" required />
            </Field>
            <Field label="Approved membership terms">
              <textarea name="terms" rows={5} required />
            </Field>
            <Button type="submit">Save membership settings</Button>
          </Form>
          <Form
            onSubmit={async (f) =>
              p.adminCommand("setting", {
                key: "referralRules",
                value: {
                  enabled: f.get("enabled") === "on",
                  depositCents: Math.round(Number(f.get("deposit")) * 100),
                  planCents: Math.round(Number(f.get("plan")) * 100),
                },
              })
            }
          >
            <h2>Referral credit</h2>
            <Field label="Award on paid deposit ($)">
              <input
                name="deposit"
                type="number"
                min="0"
                step=".01"
                defaultValue="0"
                required
              />
            </Field>
            <Field label="Additional award on plan start ($)">
              <input
                name="plan"
                type="number"
                min="0"
                step=".01"
                defaultValue="0"
                required
              />
            </Field>
            <label className="choice">
              <input type="checkbox" name="enabled" />
              Enable approved credit awards
            </label>
            <Button type="submit">Save credit rules</Button>
          </Form>
          <OperationalSettings />
        </div>
      )}
      {tab === "library" && <Library />}
      {tab === "staff" && (
        <>
          <section className="section">
            <h2>Your care team</h2>
            {d.staff.map((s: any) => (
              <div className="list-row" key={s._id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>{s.roles.join(", ")}</p>
                </div>
                <Status value={s.active ? "active" : "inactive"} />
              </div>
            ))}
          </section>
          <Form
            className="reading-width section"
            onSubmit={async (f) =>
              p.adminCommand("staff", {
                name: f.get("name"),
                email: f.get("email"),
                roles: f.getAll("roles"),
                active: f.get("active") === "on",
              })
            }
          >
            <h2>Add or update staff</h2>
            <Field label="Name">
              <input name="name" required />
            </Field>
            <Field label="Email">
              <input type="email" name="email" required />
            </Field>
            <div className="button-row">
              {["sdr", "pt", "closer", "admin"].map((r) => (
                <label key={r} className="choice">
                  <input type="checkbox" name="roles" value={r} />
                  {r.toUpperCase()}
                </label>
              ))}
            </div>
            <label className="choice">
              <input name="active" type="checkbox" defaultChecked />
              Active account
            </label>
            <Button type="submit">Save staff access</Button>
          </Form>
        </>
      )}
      {tab === "sync" && (
        <>
          <section className="section">
            <h2>Release gates</h2>
            {Object.entries(d.gates).map(([key, value]) => (
              <div className="list-row" key={key}>
                <strong>
                  {key === "realPatients"
                    ? "Real patient data"
                    : key === "care"
                      ? "Care and plan payments"
                      : "Retention and membership"}
                </strong>
                <Status value={value ? "enabled" : "not_enabled"} />
              </div>
            ))}
            <p className="muted">
              Release flags are controlled in the Convex deployment after the
              corresponding acceptance gate is met.
            </p>
          </section>
          <section className="section">
            <h2>Integration errors</h2>
            {d.syncErrors.length ? (
              d.syncErrors.map((e: any) => (
                <div className="list-row" key={e._id}>
                  <div>
                    <strong>{e.kind}</strong>
                    <p>
                      {e.error} · {e.attempts} attempts
                    </p>
                  </div>
                  <Button
                    className="outline"
                    onClick={() => p.adminCommand("replay", { id: e._id })}
                  >
                    <RefreshCw size={17} />
                    Retry
                  </Button>
                </div>
              ))
            ) : (
              <Empty title="Nothing waiting for repair">
                Integration failures older than an hour will appear here.
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function Metrics() {
  const p = usePortal(),
    m = p.metrics;
  if (!m) return <Empty title="Loading metrics…" />;
  return (
    <>
      <Header
        title="See what’s making a difference."
        description="Activity recorded in the portal, starting with the first patient."
      />
      <Field label="Video completion cohort">
        <select
          value={p.cohort}
          onChange={(e) => p.setCohort(e.target.value as any)}
        >
          <option value="all">All patients</option>
          <option value="complete">Completed before evaluation</option>
          <option value="incomplete">Incomplete before evaluation</option>
        </select>
      </Field>
      {p.demo && (
        <p className="muted">
          Sample counts illustrate this report. Cohort filtering uses live
          evaluation records when connected.
        </p>
      )}
      <div className="team-counts">
        <div>
          <strong>{m.patients}</strong>
          <span>Patients</span>
        </div>
        <div>
          <strong>{Math.round(m.installmentShare * 100)}%</strong>
          <span>Plans using installments</span>
        </div>
        <div>
          <strong>{m.counts.session_completed ?? 0}</strong>
          <span>Sessions completed</span>
        </div>
      </div>
      {m.proposals && (
        <section className="section">
          <h2>Plan of care proposals</h2>
          <div className="team-counts">
            <div>
              <strong>{m.proposals.produced}</strong>
              <span>Proposals produced</span>
            </div>
            <div>
              <strong>{Math.round(m.proposals.scopeConfirmRate * 100)}%</strong>
              <span>Confirmed the plan</span>
            </div>
            <div>
              <strong>{Math.round(m.proposals.acceptAfterRevealRate * 100)}%</strong>
              <span>Accepted after seeing price</span>
            </div>
            <div>
              <strong>
                {m.proposals.medianHoursToAccept === null
                  ? "—"
                  : `${m.proposals.medianHoursToAccept.toFixed(1)} h`}
              </strong>
              <span>Median Produce to accept</span>
            </div>
          </div>
          {Object.keys(m.proposals.declineReasons).length > 0 && (
            <p className="muted">
              Decline reasons:{" "}
              {Object.entries(m.proposals.declineReasons)
                .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
                .join(" · ")}
            </p>
          )}
        </section>
      )}
      <section className="section">
        <h2>Journey events</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.counts).map(([key, count]) => (
                <tr key={key}>
                  <td>{key.replaceAll("_", " ")}</td>
                  <td>{String(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>Weekly activity</h2>
        {Object.keys(m.weeks).length ? (
          Object.entries(m.weeks).map(([week, counts]) => (
            <div className="list-row" key={week}>
              <strong>Week of {week}</strong>
              <span>
                {Object.entries(counts as any)
                  .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
                  .join(" · ")}
              </span>
            </div>
          ))
        ) : (
          <Empty title="A picture takes time">
            Weekly patterns will appear as patients use the portal.
          </Empty>
        )}
      </section>
    </>
  );
}
