import { readFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import {
  AppError,
  getShot,
  id,
  now,
  selectedVersion,
  type Project,
  type Shot,
} from "./model";
import type { Store } from "./store";
import { probeMedia, runFfmpeg } from "./media";
import { endpoint, fetchJson } from "./providers";
import { referenceIds } from "../../shared/shot-references";

function visualInputs(project: Project, shot: Shot) {
  return JSON.stringify([
    shot.selectedVersionId,
    shot.prompt,
    shot.scene,
    shot.duration,
    shot.trimStart ?? 0,
    shot.referenceIds,
    shot.characterIds.map((id) => project.characters.find((c) => c.id === id)),
  ]);
}

export async function reviewShot(
  store: Store,
  projectId: string,
  shotId: string,
) {
  const config = store.settings().agent;
  if (!config.endpoint || !config.model || !config.apiKey)
    throw new AppError(400, "请先配置支持图像输入的助手模型与 API Key");
  const project = store.project(projectId),
    shot = getShot(project, shotId),
    version = selectedVersion(shot),
    asset = project.assets.find((a) => a.id === version?.assetId);
  if (!version || !asset) throw new AppError(400, "请先选择一个候选版本");
  const reviewed = visualInputs(project, shot);
  const content: any[] = [
    {
      type: "text",
      text: `检查此短剧镜头的可观察视觉问题。镜头目标：${shot.prompt}\n场景：${shot.scene}\n角色设定：${shot.characterIds
        .map((id) => {
          const c = project.characters.find((c) => c.id === id);
          return c ? c.name + "：" + c.description : "";
        })
        .join(
          "\n",
        )}\n以下图片先为参考素材，再为被检查镜头。请用中文列出：时间点、具体可观察问题、与哪张参考的哪些细节不同、建议的最小修改。可检查面部绘制漂移、发型服装、道具、场景、构图和明显形变；不要识别现实人物身份，不要把不确定判断当作事实。无法判断时明确写无法判断。静态抽帧无法证明整段运动或口型正常。不得声称自动保证一致或审核通过。`,
    },
  ];
  const refs = referenceIds(project, shot).slice(0, 3);
  for (const [i, ref] of refs.entries()) {
    const a = project.assets.find((a) => a.id === ref && a.kind === "image");
    if (!a) continue;
    const img = await sharp(await readFile(store.path(a.file)))
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    content.push(
      { type: "text", text: `参考图 ${i + 1}` },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` },
      },
    );
  }
  let frameCount = 0;
  if (asset.kind === "image") {
    const img = await sharp(await readFile(store.path(asset.file)))
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    content.push(
      { type: "text", text: "被检查镜头：静态候选图片" },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` },
      },
    );
    frameCount = 1;
  } else if (asset.kind === "video") {
    const { duration } = await probeMedia(store.path(asset.file));
    if (!Number.isFinite(duration) || duration <= 0)
      throw new AppError(400, "视频时长无效");
    const positions = [
      Math.min(0.2, duration / 4),
      duration / 2,
      Math.max(0, duration - 0.2),
    ];
    for (const time of positions) {
      const frame = store.path(`media/${id()}-review.jpg`);
      try {
        await runFfmpeg([
          "-ss",
          String(time),
          "-i",
          store.path(asset.file),
          "-frames:v",
          "1",
          "-vf",
          "scale=640:640:force_original_aspect_ratio=decrease",
          frame,
        ]);
        const img = await readFile(frame);
        content.push(
          { type: "text", text: `被检查镜头：${time.toFixed(2)} 秒` },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${img.toString("base64")}`,
            },
          },
        );
        frameCount++;
      } finally {
        await unlink(frame).catch(() => {});
      }
    }
  } else throw new AppError(400, "仅支持图片或视频候选");
  const response = await fetchJson(
    `${endpoint(config.endpoint)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content }],
        max_tokens: 2000,
      }),
    },
  );
  const text = response.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new AppError(502, "视觉模型未返回检查结果");
  const result = {
    versionId: version.id,
    createdAt: now(),
    text: text.slice(0, 20000),
    frameCount,
    referenceIds: refs,
  };
  store.mutate(projectId, (p) => {
    const s = getShot(p, shotId);
    if (visualInputs(p, s) !== reviewed)
      throw new AppError(409, "镜头或角色参考已改变，请重新运行视觉检查");
    s.visualReview = result;
  });
  return result;
}
