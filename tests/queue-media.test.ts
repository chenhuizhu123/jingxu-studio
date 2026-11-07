import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../packages/core/src/store";
import { JobQueue } from "../packages/core/src/queue";
import {
  createProject,
  buildStoryboard,
  addVersion,
  defaultSettings,
  id,
  now,
  type Job,
} from "../packages/core/src/model";
import {
  createDemoAsset,
  ffmpegPath,
  ffprobePath,
  renderVideo,
  renderAnimatic,
  animaticStillAssetId,
  placeholderSvg,
  runFfmpeg,
} from "../packages/core/src/media";
import { summarizeUsage } from "../packages/core/src/usage";
let store: Store | undefined,
  queue: JobQueue | undefined,
  server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await queue?.close();
  queue = undefined;
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (store) {
    const root = store.root;
    store.close();
    await rm(root, { recursive: true, force: true });
    store = undefined;
  }
});
async function setup() {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-media-")));
  const p = createProject({ name: "渲染测试", script: "画面一\n林晚：你好" });
  buildStoryboard(p);
  p.shots.forEach((s) => (s.duration = 2));
  store.put("project", p.id, p);
  queue = new JobQueue(store);
  return p;
}
async function terminal(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const j = store!.get<Job>("job", jobId)!;
    if (["succeeded", "failed", "cancelled"].includes(j.state)) return j;
    await delay(50);
  }
  throw new Error("测试等待任务超时");
}
describe("任务调度与媒体输出", () => {
  it("locates both unpacked media binaries with Windows ASAR paths", () => {
    const path = String.raw`C:\Program Files\Jingxu\resources\app.asar\node_modules`;
    vi.stubEnv("JINGXU_FFMPEG", `${path}\\ffmpeg-static\\ffmpeg.exe`);
    vi.stubEnv("JINGXU_FFPROBE", `${path}\\ffprobe-static\\ffprobe.exe`);
    expect(ffmpegPath()).toContain(String.raw`\app.asar.unpacked\node_modules`);
    expect(ffprobePath()).toContain(
      String.raw`\app.asar.unpacked\node_modules`,
    );
  });
  it("does not enqueue an export with a missing asset or stale captions", async () => {
    const p = await setup();
    expect(() => queue!.enqueue(p.id, "export")).toThrow(
      "请为每个镜头选择素材后再渲染",
    );
    for (const [i, shot] of p.shots.entries()) {
      addVersion(
        p,
        shot.id,
        await createDemoAsset(store!, i),
        "素材",
        "demo",
        "demo",
      );
    }
    p.shots[0].captionTrack = {
      source: { assetId: id(), start: 0, duration: 2 },
      origin: "manual",
      createdAt: now(),
      cues: [],
    };
    store!.put("project", p.id, p);
    expect(() => queue!.enqueue(p.id, "export")).toThrow(
      "音轨或剪辑已改变，请重新核对字幕",
    );
    expect(store!.jobs()).toEqual([]);
  });
  it("演示生成真实图片，重复候选不覆盖当前已选", async () => {
    const p = await setup();
    queue!.start();
    const j = queue!.enqueue(p.id, "generate", p.shots[0].id);
    expect((await terminal(j.id)).state).toBe("succeeded");
    const first = store!.project(p.id).shots[0].selectedVersionId;
    const again = queue!.enqueue(p.id, "generate", p.shots[0].id);
    expect((await terminal(again.id)).state).toBe("succeeded");
    const saved = store!.project(p.id);
    expect(saved.shots[0].selectedVersionId).toBe(first);
    expect(saved.shots[0].versions).toHaveLength(2);
    const bytes = await readFile(store!.path(saved.assets[0].file));
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  });
  it("排队任务取消后不会执行或新增素材", async () => {
    const p = await setup(),
      j = queue!.enqueue(p.id, "generate", p.shots[0].id);
    queue!.cancel(j.id);
    queue!.start();
    await delay(350);
    expect(store!.project(p.id).assets).toHaveLength(0);
    expect(store!.get<Job>("job", j.id)?.state).toBe("cancelled");
  });
  it("运行中的取消保持终态，不产生候选", async () => {
    const p = await setup(),
      j = queue!.enqueue(p.id, "generate", p.shots[0].id);
    queue!.start();
    await delay(70);
    queue!.cancel(j.id);
    await delay(650);
    expect(store!.get<Job>("job", j.id)?.state).toBe("cancelled");
    expect(store!.project(p.id).assets).toHaveLength(0);
  });
  it("渲染器生成包含视频和音轨的真实可解码 MP4 与 SRT", async () => {
    const p = await setup();
    for (let i = 0; i < p.shots.length; i++)
      addVersion(
        p,
        p.shots[i].id,
        await createDemoAsset(store!, i),
        "本地素材",
        "demo",
        "demo",
      );
    store!.put("project", p.id, p);
    const progress: number[] = [];
    const result = await renderVideo(store!, p, (n) => progress.push(n));
    const bytes = await readFile(store!.path(result.file));
    expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
    expect(bytes.length).toBeGreaterThan(10000);
    expect(
      await readFile(store!.path(`exports/${result.id}.srt`), "utf8"),
    ).toContain("00:00:02,000 --> 00:00:04,000");
    await runFfmpeg(["-i", store!.path(result.file), "-f", "null", "-"]);
    expect(progress.at(-1)).toBe(85);
    expect(result.revision).toBe(p.revision);
  }, 30000);
  it("导出使用提交时快照，后续镜头修改不污染结果", async () => {
    const p = await setup();
    for (let i = 0; i < p.shots.length; i++)
      addVersion(
        p,
        p.shots[i].id,
        await createDemoAsset(store!, i),
        "素材",
        "demo",
        "demo",
      );
    store!.put("project", p.id, p);
    const j = queue!.enqueue(p.id, "export");
    store!.mutate(p.id, (p) => (p.shots[0].duration = 10));
    queue!.start();
    expect((await terminal(j.id)).state).toBe("succeeded");
    const exported = store!.project(p.id).exports[0];
    expect(exported.revision).toBe(1);
    const subtitles = await readFile(
      store!.path(`exports/${exported.id}.srt`),
      "utf8",
    );
    expect(subtitles).toContain("00:00:02,000");
    expect(subtitles).not.toContain("00:00:10,000");
  }, 30000);
  it("远程任务提交、轮询、下载真实视频；API Key 不进入任务记录", async () => {
    const p = await setup();
    const fixture = store!.path("media/remote-fixture.mp4");
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=teal:s=128x128:r=25",
      "-t",
      "0.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      fixture,
    ]);
    const video = await readFile(fixture);
    let submitCount = 0,
      polls = 0,
      port = 0;
    server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/tasks") {
        submitCount++;
        let body = "";
        for await (const c of req) body += c;
        expect(JSON.parse(body).model).toBe("test-video-model");
        expect(req.headers.authorization).toBe("Bearer secret-test-key");
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "remote-task-1" }));
      } else if (req.url === "/tasks/remote-task-1") {
        polls++;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify(
            polls === 1
              ? { status: "running" }
              : {
                  status: "succeeded",
                  video_url: `http://127.0.0.1:${port}/video.mp4`,
                },
          ),
        );
      } else if (req.url === "/video.mp4") {
        res.setHeader("content-type", "video/mp4");
        res.end(video);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    port = (server.address() as any).port;
    const s = structuredClone(defaultSettings);
    s.generation = {
      provider: "gateway",
      endpoint: `http://127.0.0.1:${port}`,
      model: "test-video-model",
      apiKey: "secret-test-key",
      pollIntervalMs: 100,
    };
    store!.saveSettings(s);
    queue!.start();
    const j = queue!.enqueue(p.id, "generate", p.shots[0].id);
    const final = await terminal(j.id);
    expect(final.state).toBe("succeeded");
    expect(submitCount).toBe(1);
    expect(polls).toBe(2);
    expect(JSON.stringify(final)).not.toContain("secret-test-key");
    expect(final.remoteId).toBe("remote-task-1");
    expect(store!.project(p.id).assets[0].kind).toBe("video");
  });
  it("服务返回失败时记录错误，不虚构成功候选", async () => {
    const p = await setup();
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          _req.method === "POST"
            ? { id: "failed-remote" }
            : { status: "failed", error: { message: "额度不足" } },
        ),
      );
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const s = structuredClone(defaultSettings);
    s.generation = {
      provider: "gateway",
      endpoint: `http://127.0.0.1:${(server.address() as any).port}`,
      model: "test",
      apiKey: "secret",
      pollIntervalMs: 100,
    };
    store!.saveSettings(s);
    queue!.start();
    const j = queue!.enqueue(p.id, "generate", p.shots[0].id),
      final = await terminal(j.id);
    expect(final.state).toBe("failed");
    expect(final.error).toContain("额度不足");
    expect(store!.project(p.id).shots[0].versions).toHaveLength(0);
  });
  it("重启遇到未知提交结果不自动重复创建收费任务", async () => {
    const p = await setup(),
      j: Job = {
        id: id(),
        projectId: p.id,
        shotId: p.shots[0].id,
        type: "generate",
        state: "running",
        progress: 5,
        message: "提交中",
        createdAt: now(),
        updatedAt: now(),
        provider: "gateway",
        phase: "submitting",
        attempts: 1,
      };
    store!.put("job", j.id, j);
    queue!.start();
    const saved = store!.get<Job>("job", j.id)!;
    expect(saved.state).toBe("failed");
    expect(saved.message).toContain("避免重复计费");
  });
  it("预演选帧：优先已选图片，其次参考图，都没有则返回 undefined", async () => {
    const p = await setup();
    const shot = p.shots[0];
    expect(animaticStillAssetId(p, shot)).toBeUndefined();
    const ref = await createDemoAsset(store!, 3);
    p.assets.push(ref);
    shot.referenceIds = [ref.id];
    expect(animaticStillAssetId(p, shot)).toBe(ref.id);
    addVersion(p, shot.id, ref, "素材", "demo", "demo");
    expect(animaticStillAssetId(p, shot)).toBe(ref.id);
    expect(placeholderSvg(7, "<b>开场&夜景</b>")).toContain("SHOT 07");
    expect(placeholderSvg(7, "<b>开场&夜景</b>")).not.toContain("<b>");
  });
  it("没有任何素材也能入队并渲染免费预演片（占位卡+字幕），且不计入 AI 用量", async () => {
    const p = await setup();
    expect(() => queue!.enqueue(p.id, "export")).toThrow();
    const j = queue!.enqueue(p.id, "animatic");
    expect(j.type).toBe("animatic");
    queue!.start();
    const final = await terminal(j.id);
    expect(final.state).toBe("succeeded");
    const saved = store!.project(p.id);
    expect(saved.exports).toHaveLength(1);
    const result = saved.exports[0];
    expect(result.kind).toBe("animatic");
    expect(result.name).toContain("animatic");
    const bytes = await readFile(store!.path(result.file));
    expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
    expect(bytes.length).toBeGreaterThan(5000);
    await runFfmpeg(["-i", store!.path(result.file), "-f", "null", "-"]);
    await stat(store!.path(`exports/${result.id}.srt`));
    const usage = summarizeUsage(store!.jobs());
    expect(usage.totalJobs).toBe(0);
    expect(usage.rows).toHaveLength(0);
  }, 30000);
  it("预演与成片任务互斥，避免并发渲染", async () => {
    const p = await setup();
    queue!.enqueue(p.id, "animatic");
    expect(() => queue!.enqueue(p.id, "animatic")).toThrow("已有渲染任务");
    expect(() => queue!.enqueue(p.id, "export")).toThrow();
  });
});
