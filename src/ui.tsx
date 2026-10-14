import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useParams,
  Navigate,
} from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import MuxPlayer from "./Player";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  Play,
  CalendarDays,
  MessageCircle,
  Home,
  TrendingUp,
  MoreHorizontal,
  LogOut,
  Users,
  LayoutDashboard,
  Settings,
  Clock3,
  MapPin,
  LockKeyhole,
  FileText,
  Heart,
  Copy,
  CheckCircle2,
  Phone,
  X,
  AlertCircle,
  WifiOff,
  Leaf,
  CreditCard,
  Menu,
  Plus,
  Send,
  Mail,
} from "lucide-react";
import { usePortal } from "./store";
import {
  DAY,
  allowed,
  dateLabel,
  installmentTotal,
  localDate,
  money,
  weeklyAdherence,
} from "./domain";
import { ProposalBuilder, Presentation, YourPlan } from "./proposal-ui";
import {
  TeamDashboard,
  PatientList,
  PatientDetail,
  Admin,
  Metrics,
} from "./team";

export function Button({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => any;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type={type}
        disabled={disabled || busy}
        className={`button ${className}`}
        onClick={
          onClick
            ? async () => {
                setBusy(true);
                setError("");
                try {
                  await onClick();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }
            : undefined
        }
      >
        {busy ? "One moment…" : children}
      </button>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      {value === "on_track"
        ? "On track"
        : value === "at_risk"
          ? "At risk"
          : value.replaceAll("_", " ")}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Header({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Form({
  onSubmit,
  children,
  className = "",
}: {
  onSubmit: (data: FormData) => Promise<any>;
  children: ReactNode;
  className?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className={className}
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          await onSubmit(new FormData(form));
          form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Saving…</p>}
    </form>
  );
}
function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Grounded home">
      <img src="/icon.svg" alt="" />
      <span>
        grounded
        <span className="brand-caption">PHYSICAL THERAPY & PERFORMANCE</span>
      </span>
    </Link>
  );
}
export function App() {
  const p = usePortal(),
    [online, setOnline] = useState(navigator.onLine),
    [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const staff = p.viewer?.roles?.some((r: string) => r !== "patient");
  const nav = staff
    ? [
        { to: "/team", label: "Dashboard", icon: LayoutDashboard },
        { to: "/team/patients", label: "Patients", icon: Users },
        { to: "/team/evaluations", label: "Evaluations", icon: CalendarDays },
        ...(p.viewer.roles.includes("admin")
          ? [{ to: "/team/admin", label: "Admin", icon: Settings }]
          : []),
      ]
    : [
        { to: "/", label: "Today", icon: Home },
        { to: "/progress", label: "Progress", icon: TrendingUp },
        { to: "/messages", label: "Messages", icon: MessageCircle },
        { to: "/more", label: "More", icon: MoreHorizontal },
      ];
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {p.demo && (
        <div className="demo-bar">
          <span>
            <span className="sample-dot" /> Sample workspace · No real patient
            data
          </span>
          <div>
            <select
              aria-label="Preview patient stage"
              value={p.data.patient.stage}
              onChange={(e) => p.setStage(e.target.value)}
            >
              <option value="in_care">In care</option>
              <option value="pre_visit">Before the visit</option>
              <option value="discharged">After discharge</option>
            </select>
            <button
              onClick={() => {
                p.switchRole();
                navigate(staff ? "/" : "/team");
              }}
            >
              View {staff ? "patient portal" : "team console"}{" "}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      )}
      {!online && (
        <div className="offline" role="status">
          <WifiOff size={18} />
          You’re offline. Reconnect to save changes or view new information.
        </div>
      )}
      <div className="app-shell">
        <aside className={`sidebar ${menu ? "is-open" : ""}`}>
          <Logo />
          <span className="workspace-label">
            {staff ? "Team workspace" : "Your patient portal"}
          </span>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/" || n.to === "/team"}
                onClick={() => setMenu(false)}
              >
                <n.icon size={21} />
                {n.label}
                <ChevronRight size={16} className="nav-arrow" />
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="care-mark">
              <Leaf size={27} />
              <p>
                A little progress.
                <br />
                Every single day.
              </p>
            </div>
            <div className="account">
              <span className="avatar">{staff ? "J" : "L"}</span>
              <div>
                <strong>{p.viewer?.name ?? "Your account"}</strong>
                <span>{staff ? "Care team" : "Patient"}</span>
              </div>
              <button aria-label="Sign out" onClick={() => p.signOut()}>
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="mobile-brand">
              <Logo />
            </div>
            <span className="desktop-date">
              {dateLabel(Date.now())}{" "}
              <span className="muted">· One step forward</span>
            </span>
            <div className="topbar-right">
              <span className="availability">
                <span />
                Here for you
              </span>
              <Link
                to={staff ? "/team/patients" : "/messages"}
                aria-label="Open messages"
              >
                <MessageCircle size={21} />
              </Link>
              <button
                className="mobile-menu"
                aria-label="Toggle navigation"
                onClick={() => setMenu(!menu)}
              >
                <Menu />
              </button>
            </div>
          </header>
          <main id="main" className={`main ${staff ? "team-main" : ""}`}>
            {p.error && (
              <div className="notice error" role="alert">
                <AlertCircle size={20} />
                <span>{p.error}</span>
                <button aria-label="Dismiss error" onClick={p.clearError}>
                  <X size={18} />
                </button>
              </div>
            )}
            {!p.viewer ? (
              <Empty title="Opening your portal…" />
            ) : (
              <Routes>
                <Route
                  path="/"
                  element={
                    staff ? (
                      <Navigate to="/team" replace />
                    ) : (
                      <PatientReady>
                        <Today />
                      </PatientReady>
                    )
                  }
                />
                <Route
                  path="/progress"
                  element={
                    <PatientReady>
                      <Progress />
                    </PatientReady>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <PatientReady>
                      <Messages />
                    </PatientReady>
                  }
                />
                <Route
                  path="/session"
                  element={
                    <PatientReady>
                      <Session />
                    </PatientReady>
                  }
                />
                <Route
                  path="/video/:id"
                  element={
                    <PatientReady>
                      <Video />
                    </PatientReady>
                  }
                />
                <Route
                  path="/more"
                  element={
                    <PatientReady>
                      <More />
                    </PatientReady>
                  }
                />
                <Route
                  path="/more/payments"
                  element={
                    <PatientReady>
                      <Payments />
                    </PatientReady>
                  }
                />
                <Route
                  path="/more/plan"
                  element={
                    <PatientReady>
                      <YourPlan />
                    </PatientReady>
                  }
                />
                <Route
                  path="/more/referrals"
                  element={
                    <PatientReady>
                      <Referrals />
                    </PatientReady>
                  }
                />
                <Route
                  path="/team"
                  element={staff ? <TeamDashboard /> : <Navigate to="/" />}
                />
                <Route
                  path="/team/patients"
                  element={staff ? <PatientList /> : <Navigate to="/" />}
                />
                <Route
                  path="/team/patients/:id"
                  element={staff ? <PatientDetail /> : <Navigate to="/" />}
                />
                <Route
                  path="/team/patients/:id/proposal"
                  element={
                    staff && allowed(p.viewer.roles, "clinical") ? (
                      <ProposalBuilder />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="/team/patients/:id/present"
                  element={
                    staff && allowed(p.viewer.roles, "finance") ? (
                      <Presentation />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="/team/evaluations"
                  element={
                    staff ? <TeamDashboard evaluations /> : <Navigate to="/" />
                  }
                />
                <Route
                  path="/team/admin"
                  element={
                    p.viewer.roles.includes("admin") ? (
                      <Admin />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route
                  path="/team/metrics"
                  element={
                    p.viewer.roles.includes("admin") ? (
                      <Metrics />
                    ) : (
                      <Navigate to="/" />
                    )
                  }
                />
                <Route path="/login" element={<DemoLogin />} />
                <Route
                  path="*"
                  element={
                    <Empty title="This page isn’t here">
                      <Link to="/">Return to your portal</Link>
                    </Empty>
                  }
                />
              </Routes>
            )}
          </main>
          <footer className="page-footer">
            <span>Rooted in you. Built for what’s next.</span>
            <span>Grounded PTP</span>
          </footer>
        </div>
      </div>
      {!staff && (
        <nav className="mobile-tabs" aria-label="Patient navigation">
          {nav.map((n) => (
            <NavLink to={n.to} end={n.to === "/"} key={n.to}>
              <n.icon size={22} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
function PatientReady({ children }: { children: ReactNode }) {
  const { data } = usePortal();
  return data ? children : <Empty title="Loading your portal…" />;
}
function Appointment() {
  const { data } = usePortal();
  const a = data.appointments
    .filter((a: any) => a.status === "booked" && a.startsAt > Date.now())
    .sort((a: any, b: any) => a.startsAt - b.startsAt)[0];
  return (
    <section className="appointment-block">
      <div className="section-top">
        <h3>Your next visit</h3>
        <CalendarDays size={20} />
      </div>
      {a ? (
        <>
          <p className="appointment-date">{dateLabel(a.startsAt, true)}</p>
          <p className="muted">
            {a.kind === "eval" ? "Your evaluation" : "One-on-one with your PT"}
          </p>
          <div className="location">
            <MapPin size={17} />
            <span>{a.location || data.clinic.address}</span>
          </div>
          <Link className="text-link" to="/messages">
            Need a different time? <ArrowUpRight size={15} />
          </Link>
        </>
      ) : (
        <>
          <p>No visit on the calendar yet.</p>
          <Link to="/messages" className="text-link">
            Ask the team to book a visit <ArrowRight size={16} />
          </Link>
        </>
      )}
    </section>
  );
}
export function Today() {
  const p = usePortal(),
    { data: d } = p,
    navigate = useNavigate();
  if (["pre_visit", "deposit_paid"].includes(d.patient.stage))
    return <PreVisit />;
  const discharged = d.patient.stage === "discharged",
    program = d.programs.find((p: any) => p.active),
    today = localDate(Date.now()),
    day = new Date(`${today}T12:00:00Z`).getUTCDay(),
    items = program?.items.filter((i: any) => i.days.includes(day)) ?? [],
    session = d.sessionLogs.find((s: any) => s.date === today),
    done = !!session?.completedAt,
    first = d.patient.name.split(" ")[0];
  return (
    <>
      <Header
        title={
          discharged
            ? "Keep it going, " + first + "."
            : "A little stronger, " + first + "."
        }
        description={
          discharged
            ? "Your next chapter starts with the progress you’ve made."
            : "You’re building more than strength. You’re getting back to you."
        }
        action={<Status value={d.patient.status} />}
      />
      <div className="patient-columns">
        <div>
          <section className="session-hero">
            <div className="hero-top">
              <span className="small-label">
                {discharged
                  ? "Your saved program"
                  : `Week ${Math.max(1, Math.ceil((Date.now() - (d.plansOfCare[0]?.startDate ?? Date.now())) / (7 * DAY)))} of ${d.plansOfCare[0]?.weeks ?? 8}`}
              </span>
              <span className="hero-time">
                <Clock3 size={17} /> About 12 min
              </span>
            </div>
            <h2>
              {done
                ? "You showed up for yourself."
                : items.length
                  ? "A few good moves."
                  : "Rest is part of the work."}
            </h2>
            <p>
              {done
                ? "Your session is logged. Take that feeling into the rest of your day."
                : items.length
                  ? "Make a little room for movement today. Your program is ready when you are."
                  : "Let your body recover today. Your next session will be here when it’s time."}
            </p>
            <div className="hero-bottom">
              <Button
                className="rust"
                onClick={async () => {
                  if (done || !items.length) {
                    navigate("/progress");
                    return;
                  }
                  await p.command("startSession");
                  navigate("/session");
                }}
              >
                {done
                  ? "See your progress"
                  : items.length
                    ? "Start today’s session"
                    : "See your progress"}{" "}
                {done ? <CheckCircle2 size={20} /> : <ArrowRight size={20} />}
              </Button>
              <span>
                {items.length} movements{" "}
                <span className="hero-separator">/</span> At your pace
              </span>
            </div>
          </section>
          <section className="section">
            <div className="section-top">
              <h2>Your movement for today</h2>
              <span className="muted">
                {program ? `Program v${program.version}` : ""}
              </span>
            </div>
            {items.length ? (
              <div className="exercise-list">
                {items.map((i: any, index: number) => {
                  const e = d.exercises.find(
                    (e: any) => e._id === i.exerciseId,
                  );
                  return (
                    <div className="exercise-row" key={i.id}>
                      <span className="exercise-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{e?.name}</h3>
                        <p>
                          {i.sets} sets ·{" "}
                          {i.reps
                            ? `${i.reps} reps`
                            : `${i.holdSec}-second hold`}
                        </p>
                      </div>
                      {session?.doneItemIds.includes(i.id) ? (
                        <CheckCircle2 size={21} className="green" />
                      ) : (
                        <span className="movement-tag">
                          {e?.tags?.[0] ?? "Movement"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title="A little breathing room">
                Your PT will keep your next steps up to date.
              </Empty>
            )}
          </section>
          {d.visitSummaries.length > 0 && (
            <section className="pt-note">
              {d.ptPhotoUrl?<img className="avatar large staff-photo" src={d.ptPhotoUrl} alt={d.ptName} />:<div className="avatar large">{d.ptName?.[0]??'PT'}</div>}
              <div>
                <div className="section-top">
                  <h3>A note from {d.ptName}</h3>
                  <span className="muted">
                    {dateLabel(d.visitSummaries.at(-1).at)}
                  </span>
                </div>
                <p>{d.visitSummaries.at(-1).body}</p>
                <Link to="/messages" className="text-link">
                  Message your team <ArrowUpRight size={16} />
                </Link>
              </div>
            </section>
          )}
        </div>
        <aside className="patient-aside">
          <section className="goal-block">
            <Leaf size={24} />
            <span className="small-label">What we’re working toward</span>
            <h2>“{d.patient.goal || "Moving with more confidence."}”</h2>
            <span className="muted">Your goal. Our shared direction.</span>
          </section>
          <Appointment />
          <section className="week-block">
            <div className="section-top">
              <h3>You’re showing up</h3>
              <TrendingUp size={20} />
            </div>
            <WeekStrip />
            <p>Every session is a step in the right direction.</p>
            <Link to="/progress" className="text-link">
              See your progress <ArrowRight size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
function WeekStrip() {
  const { data: d } = usePortal();
  const today = new Date(`${localDate(Date.now())}T12:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return (
    <div className="week-strip">
      {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => {
        const date = new Date(monday);
        date.setUTCDate(monday.getUTCDate() + i);
        const key = date.toISOString().slice(0, 10),
          done = d.sessionLogs.some(
            (s: any) => s.date === key && s.completedAt,
          ),
          current = key === localDate(Date.now());
        return (
          <div key={i}>
            <span>{label}</span>
            <span
              className={`day-dot ${done ? "done" : ""} ${current ? "current" : ""}`}
              role="img"
              aria-label={`${date.toDateString()}: ${done ? "completed" : current ? "today" : "not completed"}`}
            >
              {done ? <Check size={16} /> : date.getUTCDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function PreVisit() {
  const { data: d } = usePortal();
  const complete = d.assignments.filter((a: any) => a.quizPassedAt).length;
  return (
    <>
      <Header
        title={`Hi ${d.patient.name.split(" ")[0]}. Let’s get you ready.`}
        description="A little preparation now. More time for you when we meet."
      />
      <div className="patient-columns">
        <div>
          <div className="previsit-intro">
            <Play size={25} />
            <div>
              <h2>Your three videos</h2>
              <p>
                Watch in order, then answer a few quick questions. Bring your
                questions to your evaluation.
              </p>
            </div>
          </div>
          <div className="progress-caption">
            <span>
              {complete} of {d.assignments.length} complete
            </span>
            <span>At your own pace</span>
          </div>
          <progress value={complete} max={d.assignments.length || 3} />
          <div className="video-list">
            {d.assignments
              .sort((a: any, b: any) => a.order - b.order)
              .map((a: any) => {
                const video = d.videos.find((v: any) => v._id === a.videoId),
                  unlocked = a.unlockedAt !== undefined;
                return (
                  <div className="video-row" key={a._id}>
                    <span
                      className={`sequence-dot ${a.quizPassedAt ? "complete" : ""}`}
                    >
                      {a.quizPassedAt ? <Check size={18} /> : a.order + 1}
                    </span>
                    <div>
                      <span className="small-label">
                        {a.quizPassedAt
                          ? "Complete"
                          : unlocked
                            ? `Watch by ${dateLabel(a.dueAt)}`
                            : "Up next"}
                      </span>
                      <h3>{video?.title}</h3>
                      <p>
                        {Math.ceil((video?.durationSec ?? 0) / 60)} min · A few
                        questions after
                      </p>
                      {unlocked ? (
                        <Link
                          className={`button ${!a.quizPassedAt ? "rust" : "outline"}`}
                          to={`/video/${a._id}`}
                        >
                          {a.quizPassedAt ? "Watch again" : "Watch video"}{" "}
                          <Play size={16} />
                        </Link>
                      ) : (
                        <span className="locked">
                          <LockKeyhole size={14} /> Unlocks after video{" "}
                          {a.order}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        <aside className="patient-aside">
          <Appointment />
          <section className="week-block">
            <h3>A comfortable start</h3>
            <p>{d.clinic.wear}</p>
            <Link to="/messages" className="text-link">
              Something on your mind? <ArrowUpRight size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
function Video() {
  const { id } = useParams(),
    p = usePortal(),
    a = p.data.assignments.find((a: any) => a._id === id),
    player = useRef<any>(null),
    last = useRef(0);
  const [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<any>();
  if (!a) return <Empty title="Video unavailable" />;
  const v = p.data.videos.find((v: any) => v._id === a.videoId),
    quiz = p.data.quizzes.find((q: any) => q.videoId === v._id);
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Before your visit
      </Link>
      <Header title={v.title} description={v.whyLine} />
      <div className="reading-width">
        {a.unlockedAt === undefined ? (
          <Empty title="This video is next in line">
            Complete the previous video and quiz to unlock it.
          </Empty>
        ) : (
          <>
            {v.playbackId ? (
              <MuxPlayer
                ref={player}
                playbackId={v.playbackId}
                disableTracking
                disableCookies
                onPlay={() => {
                  last.current = Date.now();
                  void p.command("startVideo", { id: a._id }).catch(() => {});
                }}
                onSeeking={() => {
                  if (player.current.currentTime > a.watchedSec + 2)
                    player.current.currentTime = a.watchedSec;
                }}
                onTimeUpdate={() => {
                  if (Date.now() - last.current >= 10_000) {
                    last.current = Date.now();
                    void p
                      .command("videoProgress", {
                        id: a._id,
                        seconds: player.current.currentTime,
                      })
                      .catch(() => {});
                  }
                }}
              />
            ) : (
              <div className="video-placeholder">
                <Play size={44} />
                <h2>
                  {p.demo
                    ? "Your pre-visit video goes here"
                    : "Video not available yet"}
                </h2>
                <p>
                  {p.demo
                    ? "The sample has no clinical video content. Use the control below to explore the quiz."
                    : "Please message the clinic for help."}
                </p>
                {p.demo && (
                  <Button
                    className="outline"
                    onClick={() => p.command("demoWatch", { id: a._id })}
                  >
                    Mark sample video watched
                  </Button>
                )}
              </div>
            )}
            <div className="progress-caption">
              <span>
                {Math.round((a.watchedSec / v.durationSec) * 100)}% watched
              </span>
              <span>{Math.ceil(v.durationSec / 60)} min</span>
            </div>
            <progress value={a.watchedSec} max={v.durationSec} />
            {a.completedAt ? (
              <section className="section">
                <h2>A quick check-in</h2>
                <p>Answer each question to move to the next video.</p>
                {quiz?.questions.map((q: any, i: number) => (
                  <fieldset className="quiz" key={i}>
                    <legend>{q.prompt}</legend>
                    {q.options.map((option: string, index: number) => (
                      <label key={option} className="choice">
                        <input
                          type="radio"
                          name={`q${i}`}
                          checked={answers[i] === index}
                          onChange={() =>
                            setAnswers((a) => {
                              const n = [...a];
                              n[i] = index;
                              return n;
                            })
                          }
                        />
                        {option}
                      </label>
                    ))}
                    {result?.wrong?.some((w: any) => w.index === i) && (
                      <p className="inline-error">
                        Take another look around {q.jumpToSec} seconds, then try
                        again.
                        {v.playbackId&&<Button className="outline" onClick={()=>{if(player.current){player.current.currentTime=Math.min(q.jumpToSec,a.watchedSec);void player.current.play();}}}>Replay this part</Button>}
                      </p>
                    )}
                  </fieldset>
                ))}
                {result?.passed ? (
                  <div className="notice success">
                    <CheckCircle2 />
                    <span>You’ve got it. The next video is ready.</span>
                    <Link to="/">Continue</Link>
                  </div>
                ) : (
                  <Button
                    onClick={async () =>
                      setResult(await p.command("quiz", { id: a._id, answers }))
                    }
                    disabled={
                      answers.filter((a) => a !== undefined).length !==
                      quiz?.questions.length
                    }
                  >
                    Check my answers <ArrowRight size={18} />
                  </Button>
                )}
              </section>
            ) : (
              <p className="muted">
                Questions unlock when you’ve watched at least 90%.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
function Session() {
  const p = usePortal(),
    d = p.data,
    navigate = useNavigate(),
    session = d.sessionLogs.find((s: any) => s.date === localDate(Date.now())),
    [feel, setFeel] = useState(""),
    [note, setNote] = useState("");
  if (!session)
    return (
      <Empty title="Your session is ready">
        <Link to="/">Start from Today</Link>
      </Empty>
    );
  const program = d.programs.find((p: any) => p._id === session.programId),
    weekday = new Date(`${session.date}T12:00:00Z`).getUTCDay(),
    items = program.items.filter((i: any) => i.days.includes(weekday)),
    next = items.find((i: any) => !session.doneItemIds.includes(i.id)),
    exercise = next && d.exercises.find((e: any) => e._id === next.exerciseId);
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Today
      </Link>
      <Header
        title={
          session.completedAt
            ? "A good step forward."
            : next
              ? "One movement at a time."
              : "How did that feel?"
        }
        description={
          session.completedAt
            ? "Your session is saved. We’ll keep building from here."
            : `${session.doneItemIds.length} of ${items.length} movements complete`
        }
      />
      <div className="reading-width">
        <progress value={session.doneItemIds.length} max={items.length} />
        {session.completedAt ? (
          <>
            <div className="session-success">
              <CheckCircle2 size={54} />
              <h2>You did the work.</h2>
              <p>Small, steady steps add up.</p>
            </div>
            <Button
              onClick={() =>
                navigate(session.feel === "too_much" ? "/messages" : "/")
              }
            >
              {session.feel === "too_much"
                ? "Tell your PT what happened"
                : "Back to Today"}
              <ArrowRight size={18} />
            </Button>
          </>
        ) : next ? (
          <section className="exercise-focus">
            <div className="exercise-focus-top">
              <span className="exercise-number">
                {session.doneItemIds.length + 1}
              </span>
              <span className="small-label">Your movement</span>
            </div>
            <h2>{exercise.name}</h2>
            <div className="prescription">
              <span>
                <strong>{next.sets}</strong> sets
              </span>
              <span>
                <strong>{next.reps || next.holdSec}</strong>{" "}
                {next.reps ? "reps" : "seconds"}
              </span>
            </div>
            <p className="exercise-cue">{next.cue}</p>
            {exercise.videoId &&
              d.videos.find((v: any) => v._id === exercise.videoId)
                ?.playbackId && (
                <MuxPlayer
                  playbackId={
                    d.videos.find((v: any) => v._id === exercise.videoId)
                      .playbackId
                  }
                  disableTracking
                  disableCookies
                />
              )}
            <Button
              className="rust"
              onClick={() =>
                p.command("completeExercise", {
                  id: session._id,
                  itemId: next.id,
                })
              }
            >
              Movement done <Check size={19} />
            </Button>
            <p className="muted small">
              Take breaks when you need them. Your pace is the right pace.
            </p>
          </section>
        ) : (
          <section className="section">
            <div className="feel-options">
              {[
                ["easy", "A little easy"],
                ["about_right", "About right"],
                ["too_much", "Too much today"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`choice ${feel === value ? "selected" : ""}`}
                  onClick={() => setFeel(value)}
                >
                  <Heart size={20} />
                  {label}
                  {feel === value && <Check size={18} />}
                </button>
              ))}
            </div>
            <Field label="Anything you want your PT to know? (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </Field>
            {feel === "too_much" && (
              <p className="notice">
                After saving, tell your PT what felt too much. If it’s severe or
                sudden, call the clinic.
              </p>
            )}
            <Button
              disabled={!feel}
              onClick={() =>
                p.command("finishSession", { id: session._id, feel, note })
              }
            >
              Save my session <Check size={18} />
            </Button>
          </section>
        )}
      </div>
    </>
  );
}
function Progress() {
  const p = usePortal(),
    d = p.data,
    plan = d.plansOfCare.find((p: any) =>
      ["accepted", "completed"].includes(p.status),
    ),
    labels = [...new Set<string>(d.measurements.map((m: any) => m.label))];
  return (
    <>
      <Header
        title="Look how far you’ve come."
        description="Progress isn’t always a straight line. These are your steps forward."
      />
      <div className="patient-columns">
        <div>
          <section className="progress-goal">
            <Leaf />
            <h2>{d.patient.goal || "Your goal starts here."}</h2>
            <p>Built around what matters to you.</p>
          </section>
          <section className="section">
            <h2>Then and now</h2>
            {labels.length ? (
              labels.map((label) => {
                const rows = d.measurements
                    .filter((m: any) => m.label === label)
                    .sort((a: any, b: any) => a.takenAt - b.takenAt),
                  first = rows[0],
                  last = rows.at(-1);
                return (
                  <div className="measurement" key={label}>
                    <h3>{label}</h3>
                    <div>
                      <span>
                        <small>At your evaluation</small>
                        {first.value} <small>{first.unit}</small>
                      </span>
                      <ArrowRight size={20} />
                      <span className="measure-now">
                        <small>Latest check-in</small>
                        {last.value} <small>{last.unit}</small>
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty title="Your starting point is next">
                Your PT will add your first measurements at your evaluation.
              </Empty>
            )}
          </section>
          <section className="section">
            <h2>Your consistency, week by week</h2>
            <div className="adherence-chart">
              {weeklyAdherence(d.sessionAssignments, d.sessionLogs).map((w) => (
                <div key={w.start}>
                  <span>{w.assigned ? `${w.done}/${w.assigned}` : "—"}</span>
                  <div className="adherence-track">
                    <div
                      style={{
                        height: `${w.assigned ? (w.done / w.assigned) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>{dateLabel(Date.parse(`${w.start}T12:00:00Z`))}</small>
                </div>
              ))}
            </div>
            <p className="muted small">
              Completed sessions / assigned sessions. Program changes keep their
              original assignments.
            </p>
          </section>
          <section className="section">
            <h2>Milestones that matter</h2>
            {(plan?.outcomes ?? plan?.milestones)?.length ? (
              (plan.outcomes ?? plan.milestones).map((m: any, i: number) => (
                <div className="milestone" key={i}>
                  <span className={`milestone-check ${m.doneAt ? "done" : ""}`}>
                    {m.doneAt && <Check size={16} />}
                  </span>
                  <span>{m.label}</span>
                  <small>
                    {m.doneAt
                      ? dateLabel(m.doneAt)
                      : `Week ${m.retestWeek ?? m.week}`}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">You and your PT will set these together.</p>
            )}
          </section>
        </div>
        <aside className="patient-aside">
          <section className="week-block">
            <h3>Your week in movement</h3>
            <WeekStrip />
            <p>
              {d.sessionLogs.filter((s: any) => s.completedAt).length} sessions
              logged. Each one counts.
            </p>
          </section>
          {plan && Date.now() >= plan.startDate + 21 * DAY && (
            <section className="membership-block">
              <Leaf size={25} />
              <h2>Keep your momentum.</h2>
              <p>
                A little ongoing support for everything that comes next.
                Membership begins when your plan of care ends.
              </p>
              {d.membershipPrice > 0 ? (
                <>
                  <p className="membership-price">
                    {money(d.membershipPrice)} <small>/ month</small>
                  </p>
                  <Link to="/more/payments" className="button outline">
                    Explore membership <ArrowRight size={17} />
                  </Link>
                </>
              ) : (
                <Link to="/messages" className="text-link">
                  Ask about membership <ArrowUpRight size={16} />
                </Link>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
export function Messages() {
  const p = usePortal(),
    d = p.data,
    [body, setBody] = useState(""),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void p.command("readMessages").catch(() => {});
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [d.messages.length]);
  const pain = d.messages.some(
    (m: any) => m.painFlag && m.at > (d.patient.painResolvedAt ?? 0),
  );
  return (
    <>
      <Header
        title="A direct line to your team."
        description="A question, a small win, or something that doesn’t feel right. We’re here."
      />
      <div className="message-panel">
        <div className="thread-header">
          {d.ptPhotoUrl?<img className="avatar staff-photo" src={d.ptPhotoUrl} alt="" />:<span className="avatar">{d.ptName?.[0]??'PT'}</span>}
          <div>
            <strong>Your Grounded team</strong>
            <p>We reply the same business day.</p>
          </div>
        </div>
        <div className="message-list" role="log" aria-label="Conversation">
          {d.messages.length ? (
            d.messages.map((m: any) => (
              <div
                key={m._id}
                className={`message ${m.senderKind === "patient" ? "outgoing" : "incoming"}`}
              >
                <small>
                  {m.senderKind === "patient" && p.viewer.roles.includes('patient') ? "You" : m.senderName} ·{" "}
                  {dateLabel(m.at, true)}
                </small>
                <p>{m.body}</p>
                {d.readCursors?.some((r:any)=>r.userId!==m.senderId&&r.readAt>=m.at)&&<small>Seen</small>}
              </div>
            ))
          ) : (
            <Empty title="Start a conversation">
              Your messages stay here in your portal.
            </Empty>
          )}
          {pain && (
            <div className="notice">
              <Phone size={20} />
              <span>
                If it’s severe or sudden, call us now.
                {d.clinic.phone && (
                  <a href={`tel:${d.clinic.phone}`}> {d.clinic.phone}</a>
                )}
              </span>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="message-compose"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            try {
              await p.command("sendMessage", { body });
              setBody("");
            } catch {}
          }}
        >
          <label className="sr-only" htmlFor="message">
            Write to the team
          </label>
          <textarea
            id="message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write to your team…"
            rows={2}
            maxLength={5000}
          />
          <button
            type="submit"
            className="button"
            disabled={!body.trim()}
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </>
  );
}
function More() {
  const p = usePortal();
  return (
    <>
      <Header
        title="The rest, all in one place."
        description="Your plan, your paperwork, and a little something to pass along."
      />
      <div className="more-links">
        {[
          {
            to: "/more/plan",
            icon: FileText,
            title: "Your plan",
            body: "What you agreed to, ready to share or download.",
          },
          {
            to: "/more/payments",
            icon: CreditCard,
            title: "Payments",
            body: "Your balance, payment details, and documents.",
          },
          {
            to: "/more/referrals",
            icon: Users,
            title: "Refer a friend",
            body: "Help someone you know take their first step.",
          },
          {
            to: "/messages",
            icon: CalendarDays,
            title: "Request a visit",
            body: "Let’s find a time that works for you.",
          },
        ].map((l) => (
          <Link to={l.to} key={l.to}>
            <l.icon size={25} />
            <div>
              <h2>{l.title}</h2>
              <p>{l.body}</p>
            </div>
            <ArrowUpRight size={22} />
          </Link>
        ))}
      </div>
      <section className="section reading-width">
        <h2>Your account</h2>
        <p>
          {p.data.patient.name}
          <br />
          <span className="muted">{p.data.patient.email}</span>
        </p>
        <Button className="outline" onClick={() => p.command("revokeSessions")}>
          Sign out all devices <LogOut size={17} />
        </Button>
        {p.viewer.sessions?.map((session:any)=><div className="list-row" key={session.id}><span>{session.current?'This device':'Device session'} · Signed in {dateLabel(session.createdAt,true)}</span><Button className="outline" onClick={()=>p.command('revokeSession',{id:session.id})}>Sign out device</Button></div>)}
      </section>
    </>
  );
}
export function Payments() {
  const p = usePortal(),
    d = p.data,
    plan = d.plansOfCare
      .filter((x: any) => ["accepted", "completed"].includes(x.status))
      .at(-1),
    pending = d.plansOfCare.find((x: any) => x.status === "sent_to_portal"),
    paid = d.payments
      .filter(
        (p: any) =>
          ["paid", "partially_refunded"].includes(p.status) &&
          p.kind !== "membership",
      )
      .reduce(
        (n: number, p: any) => n + p.amountCents - (p.refundedCents ?? 0),
        0,
      ),
    total = plan
      ? plan.installments
        ? (plan.installmentTotalCents ?? installmentTotal(plan.priceCents))
        : plan.priceCents
      : 4850,
    next = d.installmentSchedules
      .filter((s: any) => s.status === "scheduled")
      .sort((a: any, b: any) => a.dueAt - b.dueAt)[0],
    [memberAccepted, setMemberAccepted] = useState(false);
  const membership = d.memberships.at(-1);
  return (
    <>
      <Header
        title="Your plan. Clear and simple."
        description="Everything you need to know about your care and payments."
      />
      <div className="patient-columns">
        <div>
          {d.payments.some((p: any) => p.status === "failed") && (
            <div className="notice error">
              <AlertCircle />
              <span>A payment needs your attention.</span>
              <Button className="outline" onClick={() => p.checkout("manage")}>
                Update card
              </Button>
            </div>
          )}
          {pending && !p.viewer.staffId && (
            <div className="notice">
              <FileText size={20} />
              <span>Your plan of care is ready to review.</span>
              <Link to="/more/plan" className="button outline small-button">
                Review plan
              </Link>
            </div>
          )}
          {plan ? (
            <section className="plan-block">
              <h2>{plan.goal}</h2>
              <div className="plan-facts">
                <div>
                  <small>Length</small>
                  <strong>{plan.weeks} weeks</strong>
                </div>
                <div>
                  <small>Visits</small>
                  <strong>{plan.visits} together</strong>
                </div>
                <div>
                  <small>Plan total</small>
                  <strong>{money(total)}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <Status value={plan.status} />
                </div>
              </div>
              {!p.viewer.staffId && (
                <Link to="/more/plan" className="text-link">
                  See your full plan <ArrowUpRight size={16} />
                </Link>
              )}
            </section>
          ) : (
            <Empty title="Your plan is coming together">
              You’ll review it with your team after the evaluation.
            </Empty>
          )}
          <section className="section balance">
            <span className="small-label">Remaining balance</span>
            <h2>{money(Math.max(0, total - paid))}</h2>
            <progress value={paid} max={total} />
            <div className="progress-caption">
              <span>
                Paid so far <strong>{money(paid)}</strong>
              </span>
              <span>of {money(total)}</span>
            </div>
            {next && (
              <p>
                <CalendarDays size={18} /> Next payment:{" "}
                <strong>{money(next.amountCents)}</strong> on{" "}
                {dateLabel(next.dueAt)}
              </p>
            )}
            {!p.viewer.staffId && (
              <Button className="outline" onClick={() => p.checkout("manage")}>
                Manage payment method <ArrowUpRight size={17} />
              </Button>
            )}
          </section>
          <section className="section">
            <h2>Your documents</h2>
            {d.documents.length ? (
              d.documents.map((doc: any) => (
                <button
                  className="document-row"
                  key={doc._id}
                  onClick={() => p.download(doc._id)}
                >
                  <FileText size={22} />
                  <span>
                    {doc.name}
                    <small>{dateLabel(doc.at)}</small>
                  </span>
                  <span>
                    PDF <ArrowUpRight size={15} />
                  </span>
                </button>
              ))
            ) : (
              <Empty title="Your documents will live here">
                Signed plans and receipts appear when they’re ready.
              </Empty>
            )}
          </section>
        </div>
        <aside className="patient-aside">
          <section className="membership-block">
            <Leaf />
            <h2>Support for what’s next.</h2>
            {membership ? (
              <>
                <Status value={membership.status} />
                <p>
                  {membership.status === "enrolled"
                    ? "Your membership will begin at discharge."
                    : "Your membership details stay here."}
                </p>
              </>
            ) : (
              <>
                <p>
                  Enroll from week 4. Billing and benefits begin when your plan
                  of care ends.
                </p>
                {d.membershipPrice > 0 && d.membershipTerms ? (
                  <>
                    <strong>{money(d.membershipPrice)} / month</strong>
                    <p>{d.membershipTerms}</p>
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={memberAccepted}
                        onChange={(e) => setMemberAccepted(e.target.checked)}
                      />
                      I accept these membership terms and authorize recurring
                      monthly charges starting at discharge.
                    </label>
                    <Button
                      disabled={!memberAccepted}
                      onClick={async () => {
                        const id = await p.command("enrollMembership", {
                          accepted: true,
                        });
                        await p.checkout("membership", id);
                      }}
                    >
                      Set up membership
                    </Button>
                  </>
                ) : (
                  <Link to="/messages" className="text-link">
                    Ask your team about membership <ArrowUpRight size={15} />
                  </Link>
                )}
              </>
            )}
          </section>
          <p className="muted small">
            Card details are handled by Stripe. They are never stored in your
            portal.
          </p>
        </aside>
      </div>
    </>
  );
}
function Referrals() {
  const p = usePortal(),
    d = p.data,
    [copied, setCopied] = useState(false),
    balance = d.creditLedger.reduce(
      (n: number, c: any) => n + c.amountCents,
      0,
    ),
    url = `${window.location.origin}/r/${d.patient.referralToken}`;
  return (
    <>
      <Header
        title="Good care is worth sharing."
        description="Know someone who’s ready to feel more like themselves? Send them our way."
      />
      <div className="patient-columns">
        <div>
          <section className="referral-block">
            <Users size={30} />
            <h2>
              A first step for them.
              <br />A little thank-you for you.
            </h2>
            <p>
              Share your personal link. Your friend can leave their details, and
              our team will take it from there.
            </p>
            {d.referralRules.enabled && (
              <p>
                {money(d.referralRules.depositCents)} when they pay a deposit.{" "}
                {money(d.referralRules.planCents)} more when they start a plan.
              </p>
            )}
            <Button
              onClick={async () => {
                if (navigator.share)
                  await navigator.share({
                    title: "Grounded",
                    text: "A team that helps you get back to you.",
                    url,
                  });
                else {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }
              }}
            >
              Share your link <ArrowUpRight size={18} />
            </Button>
            <div className="copy-link">
              <span>{url.replace(/^https?:\/\//, "")}</span>
              <button
                aria-label="Copy referral link"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
            </div>
            {copied && <p role="status">Link copied.</p>}
          </section>
          <section className="section">
            <h2>Your referrals</h2>
            {d.referrals.length ? (
              d.referrals.map((r: any) => (
                <div className="list-row" key={r._id}>
                  <strong>{r.friendName}</strong>
                  <Status value={r.status} />
                </div>
              ))
            ) : (
              <Empty title="A good thing starts with a conversation">
                Friends who use your link will appear here.
              </Empty>
            )}
          </section>
        </div>
        <aside className="patient-aside">
          <section className="credit-block">
            <span className="small-label">Your membership credit</span>
            <h2>{money(balance)}</h2>
            <p>
              Ready for your next chapter. Credits apply only to membership
              charges and have no cash value.
            </p>
            {!d.referralRules.enabled && (
              <p className="muted small">
                Credit awards will begin when the clinic publishes its referral
                terms.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
export function Login() {
  const { signIn } = useAuthActions(),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [wait, setWait] = useState(0),
    [busy, setBusy] = useState(false);
  const [token] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("token"),
  );
  useEffect(() => {
    if (token) history.replaceState(null, "", "/login");
  }, [token]);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <div className="login-page">
      <Logo />
      <main className="login-card">
        <Leaf size={35} />
        <h1>
          {token
            ? "Your next step starts here."
            : sent
              ? "Check your email."
              : "Welcome back to you."}
        </h1>
        <p>
          {token
            ? "Open your portal securely."
            : sent
              ? "If that email is on file, a link is on its way. Check your inbox and spam folder."
              : "Your program, your progress, and your team. All in one place."}
        </p>
        {token ? (
          <Button
            onClick={async () => {
              try {
                await signIn("paubox", { code: token });
                window.location.assign('/');
              } catch {
                setError(
                  "This link has expired or was already used. Request a new link below.",
                );
              }
            }}
          >
            Open my portal <ArrowRight size={19} />
          </Button>
        ) : null}
        {(!token || error) && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await signIn("paubox", { email: email.trim().toLowerCase() });
              } catch {}
              setSent(true);
              setWait(30);
              setBusy(false);
            }}
          >
            <Field label="Your email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
            <button className="button" disabled={busy || wait > 0}>
              {busy
                ? "Sending…"
                : wait
                  ? `Resend in ${wait}s`
                  : sent
                    ? "Send another link"
                    : "Email me a sign-in link"}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <p className="muted small">
          No password to remember. Your link works once and expires in 15
          minutes.
        </p>
      </main>
      <span className="login-footer">
        Grounded Physical Therapy & Performance
      </span>
    </div>
  );
}
function DemoLogin() {
  return (
    <Empty title="You’re exploring a sample portal">
      <Link to="/" className="button">
        Return to the sample
      </Link>
    </Empty>
  );
}
export function ReferralForm() {
  const submit = useMutation(api.retention.refer),
    [done, setDone] = useState("");
  return (
    <div className="login-page">
      <Logo />
      <main className="login-card">
        <h1>Let’s get you back to you.</h1>
        <p>
          A friend thought we could help. Leave your details and the Grounded
          team will be in touch.
        </p>
        {done ? (
          <p role="status">{done}</p>
        ) : (
          <Form
            onSubmit={async (f) =>
              setDone(
                await submit({
                  token: location.pathname.split("/").at(-1)!,
                  name: String(f.get("name")),
                  contact: String(f.get("contact")),
                }),
              )
            }
          >
            <Field label="Your name">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Email or phone">
              <input name="contact" required maxLength={200} />
            </Field>
            <p className="small muted">
              By submitting, you’re asking Grounded to contact you about getting
              started.
            </p>
            <Button type="submit">
              Send my details <ArrowRight size={18} />
            </Button>
          </Form>
        )}
      </main>
    </div>
  );
}
