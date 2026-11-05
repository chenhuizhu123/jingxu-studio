import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ZipFile } from "yazl";
import { fromBufferPromise } from "yauzl";
import { startServer } from "../apps/server/src/app";
import { createDemoAsset, renderVideo } from "../packages/core/src/media";
import {
  addVersion,
  buildStoryboard,
  createProject,
  id,
  now,
  type Project,
} from "../packages/core/src/model";
import { captionsCurrent, captionSource } from "../packages/core/src/captions";
import { importSeriesPackage } from "../packages/core/src/series-package";
import { packageLimits } from "../packages/core/src/project-package";

type Server = Awaited<ReturnType<typeof startServer>>;
let root: string, source: Server, destination: Server;
let seriesId: string;
let episodes: Project[];
const seriesName = "雨夜来信";
const caps = { ...packageLimits };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-series-package-"));
  source = await startServer({
    root: join(root, "source"),
    port: 0,
    seed: false,
    startQueue: false,
  });
  destination = await startServer({
    root: join(root, "destination"),
    port: 0,
    seed: false,
    startQueue: false,
  });
  seriesId = id();
  episodes = await Promise.all(
    [2, 7].map(async (number) => {
      const p = createProject({
        name: `雨夜 · ${number}`,
        script: "角色：林晚\n林晚：你是谁？",
      });
      p.episode = { seriesId, seriesName, number };
      buildStoryboard(p);
      const shot = p.shots[0];
      shot.duration = 2;
      const portrait = await createDemoAsset(source.store, number);
      addVersion(p, shot.id, portrait, "First candidate", "demo", "demo");
      p.characters[0].description = "灰绿色风衣";
      p.characters[0].referenceId = portrait.id;
      p.shots[0].referenceIds = [portrait.id];
      const alternate = await createDemoAsset(source.store, number + 1);
      shot.selectedVersionId = addVersion(
        p,
        shot.id,
        alternate,
        "Alternate candidate",
        "local",
        "imported",
      ).id;
      source.store.put("project", p.id, p);
      return p;
    }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  Object.assign(packageLimits, caps);
  await Promise.all([source?.close(), destination?.close()]);
  await rm(root, { recursive: true, force: true });
});

function api(server: Server, path: string, method = "GET", body?: FormData) {
  return fetch(`http://127.0.0.1:${server.port}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${server.token}` },
    body,
  });
}
async function exportBundle() {
  const origin = `http://127.0.0.1:${source.port}`;
  const episode = await (
    await api(source, `/projects/${episodes[0].id}`)
  ).json();
  const response = await fetch(origin + episode.seriesPackageUrl);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain(
    "series-project",
  );
  return Buffer.from(await response.arrayBuffer());
}
function upload(bytes: Uint8Array, requestId = randomUUID()) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
    "series.zip",
  );
  form.append("requestId", requestId);
  return api(destination, "/series/import", "POST", form);
}
async function unpack(bytes: Buffer) {
  const archive = await fromBufferPromise(bytes);
  const items = new Map<string, Buffer>();
  try {
    for await (const entry of archive.eachEntry()) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of await archive.openReadStreamPromise(entry))
        chunks.push(chunk);
      items.set(entry.fileName, Buffer.concat(chunks));
    }
  } finally {
    archive.close();
  }
  return items;
}
async function repack(items: Map<string, Buffer>) {
  const zip = new ZipFile();
  const parts: Uint8Array[] = [];
  for (const [name, data] of items) zip.addBuffer(data, name);
  zip.end();
  for await (const chunk of zip.outputStream)
    parts.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(parts);
}
async function expectNoPartialRestore() {
  expect(destination.store.projects()).toHaveLength(0);
  expect(await readdir(destination.store.path("media"))).toEqual([]);
  expect(await readdir(destination.store.path("incoming"))).toEqual([]);
  expect(
    (await readdir(destination.store.root)).filter((file) =>
      file.startsWith(".import-"),
    ),
  ).toEqual([]);
}

it("moves a mixed v1/v2 series with real PNG, WAV, MP4, SRT and remapped references to a fresh workspace", async () => {
  const p = episodes[0],
    shot = p.shots[0];
  const wav = await readFile("apps/mobile/test/fixtures/voice.wav");
  const voice = {
    id: id(),
    name: "voice.wav",
    kind: "audio" as const,
    file: "media/voice.wav",
    size: wav.length,
    mime: "audio/wav",
    createdAt: now(),
  };
  await writeFile(source.store.path(voice.file), wav);
  p.assets.push(voice);
  shot.audioAssetId = voice.id;
  shot.captionTrack = {
    source: captionSource(shot)!,
    origin: "manual",
    createdAt: now(),
    cues: [{ start: 0.1, end: 1.8, text: "你是谁？ Who are you?" }],
  };
  p.exports.push(await renderVideo(source.store, p, () => {}));
  source.store.put("project", p.id, p);
  const settings = source.store.settings();
  settings.image.apiKey = "private-series-key";
  source.store.saveSettings(settings);
  source.queue.enqueue(episodes[1].id, "generate", episodes[1].shots[0].id);
  expect(
    (await fetch(`http://127.0.0.1:${source.port}/series-package/${seriesId}`))
      .status,
  ).toBe(401);
  const bytes = await exportBundle();
  const archive = await unpack(bytes);
  expect(JSON.parse(archive.get("series.json")!.toString())).toMatchObject({
    format: "jingxu-series-project",
    version: 1,
    name: seriesName,
    episodes: [{ number: 2 }, { number: 7 }],
  });
  expect(
    JSON.parse(archive.get("episodes/002/manifest.json")!.toString()).version,
  ).toBe(2);
  expect(
    JSON.parse(archive.get("episodes/007/manifest.json")!.toString()).version,
  ).toBe(1);
  expect(
    [...archive.values()].some((value) =>
      value.includes(Buffer.from("private-series-key")),
    ),
  ).toBe(false);
  const response = await upload(bytes);
  expect(response.status).toBe(201);
  const restored = await response.json();
  expect(restored.seriesId).not.toBe(seriesId);
  expect(restored.projects.map((p: Project) => p.episode?.number)).toEqual([
    2, 7,
  ]);
  expect(destination.store.jobs()).toEqual([]);
  expect(destination.store.settings().image.apiKey).toBe("");
  const copy = destination.store.project(restored.projects[0].id),
    restoredShot = copy.shots[0];
  expect(copy.id).not.toBe(p.id);
  expect(copy.episode?.seriesName).toBe(seriesName);
  expect(restoredShot.id).not.toBe(shot.id);
  expect(
    restoredShot.versions.find((v) => v.id === restoredShot.selectedVersionId)
      ?.number,
  ).toBe(2);
  expect(copy.characters[0].description).toBe("灰绿色风衣");
  expect(restoredShot.referenceIds).toEqual([copy.characters[0].referenceId]);
  expect(restoredShot.captionTrack?.source.assetId).toBe(
    restoredShot.audioAssetId,
  );
  expect(captionsCurrent(restoredShot)).toBe(true);
  for (const [index, asset] of copy.assets.entries()) {
    expect(await readFile(destination.store.path(asset.file))).toEqual(
      await readFile(source.store.path(p.assets[index].file)),
    );
  }
  expect(await readFile(destination.store.path(copy.exports[0].file))).toEqual(
    await readFile(source.store.path(p.exports[0].file)),
  );
  expect(
    await readFile(
      destination.store.path(copy.exports[0].subtitlesFile!),
      "utf8",
    ),
  ).toContain("Who are you?");
  expect(source.store.projects()).toHaveLength(2);
});

it("imports one copy for concurrent retries using the same request ID", async () => {
  const bytes = await exportBundle(),
    requestId = randomUUID();
  const results = await Promise.all([
    upload(bytes, requestId),
    upload(bytes, requestId),
  ]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 201]);
  const payloads = await Promise.all(
    results.map((response) => response.json()),
  );
  expect(payloads[0].seriesId).toBe(payloads[1].seriesId);
  expect(destination.store.projects()).toHaveLength(2);
  expect(await readdir(destination.store.path("media"))).toHaveLength(2);
  expect(await readdir(destination.store.path("incoming"))).toEqual([]);
  expect((await upload(await exportBundle(), requestId)).status).toBe(409);
});

it("rejects an invalid later episode without publishing earlier records or files", async () => {
  const items = await unpack(await exportBundle());
  const broken = [...items.keys()].find((name) =>
    name.startsWith("episodes/007/assets/"),
  )!;
  items.set(broken, Buffer.from("not a valid image"));
  expect((await upload(await repack(items))).status).toBe(400);
  await expectNoPartialRestore();
});

it("reverts media publication and the receipt on disk failure, then permits retry", async () => {
  const bytes = await exportBundle(),
    requestId = randomUUID();
  vi.spyOn(destination.store, "flush").mockImplementationOnce(() => {
    throw new Error("Disk full");
  });
  expect((await upload(bytes, requestId)).status).toBe(507);
  await expectNoPartialRestore();
  expect(
    destination.store.get("series-import-receipt", requestId),
  ).toBeUndefined();
  expect((await upload(bytes, requestId)).status).toBe(201);
});

it("cancels after the first episode enters publication and removes its marked folder", async () => {
  const file = join(root, "valid.zip");
  await writeFile(file, await exportBundle());
  const controller = new AbortController();
  const path = destination.store.path.bind(destination.store);
  vi.spyOn(destination.store, "path").mockImplementation((relative) => {
    const target = path(relative);
    if (relative.startsWith("media/import-")) controller.abort();
    return target;
  });
  await expect(
    importSeriesPackage(
      destination.store,
      file,
      randomUUID(),
      controller.signal,
    ),
  ).rejects.toThrow();
  await expectNoPartialRestore();
});

it("rejects unlisted episode paths and aggregate archive bytes over the configured limit", async () => {
  const valid = await exportBundle();
  const items = await unpack(valid);
  items.set("episodes/999/manifest.json", Buffer.from("{}"));
  expect((await upload(await repack(items))).status).toBe(400);
  packageLimits.totalBytes = valid.length - 100;
  expect((await upload(valid)).status).toBe(413);
  await expectNoPartialRestore();
});
