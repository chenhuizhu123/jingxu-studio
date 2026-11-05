import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import * as yauzl from "yauzl";
import { ZipFile } from "yazl";
import { z } from "zod";
import { AppError, id, now, type Project } from "./model";
import {
  entriesOf,
  extractProjectPackage,
  planProjectPackage,
  readPackageJson,
} from "./package-archive";
import { packageLimits } from "./project-package";
import type { Store } from "./store";

const manifestFile = "series.json";
const maximumEntries = 15000;
const seriesManifest = z
  .object({
    format: z.literal("jingxu-series-project"),
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    exportedAt: z.iso.datetime(),
    episodes: z
      .array(z.object({ number: z.number().int().min(1).max(999) }).strict())
      .min(1)
      .max(99),
  })
  .strict();
const prefixFor = (number: number) =>
  `episodes/${String(number).padStart(3, "0")}/`;
const invalid = () => new AppError(400, "整季工程包损坏或格式暂不支持");
const tooLarge = () =>
  new AppError(413, "整季工程包超过 2 GB 或文件数量上限，请按单集迁移");

export async function exportSeriesPackage(store: Store, episodes: Project[]) {
  if (!episodes.length) throw new AppError(404, "剧集不存在");
  const manifest = seriesManifest.parse({
    format: "jingxu-series-project",
    version: 1,
    name: episodes[0].episode!.seriesName,
    exportedAt: now(),
    episodes: episodes.map((p) => ({ number: p.episode!.number })),
  });
  if (
    new Set(manifest.episodes.map((entry) => entry.number)).size !==
    episodes.length
  )
    throw invalid();
  const files: { source: string; name: string }[] = [];
  const buffers = [
    {
      name: manifestFile,
      data: Buffer.from(JSON.stringify(manifest, null, 2)),
    },
  ];
  let total = buffers[0].data.length;
  for (const episode of episodes) {
    const prepared = await planProjectPackage(store, episode, false);
    const prefix = prefixFor(episode.episode!.number);
    for (const file of prepared.files)
      files.push({ ...file, name: prefix + file.name });
    for (const item of prepared.buffers)
      buffers.push({ ...item, name: prefix + item.name });
    total += prepared.total;
    if (
      total > packageLimits.totalBytes ||
      files.length + buffers.length > maximumEntries
    )
      throw tooLarge();
  }
  // Entries are stored without compression. Reserve space for both ZIP
  // headers, timestamps, ZIP64 metadata and the central directory.
  const overhead = [...buffers, ...files].reduce(
    (sum, entry) => sum + 256 + Buffer.byteLength(entry.name) * 2,
    1024,
  );
  if (total + overhead > packageLimits.totalBytes) throw tooLarge();
  const archive = new ZipFile();
  archive.on("error", (error) =>
    (archive.outputStream as Readable).destroy(error),
  );
  for (const { name, data } of buffers)
    archive.addBuffer(data, name, { compress: false });
  for (const { name, source } of files)
    archive.addFile(source, name, { compress: false });
  archive.end();
  return archive.outputStream;
}

type Receipt = { fingerprint: string; seriesId: string; projectIds: string[] };

export async function importSeriesPackage(
  store: Store,
  filename: string,
  requestId: string,
  signal?: AbortSignal,
) {
  let zip: yauzl.ZipFile | undefined,
    staging: string | undefined,
    committing = false;
  const published: { projectId: string; folder: string }[] = [];
  try {
    signal?.throwIfAborted();
    if ((await stat(filename)).size > packageLimits.totalBytes)
      throw tooLarge();
    zip = await yauzl.openPromise(filename, {
      lazyEntries: true,
      autoClose: false,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const entries = await entriesOf(zip, maximumEntries);
    const entry = entries.get(manifestFile);
    if (!entry) throw invalid();
    const manifest = seriesManifest.parse(
      await readPackageJson(zip, entry, signal),
    );
    const prefixes = new Map(
      manifest.episodes.map((episode) => [
        prefixFor(episode.number),
        new Map<string, yauzl.Entry>(),
      ]),
    );
    if (prefixes.size !== manifest.episodes.length) throw invalid();
    const hash = createHash("sha256");
    for (const [name, entry] of entries) {
      hash.update(JSON.stringify([name, entry.uncompressedSize, entry.crc32]));
      if (name === manifestFile) continue;
      const prefix = name.match(/^episodes\/\d{3}\//)?.[0];
      const group = prefix && prefixes.get(prefix);
      if (!group || entry.fileName.endsWith("/")) throw invalid();
      group.set(name.slice(prefix!.length), entry);
    }
    const fingerprint = hash.digest("hex");
    function prior() {
      const receipt = store.get<Receipt>("series-import-receipt", requestId);
      if (!receipt) return;
      if (receipt.fingerprint !== fingerprint)
        throw new AppError(409, "本次导入使用了其他工程包，请重新选择文件");
      const projects = receipt.projectIds.map((id) =>
        store.get<Project>("project", id),
      );
      if (projects.some((p) => !p))
        throw new AppError(409, "此前恢复的分集已删除，请重新选择工程包导入");
      return {
        seriesId: receipt.seriesId,
        projects: projects as Project[],
        created: false,
      };
    }
    const restored = prior();
    if (restored) return restored;
    staging = await mkdtemp(join(store.root, ".import-series-"));
    const seriesId = id(),
      projects: Project[] = [];
    const staged: { project: Project; folder: string }[] = [];
    for (const { number } of [...manifest.episodes].sort(
      (a, b) => a.number - b.number,
    )) {
      signal?.throwIfAborted();
      const group = prefixes.get(prefixFor(number))!;
      if (!group.has("manifest.json")) throw invalid();
      const folder = join(staging, String(number));
      await mkdir(folder);
      const project = await extractProjectPackage(zip, group, folder, signal);
      project.episode = { seriesId, seriesName: manifest.name, number };
      staged.push({ project, folder });
      projects.push(project);
    }
    committing = true;
    for (const { project, folder } of staged) {
      signal?.throwIfAborted();
      const target = store.path(`media/import-${project.id}`);
      await rename(folder, target);
      published.push({ projectId: project.id, folder: target });
    }
    signal?.throwIfAborted();
    // A retry with the same request ID can finish extraction concurrently.
    // The final receipt check and SQLite batch have no asynchronous gap.
    const winner = prior();
    if (winner) return winner;
    store.writeBatch(
      [
        ...projects.map((p) => ({ kind: "project", id: p.id, value: p })),
        {
          kind: "series-import-receipt",
          id: requestId,
          value: {
            fingerprint,
            seriesId,
            projectIds: projects.map((p) => p.id),
          },
        },
      ],
      { insertOnly: true },
    );
    return { seriesId, projects, created: true };
  } catch (error) {
    if (error instanceof AppError || signal?.aborted) throw error;
    if (
      committing ||
      ["ENOSPC", "EACCES", "EPERM", "EROFS"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      throw new AppError(507, "无法保存整季工程，请检查磁盘空间和写入权限");
    throw invalid();
  } finally {
    zip?.close();
    if (staging)
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    for (const { projectId, folder } of published) {
      if (store.get("project", projectId))
        await rm(join(folder, ".pending-import.json"), { force: true }).catch(
          () => {},
        );
      else await rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}
