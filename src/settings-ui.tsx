import { useState } from "react";
import { usePortal } from "./store";
import { Field, Form, Button } from "./ui";
export function OperationalSettings() {
  const p = usePortal(),
    settings = p.adminData.settings;
  const get = (key: string, fallback: any) =>
    settings.find((s: any) => s.key === key)?.value ?? fallback;
  const [template, setTemplate] = useState("new_message");
  const thresholds = get("thresholds", {});
  return (
    <>
      <Form
        onSubmit={async (f) => {
          const value = Object.fromEntries(
            [
              "noLoginHours",
              "videoLateHours",
              "videoHardHours",
              "inactiveDays",
              "membershipDays",
              "adherence",
            ].map((k) => [k, Number(f.get(k))]),
          );
          await p.adminCommand("setting", { key: "thresholds", value });
        }}
      >
        <h2>Follow-up thresholds</h2>
        {[
          ["noLoginHours", "No sign-in (hours)", 24],
          ["videoLateHours", "Video overdue: watch (hours)", 24],
          ["videoHardHours", "Video overdue: at risk (hours)", 48],
          ["inactiveDays", "In-care inactivity (days)", 5],
          ["membershipDays", "Membership check-in after discharge (days)", 30],
          ["adherence", "Minimum weekly adherence (0 to 1)", 0.5],
        ].map(([name, label, defaultValue]) => (
          <Field key={name} label={String(label)}>
            <input
              name={String(name)}
              type="number"
              min="0"
              step={name === "adherence" ? ".05" : "1"}
              max={name === "adherence" ? "1" : undefined}
              defaultValue={thresholds[String(name)] ?? defaultValue}
              required
            />
          </Field>
        ))}
        <Button type="submit">Save thresholds</Button>
      </Form>
      <Form
        onSubmit={async (f) => {
          await p.adminCommand("setting", {
            key: "retentionYears",
            value: Number(f.get("years")),
          });
          await p.adminCommand("setting", {
            key: "referralWarningVisits",
            value: Number(f.get("visits")),
          });
        }}
      >
        <h2>Approved record rules</h2>
        <p>
          Enter the clinic’s legally reviewed values. Records are never
          automatically deleted.
        </p>
        <Field label="Record retention (years)">
          <input
            name="years"
            type="number"
            min="1"
            required
            defaultValue={get("retentionYears", "")}
          />
        </Field>
        <Field label="Warn before treatment without referral reaches this visit count">
          <input
            name="visits"
            type="number"
            min="1"
            required
            defaultValue={get("referralWarningVisits", "")}
          />
        </Field>
        <Button type="submit">Save approved rules</Button>
      </Form>
      <Form
        onSubmit={async (f) => {
          await p.adminCommand("setting", {
            key: "businessHours",
            value: {
              open: Number(f.get("open")),
              close: Number(f.get("close")),
              days: f.getAll("days").map(Number),
            },
          });
          await p.adminCommand("setting", {
            key: "holidays",
            value: String(f.get("holidays"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
      >
        <h2>Business calendar</h2>
        <p>Central time. Text-message quiet hours remain 8 p.m.–8 a.m.</p>
        <div className="form-grid">
          <Field label="Open hour (0–23)">
            <input
              name="open"
              type="number"
              min="0"
              max="23"
              required
              defaultValue={get("businessHours", { open: 8 }).open}
            />
          </Field>
          <Field label="Close hour (1–24)">
            <input
              name="close"
              type="number"
              min="1"
              max="24"
              required
              defaultValue={get("businessHours", { close: 17 }).close}
            />
          </Field>
        </div>
        <fieldset className="day-picker">
          <legend>Business days</legend>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
            (label, day) => (
              <label key={day}>
                <input
                  name="days"
                  type="checkbox"
                  value={day}
                  defaultChecked={get("businessHours", {
                    days: [1, 2, 3, 4, 5],
                  }).days.includes(day)}
                />
                <span>{label}</span>
              </label>
            ),
          )}
        </fieldset>
        <Field label="Closed dates (YYYY-MM-DD, separated by commas)">
          <textarea
            name="holidays"
            rows={3}
            defaultValue={get("holidays", []).join(", ")}
          />
        </Field>
        <Button type="submit">Save business calendar</Button>
      </Form>
      <Form
        onSubmit={async (f) =>
          p.adminCommand("setting", {
            key: "messageTemplates",
            value: {
              ...get("messageTemplates", {}),
              [template]: String(f.get("body")),
            },
          })
        }
      >
        <h2>Generic notification text</h2>
        <p>
          Use general portal language only. Never include a patient name,
          condition, exercise, or clinical detail. The portal link is added
          automatically.
        </p>
        <Field label="Notification">
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {[
              ["invite", "Portal invitation"],
              ["new_message", "New message"],
              ["plan_ready", "Plan ready"],
              ["appointment_reminder", "Appointment reminder"],
              ["video_reminder", "Video reminder"],
              ["review_request", "Review request"],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message text">
          <textarea
            key={template}
            name="body"
            rows={4}
            required
            maxLength={350}
            defaultValue={
              get("messageTemplates", {})[template] ??
              "There is an update in your Grounded portal."
            }
          />
        </Field>
        <Button type="submit">Save notification text</Button>
      </Form>
    </>
  );
}
