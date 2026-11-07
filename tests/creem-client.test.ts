import { describe, expect, it, vi } from "vitest";
import {
  createCreemClient,
  CreemApiError,
  serverFromApiKey,
  verifyWebhookSignature,
} from "../apps/billing/src/creem";

const key = "creem_test_abc123XYZ";

function activeLicense(instance: unknown) {
  return {
    mode: "test",
    product_id: "prod_x",
    status: "active",
    expires_at: null,
    activation: 1,
    activation_limit: 1,
    instance,
  };
}

describe("createCreemClient", () => {
  it("根据密钥前缀选择服务器，并校验密钥格式", () => {
    expect(serverFromApiKey("creem_test_x")).toBe("test");
    expect(serverFromApiKey("creem_x")).toBe("prod");
    expect(() => createCreemClient({ apiKey: "nope" })).toThrow(/malformed/);
    expect(createCreemClient({ apiKey: key }).server).toBe("test");
  });

  it("创建结账会话并只接受 creem.io 的 https 链接", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: "ch_1",
        mode: "test",
        product: "prod_x",
        status: "pending",
        checkout_url: "https://creem.io/test/checkout/ch_1",
      }),
    );
    const client = createCreemClient({ apiKey: key, fetch: request });
    const checkout = await client.createCheckout({
      productId: "prod_x",
      requestId: "req_1",
      successUrl: "https://example.com/done",
    });
    expect(checkout).toEqual({
      id: "ch_1",
      status: "pending",
      checkoutUrl: "https://creem.io/test/checkout/ch_1",
    });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://test-api.creem.io/v1/checkouts");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "x-api-key": key },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      product_id: "prod_x",
      request_id: "req_1",
      success_url: "https://example.com/done",
    });

    request.mockResolvedValueOnce(
      Response.json({
        id: "ch_2",
        mode: "test",
        product: "prod_x",
        status: "pending",
        checkout_url: "https://evil.example.com/checkout",
      }),
    );
    await expect(
      createCreemClient({ apiKey: key, fetch: request }).createCheckout({
        productId: "prod_x",
        requestId: "req_2",
      }),
    ).rejects.toBeInstanceOf(CreemApiError);
  });

  it("激活时规范化授权码，兼容 instance 对象/数组/null", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          activeLicense({ id: "inst_1", name: "本机", status: "active" }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          activeLicense([
            { id: "inst_2", name: null, status: "active" },
            { id: "inst_other", name: null, status: "inactive" },
          ]),
        ),
      )
      .mockResolvedValueOnce(Response.json(activeLicense(null)));
    const client = createCreemClient({ apiKey: key, fetch: request });
    const a = await client.activate({
      key: "abcde-fghij-klmno-pqrst-uvwxy",
      instanceName: "dev",
    });
    expect(a.instance).toEqual({
      id: "inst_1",
      name: "本机",
      status: "active",
    });
    expect(a.activationLimit).toBe(1);
    const b = await client.validate({
      key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
      instanceId: "inst_2",
    });
    expect(b.instance?.id).toBe("inst_2");
    const c = await client.deactivate({
      key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
      instanceId: "inst_3",
    });
    expect(c.instance).toBeNull();
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).key).toBe(
      "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
    );
  });

  it("拒绝畸形授权码", async () => {
    const client = createCreemClient({ apiKey: key, fetch: vi.fn() });
    await expect(
      client.activate({ key: "BAD", instanceName: "dev" }),
    ).rejects.toThrow();
  });

  it("把上游错误码与网络故障映射为 CreemApiError", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: "x" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: "x" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: "x" }, { status: 500 }))
      .mockRejectedValueOnce(new TypeError("network down"));
    const client = createCreemClient({ apiKey: key, fetch: request });
    await expect(
      client.validate({
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "i",
      }),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      client.validate({
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "i",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      client.validate({
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "i",
      }),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      client.validate({
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceId: "i",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("上游返回意外结构时抛 502", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "weird" }));
    await expect(
      createCreemClient({ apiKey: key, fetch: request }).activate({
        key: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        instanceName: "dev",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("verifyWebhookSignature", () => {
  async function sign(secret: string, body: string) {
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

  it("接受正确签名，拒绝错误/畸形签名", async () => {
    const body = JSON.stringify({
      id: "evt_1",
      eventType: "checkout.completed",
    });
    const good = await sign("whsec", body);
    expect(await verifyWebhookSignature(body, good, "whsec")).toBe(true);
    expect(await verifyWebhookSignature(body, good, "wrong")).toBe(false);
    expect(await verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(await verifyWebhookSignature(body, "abc", "whsec")).toBe(false);
  });
});
