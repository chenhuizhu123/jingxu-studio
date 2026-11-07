import { afterEach, describe, it, expect } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { Store } from "../packages/core/src/store";
import { JobQueue } from "../packages/core/src/queue";
import {
  createProject,
  buildStoryboard,
  addVersion,
  id,
  now,
  defaultSettings,
  makeSrt,
  updateShot,
  reorderShots,
  type Asset,
  type Job,
} from "../packages/core/src/model";
import {
  captionSource,
  captionsCurrent,
  captionTrackSchema,
} from "../packages/core/src/captions";
import {
  parseTranscription,
  recoverTranscriptionFiles,
} from "../packages/core/src/transcription";
import { runFfmpeg, probeMedia, renderVideo } from "../packages/core/src/media";
import {
  exportProjectPackage,
  importProjectPackage,
} from "../packages/core/src/package-archive";
import { startServer } from "../apps/server/src/app";
let store: Store, queue: JobQueue, server: Server | undefined;
afterEach(async () => {
  await queue?.close();
  queue = undefined!;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (store) {
    const root = store.root;
    store.close();
    store = undefined!;
    await rm(root, { recursive: true, force: true });
  }
});
async function setup(
  handler?: (req: IncomingMessage, res: ServerResponse) => void,
) {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-asr-")));
  queue = new JobQueue(store);
  server = createServer(
    handler ??
      ((_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            text: "Hello. 雨停了。",
            segments: [
              { start: 0.25, end: 0.8, text: "Hello." },
              { start: 1.1, end: 1.7, text: "雨停了。" },
            ],
          }),
        );
      }),
  );
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const settings = structuredClone(defaultSettings);
  settings.transcription = {
    endpoint: `http://127.0.0.1:${(server.address() as any).port}/v1`,
    model: "timestamp-model",
    language: "zh",
    apiKey: "asr-secret",
  };
  store.saveSettings(settings);
  const p = createProject({
    name: "Timecoded film",
    script: "Mia: Keep the original script.",
  });
  buildStoryboard(p);
  p.shots[0].duration = 2;
  p.shots[0].trimStart = 3;
  const asset: Asset = {
    id: id(),
    name: "Six seconds.mp4",
    file: `media/${id()}.mp4`,
    kind: "video",
    mime: "video/mp4",
    size: 0,
    createdAt: now(),
  };
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=0x202020:s=72x128:r=25:d=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=16000:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=16000:duration=3",
    "-filter_complex",
    "[1:a][2:a]concat=n=2:v=0:a=1[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-t",
    "6",
    store.path(asset.file),
  ]);
  asset.size = (await stat(store.path(asset.file))).size;
  addVersion(p, p.shots[0].id, asset, "source", "local", "imported");
  store.put("project", p.id, p);
  return p;
}
async function terminal(key: string) {
  for (let i = 0; i < 300; i++) {
    const j = store.get<Job>("job", key)!;
    if (["succeeded", "failed", "cancelled"].includes(j.state)) return j;
    await delay(20);
  }
  throw Error("ASR did not finish");
}
async function pcmFrequency(file: string) {
  const raw = store.path(`exports/${id()}.f32`);
  await runFfmpeg([
    "-i",
    file,
    "-t",
    "0.5",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "f32le",
    raw,
  ]);
  const bytes = await readFile(raw);
  let crossings = 0;
  for (let i = 4; i < bytes.length; i += 4)
    if (bytes.readFloatLE(i - 4) <= 0 && bytes.readFloatLE(i) > 0) crossings++;
  return crossings / (bytes.length / 4 / 16000);
}
describe("timestamped speech recognition and caption delivery", () => {
  it("uploads only the rendered video audio range, snapshots config and returns a candidate without overwriting script", async () => {
    let captured: FormData | undefined,
      authorization = "";
    const p = await setup((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (b) => chunks.push(b));
      req.on("end", () => {
        void (async () => {
          expect(req.url).toBe("/v1/audio/transcriptions");
          authorization = req.headers.authorization!;
          captured = await new Request("http://local.test", {
            method: "POST",
            headers: req.headers as any,
            body: Buffer.concat(chunks),
          }).formData();
          res.end(
            JSON.stringify({
              text: "Hello",
              segments: [{ start: 0.25, end: 1.5, text: "Hello" }],
            }),
          );
        })();
      });
    });
    const job = queue.enqueueTranscription(
      p.id,
      p.shots[0].id,
      captionSource(p.shots[0]),
    );
    const settings = store.settings();
    settings.transcription.model = "replacement";
    settings.transcription.apiKey = "different-secret";
    store.saveSettings(settings);
    queue.start();
    const result = await terminal(job.id);
    expect(result.state).toBe("succeeded");
    expect(authorization).toBe("Bearer asr-secret");
    expect(captured!.get("model")).toBe("timestamp-model");
    expect(captured!.get("language")).toBe("zh");
    expect(captured!.get("response_format")).toBe("verbose_json");
    expect(captured!.get("timestamp_granularities[]")).toBe("segment");
    const audio = captured!.get("file") as File;
    expect(audio.name).toBe("shot.wav");
    const file = store.path("exports/upload.wav");
    await writeFile(file, Buffer.from(await audio.arrayBuffer()));
    expect((await probeMedia(file)).duration).toBeCloseTo(2, 1);
    expect(await pcmFrequency(file)).toBeCloseTo(880, -1);
    expect(store.project(p.id).shots[0].dialogue).toBe(
      " Keep the original script.",
    );
    expect(store.project(p.id).shots[0].captionTrack).toBeUndefined();
    expect(result.captionResult!.source.start).toBe(3);
    expect(JSON.stringify(store.jobs())).not.toContain("asr-secret");
    expect(
      (await readFile(store.path("studio.sqlite"))).includes(
        Buffer.from("asr-secret"),
      ),
    ).toBe(false);
    expect(
      (await readdir(store.path("exports"))).some((f) => f.startsWith(".asr-")),
    ).toBe(false);
  });
  it("prefers selected voiceover from zero and pads only the audible shot range", async () => {
    let captured: Buffer | undefined;
    const p = await setup((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (b) => chunks.push(b));
      req.on("end", () => {
        void (async () => {
          const form = await new Request("http://local.test", {
            method: "POST",
            headers: req.headers as any,
            body: Buffer.concat(chunks),
          }).formData();
          captured = Buffer.from(
            await (form.get("file") as File).arrayBuffer(),
          );
          res.end(JSON.stringify({ text: "", segments: [] }));
        })();
      });
    });
    const voice: Asset = {
      id: id(),
      name: "voice.wav",
      file: `media/${id()}.wav`,
      mime: "audio/wav",
      kind: "audio",
      size: 0,
      createdAt: now(),
    };
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=640:sample_rate=16000:duration=1",
      store.path(voice.file),
    ]);
    voice.size = (await stat(store.path(voice.file))).size;
    store.mutate(p.id, (p) => {
      p.assets.push(voice);
      p.shots[0].audioAssetId = voice.id;
    });
    const job = queue.enqueueTranscription(p.id, p.shots[0].id);
    queue.start();
    const result = await terminal(job.id);
    expect(result.state).toBe("succeeded");
    expect(result.captionResult!.source).toEqual({
      assetId: voice.id,
      start: 0,
      duration: 2,
    });
    const file = store.path("exports/captured.wav");
    await writeFile(file, captured!);
    expect(await pcmFrequency(file)).toBeCloseTo(640, -1);
  });
  it("uses applied segment timestamps in actual SRT and burned MP4, and keeps them through ZIP restoration", async () => {
    const p = await setup();
    const job = queue.enqueueTranscription(p.id, p.shots[0].id);
    queue.start();
    const result = await terminal(job.id);
    expect(result.state).toBe("succeeded");
    store.mutate(p.id, (p) =>
      updateShot(p, p.shots[0].id, { captionTrack: result.captionResult }),
    );
    const saved = store.project(p.id);
    expect(captionsCurrent(saved.shots[0])).toBe(true);
    expect(makeSrt(saved.shots)).toContain("00:00:00,250 --> 00:00:00,800");
    const video = await renderVideo(store, saved, () => {});
    expect(await readFile(store.path(video.subtitlesFile!), "utf8")).toContain(
      "00:00:01,100 --> 00:00:01,700",
    );
    const frames: Buffer[] = [];
    for (const time of [0.1, 0.5]) {
      const file = store.path(`exports/frame-${time}.png`);
      await runFfmpeg([
        "-ss",
        String(time),
        "-i",
        store.path(video.file),
        "-frames:v",
        "1",
        file,
      ]);
      frames.push(await sharp(file).raw().toBuffer());
    }
    let changed = 0;
    for (let i = 0; i < frames[0].length; i++)
      if (Math.abs(frames[0][i] - frames[1][i]) > 30) changed++;
    expect(changed).toBeGreaterThan(200);
    const archive = await exportProjectPackage(store, saved),
      copy = await importProjectPackage(store, store.path(archive.file));
    expect(copy.shots[0].captionTrack!.source.assetId).toBe(copy.assets[0].id);
    expect(makeSrt(copy.shots)).toBe(makeSrt(saved.shots));
  }, 30000);
  it("stale subtitles block SRT and rendering while project backups remain exportable", async () => {
    const p = await setup();
    const track = parseTranscription(
      { segments: [{ start: 0.1, end: 1, text: "Old" }] },
      captionSource(p.shots[0])!,
    );
    updateShot(p, p.shots[0].id, { captionTrack: track });
    updateShot(p, p.shots[0].id, { duration: 3 });
    expect(captionsCurrent(p.shots[0])).toBe(false);
    expect(() => makeSrt(p.shots)).toThrow("音轨或剪辑");
    await expect(renderVideo(store, p, () => {})).rejects.toThrow("音轨或剪辑");
    const archive = await exportProjectPackage(store, p);
    expect(
      (await importProjectPackage(store, store.path(archive.file))).shots[0]
        .captionTrack,
    ).toEqual(expect.objectContaining({ origin: "asr" }));
  });
  it("validates cue order/bounds, allows empty silence tracks and offsets them when shots reorder", () => {
    const p = createProject({
      name: "Offsets",
      script: "Mia: First\nMia: Next",
    });
    buildStoryboard(p);
    p.shots[0].duration = 3;
    p.shots[0].audioAssetId = "a";
    p.shots[1].duration = 2;
    p.shots[0].captionTrack = parseTranscription(
      { segments: [{ start: 0.2, end: 0.8, text: "Cue" }] },
      { assetId: "a", start: 0, duration: 3 },
    );
    expect(makeSrt(p.shots)).toContain("00:00:03,000 --> 00:00:05,000");
    reorderShots(p, [p.shots[1].id, p.shots[0].id]);
    expect(makeSrt(p.shots)).toContain("00:00:02,200 --> 00:00:02,800");
    const source = { assetId: "a", start: 0, duration: 3 };
    expect(parseTranscription({ text: "", segments: [] }, source).cues).toEqual(
      [],
    );
    expect(() => parseTranscription({ text: "text only" }, source)).toThrow();
    expect(() =>
      parseTranscription({ text: "text only", segments: [] }, source),
    ).toThrow();
    expect(() =>
      parseTranscription(
        { segments: [{ start: 1, end: 4, text: "x" }] },
        source,
      ),
    ).toThrow();
    expect(() =>
      captionTrackSchema.parse({
        source,
        origin: "manual",
        createdAt: now(),
        cues: [
          { start: 1, end: 2, text: "a" },
          { start: 1.5, end: 2.5, text: "b" },
        ],
      }),
    ).toThrow();
  });
  for (const mode of [
    "http",
    "redirect",
    "json",
    "utf8",
    "missing",
    "oversize",
  ]) {
    it(`rejects ${mode} responses without publishing or leaking provider output`, async () => {
      const p = await setup((_req, res) => {
        if (mode === "http") {
          res.statusCode = 429;
          res.end("asr-secret");
        } else if (mode === "redirect") {
          res.statusCode = 302;
          res.setHeader("location", "/other");
          res.end();
        } else if (mode === "utf8") res.end(Buffer.from([255]));
        else if (mode === "oversize") {
          res.setHeader("content-length", String(2 * 1024 * 1024 + 1));
          res.flushHeaders();
        } else res.end(mode === "json" ? "not JSON" : '{"text":"asr-secret"}');
      });
      const j = queue.enqueueTranscription(p.id, p.shots[0].id);
      queue.start();
      const result = await terminal(j.id);
      expect(result.state).toBe("failed");
      expect(result.error).not.toContain("asr-secret");
      expect(store.project(p.id).shots[0].captionTrack).toBeUndefined();
      expect(await readdir(store.path("exports"))).toEqual([]);
    });
  }
  it("cancels an in-flight upload response and never resubmits after shutdown", async () => {
    let calls = 0;
    const p = await setup((_req, res) => {
      calls++;
      res.write("{");
    });
    const j = queue.enqueueTranscription(p.id, p.shots[0].id);
    queue.start();
    for (let i = 0; calls === 0 && i < 100; i++) await delay(20);
    expect(calls).toBe(1);
    await queue.close();
    expect(store.get<Job>("job", j.id)!.state).toBe("failed");
    queue = new JobQueue(store);
    queue.start();
    await delay(300);
    expect(calls).toBe(1);
    expect(await readdir(store.path("exports"))).toEqual([]);
  });
  it("requires an unchanged source, rejects duplicate requests and cleans only owned scratch files", async () => {
    const p = await setup();
    expect(() =>
      queue.enqueueTranscription(p.id, p.shots[0].id, {
        ...captionSource(p.shots[0])!,
        start: 0,
      }),
    ).toThrow("音轨");
    queue.enqueueTranscription(p.id, p.shots[0].id);
    expect(() => queue.enqueueTranscription(p.id, p.shots[0].id)).toThrow(
      "已有识别",
    );
    const own = `.asr-${id()}.wav`;
    for (const name of [
      own,
      "user.wav",
      ".asr------------------------------------.wav",
    ])
      await writeFile(store.path(`exports/${name}`), "x");
    recoverTranscriptionFiles(store);
    expect(await readdir(store.path("exports"))).not.toContain(own);
    expect(await readdir(store.path("exports"))).toContain("user.wav");
  });
  it("authenticated API saves ASR configuration and supports explicit caption apply/clear with revision protection", async () => {
    const p = await setup(),
      engine = await startServer({
        root: await mkdtemp(join(tmpdir(), "jingxu-asr-api-")),
        port: 0,
        seed: false,
        startQueue: false,
      });
    engine.license.startTrial();
    try {
      engine.store.put("project", p.id, p);
      const req = (path: string, method: string, body: unknown) =>
        fetch(`http://127.0.0.1:${engine.port}/api${path}`, {
          method,
          headers: {
            authorization: `Bearer ${engine.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      let r = await req("/settings", "PUT", store.settings());
      expect(r.status).toBe(200);
      expect(JSON.stringify(await r.json())).not.toContain("asr-secret");
      r = await req(
        `/projects/${p.id}/shots/${p.shots[0].id}/transcribe`,
        "POST",
        { source: captionSource(p.shots[0]) },
      );
      expect(r.status).toBe(202);
      const track = parseTranscription(
        { segments: [{ start: 0.2, end: 1, text: "Hi" }] },
        captionSource(p.shots[0])!,
      );
      const path = `/projects/${p.id}/shots/${p.shots[0].id}`;
      expect(
        (
          await req(path, "PATCH", {
            revision: p.revision,
            captionTrack: track,
          })
        ).status,
      ).toBe(200);
      expect(
        (await req(path, "PATCH", { revision: p.revision, captionTrack: null }))
          .status,
      ).toBe(409);
      expect((await req(path, "PATCH", { captionTrack: null })).status).toBe(
        200,
      );
      expect(engine.store.project(p.id).shots[0].captionTrack).toBeUndefined();
    } finally {
      await engine.close();
      await rm(engine.store.root, { recursive: true, force: true });
    }
  });
});
