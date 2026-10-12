import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { stripe } from "./payments";
const http = httpRouter();
auth.addHttpRoutes(http);
const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    if (body.length > 1_000_000)
      return new Response("Too large", { status: 413 });
    const signature = request.headers.get("stripe-signature") ?? "",
      parts = signature.split(","),
      timestamp = parts.find((p) => p.startsWith("t="))?.slice(2),
      hashes = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    if (
      !timestamp ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !process.env.STRIPE_WEBHOOK_SECRET
    )
      return new Response("Invalid signature", { status: 401 });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${timestamp}.${body}`),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (!hashes.some((h) => equal(h, signed)))
      return new Response("Invalid signature", { status: 401 });
    try {
      const payload = JSON.parse(body);
      await ctx.runMutation(internal.webhooks.receive, {
        provider: "stripe",
        key: `stripe:${payload.id}`,
        payload,
      });
      return new Response("Accepted");
    } catch {
      return new Response("Invalid event", { status: 400 });
    }
  }),
});
http.route({
  path: "/webhooks/ghl",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (
      !process.env.GHL_WORKFLOW_SECRET ||
      !equal(
        request.headers.get("authorization") ?? "",
        `Bearer ${process.env.GHL_WORKFLOW_SECRET}`,
      )
    )
      return new Response("Unauthorized", { status: 401 });
    const body = await request.text();
    if (body.length > 100_000)
      return new Response("Too large", { status: 413 });
    try {
      const payload = JSON.parse(body);
      if (
        payload.locationId !== process.env.GHL_LOCATION_ID ||
        !payload.eventId
      )
        return new Response("Invalid event", { status: 400 });
      await ctx.runMutation(internal.webhooks.receive, {
        provider: "ghl",
        key: `ghl:${payload.eventId}`,
        payload,
      });
      return new Response("Accepted");
    } catch {
      return new Response("Invalid event", { status: 400 });
    }
  }),
});
http.route({
  path: "/ghl/deposit",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    if (
      !process.env.GHL_WORKFLOW_SECRET ||
      !equal(
        request.headers.get("authorization") ?? "",
        `Bearer ${process.env.GHL_WORKFLOW_SECRET}`,
      )
    )
      return new Response("Unauthorized", { status: 401 });
    try {
      const x = await request.json();
      if (!x.contactId || !x.opportunityId || !x.requestId)
        return new Response("Missing identifiers", { status: 400 });
      const session = await stripe(
        "checkout/sessions",
        {
          mode: "payment",
          customer_creation: "always",
          customer_email: x.email,
          "phone_number_collection[enabled]": "true",
          success_url: `${process.env.SITE_URL}/login`,
          cancel_url: `${process.env.SITE_URL}/login`,
          "metadata[kind]": "deposit",
          "metadata[ghlContactId]": x.contactId,
          "metadata[ghlOpportunityId]": x.opportunityId,
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": "4850",
          "line_items[0][price_data][product_data][name]": "Grounded deposit",
          "line_items[0][quantity]": "1",
        },
        `deposit:${x.requestId}`,
      );
      // Workflow uses this response to send the link via its configured SMS action.
      return Response.json({ url: session.url });
    } catch {
      return new Response("Unable to create deposit checkout", { status: 503 });
    }
  }),
});
export default http;
