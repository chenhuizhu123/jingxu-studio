import { z } from "zod";

// Web-standards only (fetch + WebCrypto) so the same code runs on Cloudflare
// Workers, other serverless runtimes and Node 18+. The merchant API key never
// leaves this service: desktop clients call the billing handler, not Creem.

export type CreemServer = "test" | "prod";

const baseUrls: Record<CreemServer, string> = {
  test: "https://test-api.creem.io/v1",
  prod: "https://api.creem.io/v1",
};

export function serverFromApiKey(apiKey: string): CreemServer {
  return apiKey.startsWith("creem_test_") ? "test" : "prod";
}

const licenseKeySchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/),
  );

const productIdSchema = z.string().regex(/^prod_[A-Za-z0-9]+$/);
const providerMode = z.enum(["test", "prod", "sandbox"]);

const rawInstanceSchema = z.union([
  z.object({
    id: z.string().min(1).max(128),
    name: z.string().nullish(),
    status: z.string(),
  }),
  z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        name: z.string().nullish(),
        status: z.string(),
      }),
    )
    .transform((instances) => instances[0] ?? null),
  z.null(),
]);

const rawLicenseSchema = z.object({
  mode: providerMode,
  product_id: productIdSchema,
  status: z.enum(["active", "inactive", "expired", "disabled"]),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  activation: z.number().int().nonnegative().optional(),
  activation_limit: z.number().int().nonnegative().nullable().optional(),
  instance: rawInstanceSchema.optional(),
});

export interface LicenseInstance {
  id: string;
  name: string;
  status: string;
}
export interface LicenseResult {
  productId: string;
  status: "active" | "inactive" | "expired" | "disabled";
  expiresAt: string | null;
  activation: number | null;
  activationLimit: number | null;
  instance: LicenseInstance | null;
}

function normalizeLicense(
  raw: z.infer<typeof rawLicenseSchema>,
): LicenseResult {
  const instance = raw.instance
    ? {
        id: raw.instance.id,
        name: raw.instance.name ?? "",
        status: raw.instance.status,
      }
    : null;
  return {
    productId: raw.product_id,
    status: raw.status,
    expiresAt: raw.expires_at,
    activation: raw.activation ?? null,
    activationLimit: raw.activation_limit ?? null,
    instance,
  };
}

export class CreemApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CreemClientOptions {
  apiKey: string;
  server?: CreemServer;
  fetch?: typeof fetch;
}

export function createCreemClient(options: CreemClientOptions) {
  if (!/^creem_(test_)?[A-Za-z0-9]+$/.test(options.apiKey))
    throw new Error("CREEM_API_KEY is missing or malformed.");
  const server = options.server ?? serverFromApiKey(options.apiKey);
  const request = options.fetch ?? fetch;
  const expectedMode = (mode: z.infer<typeof providerMode>) =>
    mode === server || (server === "test" && mode === "sandbox");

  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<T> {
    let response: Response;
    try {
      response = await request(baseUrls[server] + path, {
        method: body ? "POST" : "GET",
        headers: {
          "x-api-key": options.apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new CreemApiError(502, "无法连接 Creem，请稍后重试。");
    }
    if (!response.ok) {
      const invalidLicense =
        path === "/licenses/validate" &&
        [400, 404, 410, 422].includes(response.status);
      throw new CreemApiError(
        invalidLicense ? 422 : 502,
        `Creem returned HTTP ${response.status}.`,
      );
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new CreemApiError(502, "Creem returned an unexpected response.");
    return parsed.data;
  }

  async function licenseRequest(
    action: "activate" | "validate" | "deactivate",
    body: object,
  ) {
    const result = await call(`/licenses/${action}`, rawLicenseSchema, body);
    if (!expectedMode(result.mode))
      throw new CreemApiError(502, "Creem returned an unexpected environment.");
    return normalizeLicense(result);
  }

  return {
    server,
    async createCheckout(input: {
      productId: string;
      requestId: string;
      successUrl?: string;
    }): Promise<{ id: string; status: string; checkoutUrl: string }> {
      const created = await call(
        "/checkouts",
        z.object({
          id: z.string().min(1),
          mode: providerMode,
          product: z.union([
            productIdSchema,
            z.object({ id: productIdSchema }),
          ]),
          status: z.string(),
          checkout_url: z.url(),
        }),
        {
          product_id: input.productId,
          request_id: input.requestId,
          ...(input.successUrl ? { success_url: input.successUrl } : {}),
        },
      );
      const returnedProduct =
        typeof created.product === "string"
          ? created.product
          : created.product.id;
      if (!expectedMode(created.mode) || returnedProduct !== input.productId)
        throw new CreemApiError(
          502,
          "Creem returned an unexpected checkout product or environment.",
        );
      const url = new URL(created.checkout_url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !(url.hostname === "creem.io" || url.hostname.endsWith(".creem.io"))
      )
        throw new CreemApiError(
          502,
          "Creem returned an unexpected checkout URL.",
        );
      return { id: created.id, status: created.status, checkoutUrl: url.href };
    },
    async activate(input: { key: string; instanceName: string }) {
      return licenseRequest("activate", {
        key: licenseKeySchema.parse(input.key),
        instance_name: input.instanceName,
      });
    },
    async validate(input: { key: string; instanceId?: string }) {
      return licenseRequest("validate", {
        key: licenseKeySchema.parse(input.key),
        ...(input.instanceId ? { instance_id: input.instanceId } : {}),
      });
    },
    async deactivate(input: { key: string; instanceId: string }) {
      return licenseRequest("deactivate", {
        key: licenseKeySchema.parse(input.key),
        instance_id: input.instanceId,
      });
    },
  };
}

const encoder = new TextEncoder();
function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await subtle.sign("HMAC", key, encoder.encode(rawBody));
  return timingSafeEqualHex(toHex(digest), signature.toLowerCase());
}
