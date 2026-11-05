import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startServer } from "../apps/server/src/app";
import { createDemoAsset, probeMedia } from "../packages/core/src/media";
import {
  addVersion,
  storyboardLines,
  type Job,
  type Project,
} from "../packages/core/src/model";
import { splitEpisodes } from "../packages/core/src/series";
import { Store } from "../packages/core/src/store";
import { fromBufferPromise } from "yauzl";

const script =
  "Cast: Maya\nEpisode 1: The letter\nMaya: Who sent this?\nThe light goes out.\n第二集：响铃\nMaya: Pick up the phone.\nEP. 3 – The answer\nMaya: I know your voice.";
const draft = {
  name: "Rain Letters",
  style: "Cinematic",
  format: "9:16",
  script,
};

it("honors bilingual headings, shares the declared cast and retains source opening and ending", () => {
  const plan = splitEpisodes(script, 8, 1, "en");
  expect(plan.marked).toBe(true);
  expect(plan.episodes.map(({ number, title }) => [number, title])).toEqual([
    [1, "The letter"],
    [2, "响铃"],
    [3, "The answer"],
  ]);
  expect(plan.episodes[0]).toMatchObject({
    shotCount: 2,
    opening: "Maya: Who sent this?",
    ending: "The light goes out.",
  });
  expect(plan.episodes.every((e) => e.script.startsWith("Cast: Maya"))).toBe(
    true,
  );
});

it("splits a long unmarked novel passage without dropping tail text or splitting emoji", () => {
  const text = "风".repeat(249) + "🎬" + "雨".repeat(480) + "最后一句。";
  const chunks = storyboardLines(text);
  expect(chunks.join("")).toBe(text);
  expect(
    chunks.some((chunk) => /^[\udc00-\udfff]|[\ud800-\udbff]$/.test(chunk)),
  ).toBe(false);
  const plan = splitEpisodes(`角色：林晚\n${text}`, 2, 6);
  expect(plan.episodes.map((e) => e.number)).toEqual([6, 7]);
  expect(
    plan.episodes
      .map((e) => e.script.replace(/^角色：林晚\n/, "").replaceAll("\n", ""))
      .join(""),
  ).toBe(text);
});

it("rejects duplicate numbers, empty episodes and marked episodes over the shot limit", () => {
  expect(() => splitEpisodes("Episode 2\na\n第二集\nb", 8)).toThrow("重复");
  expect(() => splitEpisodes("Episode 1\nCast: Maya\nEpisode 2\nb", 8)).toThrow(
    "空集",
  );
  expect(() => splitEpisodes("Episode 1\n" + "shot\n".repeat(61), 8)).toThrow(
    "60",
  );
  expect(splitEpisodes("第十二集：春天\n新故事", 8).episodes[0].number).toBe(
    12,
  );
  expect(
    splitEpisodes("第一百零二集：春天\n新故事", 8).episodes[0].number,
  ).toBe(102);
});

let root: string, app: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jingxu-series-"));
  app = await startServer({ root, port: 0, seed: false, startQueue: false });
});
afterEach(async () => {
  await app.close();
  await rm(root, { force: true, recursive: true });
});

function request(path: string, method = "GET", body?: unknown) {
  return fetch(`http://127.0.0.1:${app.port}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${app.token}`,
      "Content-Type": "application/json",
      "Accept-Language": "en",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function plan(input: object = draft) {
  const response = await request("/series/preview", "POST", input);
  expect(response.status).toBe(200);
  return {
    ...input,
    review: (await response.json()).review,
    requestId: randomUUID(),
  };
}
async function create() {
  const response = await request("/series", "POST", await plan());
  expect(response.status).toBe(201);
  return (await response.json()) as { seriesId: string; projects: Project[] };
}

it("previews without writes, commits reviewed episodes once and gives duplicates independent project membership", async () => {
  const payload = await plan();
  expect(app.store.projects()).toHaveLength(0);
  expect(
    (
      await request("/series", "POST", {
        ...payload,
        script: script + "\nChanged",
      })
    ).status,
  ).toBe(409);
  const response = await request("/series", "POST", payload);
  expect(response.status).toBe(201);
  const original = await response.json();
  const retry = await request("/series", "POST", payload);
  expect(retry.status).toBe(200);
  expect((await retry.json()).projects.map((p: Project) => p.id)).toEqual(
    original.projects.map((p: Project) => p.id),
  );
  expect(app.store.projects()).toHaveLength(3);
  expect(original.projects.map((p: Project) => p.shots.length)).toEqual([
    2, 1, 1,
  ]);
  const duplicate = await request(
    `/projects/${original.projects[0].id}/duplicate`,
    "POST",
    {},
  );
  expect((await duplicate.json()).episode).toBeUndefined();
  const reopened = await Store.open(root);
  try {
    expect(
      reopened
        .projects()
        .filter((p) => p.episode?.seriesId === original.seriesId),
    ).toHaveLength(3);
  } finally {
    reopened.close();
  }
});

it("appends numbers after the last episode, rejects overlapping/stale plans and keeps the first receipt", async () => {
  const { seriesId } = await create();
  const next = {
    ...draft,
    seriesId,
    script: "Maya: There was another letter.",
  };
  const one = await plan(next);
  const two = await plan({ ...next, script: "The phone rings again." });
  const added = await request("/series", "POST", one);
  expect(added.status).toBe(201);
  expect((await added.json()).projects[0].episode.number).toBe(4);
  expect((await request("/series", "POST", two)).status).toBe(409);
  expect(
    (
      await request("/series/preview", "POST", {
        ...next,
        script: "Episode 2\nDuplicate.",
      })
    ).status,
  ).toBe(409);
  expect((await request("/series", "POST", one)).status).toBe(200);
  expect(app.store.projects()).toHaveLength(4);
});

it("publishes no partial episodes or receipt after a batch storage failure", async () => {
  const payload = await plan();
  const flush = vi.spyOn(app.store, "flush").mockImplementationOnce(() => {
    throw new Error("Simulated disk failure");
  });
  try {
    expect((await request("/series", "POST", payload)).status).toBe(500);
    expect(app.store.projects()).toHaveLength(0);
    expect(app.store.get("series-receipt", payload.requestId)).toBeUndefined();
  } finally {
    flush.mockRestore();
  }
  expect((await request("/series", "POST", payload)).status).toBe(201);
});

it("shares a standalone episode through the existing project package format", async () => {
  const { projects } = await create();
  const episode = projects[0];
  const result = await request(`/projects/${episode.id}/archive`, "POST", {});
  expect(result.status).toBe(200);
  const payload = await result.json();
  const file = await fetch(
    `http://127.0.0.1:${app.port}${payload.exports[0].url}`,
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([await file.arrayBuffer()], { type: "application/zip" }),
    "episode.zip",
  );
  const response = await fetch(
    `http://127.0.0.1:${app.port}/api/projects/import`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${app.token}` },
      body: form,
    },
  );
  expect(response.status).toBe(201);
  const imported = await response.json();
  expect(imported.script).toBe(episode.script);
  expect(imported.shots).toHaveLength(2);
  expect(imported.episode).toBeUndefined();
});

it("renders only ready episodes into independent playable MP4 and SRT files", async () => {
  const { seriesId, projects } = await create();
  for (const project of projects.slice(0, 2)) {
    for (const shot of project.shots) {
      shot.duration = 2;
      addVersion(
        project,
        shot.id,
        await createDemoAsset(app.store, shot.order),
        shot.prompt,
        "demo",
        "demo",
      );
    }
    app.store.put("project", project.id, project);
  }
  const first = await request(`/series/${seriesId}/render`, "POST", {});
  expect(first.status).toBe(202);
  const queued = await first.json();
  expect(queued.jobs.map((j: Job) => j.projectId)).toEqual(
    projects.slice(0, 2).map((p) => p.id),
  );
  expect(queued.skipped).toEqual([
    { projectId: projects[2].id, reason: "incomplete" },
  ]);
  const second = await (
    await request(`/series/${seriesId}/render`, "POST", {})
  ).json();
  expect(second.jobs).toHaveLength(0);
  expect(second.skipped.map((item: { reason: string }) => item.reason)).toEqual(
    ["busy", "busy", "incomplete"],
  );
  app.queue.start();
  await vi.waitFor(
    () => {
      expect(app.store.jobs().every((job) => job.state === "succeeded")).toBe(
        true,
      );
    },
    { timeout: 20000, interval: 100 },
  );
  const firstVideo = app.store.project(projects[0].id).exports[0];
  const secondVideo = app.store.project(projects[1].id).exports[0];
  expect(firstVideo.file).not.toBe(secondVideo.file);
  expect((await probeMedia(app.store.path(firstVideo.file))).hasVideo).toBe(
    true,
  );
  expect((await probeMedia(app.store.path(secondVideo.file))).hasVideo).toBe(
    true,
  );
  const project = await (await request(`/projects/${projects[1].id}`)).json();
  const srt = await fetch(
    `http://127.0.0.1:${app.port}${project.exports[0].subtitlesUrl}`,
  );
  expect(await srt.text()).toContain("Pick up the phone.");
  expect(app.store.project(projects[2].id).exports).toHaveLength(0);
  const origin = `http://127.0.0.1:${app.port}`;
  expect((await fetch(origin + `/series-delivery/${seriesId}`)).status).toBe(
    401,
  );
  const bundle = await fetch(origin + project.seriesDeliveryUrl);
  expect(bundle.status).toBe(200);
  expect(bundle.headers.get("content-disposition")).toContain(".zip");
  const zip = await fromBufferPromise(Buffer.from(await bundle.arrayBuffer()));
  const contents = new Map<string, Buffer>();
  try {
    for await (const entry of zip.eachEntry()) {
      const parts: Uint8Array[] = [];
      for await (const chunk of await zip.openReadStreamPromise(entry))
        parts.push(chunk);
      contents.set(entry.fileName, Buffer.concat(parts));
    }
  } finally {
    zip.close();
  }
  expect(contents.get("episode-001.mp4")).toEqual(
    await readFile(app.store.path(firstVideo.file)),
  );
  expect(contents.get("episode-002.mp4")).toEqual(
    await readFile(app.store.path(secondVideo.file)),
  );
  expect(contents.get("episode-002.srt")?.toString()).toContain(
    "Pick up the phone.",
  );
  expect(JSON.parse(contents.get("manifest.json")!.toString())).toMatchObject({
    name: "Rain Letters",
    missing: [3],
    episodes: [
      { number: 1, revision: firstVideo.revision, video: "episode-001.mp4" },
      { number: 2, revision: secondVideo.revision, video: "episode-002.mp4" },
    ],
  });
});
