import { expect, it, vi } from "vitest";
import { runCreemSandbox } from "../scripts/creem-sandbox";

const env = {
  CREEM_TEST_API_KEY: "merchant-test-fixture",
  CREEM_TEST_PRODUCT_ID: "prod_jingxu",
  CREEM_TEST_LICENSE_KEY: "customer-test-fixture",
  CREEM_TEST_INSTANCE_ID: "inst_jingxu",
};
const product = {
  id: env.CREEM_TEST_PRODUCT_ID,
  mode: "test",
  status: "active",
  price: 1000,
  currency: "USD",
  billing_type: "onetime",
};
const license = {
  mode: "test",
  product_id: product.id,
  key: env.CREEM_TEST_LICENSE_KEY,
  status: "active",
  expires_at: null,
  instance: { id: env.CREEM_TEST_INSTANCE_ID, status: "active" },
};

it("creates checkout only for the configured sandbox product and returns only the public session fields", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(Response.json(product)).mockResolvedValueOnce(
    Response.json({
      id: "ch_test",
      mode: "test",
      product: { id: product.id },
      status: "pending",
      checkout_url: "https://checkout.creem.io/ch_test",
      secret: env.CREEM_TEST_API_KEY,
    }),
  );
  await expect(runCreemSandbox("checkout", env, request)).resolves.toEqual({
    id: "ch_test",
    mode: "test",
    status: "pending",
    checkoutUrl: "https://checkout.creem.io/ch_test",
  });
  expect(request.mock.calls[0][0]).toBe(
    `https://test-api.creem.io/v1/products/${product.id}`,
  );
  expect(request.mock.calls[1][0]).toBe(
    "https://test-api.creem.io/v1/checkouts",
  );
  expect(request.mock.calls[1][1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { "x-api-key": env.CREEM_TEST_API_KEY },
  });
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
    product_id: product.id,
    request_id: expect.any(String),
  });
});

it("rejects production responses and redacts raw provider error bodies", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(Response.json({ ...product, mode: "prod" }));
  await expect(runCreemSandbox("checkout", env, request)).rejects.toThrow(
    "unexpected sandbox response",
  );
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(
    Response.json({ secret: env.CREEM_TEST_API_KEY }, { status: 401 }),
  );
  await expect(runCreemSandbox("product", env, request)).rejects.toThrow(
    /^Creem sandbox products returned HTTP 401\.$/,
  );
});

it("does not consume an activation for a license from another product", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ ...license, product_id: "prod_other" }),
    );
  await expect(runCreemSandbox("activate", env, request)).rejects.toThrow(
    "different product",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

it("activates, validates and deactivates a test instance without printing its license key", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ ...license, instance: null, status: "inactive" }),
    )
    .mockResolvedValueOnce(Response.json(license))
    .mockResolvedValueOnce(Response.json(license))
    .mockResolvedValueOnce(Response.json(license))
    .mockResolvedValueOnce(
      Response.json({
        ...license,
        instance: { ...license.instance, status: "inactive" },
      }),
    );
  const result = {
    mode: "test",
    status: "active",
    expiresAt: null,
    instanceId: env.CREEM_TEST_INSTANCE_ID,
    instanceStatus: "active",
  };
  await expect(runCreemSandbox("activate", env, request)).resolves.toEqual(
    result,
  );
  await expect(runCreemSandbox("validate", env, request)).resolves.toEqual(
    result,
  );
  await expect(runCreemSandbox("deactivate", env, request)).resolves.toEqual({
    ...result,
    instanceStatus: "inactive",
  });
  expect(
    request.mock.calls.map(([url]) => new URL(String(url)).pathname),
  ).toEqual([
    "/v1/licenses/validate",
    "/v1/licenses/activate",
    "/v1/licenses/validate",
    "/v1/licenses/validate",
    "/v1/licenses/deactivate",
  ]);
});
