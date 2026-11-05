import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  buildStoryboard,
  castLine,
  createProject,
  declaredCast,
  id,
  storyboardLines,
  type Project,
} from "./model";
import type { Store } from "./store";

const maximumEpisodes = 99;
const numeral = "〇一二三四五六七八九";
const heading =
  /^(?:#{1,6}\s+)?(?:第\s*([0-9〇零一二两三四五六七八九十百]+)\s*集|(?:episode|ep\.?)\s*(\d+)(?!\w))(?=$|[\s：:·.\-—–\u4e00-\u9fff])\s*(?:[：:·.\-—–]\s*)?(.*?)\s*$/i;

const seriesDraft = z
  .object({
    seriesId: z.uuid().optional(),
    name: z.string().trim().min(1).max(100),
    script: z.string().trim().min(1).max(300000),
    format: z.enum(["9:16", "16:9", "1:1"]),
    style: z.string().trim().min(1).max(100),
    shotsPerEpisode: z.number().int().min(2).max(20).default(8),
  })
  .strict();

export const seriesCreate = seriesDraft.extend({
  requestId: z.uuid(),
  review: z.string().regex(/^[a-f0-9]{64}$/),
});

export type EpisodeDraft = {
  number: number;
  title: string;
  script: string;
  shotCount: number;
  opening: string;
  ending: string;
};

function episodeNumber(text: string) {
  if (/^\d+$/.test(text)) return Number(text);
  const digits = [...text.replaceAll("两", "二").replaceAll("零", "〇")];
  if (digits.every((c) => numeral.includes(c)))
    return Number(digits.map((c) => numeral.indexOf(c)).join(""));
  const sequence = digits.join("");
  if (
    !/^(?:[一二三四五六七八九]百(?:〇[一二三四五六七八九]|[一二三四五六七八九]十[一二三四五六七八九]?)?|[一二三四五六七八九]?十[一二三四五六七八九]?)$/.test(
      sequence,
    )
  )
    return NaN;
  let value = 0,
    digit = 0;
  for (const char of digits) {
    if (char === "百" || char === "十") {
      value += (digit || 1) * (char === "百" ? 100 : 10);
      digit = 0;
    } else digit = numeral.indexOf(char);
  }
  return value + digit;
}

export function splitEpisodes(
  script: string,
  shotsPerEpisode: number,
  nextEpisode = 1,
  language: "zh" | "en" = "zh",
) {
  const lines = script.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
  const preamble: string[] = [];
  const groups: { number: number; title: string; lines: string[] }[] = [];
  for (const line of lines) {
    const marker = line.trim().match(heading);
    if (marker)
      groups.push({
        number: episodeNumber(marker[1] ?? marker[2]),
        title: marker[3].trim(),
        lines: [],
      });
    else (groups.at(-1)?.lines ?? preamble).push(line);
  }
  const marked = groups.length > 0;
  const cast = preamble
    .map((line) => line.trim())
    .filter((line) => castLine.test(line));
  if (!marked) {
    const content = storyboardLines(preamble.join("\n"));
    for (let index = 0; index < content.length; index += shotsPerEpisode) {
      groups.push({
        number: nextEpisode + groups.length,
        title: "",
        lines: content.slice(index, index + shotsPerEpisode),
      });
    }
  }
  if (!groups.length) throw new AppError(400, "请添加至少一段剧情");
  if (groups.length > maximumEpisodes)
    throw new AppError(400, "每部剧最多 99 集");
  const numbers = new Set<number>();
  const episodes: EpisodeDraft[] = groups.map((group, index) => {
    if (
      !Number.isInteger(group.number) ||
      group.number < 1 ||
      group.number > 999
    )
      throw new AppError(400, "集数编号须在 1 到 999 之间");
    if (numbers.has(group.number))
      throw new AppError(400, "剧本中有重复的集数编号");
    numbers.add(group.number);
    if (!storyboardLines(group.lines.join("\n")).length)
      throw new AppError(400, "每集都需要剧情内容，请检查空集");
    const body =
      marked && index === 0
        ? [...preamble, ...group.lines]
        : [...cast, ...group.lines];
    const script = body.join("\n").trim();
    if (declaredCast(script).some((name) => name.length > 100))
      throw new AppError(400, "角色姓名不能超过 100 字");
    const shots = storyboardLines(script);
    if (shots.length > 60 || script.length > 100000)
      throw new AppError(
        400,
        "每集最多 60 个初稿镜头和 10 万字，请增加分集标题",
      );
    if (group.title.length > 100)
      throw new AppError(400, "分集标题不能超过 100 字");
    return {
      number: group.number,
      title:
        group.title ||
        (language === "en"
          ? `Episode ${group.number}`
          : `第 ${group.number} 集`),
      script,
      shotCount: shots.length,
      opening: shots[0],
      ending: shots.at(-1)!,
    };
  });
  return { marked, episodes: episodes.sort((a, b) => a.number - b.number) };
}

type SeriesReceipt = { review: string; seriesId: string; projectIds: string[] };

export function seriesEpisodes(store: Store, seriesId: string) {
  return store
    .projects()
    .filter((p) => p.episode?.seriesId === seriesId)
    .sort((a, b) => a.episode!.number - b.episode!.number);
}

export function planSeries(
  store: Store,
  input: unknown,
  language: "zh" | "en",
) {
  const data = seriesDraft.parse(input);
  const existing = data.seriesId ? seriesEpisodes(store, data.seriesId) : [];
  if (data.seriesId && !existing.length) throw new AppError(404, "剧集不存在");
  const name = existing[0]?.episode?.seriesName ?? data.name;
  const numbers = new Set(existing.map((p) => p.episode!.number));
  const split = splitEpisodes(
    data.script,
    data.shotsPerEpisode,
    Math.max(0, ...numbers) + 1,
    language,
  );
  if (split.episodes.length + existing.length > maximumEpisodes)
    throw new AppError(400, "每部剧最多 99 集");
  if (split.episodes.some((episode) => numbers.has(episode.number)))
    throw new AppError(409, "已有相同编号的集，请修改标题中的集数");
  const review = createHash("sha256")
    .update(
      JSON.stringify({ data, language, name, numbers: [...numbers], split }),
    )
    .digest("hex");
  return { ...split, name, review };
}

export function createSeriesEpisodes(
  store: Store,
  input: unknown,
  language: "zh" | "en",
) {
  const { requestId, review, ...data } = seriesCreate.parse(input);
  const receipt = store.get<SeriesReceipt>("series-receipt", requestId);
  if (receipt) {
    if (receipt.review !== review)
      throw new AppError(409, "本次导入已创建，请重新打开分集工具");
    const ids = new Set(receipt.projectIds);
    return {
      seriesId: receipt.seriesId,
      projects: seriesEpisodes(store, receipt.seriesId).filter((p) =>
        ids.has(p.id),
      ),
      created: false,
    };
  }
  const plan = planSeries(store, data, language);
  if (review !== plan.review)
    throw new AppError(409, "剧本或集数已改变，请重新预览分集");
  const seriesId = data.seriesId ?? id();
  const projects = plan.episodes.map((episode) => {
    const p = createProject({
      name: episode.title,
      script: episode.script,
      format: data.format,
      style: data.style,
    });
    p.episode = { seriesId, seriesName: plan.name, number: episode.number };
    buildStoryboard(p, language);
    return p;
  });
  store.writeBatch(
    [
      ...projects.map((p) => ({ kind: "project", id: p.id, value: p })),
      {
        kind: "series-receipt",
        id: requestId,
        value: { review, seriesId, projectIds: projects.map((p) => p.id) },
      },
    ],
    { insertOnly: true },
  );
  return { seriesId, projects, created: true };
}
