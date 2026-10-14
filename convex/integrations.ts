"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { stripe } from "./payments";
import { renderDocument } from "./pdf";
import { nextTextTime } from "../src/domain";
import { assertRecipient } from './staging';
async function ghl(path: string, method: string, body?: any) {
  if (!process.env.GHL_ACCESS_TOKEN) throw new Error("GHL is not configured.");
  const r = await fetch(`https://services.leadconnectorhq.com/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_ACCESS_TOKEN}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`GHL request failed (${r.status}).`);
  return r.json();
}
export const run = internalAction({
  args: { id: v.id("integrationJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.runMutation(internal.jobs.claim, { id });
    if (!job) return;
    try {
      const data:any = await ctx.runQuery(internal.jobs.context, { id });
      const p = data.patient,
        x = job.payload;
      if (job.kind === "webhook")
        await ctx.runMutation(internal.webhooks.process, { id: x.eventId });
      else if (job.kind === "notification") {
        const d = data.delivery;
        if (!d || d.status === "cancelled" || d.status === "sent") {
          await ctx.runMutation(internal.jobs.finish, { id });
          return;
        }
        const messages: Record<string, string> = {
          invite: "Your Grounded portal is ready.",
          new_message: "You have a new message in your Grounded portal.",
          plan_ready: "There is an update in your Grounded portal.",
          appointment_reminder:
            "You have an upcoming Grounded appointment. Open your portal for details.",
          video_reminder: "You have a task waiting in your Grounded portal.",
          review_request:
            "We would appreciate your feedback. Open your Grounded portal to message the team.",
        };
        const message = `${data.templates[d.template] ?? messages[d.template] ?? "There is an update in your Grounded portal."} ${process.env.SITE_URL}`;
        if (d.channel === "sms") {
          assertRecipient('sms',p.phone);
          const deliveryTime = nextTextTime(Date.now());
          if (deliveryTime > Date.now() + 1000) {
            await ctx.runMutation(internal.jobs.defer, {
              id,
              nextAt: deliveryTime,
            });
            return;
          }
          if (!p.ghlContactId)
            throw new Error("Match the GHL contact before texting.");
          const contact = await ghl(`contacts/${p.ghlContactId}`, "GET");
          assertRecipient('sms',contact.contact?.phone??'');
          if(contact.contact?.dnd || contact.contact?.dndSettings?.SMS?.status){await ctx.runMutation(internal.webhooks.updateExternal,{table:'notificationDeliveries',id:d._id,data:{status:'suppressed'}});await ctx.runMutation(internal.jobs.finish,{id});return;}
          if (
            !contact.contact?.dnd &&
            !contact.contact?.dndSettings?.SMS?.status
          )
            await ghl("conversations/messages", "POST", {
              type: "SMS",
              contactId: p.ghlContactId,
              message,
            });
        } else {
          assertRecipient('email',p.email);
          const response = await fetch(process.env.PAUBOX_API_URL!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token token=${process.env.PAUBOX_API_KEY}`,
            },
            body: JSON.stringify({
              data: {
                message: {
                  recipients: [p.email],
                  headers: {
                    subject: "Your Grounded portal",
                    from: process.env.EMAIL_FROM,
                  },
                  content: { "text/plain": message },
                },
              },
            }),
          });
          if (!response.ok) throw new Error("Email delivery failed.");
        }
        await ctx.runMutation(internal.webhooks.updateExternal, {
          table: "notificationDeliveries",
          id: d._id,
          data: { status: "sent", sentAt: Date.now() },
        });
      } else if (job.kind === "payment_link_text") {
        assertRecipient('sms',p.phone);
        // GH-6: texts go through GHL; the link carries no clinical content.
        const deliveryTime = nextTextTime(Date.now());
        if (deliveryTime > Date.now() + 1000) {
          await ctx.runMutation(internal.jobs.defer, { id, nextAt: deliveryTime });
          return;
        }
        if (!p.ghlContactId)
          throw new Error("Match the GHL contact before texting.");
          const contact=await ghl(`contacts/${p.ghlContactId}`,'GET');
          assertRecipient('sms',contact.contact?.phone??'');
          if(contact.contact?.dnd||contact.contact?.dndSettings?.SMS?.status){await ctx.runMutation(internal.jobs.finish,{id});return;}
          const url=await ctx.runAction(internal.payments.deliveryCheckout,{agreementId:x.agreementId});
          if(!url){await ctx.runMutation(internal.jobs.finish,{id});return;}
        await ghl("conversations/messages", "POST", {
          type: "SMS",
          contactId: p.ghlContactId,
            message: `Your Grounded payment link is ready: ${url}`,
        });
      } else if (job.kind === "ghl_match") {
        let contactId = p.ghlContactId;
        if (!contactId) {
          const email = await ghl(
            `contacts/search/duplicate?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID!)}&email=${encodeURIComponent(p.email)}`,
            "GET",
          );
          contactId = email.contact?.id;
        }
        if (!contactId && p.phone) {
          const phone = await ghl(
            `contacts/search/duplicate?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID!)}&number=${encodeURIComponent(p.phone)}`,
            "GET",
          );
          contactId = phone.contact?.id;
        }
        if (!contactId)
          throw new Error(
            "No GHL contact match. Staff must provide the contact ID.",
          );
        await ctx.runMutation(internal.webhooks.updateExternal, {
          table: "patients",
          id: p._id,
          data: { ghlContactId: contactId },
        });
        if (x.evalAt) {
          if (!process.env.GHL_EVAL_CALENDAR_ID)
            throw new Error("Configure the evaluation calendar.");
          const existing = await ghl(
            `calendars/events?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID!)}&calendarId=${encodeURIComponent(process.env.GHL_EVAL_CALENDAR_ID)}&startTime=${x.evalAt - 60_000}&endTime=${x.evalAt + 3_600_000}`,
            "GET",
          );
          const appointment =
            existing.events?.find(
              (a: any) =>
                a.contactId === contactId &&
                Date.parse(a.startTime) === x.evalAt,
            ) ??
            (await ghl("calendars/events/appointments", "POST", {
              calendarId: process.env.GHL_EVAL_CALENDAR_ID,
              locationId: process.env.GHL_LOCATION_ID,
              contactId,
              startTime: new Date(x.evalAt).toISOString(),
              endTime: new Date(x.evalAt + 3_600_000).toISOString(),
              appointmentStatus: "confirmed",
              title: "Grounded appointment",
            }));
          const a = appointment.appointment ?? appointment;
          await ctx.runMutation(internal.webhooks.receive, {
            provider: "ghl",
            key: `manual-appointment:${job.key}`,
            payload: {
              appointment: {
                ...a,
                id: a.id,
                contactId,
                kind: "eval",
                startTime: new Date(x.evalAt).toISOString(),
                appointmentStatus: "confirmed",
              },
            },
          });
        }
      } else if (job.kind === "ghl_appointment_update") {
        const appointmentStatus = (
          {
            booked: "confirmed",
            attended: "showed",
            no_show: "noshow",
            cancelled: "cancelled",
          } as any
        )[x.status];
        await ghl(`calendars/events/appointments/${x.appointmentId}`, "PUT", {
          startTime: new Date(x.startsAt).toISOString(),
          appointmentStatus,
        });
        await ctx.runMutation(internal.webhooks.receive, {
          provider: "ghl",
          key: job.key,
          payload: {
            appointment: {
              id: x.appointmentId,
              contactId: p.ghlContactId,
              startTime: new Date(x.startsAt).toISOString(),
              appointmentStatus,
              dateUpdated: new Date().toISOString(),
            },
          },
        });
      } else if (job.kind === "ghl_stage") {
        if (p.ghlDesiredStage !== x.stage) {
          await ctx.runMutation(internal.jobs.finish, { id });
          return;
        }
        if (!p?.ghlOpportunityId) throw new Error("Match a GHL opportunity.");
        const stages = JSON.parse(process.env.GHL_STAGE_IDS ?? "{}");
        if (!stages[x.stage]) throw new Error("Configure GHL stage IDs.");
        await ghl(`opportunities/${p.ghlOpportunityId}`, "PUT", {
          pipelineId: process.env.GHL_PIPELINE_ID,
          pipelineStageId: stages[x.stage],
        });
      } else if (job.kind === "ghl_status") {
        if (!p?.ghlContactId || !process.env.GHL_STATUS_FIELD_ID)
          throw new Error("Configure the GHL contact and status field.");
        await ghl(`contacts/${p.ghlContactId}`, "PUT", {
          customFields: [
            {
              id: process.env.GHL_STATUS_FIELD_ID,
              field_value: (
                {
                  on_track: "On track",
                  watch: "Watch",
                  at_risk: "At risk",
                } as any
              )[p.status],
            },
          ],
        });
      } else if (job.kind === "referral_lead") {
        const field = x.contact.includes("@") ? "email" : "number";
        const duplicate = await ghl(
          `contacts/search/duplicate?locationId=${encodeURIComponent(process.env.GHL_LOCATION_ID!)}&${field}=${encodeURIComponent(x.contact)}`,
          "GET",
        );
        if (duplicate.contact) {
          // Retry-created contacts retain referral ownership; pre-existing contacts are ineligible.
          if (duplicate.contact.source !== `Grounded referral ${x.referralId}`)
            await ctx.runMutation(internal.retention.disqualify, {
              id: x.referralId,
            });
        } else
          await ghl("contacts/upsert", "POST", {
            locationId: process.env.GHL_LOCATION_ID,
            name: x.name,
            ...(x.contact.includes("@")
              ? { email: x.contact }
              : { phone: x.contact }),
            source: `Grounded referral ${x.referralId}`,
          });
      } else if (job.kind === "payment_method") {
        const intent = await stripe(
          `payment_intents/${x.paymentIntent}`,
          {},
          undefined,
          "GET",
        );
        if (!intent.payment_method || !p.stripeCustomerId)
          throw new Error("Saved payment method unavailable.");
        await stripe(
          `customers/${p.stripeCustomerId}`,
          { "invoice_settings[default_payment_method]": intent.payment_method },
          job.key,
        );
      } else if (job.kind === "installment") {
        const data:any = await ctx.runQuery(internal.webhooks.data, {
            patientId: p._id,
            id: x.scheduleId,
          }),
          s:any = data.record;
        if (s.status === "paid") {
          await ctx.runMutation(internal.jobs.finish, { id });
          return;
        }
        // Recover the provider object before creating anything on a delayed replay.
        const existing=s.stripeId?await stripe(`invoices/${s.stripeId}`,{},undefined,'GET'):
          (await stripe(`invoices?customer=${encodeURIComponent(p.stripeCustomerId)}&limit=100`,{},undefined,'GET')).data.find((i:any)=>i.metadata?.scheduleId===s._id);
        const invoice = existing??await stripe(
          "invoices",
          {
            customer: p.stripeCustomerId,
            collection_method: "charge_automatically",
            auto_advance: "false",
            "metadata[scheduleId]": s._id,
          },
          `${job.key}:invoice`,
        );
        await ctx.runMutation(internal.webhooks.updateExternal,{table:'installmentSchedules',id:s._id,data:{stripeId:invoice.id}});
        if(invoice.status==='draft'&&!invoice.lines?.data.some((line:any)=>line.metadata?.jobKey===job.key))await stripe(
          "invoiceitems",
          {
            customer: p.stripeCustomerId,
            invoice: invoice.id,
            amount: String(s.amountCents),
            currency: "usd",
            description: "Grounded services",
            "metadata[jobKey]":job.key,
          },
          `${job.key}:item`,
        );
        if(invoice.status==='draft')await stripe(
          `invoices/${invoice.id}/finalize`,
          { auto_advance: "true" },
          `${job.key}:finalize`,
        );
        await ctx.runMutation(internal.webhooks.updateExternal, {
          table: "installmentSchedules",
          id: s._id,
          data: { stripeId: invoice.id, status: invoice.status==='paid'?'paid':'invoiced' },
        });
      } else if (job.kind === "membership_authorize") {
        const setup = await stripe(
          `setup_intents/${x.setupIntent}`,
          {},
          undefined,
          "GET",
        );
        if (setup.status !== "succeeded")
          throw new Error("Authorization incomplete.");
        await ctx.runMutation(internal.webhooks.updateExternal, {
          table: "memberships",
          id: x.membershipId,
          data: { paymentMethodId: setup.payment_method, status: "enrolled" },
        });
        await ctx.runMutation(internal.webhooks.updateExternal, {
          table: "patients",
          id: p._id,
          data: { stripeCustomerId: x.customer },
        });
        if (p.stage === "discharged")
          await ctx.runMutation(internal.retention.activate, {
            patientId: p._id,
            membershipId: x.membershipId,
          });
      } else if (job.kind === "membership_start") {
        const data:any = await ctx.runQuery(internal.webhooks.data, {
            patientId: p._id,
            id: x.membershipId,
          }),
          m:any = data.record;
        if (m.stripeSubscriptionId) {
          await ctx.runMutation(internal.jobs.finish, { id });
          return;
        }
        if (p.stage !== "discharged" || !m.paymentMethodId)
          throw new Error("Discharge and payment authorization are required.");
        // A fixed first-invoice coupon applies only to this subscription, never customer balance.
        const credit = await ctx.runMutation(internal.payments.reserveCredit, {
          patientId: p._id,
          invoiceId: `first:${m._id}`,
          amount: m.priceCents,
        });
        const fields: Record<string, string> = {
          customer: p.stripeCustomerId,
          default_payment_method: m.paymentMethodId,
          "items[0][price_data][currency]": "usd",
          "items[0][price_data][product]":
            process.env.STRIPE_MEMBERSHIP_PRODUCT_ID!,
          "items[0][price_data][unit_amount]": String(m.priceCents),
          "items[0][price_data][recurring][interval]": "month",
          "metadata[membershipId]": m._id,
          payment_behavior: "default_incomplete",
        };
        if (credit) {
          const coupon = await stripe(
            "coupons",
            { duration: "once", amount_off: String(credit), currency: "usd" },
            `${job.key}:coupon`,
          );
          fields["discounts[0][coupon]"] = coupon.id;
        }
        const existing=(await stripe(`subscriptions?customer=${encodeURIComponent(p.stripeCustomerId)}&status=all&limit=100`,{},undefined,'GET')).data.find((s:any)=>s.metadata?.membershipId===m._id);
        const sub = existing??await stripe("subscriptions", fields, job.key);
        await ctx.runMutation(internal.retention.started, {
          patientId: p._id,
          id: m._id,
          subscriptionId: sub.id,
          status: sub.status === "active" ? "active" : "failed",
        });
      } else if (job.kind === "membership_credit") {
        const invoice = await stripe(
          `invoices/${x.invoiceId}`,
          {},
          undefined,
          "GET",
        );
        if (
          invoice.billing_reason !== "subscription_create" &&
          invoice.status === "draft"
        ) {
          const credit = await ctx.runMutation(
            internal.payments.reserveCredit,
            { patientId: p._id, invoiceId: x.invoiceId, amount: x.amount },
          );
          if (credit)
            await stripe(
              "invoiceitems",
              {
                customer: p.stripeCustomerId,
                invoice: x.invoiceId,
                amount: String(-credit),
                currency: "usd",
                description: "Membership referral credit",
              },
              job.key,
            );
        }
      } else if (job.kind === "document") {
        const record = await ctx.runMutation(internal.documents.source, {
          patientId: p._id,
          kind: x.kind,
          ...(x.planId ? { planId: x.planId } : {}),
          ...(x.snapshotKey?{snapshotKey:x.snapshotKey}:{}),
        });
        const bytes = await renderDocument(x.kind, p.name, record.lines),
          fileId = await ctx.storage.store(
            new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
          );
        await ctx.runMutation(internal.documents.attach, {
          patientId: p._id,
          kind: x.kind,
          fileId,
          name:
            x.kind === "plan_pdf"
              ? `Your plan of care${record.version > 1 ? ` (version ${record.version})` : ""}.pdf`
              : `Grounded ${x.kind.replaceAll("_", " ")}.pdf`,
          key: job.key,
          ...(x.planId?{planId:x.planId,planVersion:record.version,documentState:record.documentState}:{}),
        });
      } else throw new Error("Unsupported integration job.");
      await ctx.runMutation(internal.jobs.finish, { id });
    } catch (error) {
      await ctx.runMutation(internal.jobs.finish, {
        id,
        error: error instanceof Error ? error.message : "Provider request failed",
      });
    }
  },
});
