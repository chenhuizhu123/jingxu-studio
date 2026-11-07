import { resolve } from "node:path";
import { startServer } from "./app";
const instance = await startServer({
  root: process.env.JINGXU_DATA_DIR ?? resolve(".data"),
  port: Number(process.env.PORT ?? 4318),
  host: process.env.JINGXU_HOST ?? "127.0.0.1",
  studioRoot: resolve("dist/studio"),
  token: process.env.JINGXU_TOKEN,
  allowedOrigins: (process.env.JINGXU_ALLOWED_ORIGINS ?? "")
    .split(",")
    .filter(Boolean),
  billing: process.env.JINGXU_BILLING_API_URL
    ? {
        url: process.env.JINGXU_BILLING_API_URL,
        enforce: process.env.JINGXU_BILLING_ENFORCE === "1",
      }
    : undefined,
});
process.stdout.write(`镜序 Studio API: http://127.0.0.1:${instance.port}\n`);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.once(sig, () => void instance.close().then(() => process.exit(0)));
