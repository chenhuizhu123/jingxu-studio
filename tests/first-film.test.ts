import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startServer } from "../apps/server/src/app";

let root: string;
let app: Awaited<ReturnType<typeof startServer>>;
const endpoint = "/samples/first-film";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-first-film-"));
  app = await startServer({ root, port: 0, seed: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
  await rm(root, { force: true, recursive: true });
});

function request(path: string, method = "GET", language = "zh") {
  return fetch(`http://127.0.0.1:${app.port}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${app.token}`,
      "Accept-Language": language,
    },
  });
}

it("requires a workspace session and opens one independent sample per language", async () => {
  const anonymous = await fetch(`http://127.0.0.1:${app.port}/api${endpoint}`, {
    method: "POST",
  });
  expect(anonymous.status).toBe(401);
  expect(app.store.projects()).toHaveLength(0);
  const responses = await Promise.all([
    request(endpoint, "POST"),
    request(endpoint, "POST"),
    request(endpoint, "POST", "en"),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  const [zh, retry, en] = await Promise.all(responses.map((r) => r.json()));
  expect(zh.firstFilmSample).toBe("zh");
  expect(en.firstFilmSample).toBe("en");
  expect(zh.name).toContain("雨夜来信");
  expect(en.name).toContain("Letters in the Rain");
  expect(zh.shots).toHaveLength(3);
  expect(en.shots).toHaveLength(3);
  expect(retry.id).toBe(zh.id);
  expect(zh.id).not.toBe(en.id);
  expect(app.store.projects()).toHaveLength(2);
  expect(app.store.jobs()).toHaveLength(0);
});

it("retains edits after restart and creates a fresh sample only after deletion", async () => {
  const source = await (await request(endpoint, "POST")).json();
  app.store.mutate(source.id, (p) => {
    p.name = "My practice project";
  });
  await app.close();
  app = await startServer({ root, port: 0, seed: false });
  const saved = await (await request(endpoint, "POST")).json();
  expect(saved).toMatchObject({ id: source.id, name: "My practice project" });
  expect((await request(`/projects/${source.id}`, "DELETE")).status).toBe(204);
  const restored = await (await request(endpoint, "POST")).json();
  expect(restored.id).not.toBe(source.id);
  expect(restored.name).toContain("雨夜来信");
  expect(app.store.projects()).toHaveLength(1);
});

it("rolls back the example record and media on a failed save and retries cleanly", async () => {
  vi.spyOn(app.store, "flush").mockImplementationOnce(() => {
    throw new Error("Disk write failed");
  });
  expect((await request(endpoint, "POST")).status).toBe(400);
  expect(app.store.projects()).toHaveLength(0);
  expect(app.store.get("first-film-sample", "zh")).toBeUndefined();
  expect(await readdir(app.store.path("media"))).toEqual([]);
  expect((await request(endpoint, "POST")).status).toBe(200);
  expect(app.store.projects()).toHaveLength(1);
});

it("renders a first film without a model key and downloads the actual MP4 and SRT", async () => {
  const p = await (await request(endpoint, "POST", "en")).json();
  const path = `/projects/${p.id}`;
  const response = await request(path + "/render", "POST");
  expect(response.status).toBe(202);
  const job = await response.json();
  await vi.waitFor(
    () => {
      const current = app.store.jobs().find((j) => j.id === job.id);
      expect(current?.state, current?.error).toBe("succeeded");
    },
    { timeout: 15_000, interval: 100 },
  );
  const current = await (await request(path)).json();
  expect(current.firstFilmSample).toBe("en");
  const [file] = current.exports;
  expect(file.kind).toBe("video");
  const base = `http://127.0.0.1:${app.port}`;
  const [video, subtitles] = await Promise.all([
    fetch(base + file.url),
    fetch(base + file.subtitlesUrl),
  ]);
  expect(video.status).toBe(200);
  expect(subtitles.status).toBe(200);
  expect(
    Buffer.from(await video.arrayBuffer())
      .subarray(4, 8)
      .toString(),
  ).toBe("ftyp");
  expect(await subtitles.text()).toContain("Why did you come back?");
});
