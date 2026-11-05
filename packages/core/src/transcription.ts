import { readFile, rm, stat } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import { z } from "zod";
import {
  AppError,
  id,
  now,
  type Project,
  type Shot,
  type Settings,
} from "./model";
import {
  captionSource,
  captionTrackSchema,
  type CaptionTrack,
} from "./captions";
import { endpoint } from "./providers";
import { probeMedia, runFfmpeg } from "./media";
import type { Store } from "./store";
export function transcriptionAsset(p: Project, shot: Shot) {
  const source = captionSource(shot),
    asset = p.assets.find((a) => a.id === source?.assetId);
  if (!source || !asset || !["video", "audio"].includes(asset.kind))
    throw new AppError(400, "请为镜头选择配音或带音轨的视频");
  return { source, asset };
}
export function validateTranscription(config: Settings["transcription"]) {
  if (!config.endpoint || !config.model || !config.apiKey)
    throw new AppError(400, "请配置支持分段时间戳的语音识别服务");
  endpoint(config.endpoint);
}
export function parseTranscription(
  value: unknown,
  source: CaptionTrack["source"],
): CaptionTrack {
  const data = z
    .object({
      text: z.string().max(300000).optional(),
      segments: z
        .array(
          z.object({
            start: z.number().min(0),
            end: z.number().min(0),
            text: z.string().max(1000),
          }),
        )
        .max(300),
    })
    .parse(value);
  let previous = 0;
  const cues = data.segments
    .filter((s) => s.text.trim())
    .map((s) => {
      if (s.end > source.duration + 0.1 || s.start < previous - 0.05)
        throw new AppError(502, "识别服务返回的时间戳不符合镜头范围");
      const start = Math.max(previous, Math.round(s.start * 1000) / 1000),
        end = Math.min(source.duration, Math.round(s.end * 1000) / 1000);
      previous = end;
      return { start, end, text: s.text.trim() };
    });
  if (!cues.length && data.text?.trim())
    throw new AppError(502, "识别服务没有返回可用的分段时间戳");
  return captionTrackSchema.parse({
    source,
    origin: "asr",
    createdAt: now(),
    cues,
  });
}
export function recoverTranscriptionFiles(store: Store) {
  for (const entry of readdirSync(store.path("exports"), {
    withFileTypes: true,
  })) {
    if (
      entry.isFile() &&
      /^\.asr-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.wav$/.test(
        entry.name,
      )
    ) {
      try {
        rmSync(store.path(`exports/${entry.name}`));
      } catch {}
    }
  }
}
export async function transcribeShot(
  store: Store,
  p: Project,
  shot: Shot,
  config: Settings["transcription"],
  signal: AbortSignal,
  onSubmit: () => void,
): Promise<CaptionTrack> {
  validateTranscription(config);
  const { source, asset } = transcriptionAsset(p, shot),
    file = store.path(`exports/.asr-${id()}.wav`);
  try {
    const metadata = await probeMedia(store.path(asset.file), signal);
    if (!metadata.hasAudio || source.start >= metadata.duration)
      throw new AppError(400, "镜头素材没有可识别的音轨");
    await runFfmpeg(
      [
        "-ss",
        String(source.start),
        "-i",
        store.path(asset.file),
        "-t",
        String(source.duration),
        "-vn",
        "-map",
        "0:a:0",
        "-af",
        "apad",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        file,
      ],
      signal,
    );
    signal.throwIfAborted();
    if ((await stat(file)).size > 2 * 1024 * 1024)
      throw new AppError(413, "识别音频超过镜头限制");
    const form = new FormData();
    form.set("model", config.model);
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    if (config.language) form.set("language", config.language);
    form.set(
      "file",
      new Blob([await readFile(file)], { type: "audio/wav" }),
      "shot.wav",
    );
    signal.throwIfAborted();
    onSubmit();
    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(120000),
    ]);
    const response = await fetch(
      `${endpoint(config.endpoint)}/audio/transcriptions`,
      {
        method: "POST",
        redirect: "error",
        signal: requestSignal,
        headers: { authorization: `Bearer ${config.apiKey}` },
        body: form,
      },
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AppError(502, `识别服务返回 HTTP ${response.status}`);
    }
    if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024) {
      await response.body.cancel();
      throw new AppError(502, "识别响应超过大小限制");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024)
        throw new AppError(502, "识别响应超过大小限制");
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new AppError(502, "识别服务未返回有效字幕数据");
    }
    return parseTranscription(value, source);
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}
