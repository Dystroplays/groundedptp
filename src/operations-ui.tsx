import { useState } from "react";
import { Plus, Check, FileText, ArrowRight } from "lucide-react";
import { usePortal } from "./store";
import { Button, Field, Form } from "./ui";
import { centralTimestamp, localDate } from "./domain";
export function ManualIntake() {
  const p = usePortal(),
    [saved, setSaved] = useState(false);
  if (!p.viewer.roles.some((r: string) => ["admin", "sdr"].includes(r)))
    return null;
  return (
    <details className="disclosure section">
      <summary>
        <Plus size={18} />
        Add a patient with a paid deposit
      </summary>
      <p className="muted small">
        Use this for a deposit collected outside the portal. Stripe deposits
        create the patient automatically.
      </p>
      <Form
        onSubmit={async (f) => {
          const date = String(f.get("date")),
            time = String(f.get("time")).split(":").map(Number);
          await p.adminCommand("intake", {
            name: String(f.get("name")),
            email: String(f.get("email")),
            phone: String(f.get("phone")),
            depositReference: String(f.get("reference")),
            adultConfirmed: f.get("adult") === "on",
            ...(date
              ? { evalAt: centralTimestamp(date, time[0] || 9, time[1] || 0) }
              : {}),
            ...(f.get("contactId")
              ? { ghlContactId: String(f.get("contactId")) }
              : {}),
            ...(f.get("opportunityId")
              ? { ghlOpportunityId: String(f.get("opportunityId")) }
              : {}),
          });
          setSaved(true);
        }}
      >
        <div className="form-grid">
          <Field label="Patient name">
            <input name="name" required />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" />
          </Field>
          <Field label="Paid $48.50 deposit reference">
            <input
              name="reference"
              required
              placeholder="Receipt or transaction reference"
            />
          </Field>
          <Field label="Evaluation date (optional)">
            <input name="date" type="date" />
          </Field>
          <Field label="Evaluation time (Central)">
            <input name="time" type="time" defaultValue="09:00" />
          </Field>
          <Field label="GHL contact ID (optional override)">
            <input name="contactId" />
          </Field>
          <Field label="GHL opportunity ID">
            <input name="opportunityId" />
          </Field>
        </div>
        <label className="choice">
          <input name="adult" type="checkbox" required />I confirm this patient
          is an adult and the non-refundable $48.50 deposit has been paid.
        </label>
        <Button type="submit">
          Create patient and send invite <ArrowRight size={17} />
        </Button>
      </Form>
      {saved && (
        <p className="notice success" role="status">
          Patient created. The integration queue will match the contact and send
          the invitation.
        </p>
      )}
    </details>
  );
}
export function CareControls() {
  const p = usePortal(),
    d = p.data,
    staff = p.dashboard?.staff ?? [],
    canAssign = p.viewer.roles.some((r: string) =>
      ["admin", "sdr", "closer"].includes(r),
    ),
    canBook = p.viewer.roles.some((r: string) => ["admin", "sdr"].includes(r));
  return (
    <section className="section">
      <h2>Care coordination</h2>
      {d.referralWarning && (
        <p className="notice error">
          This patient is approaching the configured physician-referral
          threshold. The PT should review the chart before further treatment.
        </p>
      )}
      {canAssign && (
        <Form
          onSubmit={async (f) =>
            p.adminCommand("operation", {
              patientId: d.patient._id,
              operation: "owners",
              payload: { ptId: f.get("ptId"), closerId: f.get("closerId") },
            })
          }
        >
          <div className="form-grid">
            <Field label="Assigned PT">
              <select name="ptId" defaultValue={d.patient.ptId ?? ""} required>
                <option value="">Choose a PT</option>
                {staff
                  .filter((s: any) => s.active && s.roles.includes("pt"))
                  .map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Assigned closer">
              <select
                name="closerId"
                defaultValue={d.patient.closerId ?? ""}
                required
              >
                <option value="">Choose a closer</option>
                {staff
                  .filter((s: any) => s.active && s.roles.includes("closer"))
                  .map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Button type="submit" className="outline">
            Save assignments <Check size={16} />
          </Button>
        </Form>
      )}
      {canBook &&
        d.appointments.map((a: any) => (
          <details className="disclosure section" key={a._id}>
            <summary>
              {a.kind === "eval" ? "Evaluation" : "Visit"} ·{" "}
              {localDate(a.startsAt)} · {a.status}
            </summary>
            <Form
              onSubmit={async (f) => {
                const time = String(f.get("time")).split(":").map(Number);
                await p.adminCommand("operation", {
                  patientId: d.patient._id,
                  operation: "appointment",
                  payload: {
                    id: a._id,
                    status: f.get("status"),
                    startsAt: centralTimestamp(
                      String(f.get("date")),
                      time[0],
                      time[1],
                    ),
                  },
                });
              }}
            >
              <div className="form-grid">
                <Field label="Date">
                  <input
                    name="date"
                    type="date"
                    defaultValue={localDate(a.startsAt)}
                    required
                  />
                </Field>
                <Field label="Time (Central)">
                  <input
                    name="time"
                    type="time"
                    defaultValue={new Intl.DateTimeFormat("en-GB", {
                      timeZone: "America/Chicago",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(a.startsAt)}
                    required
                  />
                </Field>
                <Field label="Visit status">
                  <select name="status" defaultValue={a.status}>
                    <option value="booked">Booked</option>
                    <option value="attended">Attended</option>
                    <option value="no_show">No-show</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </div>
              <Button type="submit" className="outline">
                Update in GHL
              </Button>
            </Form>
          </details>
        ))}
      <div className="button-row section">
        <Button
          className="outline"
          onClick={() =>
            p.adminCommand("operation", {
              patientId: d.patient._id,
              operation: "review_request",
              payload: {},
            })
          }
        >
          Send review request
        </Button>
        {p.viewer.roles.some((r: string) => ["admin", "pt"].includes(r)) && (
          <Button
            className="outline"
            onClick={() =>
              p.adminCommand("operation", {
                patientId: d.patient._id,
                operation: "superbill",
                payload: {},
              })
            }
          >
            <FileText size={17} />
            Generate superbill
          </Button>
        )}
      </div>
    </section>
  );
}
