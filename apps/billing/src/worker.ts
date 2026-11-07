import { z } from "zod";
import {
  createCreemClient,
  CreemApiError,
  serverFromApiKey,
  verifyWebhookSignature,
} from "./creem";

// Single-file billing edge service. Deploy as a Cloudflare Worker / Vercel /
// Netlify function; `apps/billing/src/local-server.ts` runs the same handler
// on Node for local verification. Holds the merchant key and webhook secret.

export interface BillingEnv {
  CREEM_API_KEY: string;
  CREEM_PRODUCT_ID: string;
  CREEM_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  // Success URL the buyer returns to after checkout. Optional: without it
  // Creem shows the license key on the confirmation page.
  CREEM_SUCCESS_URL?: string;
  // Optional Cloudflare KV namespace binding named BILLING_KV. When present,
  // verified webhook events and paid orders are journaled idempotently for
  // support and reconciliation. The Node local adapter instead injects a
  // file-backed storage through BillingDeps.storage.
  BILLING_KV?: BillingKv;
}

export interface BillingDeps {
  fetch?: typeof fetch;
  storage?: BillingStorage;
}

// Minimal structural slice of a Cloudflare KV namespace.
export interface BillingKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface LedgerEvent {
  id: string;
  type: string;
  receivedAt: string;
}

export interface LedgerOrderKey {
  id: string;
  maskedKey: string;
  status: string;
  activationLimit: number | null;
  expiresAt: string | null;
}

export interface LedgerOrder {
  id: string;
  eventId: string;
  productId: string | null;
  customerEmail: string | null;
  status: string | null;
  amountPaid: number | null;
  currency: string | null;
  keys: LedgerOrderKey[];
  createdAt: string | null;
  recordedAt: string;
}

export interface BillingStorage {
  hasEvent(id: string): Promise<boolean>;
  putEvent(event: LedgerEvent): Promise<void>;
  hasOrder(id: string): Promise<boolean>;
  putOrder(order: LedgerOrder): Promise<void>;
}

export class KvBillingStorage implements BillingStorage {
  constructor(private readonly kv: BillingKv) {}
  async hasEvent(id: string) {
    return (await this.kv.get(`evt:${id}`)) !== null;
  }
  async putEvent(event: LedgerEvent) {
    await this.kv.put(`evt:${event.id}`, JSON.stringify(event));
  }
  async hasOrder(id: string) {
    return (await this.kv.get(`ord:${id}`)) !== null;
  }
  async putOrder(order: LedgerOrder) {
    await this.kv.put(`ord:${order.id}`, JSON.stringify(order));
  }
}

const productIdSchema = z.string().regex(/^prod_[A-Za-z0-9]+$/);
const instanceIdSchema = z.string().min(1).max(128);
const instanceNameSchema = z.string().trim().min(1).max(200);

const loopbackOrigin = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function json(body: unknown, status = 200, init: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...init },
  });
}
function corsHeaders(request: Request, env: BillingEnv): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && (loopbackOrigin.test(origin) || allowed.includes(origin)))
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  return {};
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

// Lenient, best-effort shape of checkout.completed `object` based on
// https://docs.creem.io/code/webhooks — unknown fields are dropped, and a
// payload without an order still acks so Creem does not retry forever.
const checkoutObjectSchema = z
  .object({
    id: z.string().min(1).optional(),
    status: z.string().optional(),
    order: z
      .object({
        id: z.string().min(1),
        status: z.string().nullish(),
        product: z.string().nullish(),
        amount_paid: z.number().nullish(),
        currency: z.string().nullish(),
        created_at: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    product: z.union([z.string(), z.object({ id: z.string() })]).optional(),
    customer: z.object({ email: z.string() }).passthrough().optional(),
    license_keys: z
      .array(
        z
          .object({
            id: z.string(),
            key: z.string(),
            status: z.string(),
            activation_limit: z.number().nullable().optional(),
            expires_at: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function normalizeOrder(
  eventId: string,
  object: z.infer<typeof checkoutObjectSchema>,
): LedgerOrder | null {
  const order = object.order;
  if (!order) return null;
  const checkoutProduct =
    typeof object.product === "string" ? object.product : object.product?.id;
  if (order.product && checkoutProduct && order.product !== checkoutProduct)
    return null;
  return {
    id: order.id,
    eventId,
    productId: order.product ?? checkoutProduct ?? null,
    customerEmail: object.customer?.email ?? null,
    status: order.status ?? null,
    amountPaid: order.amount_paid ?? null,
    currency: order.currency ?? null,
    keys: (object.license_keys ?? []).map((key) => ({
      id: key.id,
      maskedKey: `••••-${key.key.replace(/[^A-Za-z0-9]/g, "").slice(-5)}`,
      status: key.status,
      activationLimit: key.activation_limit ?? null,
      expiresAt: key.expires_at ?? null,
    })),
    createdAt: order.created_at ?? null,
    recordedAt: new Date().toISOString(),
  };
}

export async function handleBillingRequest(
  request: Request,
  env: BillingEnv,
  deps: BillingDeps = {},
): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz")
    return json(
      {
        ok: true,
        mode: env.CREEM_API_KEY ? serverFromApiKey(env.CREEM_API_KEY) : null,
      },
      200,
      cors,
    );

  try {
    if (
      !env.CREEM_API_KEY ||
      !productIdSchema.safeParse(env.CREEM_PRODUCT_ID).success
    )
      return json({ error: "Billing service is not configured." }, 503, cors);
    const creem = createCreemClient({
      apiKey: env.CREEM_API_KEY,
      fetch: deps.fetch,
    });

    if (request.method === "POST" && url.pathname === "/v1/checkout") {
      const checkout = await creem.createCheckout({
        productId: env.CREEM_PRODUCT_ID,
        requestId: crypto.randomUUID(),
        successUrl: env.CREEM_SUCCESS_URL || undefined,
      });
      return json(checkout, 200, cors);
    }

    if (request.method === "POST" && url.pathname.startsWith("/v1/licenses/")) {
      const action = url.pathname.slice("/v1/licenses/".length);
      if (!["activate", "validate", "deactivate"].includes(action))
        return json({ error: "Not found." }, 404, cors);
      const body = z
        .object({ key: z.string() })
        .passthrough()
        .safeParse(await readJson(request));
      if (!body.success) return json({ error: "请输入授权码。" }, 400, cors);
      const key = body.data.key;
      function assertProduct(productId: string) {
        if (productId !== env.CREEM_PRODUCT_ID)
          throw new CreemApiError(422, "授权码不属于镜序 Studio 商品。");
      }
      let result;
      if (action === "activate") {
        const parsed = z
          .object({ instanceName: instanceNameSchema })
          .safeParse(body.data);
        if (!parsed.success)
          return json({ error: "设备名称无效。" }, 400, cors);
        assertProduct((await creem.validate({ key })).productId);
        result = await creem.activate({
          key,
          instanceName: parsed.data.instanceName,
        });
      } else {
        const parsed = z
          .object({ instanceId: instanceIdSchema })
          .safeParse(body.data);
        if (!parsed.success)
          return json({ error: "缺少设备实例 ID。" }, 400, cors);
        const details = { key, instanceId: parsed.data.instanceId };
        result = await creem.validate(details);
        assertProduct(result.productId);
        if (action === "deactivate" && result.instance?.status === "active") {
          if (result.instance.id !== details.instanceId)
            throw new CreemApiError(422, "授权实例与本机不匹配。");
          result = await creem.deactivate(details);
        }
      }
      assertProduct(result.productId);
      return json(result, 200, cors);
    }

    if (request.method === "POST" && url.pathname === "/v1/webhooks/creem") {
      if (!env.CREEM_WEBHOOK_SECRET)
        return json({ error: "Webhook secret not configured." }, 503, cors);
      const rawBody = await request.text();
      const valid = await verifyWebhookSignature(
        rawBody,
        request.headers.get("creem-signature"),
        env.CREEM_WEBHOOK_SECRET,
      );
      if (!valid) return json({ error: "Invalid signature." }, 401, cors);
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return json({ error: "Malformed event." }, 400, cors);
      }
      const event = z
        .object({
          id: z.string().min(1),
          eventType: z.string().min(1),
          object: z.unknown().optional(),
        })
        .safeParse(payload);
      if (!event.success) return json({ error: "Malformed event." }, 400, cors);
      const storage =
        deps.storage ??
        (env.BILLING_KV ? new KvBillingStorage(env.BILLING_KV) : undefined);
      if (!storage && creem.server === "prod")
        return json({ error: "Billing ledger unavailable." }, 503, cors);
      const eventId = event.data.id;
      const eventType = event.data.eventType;
      let duplicate = false;
      try {
        duplicate = storage ? await storage.hasEvent(eventId) : false;
      } catch {
        return json({ error: "Billing ledger unavailable." }, 503, cors);
      }
      let order: LedgerOrder | null = null;
      let ignored = false;
      if (!duplicate && eventType === "checkout.completed") {
        const parsed = checkoutObjectSchema.safeParse(event.data.object);
        if (parsed.success) {
          const candidate = normalizeOrder(eventId, parsed.data);
          if (
            candidate?.productId !== env.CREEM_PRODUCT_ID ||
            candidate.status !== "paid"
          ) {
            // Another product on the same Creem account: ack, do not fulfill.
            ignored = true;
          } else {
            order = candidate;
          }
        }
      }
      if (storage && !duplicate) {
        try {
          if (order && !(await storage.hasOrder(order.id)))
            await storage.putOrder(order);
          await storage.putEvent({
            id: eventId,
            type: eventType,
            receivedAt: new Date().toISOString(),
          });
        } catch {
          // Acknowledge only after the order and event are durable. Creem
          // can replay a failed delivery without creating a second order.
          return json({ error: "Billing ledger unavailable." }, 503, cors);
        }
      }
      return json(
        {
          received: true,
          id: eventId,
          eventType,
          duplicate,
          ignored,
          orderId: order?.id ?? null,
          keyCount: order?.keys.length ?? null,
        },
        200,
        cors,
      );
    }

    return json({ error: "Not found." }, 404, cors);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: "授权码格式不正确。" }, 400, cors);
    if (error instanceof CreemApiError)
      return json({ error: error.message }, error.status, cors);
    return json({ error: "Billing service error." }, 500, cors);
  }
}

export default {
  fetch: (request: Request, env: BillingEnv) =>
    handleBillingRequest(request, env),
};
