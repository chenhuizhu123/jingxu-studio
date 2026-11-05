import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startServer } from "../apps/server/src/app";
import { createDemoAsset } from "../packages/core/src/media";
import {
  addVersion,
  buildStoryboard,
  createProject,
  id,
  now,
  type Asset,
  type Project,
} from "../packages/core/src/model";
import type { SceneSyncPlan } from "../packages/core/src/series-scene";

let root: string;
let app: Awaited<ReturnType<typeof startServer>>;
let provider: Server | undefined;
let episodes: Project[];
let reference: Asset;
let existing: Asset;
let path: string;
const scene = "Café · Night";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-scene-sync-"));
  app = await startServer({ root, port: 0, seed: false, startQueue: false });
  reference = await createDemoAsset(app.store, 0);
  existing = await createDemoAsset(app.store, 1);
  const seriesId = id();
  episodes = [1, 2, 4, 7, 9, 10].map((number) => {
    const p = createProject({
      name: `Episode ${number}`,
      script: "Maya: Look.",
    });
    p.episode = {
      seriesId: number === 10 ? id() : seriesId,
      seriesName: "Letters",
      number,
    };
    buildStoryboard(p, "en");
    const shot = p.shots[0];
    shot.scene = number === 7 ? "Café · Day" : scene;
    if (number === 1) {
      p.assets.push(reference);
      shot.referenceIds = [reference.id];
    }
    if (number === 2) {
      shot.scene = "  CAFE\u0301 ·  NIGHT  ";
      const take = addVersion(
        p,
        shot.id,
        existing,
        shot.prompt,
        "demo",
        "demo",
      );
      shot.review = "approved";
      shot.visualReview = {
        versionId: take.id,
        createdAt: now(),
        text: "Previous review",
        frameCount: 1,
        referenceIds: [],
      };
      p.shots.push({
        ...structuredClone(shot),
        id: id(),
        order: 2,
        scene: "Café · Day",
        versions: [],
        selectedVersionId: undefined,
        visualReview: undefined,
      });
    }
    if (number === 4) {
      p.assets.push(existing);
      shot.referenceIds = [existing.id];
      p.shots.push({ ...structuredClone(shot), id: id(), order: 2 });
      p.shots.push({ ...structuredClone(shot), id: id(), order: 3 });
    }
    if (number === 9) {
      const filled = Array.from({ length: 10 }, (_, i) => ({
        ...existing,
        id: id(),
        name: `Reference ${i}`,
      }));
      p.assets.push(...filled);
      shot.referenceIds = filled.map((asset) => asset.id);
    }
    app.store.put("project", p.id, p);
    return p;
  });
  app.queue.enqueue(episodes[2].id, "generate", episodes[2].shots[1].id);
  path = `/projects/${episodes[0].id}/shots/${episodes[0].shots[0].id}/scene-sync/${reference.id}`;
});

afterEach(async () => {
  if (provider) {
    provider.closeAllConnections();
    await new Promise<void>((resolve) => provider!.close(() => resolve()));
    provider = undefined;
  }
  await app?.close();
  await rm(root, { force: true, recursive: true });
  vi.restoreAllMocks();
});

function api(path: string, method = "GET", body?: unknown) {
  return fetch(`http://127.0.0.1:${app.port}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${app.token}`,
      ...(body !== undefined &&
        !(body instanceof FormData) && { "Content-Type": "application/json" }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

async function preview() {
  const res = await api(path);
  expect(res.status).toBe(200);
  return (await res.json()) as SceneSyncPlan & {
    source: { referenceUrl: string };
  };
}

function reviewed(plan: SceneSyncPlan, ...episodes: number[]) {
  return {
    requestId: id(),
    review: plan.review,
    targets: plan.targets
      .filter((row) => episodes.includes(row.number))
      .map(({ projectId, review }) => ({ projectId, review })),
  };
}

it("matches only named scenes in this series and preserves takes, current images and unrelated reviews", async () => {
  const before = app.store.projects();
  const plan = await preview();
  expect(app.store.projects()).toEqual(before);
  expect(plan.targets.map(({ number, state }) => [number, state])).toEqual([
    [2, "fill"],
    [4, "review"],
    [7, "missing"],
    [9, "blocked"],
  ]);
  expect(plan.targets[1].shots.map(({ state }) => state)).toEqual([
    "add",
    "busy",
    "add",
  ]);
  expect(plan.targets[3].shots[0].state).toBe("reference-limit");
  const png = await readFile(app.store.path(reference.file));
  const served = await fetch(
    `http://127.0.0.1:${app.port}${plan.source.referenceUrl}`,
  );
  expect(served.status).toBe(200);
  expect(Buffer.from(await served.arrayBuffer())).toEqual(png);
  const data = reviewed(plan, 2, 4);
  const results = await Promise.all([
    api(path, "POST", data),
    api(path, "POST", data),
  ]);
  for (const response of results) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updatedEpisodes: 2,
      linkedShots: 3,
    });
  }
  const target = app.store.project(episodes[1].id);
  expect(target.revision).toBe(episodes[1].revision + 1);
  expect(target.shots[0].review).toBe("pending");
  expect(target.shots[0].visualReview).toBeUndefined();
  expect(target.shots[0].versions).toEqual(episodes[1].shots[0].versions);
  expect(target.shots[0].selectedVersionId).toBe(
    episodes[1].shots[0].selectedVersionId,
  );
  expect(target.shots[1]).toEqual(episodes[1].shots[1]);
  expect(
    target.assets.find((a) => a.id === target.shots[0].referenceIds[0]),
  ).toMatchObject({ file: reference.file });
  const mixed = app.store.project(episodes[2].id);
  expect(mixed.assets).toHaveLength(2);
  expect(mixed.shots[0].referenceIds).toEqual([
    existing.id,
    mixed.assets[1].id,
  ]);
  expect(mixed.shots[1].referenceIds).toEqual([existing.id]);
  expect(mixed.shots[2].referenceIds).toEqual(mixed.shots[0].referenceIds);
  expect((await preview()).targets[0].state).toBe("same");
  expect(
    app.store.projects().filter((p) => ![target.id, mixed.id].includes(p.id)),
  ).toEqual(before.filter((p) => ![target.id, mixed.id].includes(p.id)));
});

it("rejects a stale preview when a selected shot enters the generation queue", async () => {
  const body = reviewed(await preview(), 2, 4);
  app.queue.enqueue(episodes[2].id, "generate", episodes[2].shots[0].id);
  const before = app.store.projects();
  expect((await api(path, "POST", body)).status).toBe(409);
  expect(app.store.projects()).toEqual(before);
  expect(app.store.get("scene-sync-receipt", body.requestId)).toBeUndefined();
});

it("rolls back the batch on a disk failure and accepts an identical retry", async () => {
  const body = reviewed(await preview(), 2, 4);
  const before = app.store.projects();
  vi.spyOn(app.store, "flush").mockImplementationOnce(() => {
    throw new Error("Simulated disk failure");
  });
  expect((await api(path, "POST", body)).status).toBe(500);
  expect(app.store.projects()).toEqual(before);
  expect(app.store.get("scene-sync-receipt", body.requestId)).toBeUndefined();
  expect((await api(path, "POST", body)).status).toBe(200);
});

it("rejects placeholders, detached references, and missing source files", async () => {
  const source = episodes[0];
  app.store.mutate(source.id, (p) => {
    p.shots[0].scene = "Scene to confirm";
  });
  expect((await api(path)).status).toBe(400);
  app.store.mutate(source.id, (p) => {
    p.shots[0].scene = scene;
    p.shots[0].referenceIds = [];
  });
  expect((await api(path)).status).toBe(400);
  app.store.mutate(source.id, (p) => {
    p.shots[0].referenceIds = [reference.id];
  });
  expect((await api(path)).status).toBe(200);
  await unlink(app.store.path(reference.file));
  expect((await api(path)).status).toBe(400);
});

it("sends the shared reference to the image provider and preserves its bytes in a portable episode", async () => {
  const png = await readFile(app.store.path(reference.file));
  expect((await api(path, "POST", reviewed(await preview(), 2))).status).toBe(
    200,
  );
  expect((await api(`/projects/${episodes[0].id}`, "DELETE")).status).toBe(204);
  let image: unknown;
  provider = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    image = JSON.parse(Buffer.concat(chunks).toString()).image;
    res.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
  });
  await new Promise<void>((resolve) =>
    provider!.listen(0, "127.0.0.1", resolve),
  );
  const endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/api/v3`;
  const settings = app.store.settings();
  settings.image = { endpoint, model: "local-test", apiKey: "fixture-key" };
  app.store.saveSettings(settings);
  const target = app.store.project(episodes[1].id);
  const queued = await api(
    `/projects/${target.id}/shots/${target.shots[0].id}/image`,
    "POST",
    {
      endpoint,
      model: settings.image.model,
      revision: target.revision,
    },
  );
  expect(queued.status).toBe(202);
  const task = await queued.json();
  app.queue.start();
  await vi.waitFor(
    () =>
      expect(app.store.jobs().find((j) => j.id === task.id)?.state).toBe(
        "succeeded",
      ),
    { timeout: 8000 },
  );
  expect(image).toBe(`data:image/png;base64,${png.toString("base64")}`);
  const exported = await api(`/projects/${target.id}/archive`, "POST");
  expect(exported.status, await exported.clone().text()).toBe(200);
  const archive = (await exported.json()).exports.at(-1).url;
  const bytes = await (
    await fetch(`http://127.0.0.1:${app.port}${archive}`)
  ).arrayBuffer();
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "application/zip" }),
    "episode.zip",
  );
  const restored = await api("/projects/import", "POST", form);
  expect(restored.status).toBe(201);
  const project: Project = await restored.json();
  const asset = project.assets.find(
    (a) => a.id === project.shots[0].referenceIds[0],
  )!;
  expect(await readFile(app.store.path(asset.file))).toEqual(png);
});
