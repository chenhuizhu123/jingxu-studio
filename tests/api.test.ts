import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  readdir,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { startServer } from "../apps/server/src/app";
import { createDemoAsset } from "../packages/core/src/media";
import { version } from "../package.json";
let instance: Awaited<ReturnType<typeof startServer>>,
  base = "",
  projectId = "",
  shotId = "";
const request = async (
  path: string,
  method = "GET",
  body?: unknown,
  token = true,
) => {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${instance.token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: r.status === 204 ? undefined : await r.json(),
  };
};
beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "jingxu-api-"));
  instance = await startServer({
    root,
    port: 0,
    seed: false,
    startQueue: false,
  });
  base = `http://127.0.0.1:${instance.port}`;
  instance.license.startTrial();
});
afterAll(async () => {
  await instance.close();
  await rm(instance.store.root, { recursive: true, force: true });
});
describe.sequential("工作站 API", () => {
  it("启动时只清理本产品遗留的上传临时文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "jingxu-incoming-"));
    await mkdir(join(root, "incoming"));
    await writeFile(join(root, "incoming", "a".repeat(32)), "partial upload");
    await writeFile(join(root, "incoming", "keep.txt"), "user file");
    await mkdir(join(root, "incoming", "b".repeat(32)));
    const recovered = await startServer({
      root,
      port: 0,
      seed: false,
      startQueue: false,
    });
    try {
      expect((await readdir(join(root, "incoming"))).sort()).toEqual([
        "b".repeat(32),
        "keep.txt",
      ]);
    } finally {
      await recovered.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it("点目录数据根下素材链接仍可下载（dotfiles 回归）", async () => {
    const parent = await mkdtemp(join(tmpdir(), "jingxu-dot-"));
    const root = join(parent, ".data");
    const dot = await startServer({
      root,
      port: 0,
      seed: true,
      startQueue: false,
    });
    try {
      const projects = await (
        await fetch(`http://127.0.0.1:${dot.port}/api/projects`, {
          headers: { Authorization: `Bearer ${dot.token}` },
        })
      ).json();
      const asset = projects[0].assets[0];
      const r = await fetch(`http://127.0.0.1:${dot.port}${asset.url}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("image/png");
      expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      await dot.close();
      await rm(parent, { recursive: true, force: true });
    }
  });
  it("健康检查与本机配对可用", async () => {
    expect(
      (await request("/health", "GET", undefined, false)).data.version,
    ).toBe(version);
    expect(
      (await request("/session", "GET", undefined, false)).data.version,
    ).toBe(version);
    expect((await request("/health", "GET", undefined, false)).data.ok).toBe(
      true,
    );
    expect(
      (await request("/session", "GET", undefined, false)).data.token,
    ).toBe(instance.token);
  });
  it("未认证 API 与跨站来源被拒绝", async () => {
    expect((await request("/projects", "GET", undefined, false)).status).toBe(
      401,
    );
    const r = await fetch(base + "/api/session", {
      headers: { Origin: "https://evil.example" },
    });
    expect(r.status).toBe(403);
  });
  it("DNS rebinding Host 不能获得本机令牌", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        base + "/api/session",
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(401);
  });
  it("创建项目并按脚本拆镜", async () => {
    const r = await request("/projects", "POST", {
      name: "API测试",
      script: "角色：阿青\n阿青：我们出发。\n远处的天空渐渐亮起。",
    });
    expect(r.status).toBe(201);
    projectId = r.data.id;
    const split = await request(
      `/projects/${projectId}/storyboard`,
      "POST",
      {},
    );
    expect(split.data.shots).toHaveLength(2);
    shotId = split.data.shots[0].id;
  });
  it("校验名称、未知字段与未知项目", async () => {
    expect((await request("/projects", "POST", { name: "" })).status).toBe(400);
    expect((await request("/projects/unknown")).status).toBe(404);
    expect(
      (
        await request(`/projects/${projectId}/shots/${shotId}`, "PATCH", {
          duration: 90,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`/projects/${projectId}`, "PATCH", { exports: [] }))
        .status,
    ).toBe(400);
  });
  it("编辑镜头并拒绝过期 revision", async () => {
    let p = (await request(`/projects/${projectId}`)).data;
    const r = await request(`/projects/${projectId}/shots/${shotId}`, "PATCH", {
      duration: 2,
      title: "新的开头",
      revision: p.revision,
    });
    expect(r.data.shots[0].duration).toBe(2);
    expect(
      (
        await request(`/projects/${projectId}/shots/${shotId}`, "PATCH", {
          title: "旧修改",
          revision: p.revision,
        })
      ).status,
    ).toBe(409);
  });
  it("创建角色、拒绝跨项目参考", async () => {
    const r = await request(`/projects/${projectId}/characters`, "POST", {
      name: "阿白",
    });
    const c = r.data.characters.at(-1);
    expect(c.name).toBe("阿白");
    expect(
      (
        await request(`/projects/${projectId}/characters/${c.id}`, "PATCH", {
          referenceId: "unknown",
        })
      ).status,
    ).toBe(400);
  });
  it("上传图片，创建候选并生成有签名的素材地址", async () => {
    const asset = await createDemoAsset(instance.store, 0);
    const bytes = await readFile(instance.store.path(asset.file));
    const data = new FormData();
    data.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      "参考图.png",
    );
    const upload = await fetch(base + `/api/projects/${projectId}/assets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${instance.token}` },
      body: data,
    });
    expect(upload.status).toBe(201);
    const p = await upload.json();
    const a = p.assets[0];
    expect(a.url).toContain("signature=");
    expect((await fetch(base + a.url)).status).toBe(200);
    expect((await fetch(base + `/media/${projectId}/${a.id}`)).status).toBe(
      401,
    );
    const imported = await request(
      `/projects/${projectId}/shots/${shotId}/import`,
      "POST",
      { assetId: a.id },
    );
    expect(imported.data.shots[0].versions).toHaveLength(1);
  });
  it("拒绝伪造视频文件与可执行扩展名", async () => {
    for (const name of ["fake.mp4", "bad.exe"]) {
      const data = new FormData();
      data.append(
        "file",
        new Blob(["invalid"]),
        "fake" + name.slice(name.lastIndexOf(".")),
      );
      const r = await fetch(base + `/api/projects/${projectId}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${instance.token}` },
        body: data,
      });
      expect(r.status).toBe(400);
    }
  });
  it("已有素材的拆镜操作不能覆盖版本", async () => {
    expect(
      (await request(`/projects/${projectId}/storyboard`, "POST", {})).status,
    ).toBe(409);
  });
  it("批量生成去重，同镜头任务不会重复提交", async () => {
    const r = await request(`/projects/${projectId}/generate`, "POST", {
      shotIds: [shotId, shotId],
    });
    expect(r.status).toBe(202);
    expect(r.data.jobs).toHaveLength(1);
    const again = await request(`/projects/${projectId}/generate`, "POST", {
      shotIds: [shotId],
    });
    expect(again.data.skipped).toEqual([shotId]);
    expect((await request(`/projects/${projectId}`, "DELETE")).status).toBe(
      409,
    );
  });
  it("取消任务持久化，终态不能重复取消", async () => {
    const jobs = (await request("/jobs")).data;
    const r = await request(`/jobs/${jobs[0].id}/cancel`, "POST", {});
    expect(r.data.state).toBe("cancelled");
    expect(
      (await request(`/jobs/${jobs[0].id}/cancel`, "POST", {})).status,
    ).toBe(409);
  });
  it("没有 Key 时拒绝真实生成，设置不暴露 Key", async () => {
    const s = (await request("/settings")).data;
    s.generation = {
      ...s.generation,
      provider: "gateway",
      endpoint: "https://video.example",
      model: "test",
    };
    delete s.generation.hasApiKey;
    delete s.agent.hasApiKey;
    const saved = await request("/settings", "PUT", s);
    expect(saved.status).toBe(200);
    expect(
      (
        await request(`/projects/${projectId}/generate`, "POST", {
          shotIds: [shotId],
        })
      ).status,
    ).toBe(400);
    s.generation.apiKey = "my-super-secret";
    expect((await request("/settings", "PUT", s)).status).toBe(200);
    expect(JSON.stringify((await request("/settings")).data)).not.toContain(
      "my-super-secret",
    );
  });
  it("缺素材不能渲染，规则检查返回明确原因", async () => {
    expect(
      (await request(`/projects/${projectId}/render`, "POST", {})).status,
    ).toBe(400);
    expect(
      (await request(`/projects/${projectId}/check`)).data.some(
        (f: any) => f.code === "missing-media",
      ),
    ).toBe(true);
  });
  it("助手未配置时返回可理解错误", async () => {
    const r = await request(`/projects/${projectId}/chat`, "POST", {
      text: "帮我改一下",
    });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("API Key");
  });
  it("内置 Skills 可读取，自定义 Skill 可保存", async () => {
    expect((await request("/skills")).data.length).toBeGreaterThanOrEqual(3);
    expect(
      (
        await request("/skills", "POST", {
          name: "my-brand",
          title: "品牌视频审查",
          description: "品牌规范",
          content: "先读取产品外观，保持标签一致。",
        })
      ).status,
    ).toBe(201);
    const saved = (await request("/skills")).data.find(
      (s: any) => s.id === "my-brand",
    );
    expect(saved).toBeTruthy();
    // 文件名 slug 作为稳定 id，界面显示可读名称（frontmatter name）。
    expect(saved.name).toBe("品牌视频审查");
    expect(
      (await request("/skills")).data.some((s: any) => s.id === "my-brand"),
    ).toBe(true);
    expect(
      (
        await request("/skills", "POST", {
          name: "../bad",
          description: "x",
          content: "y",
        })
      ).status,
    ).toBe(400);
  });
  it("导出真实 ZIP 素材包与项目记录备份", async () => {
    const r = await request(`/projects/${projectId}/archive`, "POST", {});
    expect(r.status).toBe(200);
    const e = r.data.exports[0];
    const response = await fetch(base + e.url);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const backup = (await request("/backup")).data;
    expect(backup.format).toBe("jingxu-backup-v1");
    expect(JSON.stringify(backup)).not.toContain("my-super-secret");
  });
  it("通过 multipart 导入已导出的真实 ZIP，保留原项目并清理上传文件", async () => {
    const before = instance.store.projects().length;
    const source = instance.store.project(projectId);
    const archive = (
      await request(`/projects/${projectId}/archive`, "POST", {})
    ).data.exports[0];
    const bytes = await (await fetch(base + archive.url)).arrayBuffer();
    const form = new FormData();
    form.append(
      "file",
      new Blob([bytes], { type: "application/zip" }),
      "project.zip",
    );
    const response = await fetch(base + "/api/projects/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${instance.token}` },
      body: form,
    });
    expect(response.status).toBe(201);
    const restored = await response.json();
    expect(restored.id).not.toBe(projectId);
    expect(restored.shots.map((s: any) => s.title)).toEqual(
      source.shots.map((s) => s.title),
    );
    expect(instance.store.projects()).toHaveLength(before + 1);
    expect((await readdir(join(instance.store.root, "incoming"))).length).toBe(
      0,
    );
    if (restored.assets[0])
      expect((await fetch(base + restored.assets[0].url)).ok).toBe(true);
  });
  it("导入损坏 ZIP 不创建项目，上传文件不会残留", async () => {
    const before = instance.store.projects().length;
    const form = new FormData();
    form.append("file", new Blob(["bad archive"]), "broken.zip");
    const response = await fetch(base + "/api/projects/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${instance.token}` },
      body: form,
    });
    expect(response.status).toBe(400);
    expect(instance.store.projects()).toHaveLength(before);
    expect(await readdir(join(instance.store.root, "incoming"))).toEqual([]);
  });
  it("创建副本保留素材和候选，历史与交付独立", async () => {
    const r = await request(`/projects/${projectId}/duplicate`, "POST", {});
    expect(r.status).toBe(201);
    expect(r.data.id).not.toBe(projectId);
    expect(r.data.assets).toHaveLength(1);
    expect(r.data.exports).toEqual([]);
    expect(r.data.shots[0].versions).toHaveLength(1);
  });
});

describe("许可与试用门控", () => {
  let gated: Awaited<ReturnType<typeof startServer>>;
  let url = "";
  beforeAll(async () => {
    gated = await startServer({
      root: await mkdtemp(join(tmpdir(), "jingxu-license-api-")),
      port: 0,
      seed: true,
      startQueue: false,
    });
    url = `http://127.0.0.1:${gated.port}`;
  });
  afterAll(async () => {
    const root = gated.store.root;
    await gated.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = (path: string, method = "GET", body?: unknown) =>
    requestAt(url, gated.token, path, method, body);

  it("未开始试用时生成任务返回 402，渲染导出不受门控", async () => {
    expect((await call("/license")).data.status).toBe("none");
    const projects = await call("/projects");
    const p = projects.data[0];
    const generate = await call(`/projects/${p.id}/generate`, "POST", {
      shotIds: [p.shots[0].id],
    });
    expect(generate.status).toBe(402);
    // 导出不经过许可门控：样片缺素材会得到业务校验错误，而不是 402
    const render = await call(`/projects/${p.id}/render`, "POST", {});
    expect(render.status).not.toBe(402);
  });
  it("开始试用后可生成，非法许可证被拒绝", async () => {
    const trial = await call("/license/trial", "POST", {});
    expect(trial.data.status).toBe("trial");
    expect(trial.data.daysLeft).toBe(14);
    const bad = await call("/license/activate", "POST", { key: "JX1-bad" });
    expect(bad.status).toBe(400);
    const projects = await call("/projects");
    const p = projects.data[0];
    const generate = await call(`/projects/${p.id}/generate`, "POST", {
      shotIds: [p.shots[0].id],
    });
    expect(generate.status).toBe(202);
    expect(generate.data.jobs).toHaveLength(1);
  });
});

describe("项目 AI 用量", () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let url = "";
  const ts = () => new Date().toISOString();
  const putJob = (j: Record<string, unknown>) =>
    srv.store.put("job", String(j.id), {
      progress: 0,
      message: "",
      createdAt: ts(),
      updatedAt: ts(),
      attempts: 0,
      provider: "test",
      ...j,
    });
  beforeAll(async () => {
    srv = await startServer({
      root: await mkdtemp(join(tmpdir(), "jingxu-usage-api-")),
      port: 0,
      seed: false,
      startQueue: false,
    });
    url = `http://127.0.0.1:${srv.port}`;
  });
  afterAll(async () => {
    const root = srv.store.root;
    await srv.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = (path: string, method = "GET", body?: unknown) =>
    requestAt(url, srv.token, path, method, body);

  it("聚合本项目成功任务的用量，忽略失败与其他项目", async () => {
    const a = (await call("/projects", "POST", { name: "用量项目" })).data;
    const b = (await call("/projects", "POST", { name: "其他项目" })).data;
    putJob({
      id: "j1",
      projectId: a.id,
      type: "generate",
      state: "succeeded",
      duration: 6,
    });
    putJob({
      id: "j2",
      projectId: a.id,
      type: "image",
      state: "succeeded",
    });
    putJob({
      id: "j3",
      projectId: a.id,
      type: "speech",
      state: "succeeded",
      speechText: "一二三四五",
    });
    putJob({
      id: "j4",
      projectId: a.id,
      type: "transcribe",
      state: "succeeded",
      usage: { seconds: 8 },
    });
    putJob({
      id: "j5",
      projectId: a.id,
      type: "image",
      state: "failed",
    });
    putJob({
      id: "j6",
      projectId: b.id,
      type: "image",
      state: "succeeded",
    });

    const usage = await call(`/projects/${a.id}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.data).toEqual({
      rows: [
        { kind: "video", unit: "seconds", quantity: 6, jobs: 1 },
        { kind: "image", unit: "images", quantity: 1, jobs: 1 },
        { kind: "speech", unit: "characters", quantity: 5, jobs: 1 },
        { kind: "transcription", unit: "seconds", quantity: 8, jobs: 1 },
      ],
      totalJobs: 4,
    });
    const other = await call(`/projects/${b.id}/usage`);
    expect(other.data).toEqual({
      rows: [{ kind: "image", unit: "images", quantity: 1, jobs: 1 }],
      totalJobs: 1,
    });
    expect((await call("/projects/missing/usage")).status).toBe(404);
  });

  it("保存用户自填单价并往返；空值留空、负数拒绝", async () => {
    const s = (await call("/settings")).data;
    for (const key of [
      "image",
      "transcription",
      "speech",
      "generation",
      "agent",
    ])
      delete s[key]?.hasApiKey;
    s.pricing = {
      currency: "$",
      videoPerSecond: 1.5,
      imagePerImage: "",
      speechPerKiloChar: 0.2,
    };
    const saved = await call("/settings", "PUT", s);
    expect(saved.status).toBe(200);
    expect((await call("/settings")).data.pricing).toEqual({
      currency: "$",
      videoPerSecond: 1.5,
      speechPerKiloChar: 0.2,
    });

    s.pricing = { currency: "¥", videoPerSecond: -1 };
    expect((await call("/settings", "PUT", s)).status).toBe(400);
  });
});

async function requestAt(
  base: string,
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: r.status === 204 ? undefined : await r.json(),
  };
}
