import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/core/src/store";
import { createProject, defaultSettings } from "../packages/core/src/model";
const roots: string[] = [];
async function open() {
  const root = await mkdtemp(join(tmpdir(), "jingxu-store-"));
  roots.push(root);
  return Store.open(root);
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
describe("本地 SQLite 与凭据", () => {
  it("重启后项目与版本完整保留", async () => {
    let store = await open();
    const root = store.root,
      p = createProject({ name: "保留项目" });
    store.put("project", p.id, p);
    store.close();
    store = await Store.open(root);
    expect(store.project(p.id)).toEqual(p);
    store.close();
  });
  it("密钥不以明文落入 SQLite 或返回设置", async () => {
    const store = await open(),
      s = structuredClone(defaultSettings);
    s.generation.apiKey = "video-secret-value";
    s.agent.apiKey = "agent-secret-value";
    store.saveSettings(s);
    const bytes = await readFile(join(store.root, "studio.sqlite"));
    expect(bytes.includes(Buffer.from("video-secret-value"))).toBe(false);
    expect(JSON.stringify(store.publicSettings())).not.toContain(
      "agent-secret-value",
    );
    expect(store.settings().generation.apiKey).toBe("video-secret-value");
    expect(store.publicSettings().agent.hasApiKey).toBe(true);
    store.close();
  });
  it("相同 Key 每次加密结果不同", async () => {
    const store = await open();
    expect(store.encrypt("test")).not.toBe(store.encrypt("test"));
    expect(store.decrypt(store.encrypt("test"))).toBe("test");
    expect(store.decrypt("")).toBe("");
    expect(() => store.decrypt("invalid")).toThrow("解密");
    store.close();
  });
  it("乐观锁阻止旧版本覆盖新内容", async () => {
    const store = await open(),
      p = createProject({ name: "A" });
    store.put("project", p.id, p);
    store.mutate(p.id, (p) => (p.name = "B"), 1);
    expect(() => store.mutate(p.id, (p) => (p.name = "C"), 1)).toThrow(
      "项目已更新",
    );
    expect(store.project(p.id).name).toBe("B");
    store.close();
  });
  it("拒绝目录穿越与工作站根路径", async () => {
    const store = await open();
    expect(() => store.path("../secret")).toThrow("无效文件路径");
    expect(() => store.path(".")).toThrow();
    expect(store.path("media/test.png")).toBe(
      join(store.root, "media/test.png"),
    );
    store.close();
  });
  it("没有项目时返回明确信息", async () => {
    const store = await open();
    expect(() => store.project("unknown")).toThrow("项目不存在");
    store.close();
  });
});
