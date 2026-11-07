import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const baseUrl = "https://test-api.creem.io/v1";
const mode = z.enum(["test", "sandbox"]);
const productIdSchema = z.string().regex(/^prod_[A-Za-z0-9]+$/);
const product = z.object({
  id: productIdSchema,
  mode,
  price: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  billing_type: z.enum(["onetime", "recurring"]),
  status: z.string(),
});
const checkout = z.object({
  id: z.string().min(1),
  mode,
  status: z.string(),
  product: z.union([productIdSchema, z.object({ id: productIdSchema })]),
  checkout_url: z.url(),
});
const license = z.object({
  mode,
  product_id: productIdSchema,
  status: z.string(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  instance: z.object({ id: z.string().min(1), status: z.string() }).nullish(),
});

export async function runCreemSandbox(
  command: string,
  env: NodeJS.ProcessEnv,
  request: typeof fetch = fetch,
) {
  if (
    !["product", "checkout", "activate", "validate", "deactivate"].includes(
      command,
    )
  )
    throw new Error(
      "Usage: node --import tsx scripts/creem-sandbox.ts [product|checkout|activate|validate|deactivate]",
    );
  const apiKey = env.CREEM_TEST_API_KEY?.trim();
  if (!apiKey)
    throw new Error("Set CREEM_TEST_API_KEY to a Test Mode API key.");
  const productId = productIdSchema.safeParse(
    env.CREEM_TEST_PRODUCT_ID?.trim(),
  );
  if (!productId.success)
    throw new Error("Set CREEM_TEST_PRODUCT_ID to a Test Mode product ID.");

  async function call<T>(path: string, schema: z.ZodType<T>, body?: object) {
    const response = await request(baseUrl + path, {
      method: body ? "POST" : "GET",
      headers: {
        "x-api-key": apiKey!,
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    }).catch(() => {
      throw new Error(
        "Cannot confirm the Creem sandbox request. For writes, check the dashboard before retrying.",
      );
    });
    if (!response.ok)
      throw new Error(
        `Creem sandbox ${path.split("/")[1]} returned HTTP ${response.status}.`,
      );
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new Error("Creem returned an unexpected sandbox response.");
    return parsed.data;
  }

  if (command === "product" || command === "checkout") {
    const info = await call(`/products/${productId.data}`, product);
    if (info.id !== productId.data)
      throw new Error("Creem returned a different product.");
    if (command === "product") return info;
    if (info.status !== "active")
      throw new Error(
        "The sandbox product must be active to create a checkout.",
      );
    const created = await call("/checkouts", checkout, {
      product_id: info.id,
      request_id: randomUUID(),
    });
    const selectedProduct =
      typeof created.product === "string"
        ? created.product
        : created.product.id;
    const url = new URL(created.checkout_url);
    if (
      selectedProduct !== info.id ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !(url.hostname === "creem.io" || url.hostname.endsWith(".creem.io"))
    )
      throw new Error("Creem returned an unexpected product or checkout URL.");
    return {
      id: created.id,
      mode: created.mode,
      status: created.status,
      checkoutUrl: url.href,
    };
  }

  const key = env.CREEM_TEST_LICENSE_KEY?.trim();
  if (!key || key.length > 256)
    throw new Error(
      "Set CREEM_TEST_LICENSE_KEY to the sandbox customer's license key.",
    );
  const instanceId = env.CREEM_TEST_INSTANCE_ID?.trim();
  if (command !== "activate" && !instanceId)
    throw new Error(
      "Set CREEM_TEST_INSTANCE_ID to the instance ID from activate.",
    );
  const verified = await call("/licenses/validate", license, {
    key,
    ...(command !== "activate" && { instance_id: instanceId }),
  });
  if (verified.product_id !== productId.data)
    throw new Error("This license is for a different product.");
  if (command !== "activate" && verified.instance?.id !== instanceId)
    throw new Error(
      "This license response does not match the requested instance.",
    );

  let result = verified;
  if (command === "activate") {
    result = await call("/licenses/activate", license, {
      key,
      instance_name: `Jingxu sandbox ${randomUUID()}`,
    });
    if (
      result.product_id !== productId.data ||
      result.status !== "active" ||
      result.instance?.status !== "active"
    )
      throw new Error(
        "Creem did not confirm an active instance for this product. Check the dashboard before retrying.",
      );
  }
  if (command === "deactivate") {
    result = await call("/licenses/deactivate", license, {
      key,
      instance_id: instanceId,
    });
    if (
      result.product_id !== productId.data ||
      (result.instance &&
        (result.instance.id !== instanceId ||
          result.instance.status === "active"))
    )
      throw new Error(
        "Creem did not confirm that the instance was deactivated.",
      );
  }
  return {
    mode: result.mode,
    status: result.status,
    expiresAt: result.expires_at,
    instanceId: result.instance?.id ?? instanceId,
    instanceStatus: result.instance?.status ?? null,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length > 3)
      throw new Error(
        "Supply only a sandbox command. Set secrets through environment variables.",
      );
    console.log(
      JSON.stringify(
        await runCreemSandbox(process.argv[2] ?? "product", process.env),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Creem sandbox check failed.",
    );
    process.exitCode = 1;
  }
}
