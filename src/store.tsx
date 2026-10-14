import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { createSample, sampleDashboard } from "./sample";
import { DAY, hasPain, localDate, installmentTotal } from "./domain";
import {
  DEPOSIT_CENTS,
  canTransition,
  declineReasons,
  investment,
  patientCanSee,
  priceVisible,
  proposalGaps,
  redactPrice,
} from "./proposal";
type Store = {
  demo: boolean;
  data: any;
  viewer: any;
  dashboard: any;
  selected: string | undefined;
  select: (id: string) => void;
  command: (operation: string, payload?: any) => Promise<any>;
  setStage: (stage: string) => void;
  switchRole: () => void;
  signOut: () => Promise<void>;
  fetchChart: () => Promise<any[]>;
  download: (id: string) => Promise<void>;
  checkout: (kind: string, id?: string, deliver?: "redirect" | "text") => Promise<void>;
  proposal: (operation: string, payload?: any) => Promise<any>;
  watchProposal: (view: ProposalView) => void;
  builder: any;
  presentation: any;
  adminData: any;
  adminCommand: (kind: string, args: any) => Promise<any>;
  error: string;
  clearError: () => void;
  metrics: any;
  cohort: "all" | "complete" | "incomplete";
  setCohort: (value: "all" | "complete" | "incomplete") => void;
};
type ProposalView = "builder" | "present" | null;
const Context = createContext<Store>(null!);
const latestOf = (plans: any[], statuses?: string[]) =>
  plans
    .filter((p) => !statuses || statuses.includes(p.status))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
export const usePortal = () => useContext(Context);
function downloadBlob(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const [cohort, setCohort] = useState<"all" | "complete" | "incomplete">(
    "all",
  );
  const [data, setData] = useState(createSample),
    [team, setTeam] = useState(false),
    [selected, select] = useState<string | undefined>("linda"),
    [error, setError] = useState("");
  const [adminData, setAdmin] = useState<any>({
    settings: [],
    videos: data.videos,
    quizzes: data.quizzes,
    sequences: [
      {
        _id: "seq1",
        name: "Before your first visit",
        active: true,
        items: data.videos.map((v: any, i: number) => ({
          videoId: v._id,
          dueOffsetDays: 3 - i,
        })),
      },
    ],
    exercises: data.exercises,
    templates: data.proposalTemplates,
    staff: sampleDashboard(data).staff,
    syncErrors: [],
    gates: { realPatients: false, care: false, retention: false },
  });
  const command = useCallback(
    async (operation: string, x: any = {}) => {
      const d = structuredClone(data),
        now = Date.now(),
        id = crypto.randomUUID();
      let result: any = null;
      const record = (table: string) => {
        const r = d[table].find((r: any) => r._id === x.id);
        if (!r) throw new Error("Record unavailable.");
        return r;
      };
      try {
      if(operation==='updateGoal'){d.patient.goal=x.goal;if(typeof x.mainPain==='string')d.patient.mainPain=x.mainPain;}
      else if (operation === "sendMessage" || operation === "requestVisit") {
          const body =
            operation === "requestVisit"
              ? "I would like to request a visit. Please help me find a time."
              : String(x.body).trim();
          if (!body) throw new Error("Write a message first.");
          d.messages.push({
            _id: id,
            patientId: d.patient._id,
            senderKind: team ? "staff" : "patient",
            senderName: team ? "Jimmy" : d.patient.name,
            body,
            at: now,
            painFlag: !team && hasPain(body),
          });
        } else if (
          operation === "startVideo" ||
          operation === "videoProgress"
        ) {
          const a = record("assignments");
          if (operation === "videoProgress") a.watchedSec = x.seconds;
        } else if (operation === "demoWatch") {
          const a = record("assignments");
          a.watchedSec = d.videos.find(
            (v: any) => v._id === a.videoId,
          ).durationSec;
          a.completedAt = now;
        } else if (operation === "quiz") {
          const a = record("assignments");
          if (!a.completedAt) throw new Error("Finish the sample video first.");
          result = {
            passed: x.answers.every((a: number) => a === 0),
            wrong: x.answers
              .map((a: number, i: number) =>
                a === 0 ? null : { index: i, jumpToSec: 30 },
              )
              .filter(Boolean),
          };
          if (result.passed) {
            a.quizPassedAt = now;
            const next = d.assignments.find(
              (n: any) => n.order === a.order + 1,
            );
            if (next) next.unlockedAt = now;
          }
        } else if (operation === "startSession") {
          const existing = d.sessionLogs.find(
            (s: any) => s.date === localDate(now),
          );
          if (existing) result = existing._id;
          else {
            const p = d.programs.find((p: any) => p.active);
            if (!p) throw new Error("No published program.");
            d.sessionLogs.push({
              _id: id,
              programId: p._id,
              programVersion: p.version,
              date: localDate(now),
              startedAt: now,
              doneItemIds: [],
            });
            result = id;
          }
        } else if (operation === "completeExercise") {
          const s = record("sessionLogs");
          s.doneItemIds = [...new Set([...s.doneItemIds, x.itemId])];
        } else if (operation === "finishSession") {
          const s = record("sessionLogs");
          s.feel = x.feel;
          s.note = x.note ?? "";
          s.completedAt = now;
        } else if (operation === "saveNote") {
          if (x.id) {
            const n = record("clinicalNotes");
            if (n.signedAt) throw new Error("Signed notes are locked.");
            Object.assign(n, x);
          } else
            d.clinicalNotes.push({
              _id: id,
              ...x,
              authorId: "jimmy",
              addenda: [],
            });
        } else if (operation === "signNote") {
          const n = record("clinicalNotes");
          if (n.signedAt) throw new Error("Already signed.");
          n.signedAt = now;
        } else if (operation === "addendum") {
          const n = record("clinicalNotes");
          if (!n.signedAt) throw new Error("Sign the note first.");
          n.addenda.push({ body: x.body, authorId: "jimmy", at: now });
        } else if (operation === "measurement")
          d.measurements.push({ _id: id, ...x, takenAt: now });
        else if (operation === "summary")
          d.visitSummaries.push({
            _id: id,
            body: x.body,
            authorId: "jimmy",
            at: now,
          });
        else if (operation === "publishProgram") {
          const version =
            Math.max(...d.programs.map((p: any) => p.version)) + 1;
          d.programs.forEach((p: any) => (p.active = false));
          d.programs.push({
            _id: id,
            version,
            active: true,
            publishedAt: now,
            items: x.items.map((i: any) => ({ ...i, id: crypto.randomUUID() })),
          });
        } else if (operation === "enrollMembership")
          throw new Error(
            "Set the membership price and approved terms, then connect Stripe to authorize payment.",
          );
        else if (operation === "discharge") {
          if (
            !d.clinicalNotes.some(
              (n: any) => n.kind === "discharge" && n.signedAt,
            )
          )
            throw new Error("Sign a discharge summary first.");
          d.patient.stage = "discharged";
          d.patient.dischargedAt = now;
        } else if (operation === "resolveSave") {
          const s = d.saves.find((s: any) => s._id === x.id);
          if (s && x.outcome !== "no_answer") s.doneAt = now;
        } else if (operation === "completeMilestone") {
          const plan = record("plansOfCare");
          (plan.outcomes ?? plan.milestones)[x.index].doneAt = now;
        }
        else if (operation === "confirmReview")
          d.patient.reviewConfirmedAt = now;
        else if (operation === "updateReferral")
          d.patient.physicianReferral = x.body;
        else if (operation === "exportChart")
          downloadBlob(
            JSON.stringify(
              {
                patient: d.patient,
                notes: d.clinicalNotes,
                plans: d.plansOfCare,
              },
              null,
              2,
            ),
            "sample-chart.json",
          );
        else if (operation === "revokeSessions")
          throw new Error(
            "Sample mode has no authenticated sessions to revoke.",
          );
        d.events.unshift({ _id: id, type: operation, at: now });
        setData(d);
        return result;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [data, team],
  );
  const [proposalView, watchProposal] = useState<ProposalView>(null);
  // Mirrors convex/proposals.ts so the sample shows the same gates and states.
  // Back-to-back steps (save, then produce) must see each other's writes.
  const latest = useRef(data);
  latest.current = data;
  const proposal = useCallback(
    async (operation: string, x: any = {}) => {
      const d = structuredClone(latest.current),
        now = Date.now();
      try {
        const plan = () => {
          const r = d.plansOfCare.find((r: any) => r._id === x.id);
          if (!r) throw new Error("Proposal unavailable.");
          return r;
        };
        const move = (r: any, to: any, fields: any = {}) => {
          if (!canTransition(r.status, to))
            throw new Error("This step is not available for the proposal right now.");
          Object.assign(r, { status: to, ...fields });
        };
        const log = (type: string) =>
          d.events.unshift({ _id: crypto.randomUUID(), type, at: now });
        let result: any = null;
        if (operation === 'updateOffer' || operation === 'approveInstallments') {
          const r=plan(); if(['accepted','completed'].includes(r.status))throw new Error('Accepted financial terms are locked.');
          if(operation==='updateOffer')Object.assign(r,{priceCents:x.priceCents,installmentTotalCents:installmentTotal(x.priceCents),startDate:x.startDate,installmentsApprovedBy:undefined});
          else r.installmentsApprovedBy='demo-closer';
          Object.assign(r,{offerVersion:(r.offerVersion??1)+1,termsAcceptedAt:undefined,paymentOption:undefined,priceRevealedAt:undefined,sentToPortalAt:undefined,status:r.status==='draft'?'draft':r.scopeConfirmedAt?'scope_confirmed':'produced'});
          log(operation==='updateOffer'?'offer_updated':'installments_approved');
        } else if (operation === "saveDraft") {
          const { id, ...fields } = x;
          fields.visits =
            fields.phases.reduce((n: number, p: any) => n + p.visits, 0) ||
            fields.weeks * fields.visitsPerWeek;
          fields.installmentTotalCents =
            fields.priceCents > 0 ? installmentTotal(fields.priceCents) : 0;
          const existing = id
            ? plan()
            : d.plansOfCare.find((p: any) => p.status === "draft");
          if (existing) {
            if (!["draft", "produced"].includes(existing.status))
              throw new Error("This proposal is locked. Start a new one or revise the signed plan.");
            if (existing.status === "produced" && proposalGaps(fields).length)
              throw new Error(`Before saving: ${proposalGaps(fields).join("; ")}.`);
            Object.assign(existing, fields);
            result = existing._id;
          } else {
            result = crypto.randomUUID();
            d.plansOfCare.push({
              _id: result,
              createdAt: now,
              patientId: d.patient._id,
              status: "draft",
              startDate: now,
              installments: false,
              depositCreditCents: DEPOSIT_CENTS,
              version: 1,
              revisions: [],
              ...fields,
            });
          }
          if (fields.goal) d.patient.goal = fields.goal;
          if (fields.mainPain) d.patient.mainPain = fields.mainPain;
        } else if (operation === "produce") {
          const r = plan(),
            gaps = proposalGaps(r);
          if (gaps.length) throw new Error(`Before Produce: ${gaps.join("; ")}.`);
          if (
            d.plansOfCare.some(
              (p: any) =>
                p._id !== r._id &&
                ["produced", "scope_confirmed", "price_revealed"].includes(p.status),
            )
          )
            throw new Error("Another proposal is being presented. Decline it before producing a new one.");
          move(r, "produced", { producedAt: now });
          log("proposal_produced");
        } else if (operation === "confirmScope") {
          move(plan(), "scope_confirmed", { scopeConfirmedAt: now });
          log("scope_confirmed");
        } else if (operation === "scopeQuestions") {
          if (plan().status !== "produced")
            throw new Error("Questions are recorded before the plan is confirmed.");
          log("scope_questions");
        } else if (operation === "revealPrice") {
          const r = plan();
          if (!r.scopeConfirmedAt)
            throw new Error("The patient must confirm the plan first.");
          move(r, "price_revealed", { priceRevealedAt: now });
          log("price_revealed");
        } else if (operation === "acceptTerms") {
          const r = plan();
          if (
            !(team
              ? ["price_revealed", "sent_to_portal"]
              : ["sent_to_portal"]
            ).includes(r.status)
          )
            throw new Error("This plan is not ready for acceptance.");
          if (!["full", "installments"].includes(x.option) || x.accepted !== true)
            throw new Error("Choose a payment option and accept the plan to continue.");
          if(x.option==='installments'&&!r.installmentsApprovedBy)throw new Error('A closer must approve installments for this proposal.');
          Object.assign(r, {
            paymentOption: x.option,
            installments: x.option === "installments",
            termsAcceptedAt: now,
          });
          result = { checkoutPlanId: r._id };
        } else if (operation === "decline") {
          if (!declineReasons.includes(x.reason)) throw new Error("Choose a reason.");
          move(plan(), "declined", {
            declinedAt: now,
            declineReason: x.reason,
            declineNote: x.note ?? "",
          });
          d.saves.push({
            _id: crypto.randomUUID(),
            patientId: d.patient._id,
            rule: "plan_declined",
            level: "watch",
            play: "Follow up on the plan of care",
            ownerRole: "closer",
            dueAt: now + DAY,
            attempts: [],
          });
          log("plan_declined");
        } else if (operation === "sendToPortal") {
          move(plan(), "sent_to_portal", { sentToPortalAt: now });
          log("proposal_sent_to_portal");
        } else if (operation === "sign") {
          const r = plan();
          if (!["accepted", "completed"].includes(r.status))
            throw new Error("Sign the plan of care after the patient accepts it.");
          if (r.signedAt) throw new Error("Plan already signed.");
          r.signedAt = now;
          log("plan_signed");
        } else if (operation === "revise") {
          const r = plan();
          if (!r.signedAt) throw new Error("Only a signed plan of care can be revised.");
          if (!String(x.note ?? "").trim()) throw new Error("Describe what changed.");
          const { id, note, ...fields } = x,
            gaps = proposalGaps({ ...r, ...fields });
          if (gaps.length) throw new Error(`Before saving: ${gaps.join("; ")}.`);
          const previous: any = {};
          for (const key of Object.keys(fields)) previous[key] = r[key];
          const version = (r.version ?? 1) + 1;
          Object.assign(r, fields, {
            version,
            signedAt: now,
            revisions: [
              ...(r.revisions ?? []),
              { version, at: now, authorName: "Jimmy", note: note.trim(), previous },
            ],
          });
          log("plan_revised");
        }
        latest.current = d;
        setData(d);
        return result;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [team],
  );
  const shown = latestOf(
    data.plansOfCare.filter((p: any) => p.status !== "draft"),
  );
  const builder = {
    patient: {
      name: data.patient.name,
      goal: data.patient.goal,
      mainPain: data.patient.mainPain ?? "",
    },
    templates: adminData.templates.filter((t: any) => t.active),
    proposal: latestOf(data.plansOfCare, [
      "draft",
      "produced",
      "scope_confirmed",
      "price_revealed",
      "declined",
      "sent_to_portal",
    ]),
    plan: latestOf(data.plansOfCare, ["accepted", "completed"]),
  };
  const presentation = {
    firstName: data.patient.name.split(" ")[0],
    ptName: "Jimmy",
    proposal: shown && redactPrice(shown),
    investment:
      shown && priceVisible(shown)
        ? investment(shown.priceCents, shown.depositCreditCents ?? DEPOSIT_CENTS)
        : null,
  };
  // Same visibility the Convex snapshot applies.
  const view = {
    ...data,
    plansOfCare: team
      ? data.plansOfCare.map(redactPrice)
      : data.plansOfCare.filter(patientCanSee),
  };
  const value: Store = {
    demo: true,
    data: view,
    proposal,
    watchProposal,
    builder: proposalView === "builder" ? builder : undefined,
    presentation: proposalView === "present" ? presentation : undefined,
    viewer: {
      name: team ? "Jimmy" : "Linda",
      roles: team ? ["admin", "pt", "closer", "sdr"] : ["patient"],
      patientId: "linda",
      staffId: team ? "jimmy" : undefined,
    },
    dashboard: sampleDashboard(data),
    selected,
    select,
    command,
    setStage: (stage) =>
      setData((d: any) => ({ ...d, patient: { ...d.patient, stage } })),
    switchRole: () => setTeam((t) => !t),
    signOut: async () => {
      setTeam(false);
    },
    fetchChart: async () => data.clinicalNotes,
    download: async () => {},
    checkout: async () => {
      const message =
        "Sample mode does not take payments. Connect Stripe test mode to try Checkout.";
      setError(message);
      throw new Error(message);
    },
    adminData,
    adminCommand: async (kind, args) => {
      if (kind === "intake") {
        setData((d: any) => ({
          ...d,
          extraPatients: [
            ...(d.extraPatients ?? []),
            {
              _id: crypto.randomUUID(),
              name: args.name,
              email: args.email,
              stage: "deposit_paid",
              status: "on_track",
            },
          ],
        }));
        return;
      }
      if (kind === "operation") {
        if (args.operation === "owners")
          setData((d: any) => ({
            ...d,
            patient: { ...d.patient, ...args.payload },
          }));
        else if (args.operation === "appointment")
          setData((d: any) => ({
            ...d,
            appointments: d.appointments.map((a: any) =>
              a._id === args.payload.id ? { ...a, ...args.payload } : a,
            ),
          }));
        else if (args.operation === "superbill")
          throw new Error(
            "Configure clinic billing details and connect Convex to generate a superbill.",
          );
        return;
      }
      if (kind === "setting") {
        setAdmin((a: any) => ({
          ...a,
          settings: [
            ...a.settings.filter((s: any) => s.key !== args.key),
            args,
          ],
        }));
        if (args.key === "membershipPriceCents")
          setData((d: any) => ({ ...d, membershipPrice: args.value }));
      } else if (kind === "catalog") {
        const key =
          ({ proposalTemplates: "templates" } as any)[args.table] ?? args.table;
        setAdmin((a: any) => ({
          ...a,
          [key]: [
            ...a[key].filter((r: any) => r._id !== args.id),
            { ...args.data, _id: args.id ?? crypto.randomUUID() },
          ],
        }));
      } else if (kind === "staff")
        setAdmin((a: any) => ({
          ...a,
          staff: [...a.staff, { ...args, _id: crypto.randomUUID() }],
        }));
    },
    error,
    clearError: () => setError(""),
    cohort,
    setCohort,
    metrics: {
      patients: 4,
      counts: {
        deposit_paid: 4,
        eval_attended: 3,
        plan_accepted: 2,
        session_completed: 4,
      },
      weeks: {},
      installmentShare: 0,
      proposals: {
        produced: 3,
        scopeConfirmRate: 2 / 3,
        acceptAfterRevealRate: 0.5,
        medianHoursToAccept: 0.4,
        declineReasons: { needs_to_talk_to_spouse: 1 },
      },
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function LiveProvider({ children }: { children: ReactNode }) {
  const [cohort, setCohort] = useState<"all" | "complete" | "incomplete">(
    "all",
  );
  const viewer = useQuery(api.portal.viewer),
    [selected, select] = useState<string | undefined>(),
    [error, setError] = useState("");
  const staff = viewer?.roles?.some((r: string) => r !== "patient");
  const data = useQuery(
    api.portal.snapshot,
    viewer && !viewer.presentationPatientId && (selected || viewer.patientId)
      ? { patientId: (selected ?? viewer.patientId) as any }
      : "skip",
  );
  const dashboard = useQuery(api.portal.dashboard, staff ? {} : "skip");
  const isAdmin = viewer?.roles?.includes("admin"),
    adminData = useQuery(api.admin.overview, isAdmin ? {} : "skip"),
    metrics = useQuery(api.admin.metrics, isAdmin ? { cohort } : "skip");
  const [proposalView, watchProposal] = useState<ProposalView>(null);
  const builder = useQuery(
      api.proposals.builder,
      proposalView === "builder" && selected ? { patientId: selected as any } : "skip",
    ),
    presentation = useQuery(
      api.proposals.presentation,
      proposalView === "present" && selected ? { patientId: selected as any } : "skip",
    ),
    proposalMutation = useMutation(api.proposals.act);
  const mutate = useMutation(api.portal.command),
    chart = useMutation(api.portal.chart),
    document = useAction(api.documents.download),
    checkoutAction = useAction(api.payments.checkout),
    cancelCheckout = useAction(api.payments.cancelCheckout),
    saveSetting = useMutation(api.admin.saveSetting),
    catalog = useMutation(api.admin.catalog),
    saveStaff = useMutation(api.admin.staff),
    staffPhotoUpload = useMutation(api.admin.staffPhotoUpload),
    saveStaffPhoto = useMutation(api.admin.saveStaffPhoto),
    replay = useMutation(api.admin.replay),
    intake = useMutation(api.operations.intake),
    operationUpdate = useMutation(api.operations.update);
  const { signOut } = useAuthActions();
  const value: Store = {
    demo: false,
    data,
    viewer,
    dashboard,
    selected,
    select,
    command: async (operation, payload = {}) => {
      try {
        return await (mutate as any)({
          patientId: selected ?? viewer?.patientId,
          operation,
          payload,
        });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    proposal: async (operation, payload = {}) => {
      try {
        if (['updateOffer','acceptTerms','approveInstallments'].includes(operation)) await cancelCheckout({patientId:(selected??viewer?.patientId) as any,planId:payload.id});
        return await (proposalMutation as any)({
          patientId: selected ?? viewer?.patientId,
          operation,
          payload,
        });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    watchProposal,
    builder,
    presentation,
    setStage: () => {},
    switchRole: () => {},
    signOut,
    fetchChart: () => chart({ patientId: (selected ?? viewer?.patientId) as any }),
    download: async (id) => {
      const file = await document({ id:id as any });
      const url = URL.createObjectURL(
        new Blob([file.bytes], { type: "application/pdf" }),
      );
      const link = window.document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    },
    checkout: async (kind, id, deliver = "redirect") => {
      const url = await (checkoutAction as any)({
        patientId: selected ?? viewer?.patientId,
        kind,
        id,
        deliver,
      });
      if (deliver === "redirect") window.location.assign(url);
    },
    adminData,
    adminCommand: async (kind, args) =>
      kind === 'staffPhoto' ? (async()=>{const url=await staffPhotoUpload({});const response=await fetch(url,{method:'POST',headers:{'Content-Type':args.file.type},body:args.file});if(!response.ok)throw new Error('Photo upload failed.');const {storageId}=await response.json();return saveStaffPhoto({staffId:args.staffId,storageId});})() : kind === "intake"
        ? intake(args)
        : kind === "operation"
          ? operationUpdate(args)
          : kind === "setting"
            ? saveSetting(args)
            : kind === "catalog"
              ? catalog(args)
              : kind === "staff"
                ? saveStaff(args)
                : replay(args),
    error,
    clearError: () => setError(""),
    metrics,
    cohort,
    setCohort,
  };
  if (viewer?.presentationPatientId) return <main className="standalone"><h1>Staff sign-in required</h1><p>This device is in patient presentation mode.</p><button onClick={async () => { await signOut(); window.location.assign('/login'); }}>Return to staff sign-in</button></main>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** No broad staff, patient snapshot, or administrator subscriptions on this client. */
export function PresentationProvider({ patientId, children }: { patientId: string; children: ReactNode }) {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const lock = useMutation(api.presentation.lock), act = useMutation(api.proposals.act), checkout = useAction(api.payments.checkout), cancelCheckout = useAction(api.payments.cancelCheckout);
  const { signOut } = useAuthActions();
  useEffect(() => {
    let active = true;
    setReady(false);
    lock({ patientId:patientId as any }).then(() => { if (active) setReady(true); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [patientId, lock]);
  const presentation = useQuery(api.proposals.presentation, ready ? { patientId:patientId as any } : 'skip');
  const unavailable = async (): Promise<never> => { throw new Error('Staff sign-in required'); };
  const value: Store = {
    demo: false, selected: patientId, select: () => {}, viewer: null, data: null, dashboard: null,
    builder: null, adminData: null, metrics: null, presentation, error, clearError: () => setError(''),
    watchProposal: () => {}, setStage: () => {}, switchRole: () => {}, signOut,
    cohort: 'all', setCohort: () => {}, command: unavailable, adminCommand: unavailable,
    fetchChart: unavailable, download: unavailable,
    proposal: async (operation, payload = {}) => {
      try { if(['acceptTerms','approveInstallments'].includes(operation)) await cancelCheckout({patientId:patientId as any,planId:payload.id}); return await (act as any)({ patientId, operation, payload }); }
      catch (e) { setError((e as Error).message); throw e; }
    },
    checkout: async (kind, id, deliver = 'redirect') => {
      try { const url = await (checkout as any)({ patientId, kind, id, deliver }); if (deliver === 'redirect') window.location.assign(url); }
      catch (e) { setError((e as Error).message); throw e; }
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
