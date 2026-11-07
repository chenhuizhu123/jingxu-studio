import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink, rename } from "node:fs/promises";

// Desktop-side license manager. The merchant key lives in the billing edge
// service; this client only holds the customer license key + instance ID in a
// 0600 file inside the local workspace. Creem license status is the source of
// truth, with a short offline grace so a network blip never locks a creator
// out of their projects.

export type LicenseStatus = "active" | "inactive" | "expired" | "disabled";

export interface BillingConfig {
  url: string;
  enforce: boolean;
}

interface StoredLicense {
  key: string;
  instanceId: string;
  instanceName: string;
  status: LicenseStatus;
  expiresAt: string | null;
  activationLimit: number | null;
  activation: number | null;
  validatedAt: string;
  lastActiveAt: string | null;
}

export interface LicenseState {
  maskedKey: string;
  status: LicenseStatus;
  instanceId: string;
  instanceName: string;
  expiresAt: string | null;
  activationLimit: number | null;
  activation: number | null;
  validatedAt: string | null;
  offline: boolean;
  validUntil: number | null;
}
export interface LicenseView {
  configured: boolean;
  enforce: boolean;
  license: LicenseState | null;
}

const licenseResultSchema = z.object({
  status: z.enum(["active", "inactive", "expired", "disabled"]),
  expiresAt: z.string().nullable(),
  activation: z.number().int().nullable(),
  activationLimit: z.number().int().nullable(),
  instance: z
    .object({ id: z.string().min(1), name: z.string(), status: z.string() })
    .nullable(),
});

const offlineGraceMs = 14 * 24 * 60 * 60 * 1000;

export function maskLicenseKey(key: string) {
  const tail = key
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(-5);
  return `••••-${tail}`;
}

export class LicenseError extends Error {
  constructor(
    message: string,
    readonly unavailable = false,
    readonly rejected = false,
  ) {
    super(message);
  }
}

export interface LicensingDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

export class Licensing {
  private fetch: typeof fetch;
  private now: () => Date;
  private pending: Promise<unknown> = Promise.resolve();
  private offline = false;
  readonly configured: boolean;

  constructor(
    private config: BillingConfig | undefined,
    private stateFile: string,
    deps: LicensingDeps = {},
  ) {
    this.fetch = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.configured = !!config?.url;
  }

  private requireConfig(): BillingConfig {
    if (!this.config) throw new LicenseError("当前版本未启用在线授权。");
    return this.config;
  }

  private async load(): Promise<StoredLicense | null> {
    try {
      const parsed = z
        .object({
          key: z.string().min(1),
          instanceId: z.string().min(1),
          instanceName: z.string().min(1),
          status: z.enum(["active", "inactive", "expired", "disabled"]),
          expiresAt: z.string().nullable(),
          activationLimit: z.number().int().nullable(),
          activation: z.number().int().nullable(),
          validatedAt: z.string(),
          lastActiveAt: z.string().nullable(),
        })
        .safeParse(JSON.parse(await readFile(this.stateFile, "utf8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async save(license: StoredLicense) {
    const temp = `${this.stateFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(license, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temp, this.stateFile);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }

  private exclusively<T>(operation: () => Promise<T>) {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => {});
    return next;
  }

  private toState(stored: StoredLicense): LicenseState {
    const { key, lastActiveAt, ...rest } = stored;
    const now = this.now().getTime();
    const lastActive = Date.parse(lastActiveAt ?? "");
    const validUntil = Math.min(
      lastActive + offlineGraceMs,
      stored.expiresAt === null ? Infinity : Date.parse(stored.expiresAt),
    );
    const active =
      stored.status === "active" && lastActive <= now && now < validUntil;
    return {
      ...rest,
      status: stored.status === "active" && !active ? "expired" : stored.status,
      maskedKey: maskLicenseKey(key),
      offline: active && this.offline,
      validUntil: active ? validUntil : null,
    };
  }

  async view(): Promise<LicenseView> {
    const stored = await this.load();
    return {
      configured: this.configured,
      enforce: this.config?.enforce ?? false,
      license: stored && this.configured ? this.toState(stored) : null,
    };
  }

  private async post<T>(path: string, body: object, schema: z.ZodType<T>) {
    const config = this.requireConfig();
    let response: Response;
    try {
      response = await this.fetch(`${config.url.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new LicenseError("无法连接授权服务，请检查网络后重试。", true);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new LicenseError(
        data?.error
          ? String(data.error)
          : `授权服务返回 HTTP ${response.status}。`,
        response.status >= 500 || response.status === 429,
        path === "/v1/licenses/validate" && response.status === 422,
      );
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new LicenseError("授权服务返回了意外的响应。");
    return parsed.data;
  }

  async checkout(): Promise<string> {
    const result = await this.post(
      "/v1/checkout",
      {},
      z.object({
        id: z.string().min(1),
        status: z.string(),
        checkoutUrl: z.url(),
      }),
    );
    return result.checkoutUrl;
  }

  activate(key: string, instanceName: string): Promise<LicenseState> {
    return this.exclusively(() => this.activateStored(key, instanceName));
  }

  private async activateStored(
    key: string,
    instanceName: string,
  ): Promise<LicenseState> {
    const normalizedKey = key.trim().toUpperCase().replace(/\s+/g, "");
    const existing = await this.load();
    if (existing?.key === normalizedKey) return this.validateStored(existing);
    if (existing) throw new LicenseError("请先解绑这台设备已有的在线授权。");
    const result = await this.post(
      "/v1/licenses/activate",
      { key: normalizedKey, instanceName },
      licenseResultSchema,
    );
    if (
      result.status !== "active" ||
      !result.instance ||
      result.instance.status !== "active"
    )
      throw new LicenseError("授权未激活，请确认授权码状态后重试。");
    const timestamp = this.now().toISOString();
    const stored: StoredLicense = {
      key: normalizedKey,
      instanceId: result.instance.id,
      instanceName: result.instance.name || instanceName,
      status: result.status,
      expiresAt: result.expiresAt,
      activationLimit: result.activationLimit,
      activation: result.activation,
      validatedAt: timestamp,
      lastActiveAt: timestamp,
    };
    await this.save(stored);
    this.offline = false;
    return this.toState(stored);
  }

  private async validateStored(stored: StoredLicense): Promise<LicenseState> {
    this.offline = false;
    const timestamp = this.now().toISOString();
    const result = await this.post(
      "/v1/licenses/validate",
      { key: stored.key, instanceId: stored.instanceId },
      licenseResultSchema,
    ).catch(async (error) => {
      if (error instanceof LicenseError && error.rejected)
        await this.save({
          ...stored,
          status: "disabled",
          validatedAt: timestamp,
          lastActiveAt: null,
        });
      throw error;
    });
    if (result.instance && result.instance.id !== stored.instanceId) {
      await this.save({
        ...stored,
        status: "disabled",
        validatedAt: timestamp,
        lastActiveAt: null,
      });
      throw new LicenseError("授权实例与本机不匹配。", false, true);
    }
    const status =
      result.status === "active" && result.instance?.status !== "active"
        ? "inactive"
        : result.status;
    const next: StoredLicense = {
      ...stored,
      status,
      expiresAt: result.expiresAt,
      activationLimit: result.activationLimit,
      activation: result.activation,
      instanceName: result.instance?.name || stored.instanceName,
      validatedAt: timestamp,
      lastActiveAt: status === "active" ? timestamp : null,
    };
    await this.save(next);
    return this.toState(next);
  }

  validate(): Promise<LicenseState> {
    return this.exclusively(async () => {
      const stored = await this.load();
      if (!stored) throw new LicenseError("这台设备还没有激活授权。");
      return this.validateStored(stored);
    });
  }

  // Validate when the network is available; otherwise keep the last known
  // active license inside the offline grace. Used at application startup.
  validateWithGrace(): Promise<LicenseState> {
    return this.exclusively(async () => {
      const stored = await this.load();
      if (!stored) throw new LicenseError("这台设备还没有激活授权。");
      try {
        return await this.validateStored(stored);
      } catch (error) {
        if (error instanceof LicenseError && error.unavailable) {
          this.offline = true;
          const state = this.toState(stored);
          if (state.offline) return state;
        }
        throw error;
      }
    });
  }

  deactivate(): Promise<void> {
    return this.exclusively(async () => {
      const stored = await this.load();
      if (!stored) return;
      const result = await this.post(
        "/v1/licenses/deactivate",
        { key: stored.key, instanceId: stored.instanceId },
        licenseResultSchema,
      );
      if (
        result.instance &&
        (result.instance.id !== stored.instanceId ||
          result.instance.status === "active")
      )
        throw new LicenseError("授权服务未确认解绑，请稍后重试。");
      await unlink(this.stateFile);
      this.offline = false;
    });
  }
}
