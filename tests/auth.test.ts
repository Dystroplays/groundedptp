import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.stubEnv("SITE_URL", "https://portal.example.test");
  vi.stubEnv("PAUBOX_API_URL", "https://mail.example.test/messages");
  vi.stubEnv("PAUBOX_API_KEY", "test-only");
  vi.stubEnv("EMAIL_FROM", "hello@example.test");
  let emailed = "";
  const send = vi.fn(async (_url: any, init: any) => {
    emailed = JSON.parse(init.body).data.message.content["text/plain"];
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", send);
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("patients", {
      name: "Test",
      email: "known@example.test",
      phone: "",
      stage: "pre_visit",
      status: "on_track",
      goal: "",
      source: "test",
      depositAt: Date.now(),
      referralToken: "test",
    }),
  );
  return {
    t,
    send,
    token: () => decodeURIComponent(emailed.match(/#token=([^\s]+)/)![1]),
  };
}
describe("email authentication", () => {
  it('opens on another device without a verifier and consumes the link once',async()=>{
    vi.useFakeTimers();const {t,token}=await setup();
    const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const privateKey=new Uint8Array(await crypto.subtle.exportKey('pkcs8',keys.privateKey));
    const encoded=btoa(String.fromCharCode(...privateKey));
    vi.stubEnv('JWT_PRIVATE_KEY',`-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`);
    vi.stubEnv('CONVEX_SITE_URL','https://example.convex.site');
    await t.action(api.auth.signIn,{provider:'paubox',params:{email:'known@example.test'}});
    const code=token();
    await t.action(api.auth.signIn,{provider:'paubox',params:{code}});
    expect(await t.run(ctx=>ctx.db.query('authSessions').collect())).toHaveLength(1);
    await expect(t.action(api.auth.signIn,{provider:'paubox',params:{code}})).rejects.toThrow();
    expect(await t.run(ctx=>ctx.db.query('authSessions').collect())).toHaveLength(1);
  });
  it("returns the same request response for known and unknown emails", async () => {
    const { t, send } = await setup();
    const known = await t.action(api.auth.signIn, {
      provider: "paubox",
      params: { email: "known@example.test" },
    });
    const unknown = await t.action(api.auth.signIn, {
      provider: "paubox",
      params: { email: "unknown@example.test" },
    });
    expect(known).toEqual(unknown);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await t.run((ctx) => ctx.db.query("patients").collect()),
    ).toHaveLength(1);
  });
  it("resend throttling preserves the existing token and 15-minute expiry", async () => {
    const { t } = await setup();
    await t.action(api.auth.signIn, {
      provider: "paubox",
      params: { email: "known@example.test" },
    });
    const before = await t.run((ctx) =>
      ctx.db.query("authVerificationCodes").first(),
    );
    expect(before!.expirationTime - before!._creationTime).toBeGreaterThan(
      899000,
    );
    expect(before!.expirationTime - before!._creationTime).toBeLessThanOrEqual(
      900000,
    );
    await expect(
      t.action(api.auth.signIn, {
        provider: "paubox",
        params: { email: "known@example.test" },
      }),
    ).rejects.toThrow("wait");
    const after = await t.run((ctx) =>
      ctx.db.query("authVerificationCodes").first(),
    );
    expect(after!.code).toBe(before!.code);
  });
  it("rejects an expired token without creating a session", async () => {
    const { t, token } = await setup();
    await t.action(api.auth.signIn, {
      provider: "paubox",
      params: { email: "known@example.test" },
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60_000);
    await expect(
      t.action(api.auth.signIn, {
        provider: "paubox",
        params: { code: token() },
      }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query("authSessions").collect()),
    ).toHaveLength(0);
  });
});
