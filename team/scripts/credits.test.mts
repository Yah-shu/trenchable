/** Kie credit balance: fetch/parse against a mocked fetch, plus the 60-second cache. */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.KIE_API_KEY = "test-key";
const { fetchKieCredits, kieProvider } = await import("../src/providers/kie.ts");
const { getModel } = await import("../src/config/models.config.ts");
const { getCreditBalance, resetCreditCache, CREDITS_TTL_MS } = await import("../src/lib/credits.ts");
const { KIE_CREDITS_URL, KIE_SIGNUP_URL, KIE_API_KEY_URL, KIE_REF } = await import("../src/lib/kie-links.ts");

type Captured = { url: string; init?: RequestInit };
function mockFetch(body: unknown, status = 200) {
  const captured: Captured[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return captured;
}

beforeEach(() => resetCreditCache());

test("links carry the referral code", () => {
  for (const url of [KIE_CREDITS_URL, KIE_SIGNUP_URL, KIE_API_KEY_URL]) assert.equal(new URL(url).searchParams.get("ref"), KIE_REF);
  assert.equal(new URL(KIE_API_KEY_URL).pathname, "/api-key");
});

test("fetchKieCredits calls the credit endpoint with the bearer key", async () => {
  const cap = mockFetch({ code: 200, msg: "success", data: 1234.5 });
  assert.equal(await fetchKieCredits(), 1234.5);
  assert.equal(cap[0].url, "https://api.kie.ai/api/v1/chat/credit");
  assert.equal((cap[0].init!.headers as Record<string, string>).Authorization, "Bearer test-key");
});

test("fetchKieCredits accepts a numeric string and rejects junk", async () => {
  mockFetch({ code: 200, msg: "success", data: "88" });
  assert.equal(await fetchKieCredits(), 88);
  mockFetch({ code: 200, msg: "success", data: null });
  await assert.rejects(fetchKieCredits());
  mockFetch({ code: 401, msg: "Unauthorized", data: null });
  await assert.rejects(fetchKieCredits(), /401/);
});

test("getCreditBalance returns the balance and top-up link, cached for 60s", async () => {
  let calls = 0;
  const fetcher = async () => ++calls * 100;
  assert.deepEqual(await getCreditBalance({ now: 0, fetcher }), { credits: 100, topUpUrl: KIE_CREDITS_URL });
  assert.deepEqual(await getCreditBalance({ now: CREDITS_TTL_MS - 1, fetcher }), { credits: 100, topUpUrl: KIE_CREDITS_URL });
  assert.equal(calls, 1);
  assert.equal((await getCreditBalance({ now: CREDITS_TTL_MS, fetcher })).credits, 200);
  assert.equal(calls, 2);
});

test("getCreditBalance gives null on failure and doesn't cache it", async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const failed = await getCreditBalance({ now: 0, fetcher: () => Promise.reject(new Error("down")) });
    assert.deepEqual(failed, { credits: null, topUpUrl: KIE_CREDITS_URL });
    assert.equal((await getCreditBalance({ now: 1, fetcher: async () => 5 })).credits, 5);
  } finally {
    console.warn = original;
  }
});

test("a finished Kie job reports the credits it charged", async () => {
  mockFetch({
    code: 200,
    msg: "success",
    data: { taskId: "t1", model: "m", state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie/out.mp4"] }), creditsConsumed: 12 },
  });
  const state = await kieProvider.poll(getModel("kling-3-std")!, "t1", "m");
  assert.equal(state.status, "completed");
  if (state.status === "completed") assert.equal(state.output.usage.credits, 12);
});
