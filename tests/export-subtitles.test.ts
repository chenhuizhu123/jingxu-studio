import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../apps/server/src/app";
import { createProject, id, now } from "../packages/core/src/model";
it("exports expose signed revision-specific SRT files instead of rebuilding captions from a changed project", async () => {
  const engine = await startServer({
    root: await mkdtemp(join(tmpdir(), "jingxu-srt-")),
    port: 0,
    seed: false,
    startQueue: false,
  });
  try {
    const p = createProject({ name: "Revision history" }),
      exportId = id();
    p.exports = [
      {
        id: exportId,
        name: "Film-r1.mp4",
        file: "exports/first.mp4",
        subtitlesFile: "exports/first.srt",
        kind: "video",
        revision: 1,
        size: 1,
        createdAt: now(),
      },
    ];
    engine.store.put("project", p.id, p);
    const saved = "1\n00:00:00,250 --> 00:00:00,800\nOriginal captions\n";
    await writeFile(engine.store.path("exports/first.srt"), saved);
    const base = `http://127.0.0.1:${engine.port}`;
    const headers = { authorization: `Bearer ${engine.token}` };
    let data = (await (
      await fetch(`${base}/api/projects/${p.id}`, { headers })
    ).json()) as any;
    const url = data.exports[0].subtitlesUrl;
    expect(url).toContain("/subtitles?");
    engine.store.mutate(p.id, (p) => (p.script = "New script and revision"));
    const r = await fetch(base + url);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(saved);
    expect(r.headers.get("content-disposition")).toContain("Film-r1.srt");
    expect(
      (await fetch(`${base}/download/${p.id}/${exportId}/subtitles`)).status,
    ).toBe(401);
    expect(
      (await fetch(base + url.replace("signature=", "signature=x"))).status,
    ).toBe(401);
    engine.store.mutate(
      p.id,
      (p) => (p.exports[0].subtitlesFile = "exports/missing.srt"),
    );
    data = (await (
      await fetch(`${base}/api/projects/${p.id}`, { headers })
    ).json()) as any;
    expect(data.exports[0].subtitlesUrl).toBeUndefined();
    expect(
      (
        await fetch(`${base}/download/${p.id}/${exportId}/subtitles`, {
          headers,
        })
      ).status,
    ).toBe(404);
  } finally {
    await engine.close();
    await rm(engine.store.root, { recursive: true, force: true });
  }
});
