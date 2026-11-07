import { createServer, type IncomingMessage } from "node:http";
import { handleBillingRequest, type BillingEnv } from "./worker";
import { JsonlBillingStorage } from "./jsonl-storage";

// Local Node adapter for the edge handler. Shares CREEM_TEST_* env vars with
// scripts/creem-sandbox.ts so one .env.creem.test drives both.
const env: BillingEnv = {
  CREEM_API_KEY:
    process.env.CREEM_API_KEY?.trim() ||
    process.env.CREEM_TEST_API_KEY?.trim() ||
    "",
  CREEM_PRODUCT_ID:
    process.env.CREEM_PRODUCT_ID?.trim() ||
    process.env.CREEM_TEST_PRODUCT_ID?.trim() ||
    "",
  CREEM_WEBHOOK_SECRET:
    process.env.CREEM_WEBHOOK_SECRET?.trim() ||
    process.env.CREEM_TEST_WEBHOOK_SECRET?.trim() ||
    "",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "",
  CREEM_SUCCESS_URL: process.env.CREEM_SUCCESS_URL ?? "",
};
// Optional append-only order/event journal for local verification.
// BILLING_LEDGER_FILE=/path/to/billing-ledger.jsonl
const storage = process.env.BILLING_LEDGER_FILE?.trim()
  ? new JsonlBillingStorage(process.env.BILLING_LEDGER_FILE.trim())
  : undefined;

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const rawBody = await readRawBody(req);
    const host = req.headers.host ?? "127.0.0.1";
    const request = new Request(`http://${host}${req.url ?? "/"}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      ...(req.method && req.method !== "GET" && req.method !== "HEAD"
        ? { body: rawBody }
        : {}),
      // @ts-expect-error Node's dispatcher supports duplex for stream bodies.
      duplex: "half",
    });
    const response = await handleBillingRequest(request, env, { storage });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Local billing server failed." }));
    console.error(error);
  }
});

const port = Number(process.env.PORT ?? 8790);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Jingxu billing (local): http://127.0.0.1:${port} · mode=${
      env.CREEM_API_KEY.startsWith("creem_test_") ? "test" : "prod"
    }\n`,
  );
});
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.once(sig, () => server.close(() => process.exit(0)));
