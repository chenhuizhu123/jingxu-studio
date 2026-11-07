import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Licensing,
  LicenseError,
  maskLicenseKey,
} from "../packages/core/src/licensing";

const LICENSE_KEY = "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY";
const dirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), "jingxu-licensing-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

function licensePayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    expiresAt: null,
    activation: 1,
    activationLimit: 1,
    instance: {
      id: "inst_1",
      name: "镜序 Studio · host (darwin)",
      status: "active",
    },
    ...overrides,
  };
}

describe("Licensing", () => {
  it("未配置账单服务时只暴露未启用视图并拒绝操作", async () => {
    const stateFile = join(await makeDir(), "license.json");
    const licensing = new Licensing(undefined, stateFile);
    const view = await licensing.view();
    expect(view).toEqual({ configured: false, enforce: false, license: null });
    await expect(licensing.checkout()).rejects.toBeInstanceOf(LicenseError);
    await expect(licensing.activate(LICENSE_KEY, "dev")).rejects.toBeInstanceOf(
      LicenseError,
    );
  });

  it("授权码脱敏只保留末 5 位", () => {
    expect(maskLicenseKey(LICENSE_KEY)).toBe("••••-UVWXY");
    expect(maskLicenseKey("abcdefghijklmno")).toBe("••••-KLMNO");
  });

  it("激活成功后以 0600 持久化并返回脱敏状态", async () => {
    const stateFile = join(await makeDir(), "license.json");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(licensePayload()));
    const licensing = new Licensing(
      { url: "https://billing.example/", enforce: true },
      stateFile,
      { fetch: fetchMock, now: () => new Date("2026-11-06T08:00:00Z") },
    );
    const state = await licensing.activate(
      "abcde-fghij-klmno-pqrst-uvwxy",
      "dev",
    );
    expect(state).toMatchObject({
      maskedKey: "••••-UVWXY",
      status: "active",
      instanceId: "inst_1",
      offline: false,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://billing.example/v1/licenses/activate",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      key: LICENSE_KEY,
      instanceName: "dev",
    });
    const stored = JSON.parse(await readFile(stateFile, "utf8"));
    expect(stored.key).toBe(LICENSE_KEY);
    expect(stored.validatedAt).toBe("2026-11-06T08:00:00.000Z");
    expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
    // 重新实例化可以读出状态
    const reloaded = await new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
    ).view();
    expect(reloaded.license?.maskedKey).toBe("••••-UVWXY");
  });

  it("上游返回非 active 状态时激活失败且不落盘", async () => {
    const stateFile = join(await makeDir(), "license.json");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json(
        licensePayload({
          status: "disabled",
          instance: { id: "inst_1", name: "", status: "disabled" },
        }),
      ),
    );
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: false },
      stateFile,
      { fetch: fetchMock },
    );
    await expect(licensing.activate(LICENSE_KEY, "dev")).rejects.toThrow(
      /授权未激活/,
    );
    expect((await licensing.view()).license).toBeNull();
  });

  it("结账返回托管结账链接", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: "ch_1",
        status: "pending",
        checkoutUrl: "https://creem.io/test/checkout/ch_1",
      }),
    );
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      join(await makeDir(), "license.json"),
      { fetch: fetchMock },
    );
    expect(await licensing.checkout()).toBe(
      "https://creem.io/test/checkout/ch_1",
    );
  });

  it("校验成功时刷新状态，实例不匹配则拒绝", async () => {
    const dir = await makeDir();
    const stateFile = join(dir, "license.json");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(licensePayload()))
      .mockResolvedValueOnce(Response.json(licensePayload()))
      .mockResolvedValueOnce(
        Response.json(
          licensePayload({
            instance: { id: "inst_other", name: "", status: "active" },
          }),
        ),
      );
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
      { fetch: fetchMock, now: () => new Date("2026-11-06T08:00:00Z") },
    );
    await licensing.activate(LICENSE_KEY, "dev");
    const checked = await licensing.validate();
    expect(checked.status).toBe("active");
    expect(checked.validatedAt).toBe("2026-11-06T08:00:00.000Z");
    await expect(licensing.validate()).rejects.toThrow(/不匹配/);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      key: LICENSE_KEY,
      instanceId: "inst_1",
    });
  });

  it("未激活时校验/解绑行为正确", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      join(await makeDir(), "license.json"),
      { fetch: fetchMock },
    );
    await expect(licensing.validate()).rejects.toThrow(/还没有激活/);
    await expect(licensing.validateWithGrace()).rejects.toThrow(/还没有激活/);
    await licensing.deactivate();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("网络故障时 14 天离线宽限内放行，超期拒绝", async () => {
    const dir = await makeDir();
    const stateFile = join(dir, "license.json");
    await writeFile(
      stateFile,
      JSON.stringify({
        key: LICENSE_KEY,
        instanceId: "inst_1",
        instanceName: "dev",
        status: "active",
        expiresAt: null,
        activationLimit: 1,
        activation: 1,
        validatedAt: "2026-11-01T00:00:00.000Z",
        lastActiveAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    const offline = new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
      {
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("down")),
        now: () => new Date("2026-11-10T00:00:00Z"),
      },
    );
    const state = await offline.validateWithGrace();
    expect(state.offline).toBe(true);
    expect(state.status).toBe("active");

    const stale = new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
      {
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("down")),
        now: () => new Date("2026-11-20T00:00:00Z"),
      },
    );
    await expect(stale.validateWithGrace()).rejects.toBeInstanceOf(
      LicenseError,
    );
  });

  it("解绑时通知账单服务并删除本地文件", async () => {
    const dir = await makeDir();
    const stateFile = join(dir, "license.json");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(licensePayload()))
      .mockResolvedValueOnce(
        Response.json(
          licensePayload({
            instance: { id: "inst_1", name: "", status: "inactive" },
          }),
        ),
      );
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
      { fetch: fetchMock },
    );
    await licensing.activate(LICENSE_KEY, "dev");
    await licensing.deactivate();
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://billing.example/v1/licenses/deactivate",
    );
    expect((await licensing.view()).license).toBeNull();
  });

  it("离线宽限不能超过已知到期日，服务端明确拒绝后清除缓存权益", async () => {
    let now = new Date("2026-11-01T00:00:00Z");
    const stateFile = join(await makeDir(), "license.json");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(licensePayload({ expiresAt: "2026-11-03T00:00:00Z" })),
      )
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({}, { status: 422 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
      { fetch: fetchMock, now: () => now },
    );
    expect((await licensing.activate(LICENSE_KEY, "dev")).validUntil).toBe(
      Date.parse("2026-11-03T00:00:00Z"),
    );
    now = new Date("2026-11-03T00:00:00Z");
    expect((await licensing.view()).license?.status).toBe("expired");
    await expect(licensing.validateWithGrace()).rejects.toMatchObject({
      unavailable: true,
    });
    await expect(licensing.validateWithGrace()).rejects.toMatchObject({
      rejected: true,
    });
    expect((await licensing.view()).license).toMatchObject({
      status: "disabled",
      validUntil: null,
    });
    await expect(licensing.validateWithGrace()).rejects.toMatchObject({
      unavailable: true,
    });
  });

  it("重复并发激活同一授权码只占用一个设备名额", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(licensePayload()));
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      join(await makeDir(), "license.json"),
      { fetch: fetchMock },
    );
    await Promise.all([
      licensing.activate(LICENSE_KEY, "dev"),
      licensing.activate(LICENSE_KEY, "dev"),
    ]);
    expect(
      fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(["/v1/licenses/activate", "/v1/licenses/validate"]);
  });

  it("上游错误信息透传，畸形响应给出统一提示", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "授权码无效" }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ status: "weird" }));
    const licensing = new Licensing(
      { url: "https://billing.example", enforce: true },
      join(await makeDir(), "license.json"),
      { fetch: fetchMock },
    );
    await expect(licensing.checkout()).rejects.toThrow(/授权码无效/);
    await expect(licensing.activate(LICENSE_KEY, "dev")).rejects.toThrow(
      /HTTP 502/,
    );
    await expect(licensing.activate(LICENSE_KEY, "dev")).rejects.toThrow(
      /意外的响应/,
    );
  });

  it("损坏的状态文件视为未激活", async () => {
    const stateFile = join(await makeDir(), "license.json");
    await writeFile(stateFile, "{not-json");
    const view = await new Licensing(
      { url: "https://billing.example", enforce: true },
      stateFile,
    ).view();
    expect(view.license).toBeNull();
  });
});
