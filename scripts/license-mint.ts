#!/usr/bin/env node
// Mint a signed Jingxu Studio license key with the offline Ed25519 private key.
//
// Usage:
//   node --import tsx scripts/license-mint.ts \
//     --email buyer@example.com --plan pro --until 2027-11-06 \
//     [--machine <machine-id>] [--key /path/to/private.pem]
//
// Omit --until for a lifetime license. Omit --machine for a key that works on
// any device (not recommended for paid individual licenses).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mintLicenseKey } from "../packages/core/src/license";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = flag("email")?.trim();
const plan = flag("plan")?.trim() || "pro";
const until = flag("until")?.trim();
const machine = flag("machine")?.trim();
const keyPath =
  flag("key") ?? join(homedir(), ".config", "jingxu", "license-signing-key.pem");

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error(
    "Usage: --email buyer@example.com [--plan pro] [--until YYYY-MM-DD] [--machine id] [--key private.pem]",
  );
if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until))
  throw new Error("--until must be YYYY-MM-DD");

const pem = readFileSync(keyPath, "utf8");
const key = mintLicenseKey(pem, {
  email,
  plan,
  ...(until ? { until } : {}),
  ...(machine ? { machine } : {}),
});
process.stdout.write(key + "\n");
