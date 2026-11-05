import React, { useRef, useState } from "react";
import {
  ArrowUpRight,
  Clapperboard,
  Download,
  Film,
  Plus,
  Trash2,
} from "lucide-react";
import type { EpisodeDraft } from "../../../packages/core/src/series";
import type { Job, Project } from "../../../packages/core/src/model";
import { episodeReady } from "../../../packages/shared/episode-status";
import { download, mediaUrl, post } from "./api";
import { t, getLocale } from "./i18n";

type Episode = Omit<Project, "exports"> & {
  seriesDeliveryUrl?: string;
  seriesPackageUrl?: string;
  exports: (Project["exports"][number] & { url: string })[];
};
type SeriesGroup = { id: string; name: string; episodes: Episode[] };
export type AppendSeries = {
  id: string;
  name: string;
  format: Project["format"];
  style: string;
};
type SeriesReview = {
  episodes: EpisodeDraft[];
  marked: boolean;
  name: string;
  review: string;
};
type CreatedSeries = { seriesId: string; projects: Episode[] };

export function episodeLabel(number: number) {
  return getLocale() === "en" ? `Episode ${number}` : `第 ${number} 集`;
}

function collectSeries(projects: Episode[], query: string) {
  const groups = new Map<string, SeriesGroup>();
  for (const p of projects) {
    if (!p.episode) continue;
    const { seriesId, seriesName } = p.episode;
    const group = groups.get(seriesId);
    if (group) group.episodes.push(p);
    else
      groups.set(seriesId, { id: seriesId, name: seriesName, episodes: [p] });
  }
  return [...groups.values()].filter(
    (group) =>
      group.name.toLowerCase().includes(query) ||
      group.episodes.some((p) => p.name.toLowerCase().includes(query)),
  );
}

export function SeriesBoard({
  projects,
  jobs,
  query,
  busy,
  openEpisode,
  appendEpisodes,
  onRender,
  onDelete,
  onError,
}: {
  projects: Episode[];
  jobs: Job[];
  query: string;
  busy: boolean;
  openEpisode: (id: string) => void;
  appendEpisodes: (series: AppendSeries) => void;
  onRender: (id: string) => Promise<void>;
  onDelete: (id: string, title: string) => void;
  onError: (error: unknown) => void;
}) {
  const groups = collectSeries(projects, query.trim().toLowerCase());
  const rendering = new Set(
    jobs
      .filter(
        (job) =>
          job.type === "export" &&
          (job.state === "queued" || job.state === "running"),
      )
      .map((job) => job.projectId),
  );
  return groups.map((group) => {
    const episodes = group.episodes.sort(
      (a, b) => a.episode!.number - b.episode!.number,
    );
    const ready = episodes.filter(
      (episode) => !rendering.has(episode.id) && episodeReady(episode),
    );
    const delivery = episodes[0].seriesDeliveryUrl;
    const packageUrl = episodes[0].seriesPackageUrl;
    const hasVideos = episodes.some((p) =>
      p.exports.some((item) => item.kind === "video"),
    );
    return (
      <section key={group.id} className="series-group" aria-label={group.name}>
        <header>
          <div>
            <div className="eyebrow">
              <Clapperboard size={14} /> {t("短剧系列")}
            </div>
            <h2>{group.name}</h2>
            <p>
              {episodes.length} {t("集")} · {ready.length} {t("集可渲染")}
            </p>
          </div>
          <div className="series-actions">
            {packageUrl && (
              <a className="btn" href={mediaUrl(packageUrl)} download>
                <Download size={14} />
                {t("导出整季工程")}
              </a>
            )}
            {delivery && hasVideos && (
              <a className="btn" href={mediaUrl(delivery)} download>
                <Download size={14} />
                {t("下载成片与字幕 ZIP")}
              </a>
            )}
            <button
              className="btn"
              onClick={() =>
                appendEpisodes({
                  id: group.id,
                  name: group.name,
                  format: episodes[0].format,
                  style: episodes[0].style,
                })
              }
            >
              <Plus size={14} />
              {t("添加分集")}
            </button>
            <button
              className="btn"
              disabled={busy || ready.length === 0}
              onClick={() => void onRender(group.id)}
            >
              <Film size={14} />
              {t("批量渲染就绪集")}
            </button>
          </div>
        </header>
        <ol>
          {episodes.map((p) => {
            const video = p.exports.findLast((e) => e.kind === "video");
            const state = rendering.has(p.id)
              ? "渲染中"
              : video
                ? "已有成片"
                : episodeReady(p)
                  ? "可渲染"
                  : "制作中";
            return (
              <li key={p.id}>
                <button
                  className="series-episode-link"
                  onClick={() => openEpisode(p.id)}
                >
                  <span>{episodeLabel(p.episode!.number)}</span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.shots.length} {t("个镜头")}
                  </small>
                  <ArrowUpRight size={15} />
                </button>
                <span className="series-status">{t(state)}</span>
                {video && (
                  <button
                    className="icon-btn"
                    title={t("下载成片")}
                    aria-label={`${t("下载成片")} · ${p.name}`}
                    onClick={() =>
                      void download(video.url, video.name).catch(onError)
                    }
                  >
                    <Download size={15} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  title={t("删除")}
                  aria-label={`${t("删除")} · ${p.name}`}
                  onClick={() => onDelete(p.id, p.name)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    );
  });
}

export function SeriesImportForm({
  append,
  close,
  onCreated,
}: {
  append?: AppendSeries;
  close: () => void;
  onCreated: (seriesId: string) => Promise<void>;
}) {
  const [name, setName] = useState(append?.name ?? "");
  const [script, setScript] = useState("");
  const [format, setFormat] = useState(append?.format ?? "9:16");
  const [style, setStyle] = useState(
    append?.style ?? (getLocale() === "en" ? "Cinematic" : "电影写实"),
  );
  const [shotsPerEpisode, setShotsPerEpisode] = useState(8);
  const [plan, setPlan] = useState<SeriesReview>();
  const [result, setResult] = useState<CreatedSeries>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef("");
  const inFlight = useRef(false);
  const data = {
    name,
    script,
    style,
    format,
    shotsPerEpisode,
    seriesId: append?.id,
  };
  async function advance() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      if (!plan) {
        const reviewed = await post<SeriesReview>("/series/preview", data);
        requestId.current = crypto.randomUUID();
        setPlan(reviewed);
      } else {
        const accepted =
          result ??
          (await post<CreatedSeries>("/series", {
            ...data,
            review: plan.review,
            requestId: requestId.current,
          }));
        setResult(accepted);
        await onCreated(accepted.seriesId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("请求失败"));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void advance();
      }}
    >
      {plan ? (
        <>
          <div className="notice">
            <Film size={16} />
            <span>
              {plan.name} · {plan.episodes.length} {t("集")} ·{" "}
              {t(plan.marked ? "按剧本标题分集" : "按段落生成分集初稿")}
            </span>
          </div>
          <div className="series-review">
            {plan.episodes.map((episode) => (
              <article key={episode.number}>
                <header>
                  <strong>
                    {episodeLabel(episode.number)} · {episode.title}
                  </strong>
                  <small>
                    {episode.shotCount} {t("个镜头")}
                  </small>
                </header>
                <dl>
                  <dt>{t("开场")}</dt>
                  <dd>{episode.opening}</dd>
                  <dt>{t("结尾")}</dt>
                  <dd>{episode.ending}</dd>
                </dl>
                <details>
                  <summary>{t("查看本集剧本")}</summary>
                  <pre>{episode.script}</pre>
                </details>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="modal-intro">
            {t("粘贴长剧本。使用分集标题保留原编号，或按段落切分初稿。")}
          </p>
          <label className="field">
            <span>{t("剧集名称")}</span>
            <input
              required
              maxLength={100}
              value={name}
              readOnly={!!append}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t("画幅")}</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Project["format"])}
              >
                <option>9:16</option>
                <option>16:9</option>
                <option>1:1</option>
              </select>
            </label>
            <label className="field">
              <span>{t("视觉风格")}</span>
              <input
                required
                maxLength={100}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>{t("剧本 / 小说片段")}</span>
            <textarea
              required
              rows={9}
              maxLength={300000}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={
                getLocale() === "en"
                  ? "Cast: Maya, Sam\nEpisode 1: The letter\nMaya finds a sealed letter.\nEpisode 2: The call\nA phone rings across the street."
                  : "角色：林晚、陈序\n第一集：雨夜来信\n林晚收到一封信。\n第二集：来电\n街对面的电话突然响了。"
              }
            />
          </label>
          <label className="field">
            <span>{t("无标题时每集镜头数")}</span>
            <input
              type="number"
              required
              min={2}
              max={20}
              value={shotsPerEpisode}
              onChange={(e) => setShotsPerEpisode(Number(e.target.value))}
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="series-error">
          {error}
        </p>
      )}
      <footer className="modal-footer">
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={
            plan && !result
              ? () => {
                  setPlan(undefined);
                  setError("");
                }
              : close
          }
        >
          {t(plan && !result ? "返回编辑" : "关闭")}
        </button>
        <button type="submit" className="btn primary" disabled={loading}>
          {t(
            loading
              ? "处理中"
              : result
                ? "打开剧集"
                : plan
                  ? "创建分集项目"
                  : "预览分集",
          )}
        </button>
      </footer>
    </form>
  );
}
