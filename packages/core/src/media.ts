import { spawn } from "node:child_process";
import { writeFile, stat, rename, unlink } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import {
  id,
  now,
  selectedVersion,
  makeSrt,
  storyboardCsv,
  AppError,
  type Asset,
  type Project,
  type Export,
} from "./model";
import type { Store } from "./store";

export function posterSvg(index: number) {
  const hues = [
    "#224b4c",
    "#403a56",
    "#68503a",
    "#27473b",
    "#4b3440",
    "#314654",
  ];
  const bg = hues[index % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#101c26"/><stop offset="1" stop-color="${bg}"/></linearGradient><radialGradient id="glow"><stop stop-color="#ebd2a0" stop-opacity=".7"/><stop offset="1" stop-color="#ebd2a0" stop-opacity="0"/></radialGradient><linearGradient id="road" x2="0" y2="1"><stop stop-color="#17272d"/><stop offset="1" stop-color="#090f16"/></linearGradient></defs><rect width="720" height="1280" fill="url(#sky)"/><circle cx="${520 - index * 35}" cy="280" r="230" fill="url(#glow)"/><g fill="#101b24"><path d="M0 220H110V730H0ZM120 350H245V740H120ZM285 120H420V760H285ZM445 280H560V740H445ZM590 160H720V770H590Z"/></g><g fill="#deb985" opacity=".6">${Array.from({ length: 42 }, (_, i) => `<rect x="${25 + (i % 7) * 104}" y="${340 + Math.floor(i / 7) * 58}" width="${i % 3 === 0 ? 26 : 9}" height="16"/>`).join("")}</g><path d="M0 750L720 740V1280H0Z" fill="url(#road)"/><path d="M460 760L660 1280H300L400 760Z" fill="${bg}" opacity=".55"/><g stroke="#bad2d0" opacity=".16" stroke-width="2">${Array.from({ length: 65 }, (_, i) => `<path d="M${(i * 83) % 750} ${(i * 137) % 1280}l-14 68"/>`).join("")}</g><path d="M95 750H265V900H95Z" fill="#203738"/><rect x="103" y="757" width="154" height="103" fill="#dbc6a0" opacity=".55"/><path d="M176 748V898M103 810H257" stroke="#14282b" stroke-width="7"/><path d="M${330 + index * 10} 800q-100 -130 100 -130q110 0 145 130Z" fill="#10191e"/><path d="M${430 + index * 10} 750V900" stroke="#c5a67b" stroke-width="4"/><ellipse cx="${415 + index * 10}" cy="835" rx="32" ry="40" fill="#b39477"/><path d="M${380 + index * 10} 812q30-50 62 0l-6 30q-25-30-53 0Z" fill="#131a20"/><path d="M${383 + index * 10} 870q-25 20-35 180h132q-10-160-34-180Z" fill="${index % 2 ? "#b4ada0" : "#6b8280"}"/><path d="M${375 + index * 10} 1040l-12 150h27l28-150M${430 + index * 10} 1040l15 150h28l-8-150" fill="#14212b"/><rect width="720" height="1280" fill="none" stroke="#ffe8bb" stroke-opacity=".12" stroke-width="30"/><text x="44" y="80" fill="#f4e8cd" font-family="sans-serif" font-size="19" letter-spacing="5">JINGXU ORIGINAL / STUDY ${String(index + 1).padStart(2, "0")}</text><text x="44" y="1170" fill="#eee5d5" font-family="sans-serif" font-size="48" letter-spacing="10">雨 夜 来 信</text><text x="46" y="1212" fill="#a2b4b0" font-family="sans-serif" font-size="15" letter-spacing="2">演示素材 · 非 AI 生成</text></svg>`;
}
export async function createDemoAsset(
  store: Store,
  index: number,
): Promise<Asset> {
  const assetId = id(),
    file = `media/${assetId}.png`;
  await sharp(Buffer.from(posterSvg(index)))
    .png()
    .toFile(store.path(file));
  const info = await stat(store.path(file));
  return {
    id: assetId,
    name: `演示镜头 ${index + 1}.png`,
    kind: "image",
    file,
    mime: "image/png",
    size: info.size,
    createdAt: now(),
  };
}
export function ffmpegPath() {
  const path = process.env.JINGXU_FFMPEG || ffmpegStatic;
  if (!path) throw new AppError(503, "未找到本机视频渲染器");
  return path.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
}
export function runFfmpeg(args: string[], signal?: AbortSignal, cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    let stderr = "";
    const proc = spawn(
      ffmpegPath(),
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { windowsHide: true, signal, cwd },
    );
    const timeout = setTimeout(() => proc.kill(), 180000);
    proc.stderr.on(
      "data",
      (d) => (stderr = (stderr + d.toString()).slice(-5000)),
    );
    proc.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    proc.once("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(
            new AppError(
              500,
              `视频渲染失败：${stderr.slice(-500) || "任务已中断"}`,
            ),
          );
    });
  });
}
export function probeMedia(file: string, signal?: AbortSignal) {
  return new Promise<{
    hasAudio: boolean;
    hasVideo: boolean;
    duration: number;
  }>((resolve, reject) => {
    let output = "";
    const process = spawn(ffmpegPath(), ["-hide_banner", "-i", file], {
      windowsHide: true,
      signal,
    });
    const timeout = setTimeout(() => process.kill(), 15000);
    process.stderr.on(
      "data",
      (d) => (output = (output + d.toString()).slice(-100000)),
    );
    process.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    process.once("close", () => {
      clearTimeout(timeout);
      const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match)
        return reject(
          new AppError(400, "无法识别媒体时长，请检查文件是否损坏"),
        );
      resolve({
        hasAudio: /Stream #.*Audio:/.test(output),
        hasVideo: /Stream #.*Video:/.test(output),
        duration:
          Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]),
      });
    });
  });
}
const filterPath = (path: string) =>
  path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
export async function renderVideo(
  store: Store,
  p: Project,
  onProgress: (n: number) => void,
  signal?: AbortSignal,
): Promise<Export> {
  if (!p.shots.length) throw new AppError(400, "请先添加分镜");
  const [width, height] =
    p.format === "16:9"
      ? [1280, 720]
      : p.format === "1:1"
        ? [720, 720]
        : [720, 1280];
  const srt = makeSrt(p.shots);
  const exportId = id(),
    tempFiles: string[] = [],
    clips: string[] = [];
  try {
    for (const [i, s] of [...p.shots]
      .sort((a, b) => a.order - b.order)
      .entries()) {
      signal?.throwIfAborted();
      const v = selectedVersion(s),
        asset = p.assets.find((a) => a.id === v?.assetId);
      if (!asset || !["image", "video"].includes(asset.kind))
        throw new AppError(400, `镜头 ${s.order} 尚未选择图片或视频`);
      const output = store.path(`exports/${exportId}-${i}.mp4`);
      tempFiles.push(output);
      clips.push(output);
      const input =
        asset.kind === "image"
          ? ["-loop", "1", "-i", store.path(asset.file)]
          : ["-ss", String(s.trimStart ?? 0), "-i", store.path(asset.file)];
      const voice = p.assets.find(
        (a) => a.id === s.audioAssetId && a.kind === "audio",
      );
      const metadata =
        asset.kind === "video"
          ? await probeMedia(store.path(asset.file), signal)
          : undefined;
      if (metadata && (s.trimStart ?? 0) >= metadata.duration)
        throw new AppError(400, `镜头 ${s.order} 的裁切起点超出素材时长`);
      const originalAudio = metadata?.hasAudio ?? false;
      const audioInput = voice
        ? ["-i", store.path(voice.file)]
        : originalAudio
          ? []
          : [
              "-f",
              "lavfi",
              "-i",
              "anullsrc=channel_layout=stereo:sample_rate=48000",
            ];
      await runFfmpeg(
        [
          ...input,
          ...audioInput,
          "-t",
          String(s.duration),
          "-map",
          "0:v:0",
          "-map",
          voice || !originalAudio ? "1:a:0" : "0:a:0",
          "-vf",
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=25,tpad=stop_mode=clone:stop_duration=${s.duration}`,
          "-af",
          "apad,aresample=48000",
          "-ac",
          "2",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          output,
        ],
        signal,
      );
      onProgress(Math.round(((i + 1) / p.shots.length) * 85));
    }
    const list = store.path(`exports/${exportId}.txt`);
    tempFiles.push(list);
    await writeFile(list, clips.map((p) => `file '${basename(p)}'`).join("\n"));
    const file = `exports/${exportId}.mp4`,
      partial = store.path(`exports/${exportId}-partial.mp4`);
    tempFiles.push(partial);
    const subtitleFile = store.path(`exports/${exportId}.srt`);
    await writeFile(subtitleFile, srt, "utf8");
    const music = p.assets.find(
      (a) => a.id === p.musicAssetId && a.kind === "audio",
    );
    const burn = !!srt && p.burnSubtitles !== false;
    const fontDir = process.env.JINGXU_FONTS_DIR ?? resolve("resources/fonts");
    const effects: string[] = [];
    if (burn)
      effects.push(
        "-vf",
        `subtitles=filename='${filterPath(subtitleFile)}':fontsdir='${filterPath(fontDir)}':force_style='FontName=Noto Sans SC,FontSize=18,Outline=1.5,MarginV=28'`,
      );
    if (music) {
      effects.push(
        "-filter_complex",
        `[1:a]volume=${p.musicVolume ?? 0.15}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[a]`,
        "-map",
        "0:v:0",
        "-map",
        "[a]",
      );
    }
    await runFfmpeg(
      [
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        list,
        ...(music ? ["-stream_loop", "-1", "-i", store.path(music.file)] : []),
        ...effects,
        "-c:v",
        burn ? "libx264" : "copy",
        ...(burn ? ["-preset", "fast", "-crf", "20"] : []),
        "-c:a",
        music ? "aac" : "copy",
        "-movflags",
        "+faststart",
        partial,
      ],
      signal,
    );
    signal?.throwIfAborted();
    await rename(partial, store.path(file));
    const info = await stat(store.path(file));
    return {
      id: exportId,
      subtitlesFile: `exports/${exportId}.srt`,
      name: `${p.name}-r${p.revision}.mp4`,
      file,
      kind: "video",
      createdAt: now(),
      size: info.size,
      revision: p.revision,
    };
  } finally {
    await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})));
  }
}
export async function exportArchive(store: Store, p: Project): Promise<Export> {
  const { exportProjectPackage } = await import("./package-archive");
  return exportProjectPackage(store, p);
}
