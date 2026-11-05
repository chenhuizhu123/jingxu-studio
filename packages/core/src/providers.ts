import { readFile, writeFile, stat } from "node:fs/promises";
import {
  AppError,
  id,
  now,
  type Asset,
  type Project,
  type Shot,
  type Settings,
} from "./model";
import type { Store } from "./store";
import { referenceIds, videoPrompt } from "../../shared/shot-references";

export function endpoint(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AppError(400, "服务地址必须是有效 URL");
  }
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new AppError(400, "服务地址仅支持无凭据的 HTTP/HTTPS URL");
  if (
    u.protocol === "http:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
  )
    throw new AppError(400, "远程服务必须使用 HTTPS");
  return value.replace(/\/$/, "");
}
export async function fetchJson(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.any([
      AbortSignal.timeout(60000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok) {
    let message = "";
    try {
      const data = (await response.json()) as any;
      message = String(data.error?.message ?? data.message ?? "");
    } catch {}
    throw new AppError(
      502,
      `服务返回 HTTP ${response.status}${message ? "：" + message.slice(0, 200) : ""}`,
    );
  }
  return response.json();
}
async function references(
  store: Store,
  p: Project,
  shot: Shot,
  firstFrame?: string,
) {
  const ids = firstFrame ? [firstFrame] : referenceIds(p, shot);
  return Promise.all(
    ids.map(async (id) => {
      const a = p.assets.find((a) => a.id === id && a.kind === "image");
      if (!a) throw new AppError(400, "参考素材不存在");
      const b = await readFile(store.path(a.file));
      if (b.length > 15 * 1024 * 1024)
        throw new AppError(400, "单张参考图不能超过 15 MB");
      return `data:${a.mime};base64,${b.toString("base64")}`;
    }),
  );
}
export async function submitGeneration(
  store: Store,
  settings: Settings,
  p: Project,
  shot: Shot,
  signal: AbortSignal,
  firstFrame?: string,
): Promise<string> {
  const c = settings.generation;
  if (!c.apiKey || !c.model)
    throw new AppError(400, "请先配置视频服务 API Key 和模型 ID");
  const base = endpoint(c.endpoint);
  const refs = await references(store, p, shot, firstFrame);
  const prompt = videoPrompt(p, shot);
  const body =
    c.provider === "ark"
      ? {
          model: c.model,
          content: [
            { type: "text", text: prompt },
            ...refs.map((url) => ({
              type: "image_url",
              image_url: { url },
              role: refs.length === 1 ? "first_frame" : "reference_image",
            })),
          ],
          ratio: firstFrame ? "adaptive" : p.format,
          duration: shot.duration,
        }
      : {
          model: c.model,
          prompt,
          aspect_ratio: p.format,
          duration: shot.duration,
          references: refs,
        };
  const result = await fetchJson(
    `${base}${c.provider === "ark" ? "/contents/generations/tasks" : "/tasks"}`,
    {
      method: "POST",
      ...(firstFrame ? { redirect: "error" as const } : {}),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${c.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    signal,
  );
  const remoteId = result.id ?? result.task_id;
  if (typeof remoteId !== "string" || !remoteId || remoteId.length > 500)
    throw new AppError(
      502,
      "生成服务未返回有效任务 ID，请在服务后台确认提交结果",
    );
  return remoteId;
}
export async function pollGeneration(
  settings: Settings,
  remoteId: string,
  signal: AbortSignal,
) {
  const c = settings.generation;
  return fetchJson(
    `${endpoint(c.endpoint)}${c.provider === "ark" ? "/contents/generations/tasks" : "/tasks"}/${encodeURIComponent(remoteId)}`,
    { headers: { authorization: `Bearer ${c.apiKey}` } },
    signal,
  );
}
export function generationState(result: any): {
  state: "pending" | "succeeded" | "failed";
  url?: string;
  message?: string;
} {
  const status = result.status ?? result.state;
  if (["succeeded", "completed", "success"].includes(status)) {
    const url =
      result.content?.video_url ??
      result.video_url ??
      result.output?.video_url ??
      result.output?.url;
    if (typeof url !== "string")
      throw new AppError(502, "生成任务完成但未返回视频地址");
    return { state: "succeeded", url };
  }
  if (["failed", "cancelled", "canceled", "expired"].includes(status))
    return {
      state: "failed",
      message: String(
        result.error?.message ?? result.message ?? "远程生成失败",
      ).slice(0, 300),
    };
  return { state: "pending" };
}
export async function downloadVideo(
  store: Store,
  url: string,
  signal: AbortSignal,
): Promise<Asset> {
  const u = new URL(url);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new AppError(502, "服务返回了无效视频地址");
  const res = await fetch(u, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
  });
  if (!res.ok || !res.body)
    throw new AppError(502, `下载素材失败 HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 200 * 1024 * 1024)
      throw new AppError(413, "生成素材超过 200 MB 限制");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp")
    throw new AppError(502, "生成服务返回的文件不是有效 MP4");
  const assetId = id(),
    file = `media/${assetId}.mp4`;
  await writeFile(store.path(file), bytes);
  return {
    id: assetId,
    name: `生成镜头-${assetId.slice(0, 8)}.mp4`,
    kind: "video",
    file,
    mime: "video/mp4",
    size: (await stat(store.path(file))).size,
    createdAt: now(),
  };
}
export function redactError(error: unknown, settings?: Settings) {
  let message = error instanceof Error ? error.message : "任务失败";
  for (const key of [
    settings?.agent.apiKey,
    settings?.image?.apiKey,
    settings?.generation.apiKey,
    settings?.speech?.apiKey,
    settings?.transcription?.apiKey,
  ].filter((v): v is string => !!v))
    message = message.split(key).join("[已隐藏]");
  return message.slice(0, 1500);
}
