import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { forPatient, audit, setting, scope } from "./access";
import { internal } from "./_generated/api";
import { priceVisible, patientCanSee } from '../src/proposal';
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const iso = (t?: number) => (t ? new Date(t).toISOString() : "Not yet");
/** PP-15: the plan of care PDF mirrors the presentation sections. */
function planLines(p: any) {
  const lines = [
    `Plan of care | Version ${p.version ?? 1} | Status: ${p.status.replaceAll("_", " ")}`,
    `What's going on: ${p.mainPain ?? ""}`,
    ...(p.findings ? [`What we found: ${p.findings}`] : []),
    `Your goal: ${p.goal}`,
    `Recommendation: ${p.weeks} weeks, ${p.visitsPerWeek ?? "?"} visits per week (${p.visits} visits)`,
    ...(p.why ? [`Why: ${p.why}`] : []),
    ...(p.programmingFocus ? [`Programming focus: ${p.programmingFocus}`] : []),
  ];
  for (const o of p.outcomes ?? [])
    lines.push(
      `Outcome: ${o.label}${o.target ? ` | ${o.measure}: ${o.target}` : ""} | Re-test week ${o.retestWeek}`,
    );
  for (const m of p.milestones ?? [])
    lines.push(`Milestone: ${m.label} | Week ${m.week}`);
  for (const ph of p.phases ?? [])
    lines.push(
      `Weeks ${ph.weekStart}-${ph.weekEnd}: ${ph.name} | ${ph.focus} | ${ph.visits} visits | Check: ${ph.milestone}`,
    );
  for (const item of p.included ?? []) lines.push(`Included: ${item}`);
  lines.push(
    `Plan price: ${usd(p.priceCents)}`,
    `Deposit credit: ${usd(p.depositCreditCents ?? 4850)}`,
  );
  if (p.paymentOption)
    lines.push(
      p.paymentOption === "installments"
        ? `Payment: 3 payments totaling ${usd(p.installmentTotalCents)}`
        : `Payment: paid in full`,
    );
  if (p.terms) lines.push(`Terms: ${p.terms}`);
  lines.push(
    `Patient accepted: ${iso(p.acceptedAt)}`,
    `PT signed: ${p.signedAt ? iso(p.signedAt) : "Awaiting PT signature"}`,
    `Signed by: ${p.signerName??p.signedBy??'Not yet signed'}`,
  );
  if(p.agreement){lines.push(`Care start: ${iso(p.agreement.startDate)}`);for(const [i,c] of p.agreement.charges.entries())lines.push(`Payment ${i+1}: ${usd(c.amountCents)} | ${i===0?'At acceptance':iso(c.dueAt)}`);}
  for (const r of p.revisions ?? [])
    lines.push(`Version ${r.version} | ${iso(r.at)} | ${r.authorName}: ${r.note}`);
  return lines;
}
export const authorizeFile = internalMutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const d = await ctx.db.get(id);
    if (!d) throw new Error("Document unavailable.");
    const a = await scope(
      ctx,
      d.patientId,
      d.staffOnly ? "clinical" : undefined,
    );
    if (d.planId) { const plan = await ctx.db.get(d.planId); if (!plan || !priceVisible(plan) || (!a.staff && !patientCanSee(plan))) throw new Error('Document unavailable.'); }
    await audit(ctx, a.userId, "download", "documents", id);
    return { fileId: d.fileId, name: d.name };
  },
});
export const download = action({
  args: { id: v.id("documents") },
  handler: async (ctx, args): Promise<{ bytes: ArrayBuffer; name: string }> => {
    const d = await ctx.runMutation(internal.documents.authorizeFile, args);
    const blob = await ctx.storage.get(d.fileId);
    if (!blob) throw new Error("Document unavailable.");
    return { bytes: await blob.arrayBuffer(), name: d.name };
  },
});
export const source = internalMutation({
  args: {
    patientId: v.id("patients"),
    kind: v.string(),
    planId: v.optional(v.id("plansOfCare")),
    snapshotKey:v.optional(v.string()),
  },
  handler: async (ctx, { patientId, kind, planId,snapshotKey }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient unavailable.");
    const lines: string[] = [`Patient: ${patient.name}`];
    if (kind === "chart_export")
      lines.push(`Patient record: ${JSON.stringify(patient)}`);
    let plans = (await forPatient(ctx, "plansOfCare", patientId)).filter(
      (p: any) => !planId || p._id === planId,
    );
    let documentState='unsigned';
    if(snapshotKey){const version=await ctx.db.query('planVersions').withIndex('by_key',q=>q.eq('key',snapshotKey)).unique();if(!version||version.patientId!==patientId||version.planId!==planId)throw new Error('Document version unavailable.');plans=[version.snapshot];documentState=version.state;}
    let version = 1;
    if (kind === "chart_export" || kind === "plan_pdf")
      for (const p of plans) {
        version = p.version ?? 1;
        lines.push(...planLines(p));
      }
    if (kind === "chart_export" || kind === "superbill")
      for (const n of await forPatient(ctx, "clinicalNotes", patientId)) {
        if (kind === "superbill" && !n.signedAt) continue;
        const author:any = await ctx.db.get(n.authorId);
        const appointment:any = n.appointmentId
          ? await ctx.db.get(n.appointmentId)
          : null;
        lines.push(
          `Author: ${author?.name ?? n.authorId}`,
          `Service date: ${appointment ? new Date(appointment.startsAt).toISOString() : "Not linked to a visit"}`,
        );
        await audit(ctx, "document_job", "export_read", "clinicalNotes", n._id);
        lines.push(
          `${n.kind} | ${n.signedAt ? new Date(n.signedAt).toISOString() : "Unsigned draft"}`,
          `ICD-10: ${n.icd10.join(", ")} | CPT: ${n.cpt.join(", ")}`,
        );
        for(const s of n.services??[])lines.push(`Service: ${s.date} | CPT ${s.code} | Modifiers: ${s.modifiers||'None'} | Units: ${s.units} | Unit fee: ${usd(s.feeCents)} | Total: ${usd(s.feeCents*s.units)}`);
        if(kind==='superbill'&&!n.services?.length)throw new Error('Complete structured service details before generating this superbill.');
        if (kind === "chart_export") {
          lines.push(
            `Subjective: ${n.subjective}`,
            `Objective: ${n.objective}`,
            `Assessment: ${n.assessment}`,
            `Plan: ${n.plan}`,
          );
          for (const a of n.addenda) {
            const addendumAuthor:any=await ctx.db.get(a.authorId);
            lines.push(
              `Addendum ${new Date(a.at).toISOString()} by ${addendumAuthor?.name??a.authorId}: ${a.body}`,
            );
          }
        }
      }
    if (kind === "chart_export") {
      for (const table of [
        "measurements",
        "visitSummaries",
        "programs",
        "appointments",
        "messages",
        "sessionLogs",
        "sessionAssignments",
        "payments",
        "memberships",
        "videoAssignments",
        "planVersions",
        "paymentAgreements",
      ])
        for (const r of await forPatient(ctx, table, patientId))
          lines.push(`${table}: ${JSON.stringify(r)}`);
    }
    if (kind === "receipt" || kind === "superbill")
      for (const p of await forPatient(ctx, "payments", patientId))
        lines.push(
          `${p.kind}: $${(p.amountCents / 100).toFixed(2)} | ${p.status} | ${new Date(p.at).toISOString().slice(0, 10)}`,
        );
    const clinic = await setting(ctx, "clinic", {});
    return {
      version,
      documentState,
      lines: [
        clinic.name ?? "Grounded",
        clinic.address ?? "",
        `Provider NPI: ${clinic.npi ?? "Not configured"} | Tax ID: ${clinic.taxId ?? "Not configured"}`,
        ...lines,
      ],
    };
  },
});
export const attach = internalMutation({
  args: {
    patientId: v.id("patients"),
    kind: v.string(),
    fileId: v.id("_storage"),
    name: v.string(),
    key: v.string(),
    planId:v.optional(v.id('plansOfCare')),
    planVersion:v.optional(v.number()),
    documentState:v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (
      await ctx.db
        .query("documents")
        .withIndex("by_key", (q) => q.eq("key", a.key))
        .unique()
    )
      return;
    await ctx.db.insert("documents", {
      patientId: a.patientId,
      kind: a.kind,
      fileId: a.fileId,
      name: a.name,
      at: Date.now(),
      staffOnly: a.kind === "chart_export",
      key: a.key,
      ...(a.planId?{planId:a.planId,planVersion:a.planVersion,documentState:a.documentState}:{}),
    });
  },
});
