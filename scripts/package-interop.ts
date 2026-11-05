import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { Store } from "../packages/core/src/store";
import {
  createProject,
  buildStoryboard,
  id,
  now,
  addVersion,
  type Project,
  type Asset,
} from "../packages/core/src/model";
import { runFfmpeg, ffmpegPath } from "../packages/core/src/media";
import {
  exportProjectPackage,
  importProjectPackage,
} from "../packages/core/src/package-archive";

const directory = resolve("artifacts/package-interop"),
  fixture = join(directory, "fixtures");
await mkdir(fixture, { recursive: true });
for (const name of [
  "desktop-return.zip",
  "mobile-origin.zip",
  "mobile-origin-evidence.json",
  "mobile-return.zip",
  "mobile-return-evidence.json",
  "report.json",
])
  await rm(join(directory, name), { force: true });
const desktopRoot = join(directory, "desktop-workspace");
await rm(desktopRoot, { recursive: true, force: true });
const store = await Store.open(desktopRoot);
function run(phase: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "flutter",
      ["test", "--no-pub", "test/package_interop_test.dart"],
      {
        cwd: "apps/mobile",
        stdio: "inherit",
        env: {
          ...process.env,
          JINGXU_INTEROP_DIR: directory,
          JINGXU_INTEROP_PHASE: phase,
          JINGXU_INTEROP_FFMPEG: ffmpegPath(),
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`Flutter package interop failed (${phase}): ${code}`),
          ),
    );
  });
}
function semantics(p: Project) {
  const a = (value?: string) =>
    value ? p.assets.findIndex((x) => x.id === value) : null;
  const c = (value: string) => p.characters.findIndex((x) => x.id === value);
  return {
    name: p.name,
    description: p.description,
    script: p.script,
    format: p.format,
    style: p.style,
    revision: p.revision,
    createdAt: p.createdAt,
    music: a(p.musicAssetId),
    musicVolume: p.musicVolume ?? 0.15,
    burnSubtitles: p.burnSubtitles ?? true,
    assets: p.assets.map((x) => ({
      name: x.name,
      kind: x.kind,
      character: x.characterId ? c(x.characterId) : null,
      createdAt: x.createdAt || p.createdAt,
    })),
    cast: p.characters.map((x) => ({
      name: x.name,
      description: x.description ?? "",
      reference: a(x.referenceId),
    })),
    shots: [...p.shots]
      .sort((x, y) => x.order - y.order)
      .map((s) => ({
        title: s.title,
        scene: s.scene,
        type: s.type,
        duration: s.duration,
        trim: s.trimStart ?? 0,
        dialogue: s.dialogue,
        prompt: s.prompt,
        characters: s.characterIds.map(c),
        references: s.referenceIds.map(a),
        audio: a(s.audioAssetId),
        captions: s.captionTrack
          ? {
              origin: s.captionTrack.origin,
              createdAt: s.captionTrack.createdAt,
              source: {
                asset: a(s.captionTrack.source.assetId),
                start: s.captionTrack.source.start,
                duration: s.captionTrack.source.duration,
              },
              cues: s.captionTrack.cues,
            }
          : null,
        review: s.review,
        note: s.note,
        selected: s.versions.find((v) => v.id === s.selectedVersionId)?.number,
        versions: s.versions.map((v) => ({
          number: v.number,
          asset: a(v.assetId),
          prompt: v.prompt,
          source: v.source,
          provider: v.provider ?? "unknown",
          createdAt: v.createdAt || p.createdAt,
        })),
        visualReview: s.visualReview
          ? {
              text: s.visualReview.text,
              frameCount: s.visualReview.frameCount,
              version: s.versions.find(
                (v) => v.id === s.visualReview!.versionId,
              )?.number,
              references: s.visualReview.referenceIds.map(a),
            }
          : null,
      })),
    exports: p.exports
      .filter((e) => e.kind === "video")
      .map((e) => ({
        name: e.name,
        revision: e.revision,
        hasSubtitles: !!e.subtitlesFile,
        createdAt: e.createdAt,
      })),
    messages: p.messages.map((m) => ({
      role: m.role,
      text: m.text,
      skill: m.skill ?? null,
      createdAt: m.createdAt,
    })),
  };
}
const digest = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
try {
  await sharp({
    create: { width: 64, height: 96, channels: 3, background: "#b6e875" },
  })
    .png()
    .toFile(join(fixture, "reference.png"));
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=64x96:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=320:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    join(fixture, "clip.mp4"),
  ]);
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    join(fixture, "voice.wav"),
  ]);
  await writeFile(
    join(fixture, "clip.srt"),
    "1\n00:00:00,000 --> 00:00:02,000\n你好 Hello\n",
  );
  const p = createProject({
    name: "Cross-device / 跨端项目",
    script: "Cast: Maya, Sam\nMaya: Keep this take.\nSam: We will meet again.",
  });
  buildStoryboard(p, "en");
  async function asset(name: string, kind: Asset["kind"], mime: string) {
    const file = `media/${id()}${name.slice(name.lastIndexOf("."))}`;
    await copyFile(join(fixture, name), store.path(file));
    return {
      id: id(),
      name,
      kind,
      mime,
      file,
      size: (await stat(store.path(file))).size,
      createdAt: now(),
    } satisfies Asset;
  }
  const image = await asset("reference.png", "image", "image/png"),
    video = await asset("clip.mp4", "video", "video/mp4"),
    audio = await asset("voice.wav", "audio", "audio/wav");
  for (const shot of p.shots) {
    shot.duration = 2;
    addVersion(
      p,
      shot.id,
      { ...image, id: id() },
      "first take",
      "fixture",
      "imported",
    );
    addVersion(
      p,
      shot.id,
      { ...video, id: id() },
      "second take",
      "fixture",
      "imported",
    );
    shot.selectedVersionId = shot.versions[1].id;
    shot.trimStart = 0.25;
  }
  p.assets.push(audio);
  p.assets[0].characterId = p.characters[0].id;
  p.characters[0].referenceId = p.assets[0].id;
  p.shots[0].referenceIds = [p.assets[0].id];
  p.shots[0].audioAssetId = audio.id;
  p.shots[0].captionTrack = {
    source: { assetId: audio.id, start: 0, duration: p.shots[0].duration },
    origin: "asr",
    createdAt: now(),
    cues: [
      { start: 0.15, end: 0.7, text: "Hello / 你好" },
      { start: 1.1, end: 1.7, text: "Keep the captions / 保留字幕" },
    ],
  };
  p.shots[0].visualReview = {
    versionId: p.shots[0].selectedVersionId!,
    createdAt: now(),
    text: "Reviewer must confirm scene continuity.",
    frameCount: 3,
    referenceIds: [p.assets[0].id],
  };
  p.shots[0].review = "changes";
  p.shots[0].note = "Keep the wardrobe / 保留服装";
  p.musicAssetId = audio.id;
  p.musicVolume = 0.12;
  p.burnSubtitles = false;
  const render = `exports/${id()}.mp4`;
  await copyFile(join(fixture, "clip.mp4"), store.path(render));
  const subtitle = render.replace(/\.mp4$/, ".srt");
  await copyFile(join(fixture, "clip.srt"), store.path(subtitle));
  p.exports.push({
    id: id(),
    name: "Episode 01.mp4",
    file: render,
    subtitlesFile: subtitle,
    kind: "video",
    createdAt: now(),
    revision: p.revision,
    size: (await stat(store.path(render))).size,
  });
  p.messages.push({
    id: id(),
    role: "user",
    text: "Preserve all takes / 保留候选",
    createdAt: now(),
    skill: "shot-repair",
  });
  store.put("project", p.id, p);
  const archive = await exportProjectPackage(store, p);
  await copyFile(
    store.path(archive.file),
    join(directory, "desktop-origin.zip"),
  );
  await writeFile(join(directory, "desktop-origin.json"), JSON.stringify(p));
  await run("first");
  const back = await importProjectPackage(
    store,
    join(directory, "desktop-return.zip"),
  );
  assert.deepEqual(
    semantics(back),
    semantics(p),
    "Desktop → Flutter → desktop changed project semantics",
  );
  for (let i = 0; i < p.assets.length; i++)
    assert.equal(
      digest(await readFile(store.path(back.assets[i].file))),
      digest(await readFile(store.path(p.assets[i].file))),
    );
  for (let i = 0; i < p.exports.length; i++) {
    assert.deepEqual(
      await readFile(store.path(back.exports[i].file)),
      await readFile(store.path(p.exports[i].file)),
    );
    assert.deepEqual(
      await readFile(store.path(back.exports[i].subtitlesFile!)),
      await readFile(store.path(p.exports[i].subtitlesFile!)),
    );
  }
  const mobile = await importProjectPackage(
    store,
    join(directory, "mobile-origin.zip"),
  );
  const evidence = JSON.parse(
    await readFile(join(directory, "mobile-origin-evidence.json"), "utf8"),
  );
  assert.deepEqual(
    semantics(mobile),
    semantics(evidence.project),
    "Flutter-origin project changed on desktop import",
  );
  for (let i = 0; i < mobile.assets.length; i++)
    assert.deepEqual(
      await readFile(store.path(mobile.assets[i].file)),
      Buffer.from(evidence.assets[i], "base64"),
    );
  for (let i = 0; i < mobile.exports.length; i++) {
    assert.deepEqual(
      await readFile(store.path(mobile.exports[i].file)),
      Buffer.from(evidence.exports[i].video, "base64"),
    );
    assert.deepEqual(
      await readFile(store.path(mobile.exports[i].subtitlesFile!)),
      Buffer.from(evidence.exports[i].subtitles, "base64"),
    );
  }
  const mobileReturn = await exportProjectPackage(store, mobile);
  await copyFile(
    store.path(mobileReturn.file),
    join(directory, "mobile-return.zip"),
  );
  await run("return");
  const returnedEvidence = JSON.parse(
    await readFile(join(directory, "mobile-return-evidence.json"), "utf8"),
  );
  assert.deepEqual(
    semantics(returnedEvidence.project),
    semantics(evidence.project),
    "Flutter → desktop → Flutter changed project semantics",
  );
  assert.deepEqual(
    returnedEvidence.assets,
    evidence.assets,
    "Mobile media bytes changed during the round trip",
  );
  assert.deepEqual(
    returnedEvidence.exports,
    evidence.exports,
    "Mobile render/caption bytes changed during the round trip",
  );
  const result = {
    generatedAt: now(),
    result: "passed",
    directions: ["desktop → Flutter → desktop", "Flutter → desktop → Flutter"],
    media: "real PNG, MP4 with audio, WAV and SRT",
    projectChecks:
      "cast/references, selected and prior takes, trim/order, audio/music, timed captions/source references, visual review, transcript and exported video",
    nativeMobileUi: "not executed",
  };
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}
