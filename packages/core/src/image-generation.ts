import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync, rmSync } from "node:fs";
import sharp from "sharp";
import { imageReferenceLimit } from "../../shared/shot-references";
import {
  AppError,
  id,
  now,
  type Asset,
  type Project,
  type Settings,
} from "./model";
import { endpoint } from "./providers";
import type { Store } from "./store";

const miB = 1024 * 1024;
const imageMimes = new Set(["image/png", "image/jpeg", "image/webp"]);
const dimensions = {
  "9:16": "1440x2560",
  "16:9": "2560x1440",
  "1:1": "2048x2048",
};

export function validateImageConfig(config: Settings["image"]) {
  if (!config.endpoint.trim() || !config.model.trim() || !config.apiKey.trim())
    throw new AppError(400, "请在设置中配置 Seedream 服务地址、模型和 API Key");
  return endpoint(config.endpoint);
}

export function imageReferences(project: Project, ids: string[]) {
  if (ids.length > imageReferenceLimit)
    throw new AppError(400, "图片生成最多使用 10 张参考图");
  return ids.map((id) => {
    const asset = project.assets.find((a) => a.id === id);
    if (!asset || asset.kind !== "image" || !imageMimes.has(asset.mime))
      throw new AppError(400, "参考图必须是项目中的 PNG、JPEG 或 WebP");
    return asset;
  });
}

export function recoverGeneratedImages(store: Store) {
  const referenced = new Set(
    store.projects().flatMap((p) => p.assets.map((a) => a.file)),
  );
  for (const entry of readdirSync(store.path("media"), {
    withFileTypes: true,
  })) {
    const file = `media/${entry.name}`;
    if (
      entry.isFile() &&
      /^seedream-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.jpg(?:\.partial)?$/i.test(
        entry.name,
      ) &&
      !referenced.has(file)
    ) {
      try {
        rmSync(store.path(file));
      } catch {
        /* Retry at the next startup. */
      }
    }
  }
}

export async function generateShotImage(
  store: Store,
  config: Settings["image"],
  project: Project,
  prompt: string,
  refs: string[],
  signal: AbortSignal,
  beforeSubmit: () => void,
): Promise<Asset> {
  const url = validateImageConfig(config);
  const images: string[] = [];
  let inputBytes = 0;
  for (const asset of imageReferences(project, refs)) {
    const path = store.path(asset.file);
    const size = (await stat(path)).size;
    inputBytes += size;
    if (inputBytes > 20 * miB)
      throw new AppError(413, "参考图合计不能超过 20 MB");
    const bytes = await readFile(path, { signal });
    if (bytes.length !== size)
      throw new AppError(409, "参考图已改变，请重新确认生成");
    images.push(`data:${asset.mime};base64,${bytes.toString("base64")}`);
  }
  signal.throwIfAborted();
  beforeSubmit();
  const response = await fetch(`${url}/images/generations`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      ...(images.length
        ? { image: images.length === 1 ? images[0] : images }
        : {}),
      size: dimensions[project.format],
      response_format: "b64_json",
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new AppError(502, `图片服务返回 HTTP ${response.status}`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const bytes of response.body) {
    signal.throwIfAborted();
    size += bytes.length;
    if (size > 28 * miB) throw new AppError(413, "图片服务响应超过 28 MB");
    chunks.push(bytes);
  }
  let output: Buffer;
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const value = data.data?.[0]?.b64_json;
    if (typeof value !== "string" || !value || /[^A-Za-z0-9+/=]/.test(value))
      throw new Error("Image data unavailable");
    const bytes = Buffer.from(value, "base64");
    const input = sharp(bytes, {
      limitInputPixels: 10_000_000,
      failOn: "error",
    });
    const meta = await input.metadata();
    if (
      !meta.format ||
      !imageMimes.has(`image/${meta.format}`) ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error("Unsupported format");
    output = await input
      .autoOrient()
      .flatten({ background: "#000000" })
      .jpeg({ quality: 93 })
      .toBuffer();
  } catch {
    throw new AppError(502, "图片服务未返回可读取的单张图片");
  }
  signal.throwIfAborted();
  const assetId = id(),
    file = `media/seedream-${assetId}.jpg`;
  const target = store.path(file),
    partial = target + ".partial";
  try {
    await writeFile(partial, output, { mode: 0o600, flag: "wx", signal });
    signal.throwIfAborted();
    await rename(partial, target);
  } finally {
    await rm(partial, { force: true }).catch(() => {});
  }
  return {
    id: assetId,
    file,
    kind: "image",
    mime: "image/jpeg",
    size: output.length,
    name: `Seedream-${assetId.slice(0, 8)}.jpg`,
    createdAt: now(),
  };
}
