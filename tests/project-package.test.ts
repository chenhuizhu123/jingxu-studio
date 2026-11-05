import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  mkdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZipFile } from "yazl";
import { Store } from "../packages/core/src/store";
import {
  createProject,
  buildStoryboard,
  addVersion,
  id,
  now,
  type Project,
} from "../packages/core/src/model";
import { createDemoAsset, runFfmpeg } from "../packages/core/src/media";
import {
  exportProjectPackage,
  importProjectPackage,
  recoverInterruptedImports,
} from "../packages/core/src/package-archive";
import {
  portableManifest,
  validatePortableProject,
  safePackagePath,
  packageLimits,
} from "../packages/core/src/project-package";

let store: Store | undefined;
const limits = { ...packageLimits };
afterEach(async () => {
  vi.restoreAllMocks();
  Object.assign(packageLimits, limits);
  if (!store) return;
  const root = store.root;
  store.close();
  store = undefined;
  await rm(root, { recursive: true, force: true });
});
async function setup(withImage = true) {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-package-")));
  const p = createProject({
    name: "Project with versions",
    script: "林晚：你好。",
  });
  buildStoryboard(p);
  p.shots = p.shots.slice(0, 1);
  p.shots[0].duration = 2;
  if (withImage) {
    const a = await createDemoAsset(store, 0);
    addVersion(p, p.shots[0].id, a, "Keep face", "local", "imported");
    p.characters[0].referenceId = a.id;
    a.characterId = p.characters[0].id;
    p.shots[0].referenceIds = [a.id];
    p.shots[0].characterIds = [p.characters[0].id];
    p.shots[0].visualReview = {
      versionId: p.shots[0].versions[0].id,
      createdAt: now(),
      text: "Human review required",
      frameCount: 1,
      referenceIds: [a.id],
    };
  }
  p.messages = [
    {
      id: id(),
      role: "user",
      text: "Keep the setting",
      createdAt: now(),
      skill: "repair",
    },
  ];
  store.put("project", p.id, p);
  return p;
}
async function zip(
  entries: { name: string; data: Buffer | string; mode?: number }[],
) {
  const archive = new ZipFile(),
    chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on("data", (chunk) => chunks.push(chunk));
    archive.outputStream.on("error", reject);
    archive.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  for (const e of entries)
    archive.addBuffer(Buffer.from(e.data), e.name, {
      compress: false,
      mode: e.mode,
    });
  archive.end();
  const file = join(store!.root, `${id()}.zip`);
  await writeFile(file, await bytes);
  return file;
}
async function fixture(
  p: Project,
  options: { missing?: boolean; invalidImage?: boolean; version?: number } = {},
) {
  const manifest = portableManifest(p);
  manifest.project.assets.forEach((a) => (a.file = `assets/${a.id}.png`));
  if (options.version !== undefined)
    (manifest as any).version = options.version;
  return zip([
    { name: "manifest.json", data: JSON.stringify(manifest) },
    ...(options.missing
      ? []
      : await Promise.all(
          p.assets.map(async (a) => ({
            name: `assets/${a.id}.png`,
            data: options.invalidImage
              ? Buffer.from("not an image")
              : await readFile(store!.path(a.file)),
          })),
        )),
  ]);
}
describe("Portable project archives using yazl and yauzl", () => {
  it("rejects an audio-only file labelled as a video asset", async () => {
    const p = await setup(false),
      file = "media/audio.wav";
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      store!.path(file),
    ]);
    p.assets.push({
      id: "fake-video",
      name: "fake.mp4",
      kind: "video",
      file: "assets/fake.mp4",
      mime: "video/mp4",
      size: 0,
      createdAt: now(),
    });
    const archive = await zip([
      { name: "manifest.json", data: JSON.stringify(portableManifest(p)) },
      { name: "assets/fake.mp4", data: await readFile(store!.path(file)) },
    ]);
    await expect(importProjectPackage(store!, archive)).rejects.toThrow();
    expect(store!.projects()).toHaveLength(1);
  });
  it("round-trips real media, selected versions, audio, renders, captions and review links without overwriting the original", async () => {
    const p = await setup();
    const audioFile = "media/voice.wav",
      videoFile = "media/clip.mp4";
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:duration=1",
      store!.path(audioFile),
    ]);
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x64:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      store!.path(videoFile),
    ]);
    const audio = {
      id: id(),
      name: "voice.wav",
      kind: "audio" as const,
      file: audioFile,
      mime: "audio/wav",
      size: (await stat(store!.path(audioFile))).size,
      createdAt: now(),
    };
    const video = {
      id: id(),
      name: "clip.mp4",
      kind: "video" as const,
      file: videoFile,
      mime: "video/mp4",
      size: (await stat(store!.path(videoFile))).size,
      createdAt: now(),
    };
    p.assets.push(audio);
    addVersion(p, p.shots[0].id, video, "second take", "local", "imported");
    p.shots[0].selectedVersionId = p.shots[0].versions[1].id;
    p.shots[0].trimStart = 0.2;
    p.shots[0].audioAssetId = audio.id;
    p.musicAssetId = audio.id;
    p.exports.push({
      id: id(),
      name: "Final.mp4",
      kind: "video",
      file: videoFile,
      createdAt: now(),
      revision: p.revision,
      size: video.size,
    });
    await writeFile(
      store!.path("media/clip.srt"),
      "1\n00:00:00,000 --> 00:00:01,000\nHello\n",
    );
    (p as any).settings = { apiKey: "must-not-travel" };
    const archive = await exportProjectPackage(store!, p);
    const original = store!.project(p.id);
    const restored = await importProjectPackage(
      store!,
      store!.path(archive.file),
    );
    expect(restored.id).not.toBe(p.id);
    expect(store!.project(p.id)).toEqual(original);
    expect(store!.projects()).toHaveLength(2);
    expect(JSON.stringify(restored)).not.toContain("must-not-travel");
    expect(restored.messages[0].text).toBe(p.messages[0].text);
    expect(restored.messages[0].id).not.toBe(p.messages[0].id);
    const shot = restored.shots[0];
    expect(shot.selectedVersionId).toBe(shot.versions[1].id);
    expect(shot.trimStart).toBe(0.2);
    expect(shot.visualReview?.versionId).toBe(shot.versions[0].id);
    expect(shot.visualReview?.referenceIds).toEqual(shot.referenceIds);
    expect(restored.characters[0].referenceId).toBe(restored.assets[0].id);
    expect(restored.assets[0].characterId).toBe(restored.characters[0].id);
    expect(shot.audioAssetId).toBe(restored.musicAssetId);
    for (let i = 0; i < p.assets.length; i++) {
      expect(await readFile(store!.path(restored.assets[i].file))).toEqual(
        await readFile(store!.path(p.assets[i].file)),
      );
    }
    expect(await readFile(store!.path(restored.exports[0].file))).toEqual(
      await readFile(store!.path(videoFile)),
    );
    expect(
      await readFile(store!.path(restored.exports[0].subtitlesFile!), "utf8"),
    ).toContain("Hello");
    expect(
      (await readdir(store!.root)).some((f) => f.startsWith(".import-")),
    ).toBe(false);
  });
  it.each(["desktop", "mobile"])(
    "imports legacy %s packages with remapped asset filenames",
    async (variant) => {
      const p = await setup();
      const a = p.assets[0];
      const path =
        variant === "desktop"
          ? `assets/${a.id}-${a.name}`
          : `assets/${a.id}.png`;
      const file = await zip([
        { name: "project.json", data: JSON.stringify(p) },
        { name: path, data: await readFile(store!.path(a.file)) },
      ]);
      const restored = await importProjectPackage(store!, file);
      expect(restored.assets).toHaveLength(1);
      expect(restored.shots[0].versions[0].assetId).toBe(restored.assets[0].id);
    },
  );
  it.each([{ missing: true }, { invalidImage: true }, { version: 999 }])(
    "rejects invalid packages and removes partial imports: %j",
    async (options) => {
      const p = await setup();
      const file = await fixture(p, options);
      await expect(importProjectPackage(store!, file)).rejects.toThrow();
      expect(store!.projects()).toHaveLength(1);
      expect(
        (await readdir(store!.root)).some((f) => f.startsWith(".import-")),
      ).toBe(false);
      expect(
        (await readdir(store!.path("media"))).some((f) =>
          f.startsWith("import-"),
        ),
      ).toBe(false);
    },
  );
  it("rolls back media publication when the database commit fails", async () => {
    const p = await setup(),
      file = await fixture(p);
    vi.spyOn(store!, "put").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await expect(importProjectPackage(store!, file)).rejects.toThrow();
    expect(store!.projects()).toHaveLength(1);
    expect(
      (await readdir(store!.path("media"))).some((f) =>
        f.startsWith("import-"),
      ),
    ).toBe(false);
  });
  it("rejects cancelled imports without publishing a project", async () => {
    const p = await setup(),
      file = await fixture(p),
      controller = new AbortController();
    controller.abort();
    await expect(
      importProjectPackage(store!, file, controller.signal),
    ).rejects.toThrow();
    expect(store!.projects()).toHaveLength(1);
  });
  it.each([
    "duplicate",
    "symlink",
    "traversal",
    "encrypted",
    "crc",
    "invalid-json",
    "invalid-utf8",
    "unknown-zip",
  ])("rejects malformed or unsafe ZIP: %s", async (kind) => {
    const p = await setup(false);
    let file = await zip([
      { name: "manifest.json", data: JSON.stringify(portableManifest(p)) },
      ...(kind === "duplicate" ? [{ name: "manifest.json", data: "{}" }] : []),
      ...(kind === "symlink"
        ? [{ name: "link", data: "/etc/passwd", mode: 0o120777 }]
        : []),
      ...(kind === "traversal"
        ? [{ name: "safe/f.txt", data: "do not extract" }]
        : []),
    ]);
    const bytes = await readFile(file);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (kind === "traversal") {
      for (
        let start = 0;
        (start = bytes.indexOf("safe/f.txt", start)) >= 0;
        start += 10
      )
        bytes.write("../bad.txt", start);
    }
    if (kind === "encrypted")
      bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 1, central + 8);
    if (kind === "crc") bytes[central + 16] ^= 1;
    if (kind === "invalid-json")
      file = await zip([{ name: "manifest.json", data: "{" }]);
    else if (kind === "invalid-utf8")
      file = await zip([{ name: "manifest.json", data: Buffer.from([0xff]) }]);
    else
      await writeFile(
        file,
        kind === "unknown-zip" ? Buffer.from("not a zip") : bytes,
      );
    await expect(importProjectPackage(store!, file)).rejects.toThrow();
    expect(store!.projects()).toHaveLength(1);
  });
  it("rejects metadata and expanded-size limits before extracting files", async () => {
    const p = await setup(false),
      file = await fixture(p);
    packageLimits.manifestBytes = 10;
    await expect(importProjectPackage(store!, file)).rejects.toThrow();
    packageLimits.manifestBytes = limits.manifestBytes;
    packageLimits.totalBytes = 2000;
    await expect(exportProjectPackage(store!, p)).rejects.toThrow();
    packageLimits.totalBytes = limits.totalBytes;
    packageLimits.entries = 0;
    await expect(importProjectPackage(store!, file)).rejects.toThrow();
  });
  it("cleans interrupted unpublished imports while retaining committed or unrelated media", async () => {
    const p = await setup(false);
    const retained = `import-${p.id}`;
    for (const dir of [
      ".import-temp",
      "media/import-orphan",
      `media/${retained}`,
      "media/unrelated",
    ]) {
      await mkdir(join(store!.root, dir));
      if (dir.includes("import-"))
        await writeFile(join(store!.root, dir, ".pending-import.json"), "{}");
    }
    await recoverInterruptedImports(store!);
    expect(await readdir(store!.path("media"))).toEqual(
      expect.arrayContaining([retained, "unrelated"]),
    );
    expect(
      (await readdir(store!.path("media"))).includes("import-orphan"),
    ).toBe(false);
    await expect(stat(join(store!.root, ".import-temp"))).rejects.toThrow();
    await expect(
      stat(join(store!.path("media"), retained, ".pending-import.json")),
    ).rejects.toThrow();
  });
});
describe("Project package contract", () => {
  it.each([
    "../bad.png",
    "/root.png",
    "C:\\bad.png",
    "a//b.png",
    "./a.png",
    "a/../b.png",
    "a\u0000.png",
  ])("rejects path %j", (path) => {
    expect(() => safePackagePath(path)).toThrow();
  });
  it("validates relationships before file extraction", async () => {
    const p = await setup();
    const cases: ((p: Project) => void)[] = [
      (p) => p.assets.push(p.assets[0]),
      (p) => (p.shots[0].selectedVersionId = "missing"),
      (p) => p.shots[0].characterIds.push("missing"),
      (p) => p.shots[0].referenceIds.push("missing"),
      (p) => (p.shots[0].versions[0].assetId = "missing"),
      (p) => (p.characters[0].referenceId = "missing"),
      (p) => (p.assets[0].characterId = "missing"),
      (p) => (p.assets[0].createdAt = "not a date"),
      (p) => (p.assets[0].file = "media/file.exe"),
      (p) => (p.shots[0].visualReview!.versionId = "missing"),
    ];
    for (const mutation of cases) {
      const copy = structuredClone(p);
      mutation(copy);
      expect(() => validatePortableProject(copy)).toThrow();
    }
  });
});
