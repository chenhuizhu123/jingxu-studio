import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { LicenseGate, mintLicenseKey } from "../packages/core/src/license";
import { AppError } from "../packages/core/src/model";

const roots: string[] = [];
async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "jingxu-license-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: publicKey.export({ type: "spki", format: "pem" }) as string,
    priv: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };
}

describe("本机试用", () => {
  it("首次打开时为未开始状态并阻止生成", async () => {
    const gate = new LicenseGate(await makeRoot());
    const s = gate.state();
    expect(s.status).toBe("none");
    expect(s.blocked).toBe(true);
    expect(() => gate.assertActive()).toThrowError(AppError);
  });

  it("开始试用后 14 天有效，并持久化", async () => {
    const root = await makeRoot();
    const day = (n: number) =>
      new Date(Date.parse("2026-11-06T08:00:00Z") + n * 86400000);
    let gate = new LicenseGate(root, { now: () => day(0) });
    const started = gate.startTrial();
    expect(started.status).toBe("trial");
    expect(started.blocked).toBe(false);
    expect(started.daysLeft).toBe(14);
    expect(() => gate.assertActive()).not.toThrow();

    gate = new LicenseGate(root, { now: () => day(13) });
    expect(gate.state().daysLeft).toBe(1);

    gate = new LicenseGate(root, { now: () => day(14) });
    const expired = gate.state();
    expect(expired.status).toBe("expired");
    expect(expired.blocked).toBe(true);
    expect(expired.reason).toBe("trial-ended");
    expect(() => gate.assertActive()).toThrowError(/试用已结束/);
  });

  it("回拨系统时钟不能延长试用", async () => {
    const root = await makeRoot();
    const at = (d: string) => () => new Date(d);
    new LicenseGate(root, { now: at("2026-11-06T08:00:00Z") }).startTrial();
    // 正常使用到第 5 天
    const day5 = new LicenseGate(root, {
      now: at("2026-11-11T08:00:00Z"),
    }).state();
    expect(day5.daysLeft).toBe(9);
    // 时钟被拨回第 1 天，剩余天数不应增加
    const rolled = new LicenseGate(root, {
      now: at("2026-11-07T08:00:00Z"),
    }).state();
    expect(rolled.daysLeft).toBe(9);
  });
});

describe("签名许可证", () => {
  it("接受内置信任公钥验证通过的密钥并持久化激活", async () => {
    const { pub, priv } = testKeys();
    const root = await makeRoot();
    const gate = new LicenseGate(root, { publicKeyPem: pub });
    const key = mintLicenseKey(priv, {
      email: "buyer@example.com",
      plan: "pro",
      until: "2027-11-06",
    });
    const s = gate.activate(key);
    expect(s.status).toBe("active");
    expect(s.blocked).toBe(false);
    expect(s.license?.email).toBe("buyer@example.com");
    expect(s.license?.plan).toBe("pro");
    // 重新实例化仍然有效
    expect(
      new LicenseGate(root, { publicKeyPem: pub }).state().status,
    ).toBe("active");
  });

  it("无到期日为永久许可", async () => {
    const { pub, priv } = testKeys();
    const gate = new LicenseGate(await makeRoot(), { publicKeyPem: pub });
    const s = gate.activate(
      mintLicenseKey(priv, {
        email: "forever@example.com",
        plan: "pro-perpetual",
      }),
    );
    expect(s.status).toBe("active");
    expect(s.daysLeft).toBeUndefined();
  });

  it("拒绝伪造、损坏和他机绑定的密钥", async () => {
    const { pub, priv } = testKeys();
    const gate = new LicenseGate(await makeRoot(), { publicKeyPem: pub });
    const good = mintLicenseKey(priv, {
      email: "a@example.com",
      plan: "pro",
      until: "2027-01-01",
    });
    // 篡改签名段
    const tampered = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
    expect(() => gate.activate(tampered)).toThrowError(/签名无效/);
    expect(() => gate.activate("not-a-key")).toThrowError(/格式不正确/);
    expect(() =>
      gate.activate(
        mintLicenseKey(priv, {
          email: "a@example.com",
          plan: "pro",
          until: "2027-01-01",
          machine: "another-machine",
        }),
      ),
    ).toThrowError(/其他设备/);
  });

  it("到期密钥无法激活，已存密钥到期后变为 expired", async () => {
    const { pub, priv } = testKeys();
    const root = await makeRoot();
    const gate = new LicenseGate(root, {
      publicKeyPem: pub,
      now: () => new Date("2026-11-06T00:00:00Z"),
    });
    expect(() =>
      gate.activate(
        mintLicenseKey(priv, {
          email: "old@example.com",
          plan: "pro",
          until: "2026-10-01",
        }),
      ),
    ).toThrowError(/已到期/);

    gate.activate(
      mintLicenseKey(priv, {
        email: "old@example.com",
        plan: "pro",
        until: "2026-11-10",
      }),
    );
    const later = new LicenseGate(root, {
      publicKeyPem: pub,
      now: () => new Date("2026-11-11T00:00:00Z"),
    });
    expect(later.state().status).toBe("expired");
    expect(later.state().blocked).toBe(true);
  });

  it("解绑后回落到阻止状态", async () => {
    const { pub, priv } = testKeys();
    const gate = new LicenseGate(await makeRoot(), { publicKeyPem: pub });
    gate.activate(
      mintLicenseKey(priv, {
        email: "a@example.com",
        plan: "pro",
        until: "2027-01-01",
      }),
    );
    expect(gate.deactivate().status).toBe("none");
  });
});
