import { z } from "zod";
import {
  captionTrackSchema,
  captionSource,
  sameCaptionSource,
  captionsCurrent,
  plainSubtitle,
  type CaptionTrack,
} from "./captions";
import { randomUUID } from "node:crypto";

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export type Asset = {
  id: string;
  name: string;
  kind: "image" | "video" | "audio" | "document";
  file: string;
  mime: string;
  size: number;
  createdAt: string;
  characterId?: string;
};
export type Character = {
  id: string;
  name: string;
  description: string;
  referenceId?: string;
};
export type Version = {
  id: string;
  number: number;
  assetId: string;
  prompt: string;
  createdAt: string;
  provider: string;
  source: "demo" | "generated" | "imported";
};
export type Shot = {
  id: string;
  order: number;
  title: string;
  scene: string;
  type: string;
  duration: number;
  trimStart?: number;
  dialogue: string;
  prompt: string;
  characterIds: string[];
  referenceIds: string[];
  audioAssetId?: string;
  captionTrack?: CaptionTrack;
  versions: Version[];
  selectedVersionId?: string;
  review: "pending" | "approved" | "changes";
  note: string;
  visualReview?: {
    versionId: string;
    createdAt: string;
    text: string;
    frameCount: number;
    referenceIds: string[];
  };
};
export type Export = {
  subtitlesFile?: string;
  id: string;
  name: string;
  file: string;
  kind: "video" | "archive" | "animatic";
  createdAt: string;
  size: number;
  revision: number;
};
export type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  createdAt: string;
  skill?: string;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  script: string;
  format: "9:16" | "16:9" | "1:1";
  style: string;
  episode?: { seriesId: string; seriesName: string; number: number };
  musicAssetId?: string;
  musicVolume?: number;
  burnSubtitles?: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  characters: Character[];
  shots: Shot[];
  assets: Asset[];
  exports: Export[];
  messages: Message[];
};
export type Job = {
  id: string;
  projectId: string;
  shotId?: string;
  type: "generate" | "export" | "speech" | "transcribe" | "image" | "animatic";
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  remoteId?: string;
  phase?: "submitting" | "polling" | "rendering";
  prompt?: string;
  referenceIds?: string[];
  firstFrameAssetId?: string;
  duration?: number;
  error?: string;
  resultId?: string;
  attempts: number;
  exportRevision?: number;
  speechText?: string;
  captionResult?: CaptionTrack;
  // Billable usage measured from data the app already holds (never an
  // estimated price). Populated at enqueue time for units not otherwise
  // derivable; only succeeded jobs are counted by summarizeUsage.
  usage?: {
    // Seconds of audio sent to transcription.
    seconds?: number;
  };
};
export type McpConfig = {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
};
export type Pricing = {
  // Display symbol only (¥, $, …), no FX conversion.
  currency: string;
  // User-filled unit prices from their own provider bill. All optional: a
  // missing price means that kind is not estimated. Never guessed by the app.
  videoPerSecond?: number;
  imagePerImage?: number;
  speechPerKiloChar?: number;
  transcriptionPerSecond?: number;
  // Optional soft monthly spending ceiling in `currency`, used only for the
  // local budget guardrail. Never blocks jobs and is never billed by Jingxu.
  monthlyBudget?: number;
};
export type Settings = {
  image: { endpoint: string; model: string; apiKey: string };
  transcription: {
    endpoint: string;
    model: string;
    language: string;
    apiKey: string;
  };
  speech: {
    endpoint: string;
    model: string;
    voice: string;
    speed: number;
    apiKey: string;
  };
  generation: {
    provider: "demo" | "ark" | "gateway";
    endpoint: string;
    model: string;
    apiKey: string;
    pollIntervalMs: number;
  };
  agent: { endpoint: string; model: string; apiKey: string };
  mcp: McpConfig[];
  concurrency: number;
  pricing: Pricing;
};
export type Approval = {
  id: string;
  projectId: string;
  serverId: string;
  tool: string;
  arguments: Record<string, unknown>;
  state: "pending" | "approved" | "rejected" | "failed";
  result?: string;
  createdAt: string;
};
export const defaultSettings: Settings = {
  image: {
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
    apiKey: "",
  },
  transcription: { endpoint: "", model: "", language: "", apiKey: "" },
  speech: { endpoint: "", model: "", voice: "", speed: 1, apiKey: "" },
  generation: {
    provider: "demo",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
    apiKey: "",
    pollIntervalMs: 5000,
  },
  agent: { endpoint: "", model: "", apiKey: "" },
  mcp: [],
  concurrency: 2,
  pricing: { currency: "¥" },
};
export const projectInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
  script: z.string().max(100000).default(""),
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  style: z.string().max(100).default("电影写实"),
});
export const shotInput = z
  .object({
    title: z.string().min(1).max(120).optional(),
    scene: z.string().max(300).optional(),
    type: z.string().max(40).optional(),
    duration: z.number().min(2).max(30).optional(),
    trimStart: z.number().min(0).max(86400).optional(),
    dialogue: z.string().max(3000).optional(),
    prompt: z.string().max(10000).optional(),
    characterIds: z.array(z.string()).max(20).optional(),
    referenceIds: z.array(z.string()).max(20).optional(),
    note: z.string().max(3000).optional(),
    review: z.enum(["pending", "approved", "changes"]).optional(),
    selectedVersionId: z.string().optional(),
    audioAssetId: z.string().nullable().optional(),
    captionTrack: captionTrackSchema.nullable().optional(),
  })
  .strict();
// Form inputs send "" for empty prices; accept only finite non-negative numbers.
const priceField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().finite().min(0).max(1_000_000).optional(),
);
export const settingsInput = z.object({
  image: z
    .object({
      endpoint: z.string().trim().max(2000),
      model: z.string().trim().max(200),
      apiKey: z.string().max(4000).optional(),
    })
    .optional(),
  transcription: z
    .object({
      endpoint: z.string().max(2000),
      model: z.string().trim().max(200),
      language: z.string().regex(/^(?:[a-z]{2})?$/),
      apiKey: z.string().max(4000).optional(),
    })
    .optional(),
  speech: z
    .object({
      endpoint: z.string().max(2000),
      model: z.string().trim().max(200),
      voice: z.string().trim().max(200),
      speed: z.number().min(0.25).max(4),
      apiKey: z.string().max(4000).optional(),
    })
    .optional(),
  generation: z.object({
    provider: z.enum(["demo", "ark", "gateway"]),
    endpoint: z.string().max(2000),
    model: z.string().max(200),
    apiKey: z.string().max(4000).optional(),
    pollIntervalMs: z.number().min(100).max(60000).default(5000),
  }),
  agent: z.object({
    endpoint: z.string().max(2000),
    model: z.string().max(200),
    apiKey: z.string().max(4000).optional(),
  }),
  mcp: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        transport: z.enum(["stdio", "http"]),
        command: z.string().max(1000).optional(),
        args: z.array(z.string().max(2000)).max(30).optional(),
        url: z.string().max(2000).optional(),
        enabled: z.boolean(),
      }),
    )
    .max(20),
  concurrency: z.number().int().min(1).max(4),
  pricing: z
    .object({
      currency: z.string().trim().max(8).default("¥"),
      videoPerSecond: priceField,
      imagePerImage: priceField,
      speechPerKiloChar: priceField,
      transcriptionPerSecond: priceField,
      monthlyBudget: priceField,
    })
    .optional(),
});
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createProject(input: z.input<typeof projectInput>): Project {
  const p = projectInput.parse(input);
  return {
    ...p,
    id: id(),
    createdAt: now(),
    updatedAt: now(),
    revision: 1,
    characters: [],
    shots: [],
    assets: [],
    exports: [],
    messages: [],
  };
}
export function getShot(project: Project, shotId: string) {
  const s = project.shots.find((s) => s.id === shotId);
  if (!s) throw new AppError(404, "镜头不存在");
  return s;
}
export function selectedVersion(shot: Shot) {
  return shot.versions.find((v) => v.id === shot.selectedVersionId);
}
export function invalidateCharacterReview(
  project: Project,
  characterId: string,
) {
  const linked = project.shots.filter((s) =>
    s.characterIds.includes(characterId),
  );
  for (const shot of linked) {
    if (shot.review === "approved") shot.review = "pending";
    delete shot.visualReview;
  }
  return linked.length;
}
export function updateShot(project: Project, shotId: string, data: unknown) {
  const shot = getShot(project, shotId);
  const patch = shotInput.parse(data);
  if (
    patch.selectedVersionId &&
    !shot.versions.some((v) => v.id === patch.selectedVersionId)
  )
    throw new AppError(400, "候选版本不存在");
  if (
    patch.referenceIds?.some(
      (a) => !project.assets.some((v) => v.id === a && v.kind === "image"),
    )
  )
    throw new AppError(400, "参考图不存在或格式不正确");
  if (
    patch.characterIds?.some((a) => !project.characters.some((v) => v.id === a))
  )
    throw new AppError(400, "角色不存在");
  if (
    patch.audioAssetId &&
    !project.assets.some(
      (a) => a.id === patch.audioAssetId && a.kind === "audio",
    )
  )
    throw new AppError(400, "配音素材不存在");
  if (
    (patch.selectedVersionId &&
      patch.selectedVersionId !== shot.selectedVersionId) ||
    (patch.trimStart !== undefined &&
      patch.trimStart !== (shot.trimStart ?? 0)) ||
    (patch.duration !== undefined && patch.duration !== shot.duration) ||
    ["scene", "characterIds", "referenceIds"].some(
      (key) =>
        key in patch &&
        JSON.stringify(patch[key as keyof typeof patch]) !==
          JSON.stringify(shot[key as keyof Shot]),
    )
  ) {
    shot.review = "pending";
    delete shot.visualReview;
  }
  const updated = {
    ...shot,
    ...patch,
    audioAssetId:
      patch.audioAssetId === null
        ? undefined
        : (patch.audioAssetId ?? shot.audioAssetId),
  } as Shot;
  if (
    patch.captionTrack &&
    !project.assets.some(
      (a) =>
        a.id === patch.captionTrack!.source.assetId &&
        (patch.captionTrack!.origin === "manual"
          ? ["audio", "video", "image"]
          : ["audio", "video"]
        ).includes(a.kind),
    )
  )
    throw new AppError(400, "字幕来源素材无效");
  if (
    patch.captionTrack &&
    !sameCaptionSource(patch.captionTrack.source, captionSource(updated))
  )
    throw new AppError(409, "音轨或剪辑已改变，请重新核对字幕");
  Object.assign(shot, patch, {
    audioAssetId:
      patch.audioAssetId === null
        ? undefined
        : (patch.audioAssetId ?? shot.audioAssetId),
  });
  if (patch.captionTrack === null) delete shot.captionTrack;
  return shot;
}
export function addVersion(
  project: Project,
  shotId: string,
  asset: Asset,
  prompt: string,
  provider: string,
  source: Version["source"],
) {
  const shot = getShot(project, shotId);
  if (!project.assets.some((a) => a.id === asset.id))
    project.assets.push(asset);
  const version: Version = {
    id: id(),
    number: Math.max(0, ...shot.versions.map((v) => v.number)) + 1,
    assetId: asset.id,
    prompt,
    provider,
    source,
    createdAt: now(),
  };
  shot.versions.push(version);
  if (!shot.selectedVersionId) shot.selectedVersionId = version.id;
  shot.review = "pending";
  return version;
}
export const castLine = /^(?:角色|cast)\s*[：:]\s*/i;
export const defaultCharacterDescription = {
  zh: "请补充角色外貌、服装和音色，并上传定妆参考图。",
  en: "Add appearance, wardrobe and voice details, then upload a character reference.",
};

export function declaredCast(script: string) {
  return script
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => castLine.test(line))
    .flatMap((line) => line.replace(castLine, "").split(/[、,，]/))
    .map((name) => name.trim())
    .filter(Boolean);
}

export function storyboardLines(script: string) {
  return script
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !castLine.test(line))
    .flatMap((line) => {
      if (line.length <= 250) return [line];
      const chunks: string[] = [];
      let start = 0;
      while (line.length - start > 250) {
        const slice = line.slice(start, start + 250);
        const breaks = [
          ...slice.matchAll(/[。！？.!?；;](?=\s|[^\x00-\x7f]|$)|[。！？；]/g),
        ];
        const last = breaks.at(-1);
        let end =
          last && last.index >= 90 ? start + last.index + 1 : start + 250;
        // Leave a UTF-16 surrogate pair intact at a hard split.
        if (/^[\udc00-\udfff]$/.test(line[end])) end--;
        chunks.push(line.slice(start, end).trim());
        start = end;
      }
      chunks.push(line.slice(start).trim());
      return chunks.filter(Boolean);
    });
}

const stylePromptLabel: Record<string, string> = {
  电影写实: "cinematic realism",
  国风动画: "Chinese-style animation",
  治愈手绘: "warm hand-drawn illustration",
  产品广告: "product commercial",
  自定义: "custom visual style",
};
export function styleForPrompt(style: string, language: "zh" | "en") {
  if (language !== "en") return style;
  return stylePromptLabel[style] ?? style;
}
export function buildStoryboard(
  project: Project,
  language: "zh" | "en" = "zh",
) {
  const lines = project.script
    .split(/\r\n?|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const content = lines.filter((s) => !castLine.test(s));
  const named = declaredCast(project.script);
  const speakers = content
    .map((s) => s.match(/^([\p{L}]{2,8})[：:]/u)?.[1])
    .filter(
      (s): s is string =>
        !!s && !/^(场景|镜头|画面|旁白|字幕|钩子|悬念|hook|scene)$/i.test(s),
    );
  for (const name of [...new Set([...named, ...speakers])].slice(0, 12))
    if (!project.characters.some((c) => c.name === name))
      project.characters.push({
        id: id(),
        name,
        description: defaultCharacterDescription[language],
      });
  const shots = storyboardLines(project.script).slice(0, 60);
  const created = shots.map((text, i): Shot => ({
    id: id(),
    order: i + 1,
    title: (
      text.replace(/^[\d一二三四五六七八九十]+[.、\s]/, "").trim() || text
    ).slice(0, 20),
    scene: language === "zh" ? "待确认场景" : "Scene to confirm",
    type: (language === "zh"
      ? ["远景", "中景", "近景", "特写"]
      : ["Long shot", "Medium shot", "Close shot", "Close-up"])[i % 4],
    duration: Math.min(12, Math.max(4, Math.ceil(text.length / 6))),
    dialogue: text.match(/^[\p{L}]{2,8}[：:](.+)/u)?.[1] ?? "",
    prompt:
      language === "zh"
        ? `${project.style}，${project.format}画幅。${text}。保持已绑定角色的面部、发型、服装与场景参考一致。`
        : `${styleForPrompt(project.style, "en")}, ${project.format} aspect ratio. ${text}. Preserve the cast’s face, hairstyle, wardrobe and setting references.`,
    characterIds: project.characters
      .filter((c) => text.includes(c.name))
      .map((c) => c.id),
    referenceIds: [],
    versions: [],
    review: "pending",
    note: "",
  }));
  project.shots = created;
  return created;
}
export type Finding = {
  shotId: string;
  severity: "error" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
};
export function inspectProject(p: Project): Finding[] {
  const result: Finding[] = [];
  for (const s of p.shots) {
    if (s.captionTrack && !captionsCurrent(s))
      result.push({
        shotId: s.id,
        severity: "error",
        code: "captions-stale",
        title: "时间轴字幕需要重新对齐",
        detail: "镜头音轨或剪辑已改变，请更新字幕或切回台词字幕。",
      });
    if (!selectedVersion(s))
      result.push({
        shotId: s.id,
        severity: "error",
        code: "missing-media",
        title: "缺少已选素材",
        detail: "生成镜头或导入视频，然后选择可用版本。",
      });
    if (s.dialogue.length > s.duration * 5)
      result.push({
        shotId: s.id,
        severity: "warning",
        code: "dialogue-long",
        title: "对白可能超出镜头时长",
        detail: `${s.dialogue.length} 字对白 / ${s.duration} 秒；请试听并调整时长。`,
      });
    if (
      s.characterIds.some(
        (c) => !p.characters.find((x) => x.id === c)?.referenceId,
      )
    )
      result.push({
        shotId: s.id,
        severity: "warning",
        code: "missing-reference",
        title: "角色尚未绑定参考图",
        detail: "补充定妆图可为生成提供一致性参考，结果仍需人工检查。",
      });
    if (["待确认场景", "Scene to confirm"].includes(s.scene))
      result.push({
        shotId: s.id,
        severity: "info",
        code: "scene-unset",
        title: "场景设定待补充",
        detail: "确认地点、光线和关键道具，减少镜头之间的设定变化。",
      });
    if (s.review === "changes")
      result.push({
        shotId: s.id,
        severity: "warning",
        code: "changes-requested",
        title: "镜头有待处理的返修",
        detail: s.note || "请检查候选版本并完成返修。",
      });
  }
  return result;
}
export function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function makeSrt(shots: Shot[]) {
  let cursor = 0,
    number = 0;
  const entries: string[] = [];
  for (const shot of [...shots].sort((a, b) => a.order - b.order)) {
    if (shot.captionTrack && !captionsCurrent(shot))
      throw new AppError(409, "音轨或剪辑已改变，请重新核对字幕");
    const cues =
      shot.captionTrack?.cues ??
      (shot.dialogue.trim()
        ? [{ start: 0, end: shot.duration, text: shot.dialogue }]
        : []);
    for (const cue of cues)
      entries.push(
        `${++number}\n${srtTime(cursor + cue.start)} --> ${srtTime(cursor + cue.end)}\n${plainSubtitle(cue.text)}\n`,
      );
    cursor += shot.duration;
  }
  return entries.join("\n");
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function storyboardCsv(p: Project) {
  return (
    "\uFEFF" +
    [
      ["镜号", "标题", "场景", "景别", "秒数", "对白", "提示词", "版本"],
      ...p.shots.map((s) => [
        s.order,
        s.title,
        s.scene,
        s.type,
        s.duration,
        s.dialogue,
        s.prompt,
        selectedVersion(s)?.number ?? "",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}

/** Reorder a complete shot set atomically; IDs and candidate history stay intact. */
export function reorderShots(project: Project, shotIds: unknown) {
  const ids = z.array(z.string()).parse(shotIds);
  if (
    ids.length !== project.shots.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !project.shots.some((s) => s.id === id))
  )
    throw new AppError(400, "镜头顺序必须包含全部镜头且不能重复");
  project.shots = ids.map((id, i) => ({
    ...getShot(project, id),
    order: i + 1,
  }));
  return project.shots;
}
