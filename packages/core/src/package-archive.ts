import { captionsCurrent } from "./captions";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import * as yauzl from "yauzl";
import { ZipFile as Writer } from "yazl";
import sharp from "sharp";
import {
  AppError,
  id,
  now,
  makeSrt,
  storyboardCsv,
  type Project,
  type Export,
} from "./model";
import type { Store } from "./store";
import { probeMedia } from "./media";
import {
  packageLimits,
  portableManifest,
  validatePortableProject,
  projectManifestSchema,
  safePackagePath,
  remapImportedProject,
} from "./project-package";

const manifestName = "manifest.json";
const packageError = () =>
  new AppError(400, "项目包损坏或不是支持的镜序项目包");
export async function planProjectPackage(
  store: Store,
  input: Project,
  includeSidecars = true,
) {
  const manifest = portableManifest({
    ...input,
    exports: input.exports.filter((e) => e.kind === "video"),
  });
  const p = manifest.project,
    files: { source: string; name: string }[] = [];
  let total = 0;
  const add = async (source: string, name: string, max: number) => {
    const info = await stat(store.path(source));
    if (!info.isFile() || info.size > max)
      throw new AppError(
        413,
        "项目包素材过大，单素材最多 200 MB，项目包最多 2 GB",
      );
    total += info.size;
    if (total > packageLimits.totalBytes)
      throw new AppError(413, "项目包超过 2 GB，请分项目导出");
    files.push({ source: store.path(source), name });
    return info.size;
  };
  for (const a of p.assets) {
    const target = `assets/${a.id}${extname(a.file).toLowerCase()}`;
    a.size = await add(a.file, target, packageLimits.assetBytes);
    a.file = target;
  }
  for (const e of p.exports) {
    const source = e.file,
      subtitles = e.subtitlesFile ?? source.replace(/\.mp4$/i, ".srt");
    e.size = await add(source, `renders/${e.id}.mp4`, packageLimits.totalBytes);
    e.file = `renders/${e.id}.mp4`;
    try {
      await add(subtitles, `renders/${e.id}.srt`, packageLimits.manifestBytes);
      e.subtitlesFile = `renders/${e.id}.srt`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      delete e.subtitlesFile;
    }
  }
  const metadata = Buffer.from(JSON.stringify(manifest, null, 2));
  if (metadata.length > packageLimits.manifestBytes)
    throw new AppError(413, "项目记录超过项目包大小限制");
  const buffers = [
    { name: manifestName, data: metadata },
    ...(includeSidecars
      ? [
          {
            name: "project.json",
            data: Buffer.from(JSON.stringify(p, null, 2)),
          },
          ...(p.shots.some((s) => s.captionTrack && !captionsCurrent(s))
            ? []
            : [{ name: "subtitles.srt", data: Buffer.from(makeSrt(p.shots)) }]),
          { name: "storyboard.csv", data: Buffer.from(storyboardCsv(p)) },
          {
            name: "README.txt",
            data: Buffer.from(
              "Jingxu Studio project package / 镜序项目包\nContains project records, assets and renders. API keys, approvals and jobs stay on the original device.\n",
            ),
          },
        ]
      : []),
  ];
  total += buffers.reduce((sum, item) => sum + item.data.length, 0);
  if (
    total > packageLimits.totalBytes ||
    buffers.length + files.length > packageLimits.entries
  )
    throw new AppError(413, "项目包超过 2 GB，请分项目导出");
  return { files, buffers, total };
}

export async function exportProjectPackage(
  store: Store,
  input: Project,
): Promise<Export> {
  const { files, buffers } = await planProjectPackage(store, input);
  const exportId = id(),
    file = `exports/${exportId}.zip`,
    partial = store.path(file + ".partial");
  const archive = new Writer();
  archive.on("error", (error) =>
    (archive.outputStream as Readable).destroy(error),
  );
  const completion = pipeline(
    archive.outputStream,
    createWriteStream(partial, { flags: "wx", mode: 0o600 }),
  );
  for (const item of buffers) archive.addBuffer(item.data, item.name);
  for (const item of files) archive.addFile(item.source, item.name);
  archive.end();
  try {
    await completion;
    const info = await stat(partial);
    if (info.size > packageLimits.totalBytes)
      throw new AppError(413, "项目包超过 2 GB，请分项目导出");
    await rename(partial, store.path(file));
    return {
      id: exportId,
      name: `${input.name}-project.zip`,
      file,
      kind: "archive",
      createdAt: now(),
      size: info.size,
      revision: input.revision,
    };
  } finally {
    await rm(partial, { force: true });
  }
}

export async function entriesOf(
  zip: yauzl.ZipFile,
  limit = packageLimits.entries,
) {
  if (zip.entryCount > limit) throw packageError();
  return new Promise<Map<string, yauzl.Entry>>((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    let total = 0;
    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      try {
        const name = safePackagePath(entry.fileName);
        const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (
          (entry.generalPurposeBitFlag & 1) !== 0 ||
          ![0, 8].includes(entry.compressionMethod) ||
          ![0, 0x8000, 0x4000].includes(kind)
        )
          throw packageError();
        if (entries.has(name) || entries.size >= limit) throw packageError();
        total += entry.uncompressedSize;
        if (total > packageLimits.totalBytes)
          throw new AppError(413, "项目包解压后超过 2 GB");
        entries.set(name, entry);
        zip.readEntry();
      } catch (error) {
        reject(error);
        zip.close();
      }
    });
    zip.readEntry();
  });
}
async function copyEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  destination: string | undefined,
  limit: number,
  signal?: AbortSignal,
) {
  if (entry.fileName.endsWith("/") || entry.uncompressedSize > limit)
    throw packageError();
  const source = await zip.openReadStreamPromise(entry);
  let length = 0,
    checksum = 0;
  const check = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      length += chunk.length;
      if (length > limit || length > entry.uncompressedSize)
        return done(packageError());
      checksum = crc32(chunk, checksum);
      done(null, chunk);
    },
  });
  let result: Buffer | undefined;
  if (destination) {
    await mkdir(join(destination, ".."), { recursive: true });
    await pipeline(
      source,
      check,
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      { signal },
    );
  } else {
    const chunks: Buffer[] = [];
    await pipeline(
      source,
      check,
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          chunks.push(chunk);
          done();
        },
      }),
      { signal },
    );
    result = Buffer.concat(chunks);
  }
  if (length !== entry.uncompressedSize || checksum !== entry.crc32 >>> 0)
    throw packageError();
  return result;
}
function legacyProject(raw: unknown, entries: Map<string, yauzl.Entry>) {
  const p = validatePortableProject(raw);
  for (const a of p.assets) {
    if (entries.has(a.file)) continue;
    const matches = [...entries.keys()].filter(
      (name) =>
        name.startsWith(`assets/${a.id}-`) ||
        name.startsWith(`assets/${a.id}.`),
    );
    if (matches.length !== 1) throw new AppError(400, "项目包缺少引用的素材");
    a.file = matches[0];
  }
  p.exports = p.exports.filter((e) => e.kind === "video");
  for (const e of p.exports) {
    e.file = entries.has(e.file) ? e.file : `renders/${e.id}.mp4`;
    if (entries.has(`renders/${e.id}.srt`))
      e.subtitlesFile = `renders/${e.id}.srt`;
  }
  return validatePortableProject(p);
}
async function validateMedia(file: string, kind: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (kind === "image") {
    const metadata = await sharp(file, {
      limitInputPixels: 40_000_000,
    }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? ""))
      throw packageError();
  }
  if (kind === "video" || kind === "audio") {
    const media = await probeMedia(file, signal);
    if (
      !media.duration ||
      (kind === "audio" && !media.hasAudio) ||
      (kind === "video" && !media.hasVideo)
    )
      throw packageError();
  }
}

export async function readPackageJson(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  signal?: AbortSignal,
) {
  const bytes = (await copyEntry(
    zip,
    entry,
    undefined,
    packageLimits.manifestBytes,
    signal,
  ))!;
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function extractProjectPackage(
  zip: yauzl.ZipFile,
  entries: Map<string, yauzl.Entry>,
  staging: string,
  signal?: AbortSignal,
): Promise<Project> {
  if (entries.size > packageLimits.entries) throw packageError();
  const manifestEntry =
    entries.get(manifestName) ?? entries.get("project.json");
  if (!manifestEntry) throw packageError();
  const raw = await readPackageJson(zip, manifestEntry, signal);
  let original;
  if (entries.has(manifestName)) {
    if (raw?.format !== "jingxu-project" || ![1, 2].includes(raw?.version))
      throw new AppError(400, "项目包版本暂不支持，请更新镜序");
    const parsed = projectManifestSchema.parse(raw);
    original = validatePortableProject(parsed.project);
  } else original = legacyProject(raw, entries);
  original.exports = original.exports.filter((e) => e.kind === "video");
  const p = remapImportedProject(original);
  for (const [index, a] of original.assets.entries()) {
    const entry = entries.get(a.file);
    if (!entry) throw new AppError(400, "项目包缺少引用的素材");
    const destination = join(
      staging,
      "assets",
      p.assets[index].file.split("/").at(-1)!,
    );
    await copyEntry(zip, entry, destination, packageLimits.assetBytes, signal);
    await validateMedia(destination, a.kind, signal);
    p.assets[index].size = entry.uncompressedSize;
  }
  for (const [index, e] of original.exports.entries()) {
    const entry = entries.get(e.file);
    if (!entry) throw new AppError(400, "项目包缺少导出的成片");
    const destination = join(
      staging,
      "renders",
      p.exports[index].file.split("/").at(-1)!,
    );
    await copyEntry(zip, entry, destination, packageLimits.totalBytes, signal);
    await validateMedia(destination, "video", signal);
    p.exports[index].size = entry.uncompressedSize;
    if (e.subtitlesFile) {
      const subtitle = entries.get(e.subtitlesFile);
      if (!subtitle) throw new AppError(400, "项目包缺少导出的字幕");
      await copyEntry(
        zip,
        subtitle,
        destination.replace(/\.mp4$/, ".srt"),
        packageLimits.manifestBytes,
        signal,
      );
    }
  }
  await writeFile(
    join(staging, ".pending-import.json"),
    JSON.stringify({ projectId: p.id }),
    { mode: 0o600 },
  );
  return p;
}

/** Extract to an unpublished directory, then move it once and commit a new project. */
export async function importProjectPackage(
  store: Store,
  filename: string,
  signal?: AbortSignal,
  persist = (project: Project) =>
    store.writeBatch([{ kind: "project", id: project.id, value: project }], {
      insertOnly: true,
    }),
): Promise<Project> {
  let zip: yauzl.ZipFile | undefined,
    staging: string | undefined,
    published: string | undefined,
    projectId: string | undefined;
  try {
    const info = await stat(filename);
    if (info.size > packageLimits.totalBytes)
      throw new AppError(413, "项目包超过 2 GB，请分项目导出");
    zip = await yauzl.openPromise(filename, {
      lazyEntries: true,
      autoClose: false,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const entries = await entriesOf(zip);
    signal?.throwIfAborted();
    staging = await mkdtemp(join(store.root, ".import-"));
    const p = await extractProjectPackage(zip, entries, staging, signal);
    projectId = p.id;
    signal?.throwIfAborted();
    published = store.path(`media/import-${p.id}`);
    await rename(staging, published);
    staging = undefined;
    signal?.throwIfAborted();
    persist(p);
    await rm(join(published, ".pending-import.json"), { force: true }).catch(
      () => {},
    );
    published = undefined;
    return p;
  } catch (error) {
    if (error instanceof AppError || signal?.aborted) throw error;
    throw packageError();
  } finally {
    zip?.close();
    if (staging) await rm(staging, { recursive: true, force: true });
    if (published) {
      if (projectId && store.get("project", projectId))
        await rm(join(published, ".pending-import.json"), { force: true });
      else await rm(published, { recursive: true, force: true });
    }
  }
}

/** Recover only owned, marked import directories, before accepting new work. */
export async function recoverInterruptedImports(store: Store) {
  for (const entry of await readdir(store.root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\.import-[A-Za-z0-9_-]+$/.test(entry.name))
      await rm(join(store.root, entry.name), { recursive: true, force: true });
  }
  const projects = store.projects();
  for (const entry of await readdir(store.path("media"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || !/^import-[A-Za-z0-9_-]+$/.test(entry.name))
      continue;
    const folder = join(store.path("media"), entry.name),
      marker = join(folder, ".pending-import.json");
    try {
      await stat(marker);
    } catch {
      continue;
    }
    const prefix = `media/${entry.name}/`;
    if (
      projects.some(
        (p) =>
          p.assets.some((a) => a.file.startsWith(prefix)) ||
          p.exports.some((e) => e.file.startsWith(prefix)) ||
          `import-${p.id}` === entry.name,
      )
    )
      await rm(marker, { force: true });
    else await rm(folder, { recursive: true, force: true });
  }
}
