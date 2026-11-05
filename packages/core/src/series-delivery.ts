import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { AppError, now, type Project } from "./model";
import type { Store } from "./store";

async function exists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function seriesDelivery(store: Store, episodes: Project[]) {
  const entries: {
    number: number;
    title: string;
    revision: number;
    video: string;
    subtitles?: string;
  }[] = [];
  const files: { source: string; name: string }[] = [];
  const missing: number[] = [];
  for (const p of episodes) {
    const number = p.episode!.number;
    const latest = p.exports.findLast((e) => e.kind === "video");
    if (!latest || !(await exists(store.path(latest.file)))) {
      missing.push(number);
      continue;
    }
    const prefix = `episode-${String(number).padStart(3, "0")}`;
    const video = prefix + ".mp4";
    files.push({ name: video, source: store.path(latest.file) });
    let subtitles: string | undefined;
    if (
      latest.subtitlesFile &&
      (await exists(store.path(latest.subtitlesFile)))
    ) {
      subtitles = prefix + ".srt";
      files.push({ name: subtitles, source: store.path(latest.subtitlesFile) });
    }
    entries.push({
      number,
      title: p.name,
      revision: latest.revision,
      video,
      subtitles,
    });
  }
  if (!entries.length) throw new AppError(404, "剧集还没有可下载的成片");
  const archive = new ZipFile();
  archive.on("error", (error) =>
    (archive.outputStream as Readable).destroy(error),
  );
  archive.addBuffer(
    Buffer.from(
      JSON.stringify(
        {
          format: "jingxu-series-delivery-v1",
          name: episodes[0].episode!.seriesName,
          createdAt: now(),
          episodes: entries,
          missing,
        },
        null,
        2,
      ),
    ),
    "manifest.json",
  );
  for (const item of files)
    archive.addFile(item.source, item.name, { compress: false });
  archive.end();
  return archive.outputStream;
}
