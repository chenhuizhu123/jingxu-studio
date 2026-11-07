import { captionTrackSchema } from "./captions";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { AppError, now, type Project } from "./model";

export const packageLimits = {
  totalBytes: 2 * 1024 ** 3,
  assetBytes: 200 * 1024 ** 2,
  manifestBytes: 8 * 1024 ** 2,
  entries: 3000,
};
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const date = z.iso.datetime();
const optionalId = identifier.optional();
const assetSchema = z.object({
  id: identifier,
  name: z.string().max(200),
  kind: z.enum(["image", "video", "audio", "document"]),
  file: z.string().min(1).max(400),
  mime: z.string().max(100).default(""),
  size: z.number().int().min(0).max(packageLimits.assetBytes).default(0),
  createdAt: z.string().max(64).default(""),
  characterId: optionalId,
});
const versionSchema = z.object({
  id: identifier,
  number: z.number().int().min(1),
  assetId: identifier,
  prompt: z.string().max(10000).default(""),
  createdAt: z.string().max(64).default(""),
  provider: z.string().max(200).default("unknown"),
  source: z.enum(["demo", "generated", "imported"]),
});
const shotSchema = z.object({
  id: identifier,
  order: z.number().int().min(1).max(60),
  title: z.string().min(1).max(120),
  scene: z.string().max(300).default(""),
  type: z.string().max(40).default("Medium"),
  duration: z.number().min(2).max(30),
  trimStart: z.number().min(0).max(86400).default(0),
  dialogue: z.string().max(3000).default(""),
  prompt: z.string().max(10000).default(""),
  characterIds: z.array(identifier).max(20).default([]),
  referenceIds: z.array(identifier).max(20).default([]),
  audioAssetId: optionalId,
  captionTrack: captionTrackSchema.optional(),
  versions: z.array(versionSchema).max(500).default([]),
  selectedVersionId: optionalId,
  review: z.enum(["pending", "approved", "changes"]).default("pending"),
  note: z.string().max(3000).default(""),
  visualReview: z
    .object({
      versionId: identifier,
      createdAt: date,
      text: z.string().max(50000),
      frameCount: z.number().int().min(1).max(20),
      referenceIds: z.array(identifier).max(20),
    })
    .optional(),
});
export const portableProjectSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
  script: z.string().max(100000).default(""),
  format: z.enum(["9:16", "16:9", "1:1"]),
  style: z.string().max(100).default(""),
  musicAssetId: optionalId,
  musicVolume: z.number().min(0).max(1).default(0.15),
  burnSubtitles: z.boolean().default(true),
  createdAt: date,
  updatedAt: date,
  revision: z.number().int().min(1),
  characters: z
    .array(
      z.object({
        id: identifier,
        name: z.string().min(1).max(100),
        description: z.string().max(3000).default(""),
        referenceId: optionalId,
      }),
    )
    .max(100)
    .default([]),
  shots: z.array(shotSchema).max(60).default([]),
  assets: z.array(assetSchema).max(1000).default([]),
  exports: z
    .array(
      z.object({
        id: identifier,
        name: z.string().max(200),
        file: z.string().min(1).max(400),
        kind: z.enum(["video", "archive", "animatic"]),
        createdAt: date,
        size: z.number().int().min(0).max(packageLimits.totalBytes).default(0),
        revision: z.number().int().min(1),
        subtitlesFile: z.string().max(400).optional(),
      }),
    )
    .max(1000)
    .default([]),
  messages: z
    .array(
      z.object({
        id: identifier,
        role: z.enum(["user", "assistant", "tool"]),
        text: z.string().max(100000),
        createdAt: date,
        skill: z.string().max(100).optional(),
      }),
    )
    .max(5000)
    .default([]),
});
export const projectManifestSchema = z.object({
  format: z.literal("jingxu-project"),
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: date,
  project: portableProjectSchema,
});
export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type PortableProject = z.infer<typeof portableProjectSchema>;

export const mediaExtensions: Record<string, { kind: string; mime: string }> = {
  ".png": { kind: "image", mime: "image/png" },
  ".jpg": { kind: "image", mime: "image/jpeg" },
  ".jpeg": { kind: "image", mime: "image/jpeg" },
  ".webp": { kind: "image", mime: "image/webp" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".mp3": { kind: "audio", mime: "audio/mpeg" },
  ".wav": { kind: "audio", mime: "audio/wav" },
  ".m4a": { kind: "audio", mime: "audio/mp4" },
  ".txt": { kind: "document", mime: "text/plain" },
  ".srt": { kind: "document", mime: "text/plain" },
};
export function safePackagePath(value: string) {
  const name = value.endsWith("/") ? value.slice(0, -1) : value;
  if (
    !name ||
    name.length > 400 ||
    /[\\:\x00-\x1f]/.test(name) ||
    name.startsWith("/") ||
    name.split("/").some((s) => !s || s === "." || s === "..")
  )
    throw new AppError(400, "项目包包含不安全的文件路径");
  return name;
}
function unique(values: unknown[], label: string) {
  if (new Set(values).size !== values.length)
    throw new AppError(400, `项目包中的${label}重复`);
}
/** Parse only known project fields. Settings, permissions and arbitrary keys never cross this boundary. */
export function validatePortableProject(input: unknown): PortableProject {
  const p = portableProjectSchema.parse(removeOptionalNulls(input));
  unique(
    p.assets.map((a) => a.id),
    "素材标识",
  );
  unique(
    p.characters.map((c) => c.id),
    "角色标识",
  );
  unique(
    p.shots.map((s) => s.id),
    "镜头标识",
  );
  unique(
    p.exports.map((e) => e.id),
    "导出标识",
  );
  unique(
    p.messages.map((m) => m.id),
    "消息标识",
  );
  unique(
    p.shots.map((s) => s.order),
    "镜头顺序",
  );
  unique(
    p.shots.flatMap((s) => s.versions.map((v) => v.id)),
    "候选标识",
  );
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const cast = new Set(p.characters.map((c) => c.id));
  const requireAsset = (id: string | undefined, kinds: string[]) => {
    if (id && !kinds.includes(assets.get(id)?.kind ?? ""))
      throw new AppError(400, "项目包引用了缺失或不匹配的素材");
  };
  for (const a of p.assets) {
    safePackagePath(a.file);
    const info = mediaExtensions[extname(a.file).toLowerCase()];
    if (!info || info.kind !== a.kind)
      throw new AppError(400, "项目包包含不支持的素材格式");
    a.mime = info.mime;
    a.createdAt = a.createdAt || p.createdAt;
    if (!z.iso.datetime().safeParse(a.createdAt).success)
      throw new AppError(400, "项目包中的日期无效");
    if (a.characterId && !cast.has(a.characterId))
      throw new AppError(400, "项目包引用了缺失的角色");
  }
  for (const c of p.characters) requireAsset(c.referenceId, ["image"]);
  requireAsset(p.musicAssetId, ["audio"]);
  for (const s of p.shots) {
    unique(
      s.versions.map((v) => v.number),
      "候选序号",
    );
    if (
      s.selectedVersionId &&
      !s.versions.some((v) => v.id === s.selectedVersionId)
    )
      throw new AppError(400, "项目包中的已选候选不存在");
    for (const c of s.characterIds)
      if (!cast.has(c)) throw new AppError(400, "项目包引用了缺失的角色");
    for (const r of s.referenceIds) requireAsset(r, ["image"]);
    requireAsset(s.audioAssetId, ["audio"]);
    if (s.captionTrack)
      requireAsset(
        s.captionTrack.source.assetId,
        s.captionTrack.origin === "manual"
          ? ["audio", "video", "image"]
          : ["audio", "video"],
      );
    for (const v of s.versions) {
      requireAsset(v.assetId, ["image", "video"]);
      v.createdAt = v.createdAt || p.createdAt;
      if (!z.iso.datetime().safeParse(v.createdAt).success)
        throw new AppError(400, "项目包中的日期无效");
    }
    if (s.visualReview) {
      if (!s.versions.some((v) => v.id === s.visualReview!.versionId))
        throw new AppError(400, "项目包中的检查版本不存在");
      for (const r of s.visualReview.referenceIds) requireAsset(r, ["image"]);
    }
  }
  for (const e of p.exports) {
    safePackagePath(e.file);
    if (e.subtitlesFile) safePackagePath(e.subtitlesFile);
  }
  return p;
}
function removeOptionalNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeOptionalNulls);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k, v]) =>
            v !== null &&
            !(
              v === "" &&
              [
                "audioAssetId",
                "musicAssetId",
                "selectedVersionId",
                "referenceId",
                "characterId",
                "subtitlesFile",
              ].includes(k)
            ),
        )
        .map(([k, v]) => [k, removeOptionalNulls(v)]),
    );
  return value;
}
export function portableManifest(
  project: unknown,
  exportedAt = now(),
): ProjectManifest {
  return {
    format: "jingxu-project",
    version: (project as Project).shots?.some((s) => s.captionTrack) ? 2 : 1,
    exportedAt,
    project: validatePortableProject(project),
  };
}

/** Every import has new IDs; all references follow the remap. Original projects remain independent. */
export function remapImportedProject(
  project: PortableProject,
  projectId = randomUUID(),
): Project {
  const p = structuredClone(project),
    assetIds = new Map(p.assets.map((a) => [a.id, randomUUID()])),
    castIds = new Map(p.characters.map((c) => [c.id, randomUUID()])),
    versionIds = new Map(
      p.shots.flatMap((s) =>
        s.versions.map((v) => [v.id, randomUUID()] as const),
      ),
    );
  const prefix = `media/import-${projectId}`;
  p.id = projectId;
  p.updatedAt = now();
  p.assets = p.assets.map((a) => ({
    ...a,
    id: assetIds.get(a.id)!,
    file: `${prefix}/assets/${assetIds.get(a.id)}${extname(a.file).toLowerCase()}`,
    characterId: a.characterId ? castIds.get(a.characterId) : undefined,
  }));
  p.characters = p.characters.map((c) => ({
    ...c,
    id: castIds.get(c.id)!,
    referenceId: c.referenceId ? assetIds.get(c.referenceId) : undefined,
  }));
  p.musicAssetId = p.musicAssetId ? assetIds.get(p.musicAssetId) : undefined;
  p.shots.sort((a, b) => a.order - b.order);
  p.shots = p.shots.map((s, i) => ({
    ...s,
    id: randomUUID(),
    order: i + 1,
    characterIds: s.characterIds.map((id) => castIds.get(id)!),
    referenceIds: s.referenceIds.map((id) => assetIds.get(id)!),
    audioAssetId: s.audioAssetId ? assetIds.get(s.audioAssetId) : undefined,
    captionTrack: s.captionTrack
      ? {
          ...s.captionTrack,
          source: {
            ...s.captionTrack.source,
            assetId: assetIds.get(s.captionTrack.source.assetId)!,
          },
        }
      : undefined,
    selectedVersionId: s.selectedVersionId
      ? versionIds.get(s.selectedVersionId)
      : undefined,
    versions: s.versions.map((v) => ({
      ...v,
      id: versionIds.get(v.id)!,
      assetId: assetIds.get(v.assetId)!,
    })),
    visualReview: s.visualReview
      ? {
          ...s.visualReview,
          versionId: versionIds.get(s.visualReview.versionId)!,
          referenceIds: s.visualReview.referenceIds.map((id) =>
            assetIds.get(id)!,
          ),
        }
      : undefined,
  }));
  p.exports = p.exports
    .filter((e) => e.kind === "video")
    .map((e) => {
      const id = randomUUID();
      return {
        ...e,
        id,
        file: `${prefix}/renders/${id}.mp4`,
        subtitlesFile: e.subtitlesFile
          ? `${prefix}/renders/${id}.srt`
          : undefined,
      };
    });
  p.messages = p.messages.map((m) => ({ ...m, id: randomUUID() }));
  return p;
}
