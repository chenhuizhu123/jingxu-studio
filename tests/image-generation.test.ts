import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { startServer } from "../apps/server/src/app";
import {
  addVersion,
  buildStoryboard,
  createProject,
  defaultSettings,
  type Job,
} from "../packages/core/src/model";
import { createDemoAsset, runFfmpeg } from "../packages/core/src/media";
import { JobQueue } from "../packages/core/src/queue";

let root: string,
  app: Awaited<ReturnType<typeof startServer>>,
  provider: Server;
let endpoint: string,
  project: ReturnType<typeof createProject>,
  png: Buffer,
  mp4: Buffer;
let requests: { path: string; auth?: string; body: any }[];
let reply: "image" | "invalid" | "hold";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-image-generation-"));
  png = await sharp({
    create: { width: 48, height: 80, channels: 3, background: "#427555" },
  })
    .png()
    .toBuffer();
  requests = [];
  reply = "image";
  provider = createServer(async (req, res) => {
    const path = req.url ?? "";
    if (req.method === "POST") {
      const chunks = [];
      for await (const bytes of req) chunks.push(bytes);
      requests.push({
        path,
        auth: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      });
    }
    res.setHeader("content-type", "application/json");
    if (path.endsWith("/images/generations")) {
      if (reply === "hold") return;
      return res.end(
        JSON.stringify({
          data: [
            {
              b64_json: (reply === "image"
                ? png
                : Buffer.from("not an image")
              ).toString("base64"),
            },
          ],
        }),
      );
    }
    if (path.endsWith("/contents/generations/tasks"))
      return res.end('{"id":"test-video"}');
    if (path.endsWith("/test-video"))
      return res.end(
        JSON.stringify({
          status: "succeeded",
          content: { video_url: endpoint + "/fixture.mp4" },
        }),
      );
    if (path.endsWith("/fixture.mp4")) {
      res.setHeader("content-type", "video/mp4");
      return res.end(mp4);
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  endpoint = `http://127.0.0.1:${(provider.address() as { port: number }).port}/api/v3`;
  app = await startServer({ root, port: 0, seed: false, startQueue: false });
  const settings = structuredClone(defaultSettings);
  settings.image = {
    endpoint,
    model: "test-seedream",
    apiKey: "image-key-test",
  };
  settings.generation = {
    provider: "ark",
    endpoint,
    model: "test-seedance",
    apiKey: "video-key-test",
    pollIntervalMs: 100,
  };
  app.store.saveSettings(settings);
  project = createProject({
    name: "Night shoot",
    script: "Cast: Maya\nMaya: Come in.",
  });
  buildStoryboard(project, "en");
  const shot = project.shots[0],
    reference = await createDemoAsset(app.store, 0);
  project.characters[0].referenceId = reference.id;
  shot.referenceIds = [reference.id];
  shot.scene = "Rain outside a corner store";
  shot.duration = 2.5;
  addVersion(project, shot.id, reference, shot.prompt, "demo", "demo");
  app.store.put("project", project.id, project);
});

afterEach(async () => {
  provider?.closeAllConnections();
  if (provider)
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

function api(path: string, method = "GET", data?: object) {
  return fetch(`http://127.0.0.1:${app.port}/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${app.token}`,
      "content-type": "application/json",
    },
    body: data && JSON.stringify(data),
  });
}
const shotPath = (suffix = "") =>
  `/projects/${project.id}/shots/${project.shots[0].id}${suffix}`;
const imageRequest = () => ({
  endpoint,
  model: "test-seedream",
  revision: project.revision,
});
async function terminal(id: string) {
  let record: Job | undefined;
  await vi.waitFor(
    () => {
      record = app.store.get<Job>("job", id);
      expect(["succeeded", "failed", "cancelled"]).toContain(record?.state);
    },
    { interval: 30, timeout: 6000 },
  );
  return record!;
}

it("uses reviewed Seedream inputs, saves a decoded candidate, and sends the selected bytes as the only Seedance first frame", async () => {
  const first = project.shots[0].selectedVersionId;
  const created = await api(shotPath("/image"), "POST", imageRequest());
  expect(created.status).toBe(202);
  const task: Job = await created.json();
  expect((await api(shotPath("/image"), "POST", imageRequest())).status).toBe(
    409,
  );
  expect(requests).toHaveLength(0);
  const snapshot = app.store.get<{ apiKey: string }>("image-config", task.id)!;
  expect(snapshot.apiKey).not.toContain("image-key-test");
  expect(await (await api("/settings")).text()).not.toContain("image-key-test");
  app.store.mutate(project.id, (p) => {
    p.shots[0].scene = "New scene after queueing";
  });
  app.queue.start();
  const image = await terminal(task.id);
  expect(image.state, image.error).toBe("succeeded");
  const reference = await readFile(app.store.path(project.assets[0].file));
  expect(requests[0]).toMatchObject({
    path: "/api/v3/images/generations",
    auth: "Bearer image-key-test",
    body: {
      model: "test-seedream",
      response_format: "b64_json",
      size: "1440x2560",
      image: `data:image/png;base64,${reference.toString("base64")}`,
      prompt: expect.stringContaining("Rain outside a corner store"),
    },
  });
  expect(requests[0].body.prompt).not.toContain("New scene");
  let saved = app.store.project(project.id);
  expect(saved.shots[0].selectedVersionId).toBe(first);
  const candidate = saved.shots[0].versions.find(
    (v) => v.id === image.resultId,
  )!;
  expect(candidate).toMatchObject({
    provider: "seedream",
    source: "generated",
  });
  const jpg = saved.assets.find((a) => a.id === candidate.assetId)!;
  const bytes = await readFile(app.store.path(jpg.file));
  expect(await sharp(bytes).metadata()).toMatchObject({
    format: "jpeg",
    width: 48,
    height: 80,
  });
  const config = { endpoint, model: "test-seedance", assetId: jpg.id };
  expect(
    (
      await api(shotPath("/first-frame"), "POST", {
        ...config,
        revision: saved.revision,
      })
    ).status,
  ).toBe(409);
  const choose = await api(shotPath(), "PATCH", {
    selectedVersionId: candidate.id,
  });
  expect(choose.status).toBe(200);
  saved = app.store.project(project.id);
  const filename = join(root, "fixture.mp4");
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=teal:s=64x112",
    "-t",
    "0.4",
    "-c:v",
    "libx264",
    filename,
  ]);
  mp4 = await readFile(filename);
  const animate = await api(shotPath("/first-frame"), "POST", {
    ...config,
    revision: saved.revision,
  });
  expect(animate.status).toBe(202);
  const video = await terminal((await animate.json()).id);
  expect(video.state, video.error).toBe("succeeded");
  expect(requests[1].body).toMatchObject({ ratio: "adaptive", duration: 4 });
  expect(
    requests[1].body.content.filter(
      (item: { type: string }) => item.type === "image_url",
    ),
  ).toEqual([
    {
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}` },
      role: "first_frame",
    },
  ]);
  saved = app.store.project(project.id);
  expect(saved.shots[0].selectedVersionId).toBe(candidate.id);
  expect(saved.shots[0].versions).toHaveLength(3);
  expect(saved.assets.map((asset) => asset.kind)).toEqual([
    "image",
    "image",
    "video",
  ]);
});

it("rejects stale or changed destinations without sending creative content and keeps old settings compatible", async () => {
  expect(
    (
      await api(shotPath("/image"), "POST", {
        ...imageRequest(),
        endpoint: endpoint + "/changed",
      })
    ).status,
  ).toBe(409);
  app.store.mutate(project.id, (p) => {
    p.shots[0].note = "changed after review";
  });
  expect((await api(shotPath("/image"), "POST", imageRequest())).status).toBe(
    409,
  );
  const publicConfig = await (await api("/settings")).json();
  delete publicConfig.image;
  expect((await api("/settings", "PUT", publicConfig)).status).toBe(200);
  expect(app.store.settings().image.apiKey).toBe("image-key-test");
  expect(requests).toEqual([]);
});

it("rejects undecodable results and requires a new review after cancellation", async () => {
  app.queue.start();
  reply = "invalid";
  const task = await (
    await api(shotPath("/image"), "POST", imageRequest())
  ).json();
  expect(await terminal(task.id)).toMatchObject({
    state: "failed",
    error: "图片服务未返回可读取的单张图片",
  });
  expect(app.store.project(project.id).assets).toHaveLength(1);
  reply = "hold";
  const pending = await (
    await api(shotPath("/image"), "POST", imageRequest())
  ).json();
  await vi.waitFor(() => expect(requests).toHaveLength(2), { interval: 30 });
  const cancel = await api(`/jobs/${pending.id}/cancel`, "POST");
  expect(await cancel.json()).toMatchObject({
    state: "cancelled",
    message: expect.stringContaining("远程服务可能继续执行"),
  });
  expect((await api(`/jobs/${pending.id}/retry`, "POST")).status).toBe(409);
  expect(
    (await readdir(app.store.path("media"))).filter((name) =>
      name.startsWith("seedream-"),
    ),
  ).toEqual([]);
});

it("marks interrupted submissions unknown and cleans only its own orphan image files", async () => {
  const task = await (
    await api(shotPath("/image"), "POST", imageRequest())
  ).json();
  app.store.put("job", task.id, {
    ...task,
    state: "running",
    phase: "submitting",
  });
  const orphan = "seedream-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg.partial";
  await writeFile(app.store.path("media/" + orphan), "partial");
  await writeFile(app.store.path("media/keep.jpg"), "unrelated");
  const restarted = new JobQueue(app.store);
  restarted.start();
  try {
    expect(await terminal(task.id)).toMatchObject({
      state: "failed",
      message: expect.stringContaining("提交结果未知"),
    });
    expect(requests).toEqual([]);
    expect(await readdir(app.store.path("media"))).toContain("keep.jpg");
    expect(await readdir(app.store.path("media"))).not.toContain(orphan);
  } finally {
    await restarted.close();
  }
});
