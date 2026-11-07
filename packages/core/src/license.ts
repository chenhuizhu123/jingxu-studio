// Offline-first commercial license gate.
//
// Two ways to use the product:
//   1. A 14-day local trial, recorded under the data root.
//   2. A signed license key ("JX1-…") minted by the publisher after payment.
//
// Keys are Ed25519-signed; only the public verification key ships in the app,
// so keys cannot be forged locally. A key may be lifetime or carry an expiry
// date, and may be bound to the machine id of this workstation.
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicKey,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPrivateKey,
} from "node:crypto";
import { AppError } from "./model";

export const TRIAL_DAYS = 14;

// Ed25519 SPKI public key. The matching private key is kept offline by the
// publisher and only used through scripts/license-mint.mjs.
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAnrnjPZHHscDU4dqdPppmqqOka+czGQpiQvF/nBh3QKk=
-----END PUBLIC KEY-----
`;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LicenseClaims = {
  email: string;
  plan: string;
  /** Inclusive last valid day, YYYY-MM-DD. Absent for a lifetime license. */
  until?: string;
  /** Machine id this key is locked to. Absent means it works on any machine. */
  machine?: string;
};

export type LicenseState = {
  /** When true, paid generation features must be refused. */
  blocked: boolean;
  status: "none" | "trial" | "active" | "expired";
  machineId: string;
  daysLeft?: number;
  reason?: "no-trial" | "trial-ended" | "license-expired" | "license-invalid";
  trial?: { startedAt: string; endsAt: string; daysLeft: number };
  license?: {
    email: string;
    plan: string;
    until?: string;
    machineBound: boolean;
    activatedAt: string;
  };
};

type StoredLicense = {
  key: string;
  claims: LicenseClaims;
  activatedAt: string;
};

type StoredTrial = { startedAt: string; lastSeenAt: string };

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Sign license claims with the offline private key. Used by the mint script. */
export function mintLicenseKey(
  privateKeyPem: string,
  claims: LicenseClaims,
): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8");
  const signature = cryptoSign(null, payload, createPrivateKey(privateKeyPem));
  return `JX1-${b64url(payload)}.${b64url(signature)}`;
}

export class LicenseGate {
  private externalValidUntil = 0;

  constructor(
    private root: string,
    private options: {
      now?: () => Date;
      publicKeyPem?: string;
      trialDays?: number;
    } = {},
  ) {}

  setExternalEntitledUntil(timestamp: number | null) {
    this.externalValidUntil = timestamp ?? 0;
  }

  private get trialDays() {
    return this.options.trialDays ?? TRIAL_DAYS;
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private file(name: string) {
    return join(this.root, name);
  }
  private readJson<T>(name: string): T | undefined {
    const path = this.file(name);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  }
  private writeJson(name: string, value: unknown) {
    writeFileSync(this.file(name), JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  }

  /** Stable random per-workstation id, used for machine-bound keys. */
  machineId(): string {
    const path = this.file(".machine-id");
    if (existsSync(path)) {
      const id = readFileSync(path, "utf8").trim();
      if (id) return id;
    }
    const id = randomUUID();
    writeFileSync(path, id, { mode: 0o600 });
    return id;
  }

  private verifyKey(key: string): LicenseClaims {
    const trimmed = key.replace(/\s+/g, "").replace(/^jx1-/i, "JX1-");
    const match = /^JX1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(trimmed);
    if (!match) throw new AppError(400, "许可证格式不正确，应以 JX1- 开头");
    const payload = b64urlDecode(match[1]);
    const signature = b64urlDecode(match[2]);
    let claims: LicenseClaims;
    try {
      claims = JSON.parse(payload.toString("utf8"));
    } catch {
      throw new AppError(400, "许可证内容无法识别");
    }
    if (
      !claims ||
      typeof claims.email !== "string" ||
      typeof claims.plan !== "string"
    )
      throw new AppError(400, "许可证内容不完整");
    let ok = false;
    try {
      ok = cryptoVerify(
        null,
        payload,
        createPublicKey(this.options.publicKeyPem ?? LICENSE_PUBLIC_KEY_PEM),
        signature,
      );
    } catch {
      ok = false;
    }
    if (!ok) throw new AppError(400, "许可证签名无效");
    if (claims.machine && claims.machine !== this.machineId())
      throw new AppError(400, "许可证绑定的是其他设备，无法在本机激活");
    if (claims.until && !/^\d{4}-\d{2}-\d{2}$/.test(claims.until))
      throw new AppError(400, "许可证到期日格式无效");
    if (claims.until && !Number.isNaN(Date.parse(claims.until))) {
      const end = new Date(`${claims.until}T23:59:59Z`);
      if (end.getTime() < this.now().getTime())
        throw new AppError(400, "许可证已到期");
    }
    return claims;
  }

  activate(key: string): LicenseState {
    const claims = this.verifyKey(key);
    const stored: StoredLicense = {
      key: key.replace(/\s+/g, ""),
      claims,
      activatedAt: this.now().toISOString(),
    };
    this.writeJson(".license.json", stored);
    return this.state();
  }

  deactivate(): LicenseState {
    if (existsSync(this.file(".license.json")))
      unlinkSync(this.file(".license.json"));
    return this.state();
  }

  startTrial(): LicenseState {
    if (existsSync(this.file(".license.json")) && this.readLicense())
      return this.state();
    if (!this.readJson<StoredTrial>(".trial.json")) {
      const iso = this.now().toISOString();
      this.writeJson(".trial.json", {
        startedAt: iso,
        lastSeenAt: iso,
      });
    }
    return this.state();
  }

  private readLicense(): StoredLicense | undefined {
    const stored = this.readJson<StoredLicense>(".license.json");
    if (!stored?.claims || !stored.key) return undefined;
    return stored;
  }

  /** Current entitlement. Also records the latest seen time for anti-rollback. */
  state(): LicenseState {
    const machineId = this.machineId();
    const base: LicenseState = {
      blocked: true,
      status: "none",
      machineId,
      reason: "no-trial",
    };

    const stored = this.readLicense();
    if (stored) {
      let claims: LicenseClaims | undefined;
      try {
        claims = this.verifyKey(stored.key);
      } catch (err) {
        return {
          ...base,
          status: "expired",
          reason: "license-invalid",
          daysLeft: 0,
          license: {
            email: stored.claims.email ?? "",
            plan: stored.claims.plan ?? "",
            until: stored.claims.until,
            machineBound: !!stored.claims.machine,
            activatedAt: stored.activatedAt,
          },
        };
      }
      const license = {
        email: claims.email,
        plan: claims.plan,
        until: claims.until,
        machineBound: !!claims.machine,
        activatedAt: stored.activatedAt,
      };
      if (!claims.until)
        return { blocked: false, status: "active", machineId, license };
      const end = new Date(`${claims.until}T23:59:59Z`).getTime();
      const daysLeft = Math.max(
        0,
        Math.ceil((end - this.now().getTime()) / DAY_MS),
      );
      if (daysLeft <= 0)
        return {
          ...base,
          status: "expired",
          reason: "license-expired",
          daysLeft: 0,
          license,
        };
      return { blocked: false, status: "active", machineId, daysLeft, license };
    }

    const trial = this.readJson<StoredTrial>(".trial.json");
    if (!trial) return base;

    const startedAt = Date.parse(trial.startedAt);
    let seen = Date.parse(trial.lastSeenAt);
    if (Number.isNaN(startedAt)) return base;
    let effectiveNow = this.now().getTime();
    // Clock moved backwards by more than an hour: keep advancing against the
    // last seen time so the trial cannot be extended by resetting the clock.
    if (effectiveNow < seen - 60 * 60 * 1000) effectiveNow = seen;
    if (effectiveNow > seen) {
      seen = effectiveNow;
      this.writeJson(".trial.json", {
        startedAt: trial.startedAt,
        lastSeenAt: new Date(seen).toISOString(),
      });
    }
    const endsAt = startedAt + this.trialDays * DAY_MS;
    const daysLeft = Math.max(0, Math.ceil((endsAt - effectiveNow) / DAY_MS));
    if (daysLeft <= 0)
      return {
        ...base,
        status: "expired",
        reason: "trial-ended",
        daysLeft: 0,
      };
    return {
      blocked: false,
      status: "trial",
      machineId,
      daysLeft,
      trial: {
        startedAt: trial.startedAt,
        endsAt: new Date(endsAt).toISOString(),
        daysLeft,
      },
    };
  }

  /** Refuse paid generation when the entitlement is exhausted. */
  assertActive() {
    if (this.now().getTime() < this.externalValidUntil) return;
    const s = this.state();
    if (!s.blocked) return;
    if (s.reason === "no-trial")
      throw new AppError(402, "请先开始 14 天试用或激活许可证");
    if (s.reason === "trial-ended")
      throw new AppError(
        402,
        "14 天试用已结束，激活许可证后可继续生成；本机作品仍可查看与导出",
      );
    if (s.reason === "license-invalid")
      throw new AppError(402, "当前许可证无法通过校验，请重新激活或联系支持");
    throw new AppError(402, "许可证已到期，请续期后继续使用");
  }
}
