import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Store } from "../packages/core/src/store";
import {
  createProject,
  buildStoryboard,
  addVersion,
  now,
  updateShot,
} from "../packages/core/src/model";
import { runDirectorWorkflow } from "../packages/core/src/agent-workflow";
import { readSkills } from "../packages/core/src/agent";
import { createFirstFilmSamples } from "../packages/core/src/first-film";
import { probeMedia, renderVideo, runFfmpeg } from "../packages/core/src/media";
import {
  exportProjectPackage,
  importProjectPackage,
} from "../packages/core/src/package-archive";

// Run with the packaged Electron binary in Node mode. No window, browser,
// network request, model key or pre-existing user workspace is involved.
async function main() {
  assert.equal(typeof Client, "function");
  const root = await mkdtemp(join(tmpdir(), "jingxu-packaged-"));
  let store: Store | undefined;
  try {
    store = await Store.open(root, resolve(__dirname, "sql-wasm.wasm"));
    const project = createProject({
      name: "Packaged engine check",
      script: "Hello from the packaged app.",
    });
    buildStoryboard(project);
    const file = "media/check.png";
    await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#c2f751" },
    })
      .png()
      .toFile(store.path(file));
    addVersion(
      project,
      project.shots[0].id,
      {
        id: "smoke-asset",
        name: "check.png",
        kind: "image",
        file,
        mime: "image/png",
        size: (await stat(store.path(file))).size,
        createdAt: now(),
      },
      "test",
      "local",
      "imported",
    );
    store.put("project", project.id, project);
    let calls = 0;
    const result = await runDirectorWorkflow([], {
      model: async () =>
        ++calls === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "smoke-call",
                  type: "function",
                  function: {
                    name: "shot_update",
                    arguments: JSON.stringify({
                      shotId: project.shots[0].id,
                      patch: { note: "Packaged graph executed" },
                    }),
                  },
                },
              ],
            }
          : { role: "assistant", content: "Done" },
      execute: async (name, args) => {
        assert.equal(name, "shot_update");
        const data = args as { shotId: string; patch: { note: string } };
        return store!.mutate(project.id, (p) =>
          updateShot(p, data.shotId, data.patch),
        );
      },
      errorText: String,
      limitText: "Limit",
      emptyText: "Done",
    });
    assert.equal(result.output, "Done");
    assert.equal(
      store.project(project.id).shots[0].note,
      "Packaged graph executed",
    );
    const archive = await exportProjectPackage(
      store,
      store.project(project.id),
    );
    const copy = await importProjectPackage(store, store.path(archive.file));
    assert.notEqual(copy.id, project.id);
    assert.equal(copy.shots[0].note, "Packaged graph executed");
    assert.deepEqual(
      await readFile(store.path(copy.assets[0].file)),
      await readFile(store.path(file)),
    );
    assert.ok(
      (await readSkills(store, resolve(__dirname, "../skills"))).length >= 3,
    );
    const notices = await readFile(
      resolve(__dirname, "THIRD_PARTY_NOTICES.txt"),
      "utf8",
    );
    assert.ok(notices.includes("@langchain/langgraph 1.6.1"));
    assert.ok(notices.includes("gray-matter"));
    await runFfmpeg(["-version"]);
    const samples = createFirstFilmSamples(
      store,
      resolve(__dirname, "samples"),
    );
    const [zh, en] = await Promise.all([
      samples.open("zh"),
      samples.open("en"),
    ]);
    assert.notEqual(zh.id, en.id);
    assert.equal(zh.shots.length, 3);
    assert.equal(en.shots.length, 3);
    assert.equal((await samples.open("zh")).id, zh.id);
    process.env.JINGXU_FONTS_DIR = resolve(__dirname, "fonts").replace(
      /app\.asar([/\\])/,
      "app.asar.unpacked$1",
    );
    const film = await renderVideo(store, zh, () => {});
    const media = await probeMedia(store.path(film.file));
    assert.equal(media.hasVideo, true);
    assert.ok(Math.abs(media.duration - 12) <= 0.05);
    assert.ok(film.subtitlesFile);
    assert.match(
      await readFile(store.path(film.subtitlesFile), "utf8"),
      /你为什么现在才来/,
    );
    console.log(
      JSON.stringify({
        result: "passed",
        runtime: process.versions.node,
        checks: [
          "packaged MCP SDK",
          "SQLite WASM",
          "Sharp",
          "LangGraph tools",
          "ZIP media restore",
          "Skills YAML",
          "license notices",
          "bundled FFmpeg",
          "bilingual bundled first film",
          "rendered sample MP4 and SRT",
        ],
      }),
    );
  } finally {
    store?.close();
    await rm(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
