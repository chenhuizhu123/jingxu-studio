import { describe, expect, it, vi } from "vitest";
import {
  handleBillingRequest,
  type BillingEnv,
  type BillingStorage,
  type LedgerEvent,
  type LedgerOrder,
} from "../apps/billing/src/worker";

const env: BillingEnv = {
  CREEM_API_KEY: "creem_test_abc123XYZ",
  CREEM_PRODUCT_ID: "prod_jingxu",
  CREEM_WEBHOOK_SECRET: "whsec_test",
};

class MemoryStorage implements BillingStorage {
  readonly events = new Map<string, LedgerEvent>();
  readonly orders = new Map<string, LedgerOrder>();
  async hasEvent(id: string) {
    return this.events.has(id);
  }
  async putEvent(event: LedgerEvent) {
    this.events.set(event.id, event);
  }
  async hasOrder(id: string) {
    return this.orders.has(id);
  }
  async putOrder(order: LedgerOrder) {
    this.orders.set(order.id, order);
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request("http://127.0.0.1:8790" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("billing worker", () => {
  it("healthz 返回当前模式并处理 CORS 预检", async () => {
    const res = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/healthz", {
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "test" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );

    const preflight = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/v1/checkout", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("未配置商户环境时返回 503", async () => {
    const res = await handleBillingRequest(post("/v1/checkout", {}), {
      CREEM_API_KEY: "",
      CREEM_PRODUCT_ID: "",
    });
    expect(res.status).toBe(503);
  });

  it("创建结账会话", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "ch_1",
        mode: "test",
        product: "prod_jingxu",
        status: "pending",
        checkout_url: "https://creem.io/test/checkout/ch_1",
      }),
    );
    const res = await handleBillingRequest(post("/v1/checkout", {}), env, {
      fetch: fetchMock,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "ch_1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("激活/校验/解绑的参数校验与透传", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({
        mode: "test",
        product_id: "prod_jingxu",
        status: "active",
        expires_at: null,
        activation: 1,
        activation_limit: 1,
        instance: { id: "inst_1", name: "镜序", status: "active" },
      }),
    );
    const badKey = await handleBillingRequest(
      post("/v1/licenses/activate", { key: "BAD", instanceName: "dev" }),
      env,
      { fetch: fetchMock },
    );
    expect(badKey.status).toBe(400);
    const missingName = await handleBillingRequest(
      post("/v1/licenses/activate", { key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY" }),
      env,
      { fetch: fetchMock },
    );
    expect(missingName.status).toBe(400);

    const ok = await handleBillingRequest(
      post("/v1/licenses/activate", {
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceName: "dev",
      }),
      env,
      { fetch: fetchMock },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).instance.id).toBe("inst_1");

    const missingInstance = await handleBillingRequest(
      post("/v1/licenses/validate", { key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY" }),
      env,
      { fetch: fetchMock },
    );
    expect(missingInstance.status).toBe(400);

    const valid = await handleBillingRequest(
      post("/v1/licenses/validate", {
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "inst_1",
      }),
      env,
      { fetch: fetchMock },
    );
    expect(valid.status).toBe(200);

    const gone = await handleBillingRequest(
      post("/v1/licenses/unknown", { key: "x" }),
      env,
      { fetch: fetchMock },
    );
    expect(gone.status).toBe(404);

    const deactivated = await handleBillingRequest(
      post("/v1/licenses/deactivate", {
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "inst_1",
      }),
      env,
      { fetch: fetchMock },
    );
    expect(deactivated.status).toBe(200);
    expect(
      fetchMock.mock.calls.map(([u]) => new URL(String(u)).pathname),
    ).toEqual([
      "/v1/licenses/validate",
      "/v1/licenses/activate",
      "/v1/licenses/validate",
      "/v1/licenses/validate",
      "/v1/licenses/deactivate",
    ]);
  });

  it("拒绝同一 Creem 店铺的其他商品授权，避免消耗激活名额", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        mode: "test",
        product_id: "prod_other",
        status: "inactive",
        expires_at: null,
      }),
    );
    const response = await handleBillingRequest(
      post("/v1/licenses/activate", {
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceName: "dev",
      }),
      env,
      { fetch: fetchMock },
    );
    expect(response.status).toBe(422);
    expect(
      fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(["/v1/licenses/validate"]);
  });

  it("空 body 返回 400", async () => {
    const request = new Request("http://127.0.0.1:8790/v1/licenses/validate", {
      method: "POST",
      body: "not-json",
    });
    const res = await handleBillingRequest(request, env, {
      fetch: vi.fn(),
    });
    expect(res.status).toBe(400);
  });

  it("webhook 验签后确认事件", async () => {
    const body = JSON.stringify({
      id: "evt_1",
      eventType: "checkout.completed",
      object: { license_keys: [] },
    });
    const signature = await hmac("whsec_test", body);

    const ok = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/v1/webhooks/creem", {
        method: "POST",
        headers: { "creem-signature": signature },
        body,
      }),
      env,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ received: true, id: "evt_1" });

    const bad = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/v1/webhooks/creem", {
        method: "POST",
        headers: { "creem-signature": signature },
        body: body + " ",
      }),
      env,
    );
    expect(bad.status).toBe(401);

    const malformed = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/v1/webhooks/creem", {
        method: "POST",
        headers: { "creem-signature": await hmac("whsec_test", "nope") },
        body: "nope",
      }),
      env,
    );
    expect(malformed.status).toBe(400);

    const notConfigured = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/v1/webhooks/creem", {
        method: "POST",
        headers: { "creem-signature": signature },
        body,
      }),
      { ...env, CREEM_WEBHOOK_SECRET: "" },
    );
    expect(notConfigured.status).toBe(503);
  });

  it("未知路由返回 404", async () => {
    const res = await handleBillingRequest(
      new Request("http://127.0.0.1:8790/nope"),
      env,
    );
    expect(res.status).toBe(404);
  });
});

function paidCheckoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_paid_1",
    eventType: "checkout.completed",
    created_at: 1728734327412,
    object: {
      id: "ch_1",
      object: "checkout",
      status: "completed",
      order: {
        object: "order",
        id: "ord_1",
        customer: "cust_1",
        product: "prod_jingxu",
        amount: 9900,
        currency: "CNY",
        amount_paid: 9900,
        status: "paid",
        type: "one_time",
        created_at: "2026-11-06T03:00:00.000Z",
      },
      product: { id: "prod_jingxu", object: "product", name: "镜序桌面版" },
      customer: {
        id: "cust_1",
        object: "customer",
        email: "buyer@example.com",
      },
      license_keys: [
        {
          id: "lk_1",
          object: "license",
          product_id: "prod_jingxu",
          key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
          status: "inactive",
          activation: 0,
          activation_limit: 1,
          expires_at: null,
          created_at: "2026-11-06T03:00:00.000Z",
          instance: null,
        },
      ],
      ...overrides,
    },
  };
}

async function postSignedWebhook(
  payload: unknown,
  storage: BillingStorage | undefined,
) {
  const body = JSON.stringify(payload);
  return handleBillingRequest(
    new Request("http://127.0.0.1:8790/v1/webhooks/creem", {
      method: "POST",
      headers: { "creem-signature": await hmac("whsec_test", body) },
      body,
    }),
    env,
    storage ? { storage } : {},
  );
}

describe("billing webhook 订单台账", () => {
  it("付款事件幂等记录订单与授权码", async () => {
    const storage = new MemoryStorage();
    const first = await postSignedWebhook(paidCheckoutEvent(), storage);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      received: true,
      duplicate: false,
      ignored: false,
      orderId: "ord_1",
      keyCount: 1,
    });

    const order = storage.orders.get("ord_1")!;
    expect(order).toMatchObject({
      eventId: "evt_paid_1",
      productId: "prod_jingxu",
      customerEmail: "buyer@example.com",
      status: "paid",
      amountPaid: 9900,
      currency: "CNY",
    });
    expect(order.keys[0]).toMatchObject({
      id: "lk_1",
      maskedKey: "••••-UVWXY",
      status: "inactive",
      activationLimit: 1,
      expiresAt: null,
    });
    expect(JSON.stringify(order)).not.toContain("ABCDE-FGHIJ");

    // Creem retries the same event: acked as duplicate, nothing rewritten.
    const repeat = await postSignedWebhook(paidCheckoutEvent(), storage);
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({
      received: true,
      duplicate: true,
      orderId: null,
      keyCount: null,
    });
    expect(storage.events.size).toBe(1);
    expect(storage.orders.size).toBe(1);
  });

  it("其他商品的事件只登记不落订单", async () => {
    const storage = new MemoryStorage();
    const res = await postSignedWebhook(
      paidCheckoutEvent({
        order: {
          ...(paidCheckoutEvent().object as any).order,
          id: "ord_other",
          product: "prod_someone_else",
        },
        product: { id: "prod_someone_else" },
        id: "ch_other",
      }),
      storage,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ignored: true,
      orderId: null,
    });
    expect(storage.orders.size).toBe(0);
    expect(storage.events.has("evt_paid_1")).toBe(true);
  });

  it("非结账事件只做事件去重登记", async () => {
    const storage = new MemoryStorage();
    const res = await postSignedWebhook(
      { id: "evt_sub_1", eventType: "subscription.paid", object: {} },
      storage,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "evt_sub_1",
      orderId: null,
      keyCount: null,
    });
    expect(storage.events.has("evt_sub_1")).toBe(true);
    expect(storage.orders.size).toBe(0);
  });

  it("订单入账后事件存储故障返回可重试错误，恢复后只保留一份订单", async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "putEvent").mockRejectedValueOnce(new Error("kv down"));
    const res = await postSignedWebhook(paidCheckoutEvent(), storage);
    expect(res.status).toBe(503);
    expect(storage.orders.size).toBe(1);
    expect(storage.events.size).toBe(0);
    const retry = await postSignedWebhook(paidCheckoutEvent(), storage);
    expect(retry.status).toBe(200);
    expect(storage.orders.size).toBe(1);
    expect(storage.events.size).toBe(1);
  });
});

async function hmac(secret: string, body: string) {
  const digest = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
