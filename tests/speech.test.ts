import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { writeFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../packages/core/src/store";
import { JobQueue } from "../packages/core/src/queue";
import {
  createProject,
  buildStoryboard,
  defaultSettings,
  type Job,
} from "../packages/core/src/model";
import {
  createDemoAsset,
  runFfmpeg,
  probeMedia,
} from "../packages/core/src/media";
import { addVersion } from "../packages/core/src/model";
import { validateSpeechConfig, speechLimit } from "../packages/core/src/speech";
import { startServer } from "../apps/server/src/app";
let fixtureRoot: string, wav: Buffer;
let store: Store, queue: JobQueue, server: Server | undefined;
beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "jingxu-speech-fixture-"));
  const file = join(fixtureRoot, "voice.wav");
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=640:sample_rate=24000",
    "-t",
    "1.25",
    file,
  ]);
  wav = await readFile(file);
});
afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});
afterEach(async () => {
  await queue?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (store) {
    const root = store.root;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function setup(
  handler?: (req: IncomingMessage, res: ServerResponse) => void,
) {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-speech-")));
  server = createServer(
    handler ??
      ((_req, res) => {
        res.setHeader("content-type", "audio/wav");
        res.end(wav);
      }),
  );
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const settings = structuredClone(defaultSettings);
  settings.speech = {
    endpoint,
    model: "local-voice",
    voice: "en-zh-narrator",
    speed: 1.15,
    apiKey: "speech-test-secret",
  };
  store.saveSettings(settings);
  const p = createProject({
    name: "配音测试",
    script: "阿青：Hello，今晚的雨停了。",
  });
  buildStoryboard(p);
  p.shots[0].dialogue = "Hello，今晚的雨停了。";
  p.shots[0].duration = 2;
  store.put("project", p.id, p);
  queue = new JobQueue(store);
  return p;
}
async function terminal(id: string) {
  for (let i = 0; i < 200; i++) {
    const j = store.get<Job>("job", id)!;
    if (["succeeded", "failed", "cancelled"].includes(j.state)) return j;
    await delay(25);
  }
  throw new Error("Voiceover task did not finish");
}
describe("BYOK speech-compatible voiceover", () => {
  it("uses immutable request/key snapshots, saves decodable WAV and keeps the selected audio", async () => {
    let request: any, authorization: string | undefined;
    const p = await setup((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        expect(req.url).toBe("/v1/audio/speech");
        authorization = req.headers.authorization;
        request = JSON.parse(Buffer.concat(chunks).toString());
        res.end(wav);
      });
    });
    store.mutate(p.id, (p) => {
      p.shots[0].audioAssetId = "existing-audio";
    });
    const job = queue.enqueueSpeech(p.id, p.shots[0].id, p.shots[0].dialogue);
    const current = store.settings();
    current.speech.apiKey = "replacement-key";
    current.speech.voice = "replacement-voice";
    store.saveSettings(current);
    store.mutate(p.id, (p) => (p.shots[0].dialogue = "Edited after queueing"));
    queue.start();
    const result = await terminal(job.id);
    expect(result.state).toBe("succeeded");
    expect(request).toEqual({
      model: "local-voice",
      voice: "en-zh-narrator",
      input: "Hello，今晚的雨停了。",
      speed: 1.15,
      response_format: "wav",
    });
    expect(authorization).toBe("Bearer speech-test-secret");
    const saved = store.project(p.id),
      asset = saved.assets.find((a) => a.id === result.resultId)!;
    expect(asset.name).toContain("AI Voiceover");
    expect(saved.shots[0].audioAssetId).toBe("existing-audio");
    expect(await readFile(store.path(asset.file))).toEqual(wav);
    expect((await probeMedia(store.path(asset.file))).duration).toBeCloseTo(
      1.25,
      1,
    );
    const db = await readFile(store.path("studio.sqlite"));
    expect(db.includes(Buffer.from("speech-test-secret"))).toBe(false);
    expect(JSON.stringify(store.publicSettings())).not.toContain(
      "replacement-key",
    );
  });
  it("generated voice can be selected and mixed into a real video without re-generating the visuals", async () => {
    const p = await setup();
    const image = await createDemoAsset(store, 0);
    store.mutate(p.id, (p) =>
      addVersion(p, p.shots[0].id, image, "still", "demo", "demo"),
    );
    const voice = queue.enqueueSpeech(p.id, p.shots[0].id);
    queue.start();
    expect((await terminal(voice.id)).state).toBe("succeeded");
    store.mutate(
      p.id,
      (p) =>
        (p.shots[0].audioAssetId = store.get<Job>("job", voice.id)!.resultId),
    );
    const render = queue.enqueue(p.id, "export");
    expect((await terminal(render.id)).state).toBe("succeeded");
    const result = store.project(p.id).exports[0];
    expect((await probeMedia(store.path(result.file))).hasAudio).toBe(true);
    const pcm = store.path("media/voice-check.f32");
    await runFfmpeg([
      "-i",
      store.path(result.file),
      "-map",
      "0:a:0",
      "-t",
      "1",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-f",
      "f32le",
      pcm,
    ]);
    const samples = await readFile(pcm);
    let energy = 0;
    for (let i = 0; i < samples.length; i += 4)
      energy += samples.readFloatLE(i) ** 2;
    expect(Math.sqrt(energy / (samples.length / 4))).toBeGreaterThan(0.03);
    await runFfmpeg([
      "-i",
      store.path(result.file),
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ]);
  }, 30000);
  it("rejects blank/unconfigured/stale requests and duplicate tasks but allows parallel video work", async () => {
    const p = await setup(),
      shot = p.shots[0];
    expect(() => queue.enqueueSpeech(p.id, shot.id, "different")).toThrow(
      "对白已改变",
    );
    queue.enqueueSpeech(p.id, shot.id);
    expect(() => queue.enqueueSpeech(p.id, shot.id)).toThrow("已有配音任务");
    expect(queue.enqueue(p.id, "generate", shot.id).type).toBe("generate");
    expect(() => validateSpeechConfig(defaultSettings.speech)).toThrow(
      "配置语音",
    );
    expect(() =>
      validateSpeechConfig({ ...store.settings().speech, speed: NaN }),
    ).toThrow("语速");
    store.mutate(p.id, (p) => (p.shots[0].dialogue = " "));
    expect(() => queue.enqueueSpeech(p.id, shot.id)).toThrow("3000");
  });
  it.each([
    "http",
    "json",
    "broken",
    "oversize",
    "stream-overflow",
    "redirect",
  ])(
    "rejects %s output without publishing or leaking partial files",
    async (mode) => {
      let requests = 0;
      const p = await setup((_req, res) => {
        requests++;
        if (mode === "http") {
          res.statusCode = 429;
          res.end("speech-test-secret");
        } else if (mode === "json") res.end('{"error":"speech-test-secret"}');
        else if (mode === "oversize") {
          res.setHeader("content-length", String(speechLimit + 1));
          res.flushHeaders();
        } else if (mode === "redirect") {
          res.statusCode = 302;
          res.setHeader("location", "/another");
          res.end();
        } else if (mode === "stream-overflow") {
          const b = Buffer.alloc(1024 * 1024);
          for (let i = 0; i < 33; i++) res.write(b);
          res.end();
        } else
          res.end(
            Buffer.concat([Buffer.from("RIFF----WAVE"), Buffer.alloc(100)]),
          );
      });
      const job = queue.enqueueSpeech(p.id, p.shots[0].id);
      queue.start();
      const result = await terminal(job.id);
      expect(result.state).toBe("failed");
      expect(result.error).not.toContain("speech-test-secret");
      expect(requests).toBe(1);
      expect(store.project(p.id).assets).toHaveLength(0);
      expect(await readdir(store.path("media"))).toEqual([]);
    },
  );
  it("cancel stops a stalled response, preserves cancellation and removes partial audio", async () => {
    let submitted = false;
    const p = await setup((_req, res) => {
      submitted = true;
      res.write(wav.subarray(0, 64));
    });
    const job = queue.enqueueSpeech(p.id, p.shots[0].id);
    queue.start();
    for (let i = 0; !submitted && i < 100; i++) await delay(20);
    expect(submitted).toBe(true);
    expect(queue.cancel(job.id).message).toContain("远程服务可能继续");
    await queue.close();
    expect(store.get<Job>("job", job.id)!.state).toBe("cancelled");
    expect(await readdir(store.path("media"))).toEqual([]);
    expect(store.project(p.id).assets).toHaveLength(0);
  });
  it("shutdown during submission never automatically resubmits paid work", async () => {
    let calls = 0;
    const p = await setup((_req, res) => {
      calls++;
      res.write(wav.subarray(0, 64));
    });
    const job = queue.enqueueSpeech(p.id, p.shots[0].id);
    queue.start();
    for (let i = 0; !calls && i < 100; i++) await delay(20);
    await queue.close();
    expect(store.get<Job>("job", job.id)!.state).toBe("failed");
    queue = new JobQueue(store);
    queue.start();
    await delay(300);
    expect(calls).toBe(1);
  });
  it("restart marks a submitting task unknown, while queued tasks can still run", async () => {
    const p = await setup();
    const lost = queue.enqueueSpeech(p.id, p.shots[0].id);
    store.put("job", lost.id, {
      ...lost,
      state: "running",
      phase: "submitting",
    });
    queue.start();
    expect(store.get<Job>("job", lost.id)!.state).toBe("failed");
    const recreated = queue.retry(lost.id);
    expect((await terminal(recreated.id)).state).toBe("succeeded");
  });
  it("a storage acknowledgement failure never removes audio already referenced by the project", async () => {
    const p = await setup();
    const job = queue.enqueueSpeech(p.id, p.shots[0].id);
    const mutate = store.mutate.bind(store);
    store.mutate = (...args) => {
      mutate(...args);
      throw new Error("simulated post-write acknowledgement failure");
    };
    queue.start();
    expect((await terminal(job.id)).state).toBe("failed");
    const asset = store.project(p.id).assets[0];
    expect(await readFile(store.path(asset.file))).toEqual(wav);
  });
  it("old settings gain defaults and credentials stay isolated", async () => {
    await setup();
    const saved: any = store.get("settings", "main");
    delete saved.speech;
    store.put("settings", "main", saved);
    expect(store.settings().speech).toEqual(defaultSettings.speech);
    expect(store.publicSettings().speech.hasApiKey).toBe(false);
  });
  it("startup removes only owned unreferenced speech files and keeps imported or referenced audio", async () => {
    const p = await setup();
    const prefix = "speech-00000000-0000-4000-8000-00000000000";
    const names = [
      prefix + "1.wav.partial",
      prefix + "2.wav",
      prefix + "3.wav",
      "user.wav",
      "speech-not-an-owned-id.wav",
    ];
    for (const name of names) await writeFile(store.path("media/" + name), wav);
    store.mutate(p.id, (p) =>
      p.assets.push({
        id: "kept",
        name: "kept.wav",
        kind: "audio",
        mime: "audio/wav",
        file: "media/" + names[2],
        size: wav.length,
        createdAt: new Date().toISOString(),
      }),
    );
    queue.start();
    expect((await readdir(store.path("media"))).sort()).toEqual(
      names.slice(2).sort(),
    );
  });
  it("authenticated API validates configuration, text and stale dialogue", async () => {
    const p = await setup(),
      engine = await startServer({
        root: await mkdtemp(join(tmpdir(), "jingxu-speech-api-")),
        port: 0,
        seed: false,
        startQueue: false,
      });
    try {
      const req = (path: string, method: string, body: any) =>
        fetch(`http://127.0.0.1:${engine.port}/api${path}`, {
          method,
          headers: {
            authorization: `Bearer ${engine.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      engine.store.put("project", p.id, p);
      const path = `/projects/${p.id}/shots/${p.shots[0].id}/speech`;
      expect(
        (await req(path, "POST", { text: p.shots[0].dialogue })).status,
      ).toBe(400);
      const settings: any = store.publicSettings();
      settings.speech.apiKey = "route-secret";
      const saved = await req("/settings", "PUT", settings);
      expect(saved.status).toBe(200);
      expect(JSON.stringify(await saved.json())).not.toContain("route-secret");
      expect((await req(path, "POST", { text: "outdated" })).status).toBe(409);
      expect((await req(path, "POST", { text: " " })).status).toBe(400);
      expect(
        (await req(path, "POST", { text: p.shots[0].dialogue })).status,
      ).toBe(202);
      const legacy = { ...settings };
      delete legacy.speech;
      expect((await req("/settings", "PUT", legacy)).status).toBe(200);
      expect(engine.store.settings().speech.apiKey).toBe("route-secret");
    } finally {
      await engine.close();
      await rm(engine.store.root, { recursive: true, force: true });
    }
  });
});
