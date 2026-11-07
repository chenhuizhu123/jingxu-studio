import { readFileSync } from "node:fs";
import { join } from "node:path";

// Begin the local trial once for the persistent e2e workspace so the
// first-run welcome and the paid-generation gate do not block the workflow
// under test. The pairing token authenticates the loopback request directly.
export default async function globalSetup() {
  const root = process.env.JINGXU_E2E_DATA_DIR ?? ".data-e2e";
  const port = process.env.PORT ?? "4321";
  let token = "";
  try {
    token = readFileSync(join(root, ".session-token"), "utf8").trim();
  } catch {
    // Token file is created during server startup; retried below.
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${port}/api/license/trial`, {
    method: "POST",
    headers,
  });
  if (!res.ok)
    throw new Error(`globalSetup: 无法开启试用工作区 (HTTP ${res.status})`);
}
