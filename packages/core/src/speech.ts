import { open, rename, rm, stat } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import { AppError, id, now, type Asset, type Settings } from "./model";
import type { Store } from "./store";
import { endpoint } from "./providers";
import { probeMedia, runFfmpeg } from "./media";

// Speech-compatible gateways return WAV bytes. Model and voice remain provider-owned IDs.
export const speechLimit = 32 * 1024 * 1024;
export function recoverSpeechFiles(store: Store) {
  const referenced = new Set(
    store.projects().flatMap((p) => p.assets.map((a) => a.file)),
  );
  for (const entry of readdirSync(store.path("media"), {
    withFileTypes: true,
  })) {
    if (
      !entry.isFile() ||
      !/^speech-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.wav(?:\.partial)?$/i.test(
        entry.name,
      )
    )
      continue;
    const file = `media/${entry.name}`;
    if (!referenced.has(file)) {
      try {
        rmSync(store.path(file));
      } catch {
        /* Retry owned leftovers on the next startup. */
      }
    }
  }
}
export function validateSpeechConfig(config: Settings["speech"]) {
  if (
    !config.endpoint.trim() ||
    !config.model.trim() ||
    !config.voice.trim() ||
    !config.apiKey
  )
    throw new AppError(400, "请在设置中配置语音服务地址、模型、音色和 API Key");
  endpoint(config.endpoint);
  if (!Number.isFinite(config.speed) || config.speed < 0.25 || config.speed > 4)
    throw new AppError(400, "配音语速必须在 0.25 到 4 之间");
}
export async function synthesizeSpeech(
  store: Store,
  config: Settings["speech"],
  text: string,
  order: number,
  signal: AbortSignal,
): Promise<Asset> {
  validateSpeechConfig(config);
  if (!text.trim() || text.length > 3000)
    throw new AppError(400, "请填写不超过 3000 字的镜头对白");
  const assetId = id(),
    file = `media/speech-${assetId}.wav`,
    target = store.path(file),
    partial = target + ".partial";
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  let published = false;
  try {
    const response = await fetch(`${endpoint(config.endpoint)}/audio/speech`, {
      method: "POST",
      redirect: "error",
      signal: requestSignal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        voice: config.voice,
        input: text,
        speed: config.speed,
        response_format: "wav",
      }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AppError(502, `语音服务返回 HTTP ${response.status}`);
    }
    if (Number(response.headers.get("content-length")) > speechLimit) {
      await response.body.cancel();
      throw new AppError(413, "生成音频超过 32 MB 限制");
    }
    const output = await open(partial, "wx");
    let size = 0;
    try {
      for await (const bytes of response.body) {
        requestSignal.throwIfAborted();
        size += bytes.length;
        if (size > speechLimit)
          throw new AppError(413, "生成音频超过 32 MB 限制");
        let written = 0;
        while (written < bytes.length) {
          const result = await output.write(
            bytes,
            written,
            bytes.length - written,
          );
          if (!result.bytesWritten) throw new AppError(500, "无法保存生成音频");
          written += result.bytesWritten;
        }
      }
    } finally {
      await output.close();
    }
    signal.throwIfAborted();
    const input = await open(partial, "r");
    const header = Buffer.alloc(12);
    try {
      await input.read(header, 0, header.length, 0);
    } finally {
      await input.close();
    }
    if (
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new AppError(502, "语音服务未返回有效 WAV 音频");
    const media = await probeMedia(partial, signal);
    if (
      !media.hasAudio ||
      media.hasVideo ||
      media.duration <= 0 ||
      media.duration > 600
    )
      throw new AppError(502, "语音服务未返回有效 WAV 音频");
    // Decode the actual stream as well as checking its header and declared duration.
    await runFfmpeg(
      ["-xerror", "-i", partial, "-map", "0:a:0", "-f", "null", "-"],
      signal,
    );
    signal.throwIfAborted();
    await rename(partial, target);
    published = true;
    const sizeOnDisk = (await stat(target)).size;
    signal.throwIfAborted();
    return {
      id: assetId,
      name: `AI Voiceover · ${String(order).padStart(2, "0")} · ${assetId.slice(0, 8)}.wav`,
      kind: "audio",
      mime: "audio/wav",
      file,
      size: sizeOnDisk,
      createdAt: now(),
    };
  } catch (error) {
    if (published) await rm(target, { force: true }).catch(() => {});
    throw error;
  } finally {
    await rm(partial, { force: true }).catch(() => {});
  }
}
