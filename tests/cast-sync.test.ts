import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startServer } from "../apps/server/src/app";
import { createDemoAsset } from "../packages/core/src/media";
import { addVersion, id, now, type Project } from "../packages/core/src/model";
import type { CastSyncPlan } from "../packages/core/src/series-cast";
import { Store } from "../packages/core/src/store";

let root: string, app: Awaited<ReturnType<typeof startServer>>;
let provider: Server | undefined;
let episodes: Project[];
let path: string;
const portraitDescription = "Short dark hair, moss coat, silver locket";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-cast-sync-"));
  app = await startServer({ root, port: 0, seed: false, startQueue: false });
  app.license.startTrial();
  const source = {
    name: "Letters in the rain",
    style: "Cinematic",
    format: "9:16",
    script: Array.from(
      { length: 6 },
      (_, i) =>
        `Episode ${i + 1}: Take ${i + 1}\n${i === 3 ? "Sam" : "Maya"}: Is anybody there?`,
    ).join("\n"),
  };
  const plan = await (await request("/series/preview", "POST", source)).json();
  const created = await request("/series", "POST", {
    ...source,
    review: plan.review,
    requestId: randomUUID(),
  });
  expect(created.status).toBe(201);
  episodes = (await created.json()).projects;
  const portrait = await createDemoAsset(app.store, 0);
  const previous = await createDemoAsset(app.store, 1);
  app.store.mutate(episodes[0].id, (p) => {
    p.assets.push(portrait);
    p.characters[0].referenceId = portrait.id;
    p.characters[0].description = portraitDescription;
  });
  app.store.mutate(episodes[1].id, (p) => {
    const shot = p.shots[0];
    addVersion(p, shot.id, previous, shot.prompt, "demo", "demo");
    shot.review = "approved";
    shot.visualReview = {
      versionId: shot.selectedVersionId!,
      frameCount: 1,
      text: "Old review",
      referenceIds: [],
      createdAt: now(),
    };
    p.shots.push({
      ...structuredClone(shot),
      id: id(),
      order: 2,
      characterIds: [],
      versions: [],
      selectedVersionId: undefined,
      visualReview: undefined,
    });
  });
  app.store.mutate(episodes[2].id, (p) => {
    p.assets.push(previous);
    p.characters[0].referenceId = previous.id;
    p.characters[0].description = "Earlier wardrobe";
  });
  app.store.mutate(episodes[4].id, (p) => {
    p.characters.push({
      id: id(),
      name: "maya",
      description: "Another character",
    });
  });
  app.queue.enqueue(episodes[5].id, "generate", episodes[5].shots[0].id);
  path = `/projects/${episodes[0].id}/characters/${episodes[0].characters[0].id}/cast-sync`;
});

afterEach(async () => {
  if (provider) {
    provider.closeAllConnections();
    await new Promise<void>((resolve) => provider!.close(() => resolve()));
    provider = undefined;
  }
  await app?.close();
  await rm(root, { force: true, recursive: true });
});

function request(route: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${app.token}`,
    "Accept-Language": "en",
  };
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  return fetch(`http://127.0.0.1:${app.port}/api${route}`, {
    method,
    headers,
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });
}

async function preview() {
  const res = await request(path);
  expect(res.status).toBe(200);
  return (await res.json()) as CastSyncPlan & {
    source: CastSyncPlan["source"] & { referenceUrl: string };
  };
}

function reviewed(plan: CastSyncPlan, ...numbers: number[]) {
  return {
    requestId: randomUUID(),
    review: plan.review,
    targets: plan.targets
      .filter((row) => numbers.includes(row.number))
      .map((row) => ({ projectId: row.projectId, review: row.review })),
  };
}

it("previews safe matches, preserves existing candidate files, and applies only the reviewed targets", async () => {
  const snapshots = app.store.projects();
  const plan = await preview();
  expect(plan.targets.map((row) => row.state)).toEqual([
    "fill",
    "replace",
    "missing",
    "ambiguous",
    "busy",
  ]);
  expect(plan.source).toMatchObject({
    name: "Maya",
    description: portraitDescription,
    referenceUrl: expect.stringContaining("/media/"),
  });
  expect(app.store.projects()).toEqual(snapshots);
  const body = reviewed(plan, 2);
  const changed = await request(path, "POST", body);
  expect(changed.status).toBe(200);
  expect(await changed.json()).toEqual({ updatedEpisodes: 1, linkedShots: 1 });
  const target = app.store.project(episodes[1].id);
  expect(target.characters[0].description).toBe(portraitDescription);
  expect(target.shots[0].visualReview).toBeUndefined();
  expect(target.shots[0].review).toBe("pending");
  expect(target.shots[1].review).toBe("approved");
  const previous = snapshots.find((p) => p.id === target.id)!;
  expect(target.shots[0].versions).toEqual(previous.shots[0].versions);
  expect(target.shots[0].selectedVersionId).toBe(
    previous.shots[0].selectedVersionId,
  );
  const image = target.assets.find(
    (a) => a.id === target.characters[0].referenceId,
  )!;
  const original = app.store.project(episodes[0].id).assets[0];
  expect(image.id).not.toBe(original.id);
  expect(image.characterId).toBe(target.characters[0].id);
  expect(await readFile(app.store.path(image.file))).toEqual(
    await readFile(app.store.path(original.file)),
  );
  expect(app.store.projects().filter((p) => p.id !== target.id)).toEqual(
    snapshots.filter((p) => p.id !== target.id),
  );
  expect((await request(path, "POST", body)).status).toBe(200);
  expect(app.store.project(target.id)).toEqual(target);
  expect((await preview()).targets[0].state).toBe("same");
});

it("rejects stale reviewed targets atomically and leaves existing portraits in place", async () => {
  const body = reviewed(await preview(), 2, 3);
  const first = app.store.project(episodes[1].id);
  const earlier = app.store.project(episodes[2].id).characters[0].referenceId;
  app.store.mutate(episodes[2].id, (p) => {
    p.characters[0].description = "Revised by editor";
  });
  expect((await request(path, "POST", body)).status).toBe(409);
  expect(app.store.project(first.id)).toEqual(first);
  expect(app.store.project(episodes[2].id).characters[0]).toMatchObject({
    referenceId: earlier,
    description: "Revised by editor",
  });
});

it("recovers the original records and receipt on disk failure, then commits the selected overwrite", async () => {
  const body = reviewed(await preview(), 2, 3);
  const snapshots = app.store.projects();
  const flush = vi.spyOn(app.store, "flush").mockImplementationOnce(() => {
    throw new Error("Simulated disk failure");
  });
  try {
    expect((await request(path, "POST", body)).status).toBe(500);
    expect(app.store.projects()).toEqual(snapshots);
    expect(app.store.get("cast-sync-receipt", body.requestId)).toBeUndefined();
  } finally {
    flush.mockRestore();
  }
  expect((await request(path, "POST", body)).status).toBe(200);
  const restored = await Store.open(root);
  try {
    expect(restored.project(episodes[2].id).characters[0].description).toBe(
      portraitDescription,
    );
  } finally {
    restored.close();
  }
});

it("uses the synchronized portrait in the next image request and preserves it in an individual project ZIP", async () => {
  const body = reviewed(await preview(), 2);
  expect((await request(path, "POST", body)).status).toBe(200);
  let target = app.store.project(episodes[1].id);
  const synced = target.assets.find(
    (a) => a.id === target.characters[0].referenceId,
  )!;
  const png = await readFile(app.store.path(synced.file));
  // Source membership can be removed while the target still uses the immutable image.
  expect((await request(`/projects/${episodes[0].id}`, "DELETE")).status).toBe(
    204,
  );
  let submitted: any;
  provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    submitted = JSON.parse(Buffer.concat(chunks).toString());
    res.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
  });
  await new Promise<void>((resolve) =>
    provider!.listen(0, "127.0.0.1", resolve),
  );
  const endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/api/v3`;
  const settings = app.store.settings();
  settings.image = {
    endpoint,
    model: "seedream-local-test",
    apiKey: "fixture-key",
  };
  app.store.saveSettings(settings);
  const response = await request(
    `/projects/${target.id}/shots/${target.shots[0].id}/image`,
    "POST",
    {
      endpoint,
      model: settings.image.model,
      revision: target.revision,
    },
  );
  expect(response.status).toBe(202);
  const task = await response.json();
  app.queue.start();
  await vi.waitFor(
    () =>
      expect(app.store.jobs().find((j) => j.id === task.id)?.state).toBe(
        "succeeded",
      ),
    { timeout: 8000 },
  );
  expect(submitted.prompt).toContain(portraitDescription);
  expect(submitted.image).toBe(
    `data:image/png;base64,${png.toString("base64")}`,
  );
  const archive = await (
    await request(`/projects/${target.id}/archive`, "POST")
  ).json();
  const bytes = await (
    await fetch(`http://127.0.0.1:${app.port}${archive.exports.at(-1).url}`)
  ).arrayBuffer();
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "application/zip" }),
    "episode.zip",
  );
  const restored = await request("/projects/import", "POST", form);
  expect(restored.status).toBe(201);
  target = await restored.json();
  const reference = target.assets.find(
    (a) => a.id === target.characters[0].referenceId,
  )!;
  expect(await readFile(app.store.path(reference.file))).toEqual(png);
});

it("discards a visual review that completed after the role was synchronized", async () => {
  let requested!: () => void, reply!: () => void;
  const entered = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const release = new Promise<void>((resolve) => {
    reply = resolve;
  });
  provider = createServer(async (_req, res) => {
    requested();
    await release;
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: "Review with the previous portrait" } },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) =>
    provider!.listen(0, "127.0.0.1", resolve),
  );
  const settings = app.store.settings();
  settings.agent = {
    endpoint: `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`,
    model: "visual-fixture",
    apiKey: "fixture-key",
  };
  app.store.saveSettings(settings);
  const target = episodes[1];
  const pending = request(
    `/projects/${target.id}/shots/${target.shots[0].id}/visual-review`,
    "POST",
  );
  try {
    await entered;
    const res = await request(path, "POST", reviewed(await preview(), 2));
    expect(res.status).toBe(200);
  } finally {
    reply();
  }
  expect((await pending).status).toBe(409);
  expect(app.store.project(target.id).shots[0].visualReview).toBeUndefined();
});
