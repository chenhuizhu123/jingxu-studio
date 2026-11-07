import React, { useRef, useState } from "react";
import { Plus, Trash2, Play, Captions, Loader2 } from "lucide-react";
import type {
  Project,
  Shot,
  Job,
  Settings,
  Pricing,
} from "../../../packages/core/src/model";
import {
  captionSource,
  captionTrackSchema,
  sameCaptionSource,
  type CaptionTrack,
} from "../../../packages/core/src/captions";
import { estimateTranscription } from "../../../packages/core/src/usage";
import { api, post, mediaUrl } from "./api";
import { t } from "./i18n";
export type PublicTranscription = Omit<Settings["transcription"], "apiKey"> & {
  apiKey?: string;
  hasApiKey: boolean;
};
export function TranscriptionSettings({
  value,
  onChange,
}: {
  value: PublicTranscription;
  onChange: (v: PublicTranscription) => void;
}) {
  return (
    <section className="settings-card">
      <header>
        <Captions size={20} />
        <div>
          <h2>{t("语音识别与字幕")}</h2>
          <p>
            {t(
              "使用支持 verbose_json 分段时间戳的兼容服务。模型由你的服务商提供。",
            )}
          </p>
        </div>
      </header>
      <label className="field">
        <span>{t("识别 API 服务地址 / 不含 audio/transcriptions")}</span>
        <input
          type="url"
          value={value.endpoint}
          onChange={(e) => onChange({ ...value, endpoint: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t("识别模型 ID")}</span>
          <input
            maxLength={200}
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{t("识别语言")}</span>
          <select
            value={value.language}
            onChange={(e) => onChange({ ...value, language: e.target.value })}
          >
            <option value="">{t("自动检测")}</option>
            <option value="zh">{t("中文")}</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>
          {t("识别 API Key")} {value.hasApiKey && <small>{t("已保存")}</small>}
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={value.apiKey ?? ""}
          placeholder={
            value.hasApiKey ? t("留空保留已有 Key") : t("输入 API Key")
          }
          onChange={(e) =>
            onChange({ ...value, apiKey: e.target.value || undefined })
          }
        />
      </label>
    </section>
  );
}
type ViewProject = Omit<Project, "assets"> & {
  assets: (Project["assets"][number] & { url: string })[];
};
export function CaptionEditor({
  project,
  shot,
  jobs,
  config,
  onSaved,
  onClose,
  openSettings,
  pricing,
}: {
  project: ViewProject;
  shot: Shot;
  jobs: Job[];
  config?: PublicTranscription;
  onSaved: () => Promise<void>;
  onClose: () => void;
  openSettings: () => void;
  pricing?: Pricing;
}) {
  const source = captionSource(shot),
    asset = project.assets.find((a) => a.id === source?.assetId),
    media = useRef<HTMLMediaElement | null>(null);
  const [draft, setDraft] = useState<CaptionTrack | undefined>(
      shot.captionTrack,
    ),
    [revision] = useState(project.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState(false),
    [acceptedJob, setAcceptedJob] = useState<Job>(),
    [saved, setSaved] = useState(false),
    [edited, setEdited] = useState(false);
  const running = jobs.some(
    (j) =>
      j.type === "transcribe" &&
      j.shotId === shot.id &&
      ["queued", "running"].includes(j.state),
  );
  const candidates = jobs.filter(
    (j) => j.type === "transcribe" && j.shotId === shot.id && j.captionResult,
  );
  const ready = !!(config?.endpoint && config.model && config.hasApiKey),
    usable = !!asset && ["audio", "video"].includes(asset.kind);
  const transcriptionEstimate = estimateTranscription(
    source?.duration ?? 0,
    pricing,
  );
  const current = draft && sameCaptionSource(draft.source, source);
  const valid = !!draft && captionTrackSchema.safeParse(draft).success;
  function changeCue(index: number, key: string, value: unknown) {
    setEdited(true);
    setDraft((d) =>
      d
        ? {
            ...d,
            cues: d.cues.map((c, i) =>
              i === index ? { ...c, [key]: value } : c,
            ),
          }
        : d,
    );
  }
  async function recognize() {
    if (busy || !source) return;
    setBusy(true);
    setError("");
    let result = acceptedJob;
    try {
      if (!result) {
        result = await post<Job>(
          `/projects/${project.id}/shots/${shot.id}/transcribe`,
          { source },
        );
        setAcceptedJob(result);
      }
      await onSaved();
      setConfirming(false);
    } catch (e) {
      setError(
        (result ? t("识别任务已创建，重试只刷新结果。") + " " : "") +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(track: CaptionTrack | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    let committed = saved;
    try {
      if (!committed) {
        await api(`/projects/${project.id}/shots/${shot.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            revision,
            captionTrack: track && {
              ...track,
              origin: edited ? "manual" : track.origin,
              createdAt: new Date().toISOString(),
            },
          }),
        });
        setSaved(true);
        committed = true;
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        (committed ? t("字幕已保存，重试只刷新项目。") + " " : "") +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="caption-editor">
      <p className="modal-intro">
        {t(
          "时间以镜头起点为零。识别当前配音或源视频音轨，核对后应用；不会改写剧本台词。",
        )}
      </p>
      {usable && source && (
        <div className="caption-listen">
          {asset.kind === "video" ? (
            <video
              ref={(node) => {
                media.current = node;
              }}
              controls
              src={mediaUrl(asset.url)}
              preload="metadata"
            />
          ) : (
            <audio
              ref={(node) => {
                media.current = node;
              }}
              controls
              src={mediaUrl(asset.url)}
              preload="metadata"
            />
          )}
          <small>
            {t("识别范围")} {source.start.toFixed(2)}–
            {(source.start + source.duration).toFixed(2)}s · {asset.name}
          </small>
        </div>
      )}
      {!usable && (
        <p className="notice">{t("请为镜头选择配音或带音轨的视频")}</p>
      )}
      <div className="button-row">
        {ready ? (
          <button
            className="btn"
            type="button"
            disabled={busy || running || !usable}
            onClick={() => {
              setConfirming(true);
              setAcceptedJob(undefined);
              setError("");
            }}
          >
            {running ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Captions size={14} />
            )}{" "}
            {t(running ? "正在识别音轨" : "识别当前音轨")}
          </button>
        ) : (
          <button className="btn" type="button" onClick={openSettings}>
            {t("配置语音识别")}
          </button>
        )}
        <button
          className="btn"
          type="button"
          disabled={busy || !asset}
          onClick={() => {
            setDraft({
              source: source!,
              origin: "manual",
              createdAt: new Date().toISOString(),
              cues: [],
            });
            setEdited(true);
          }}
        >
          {t("手动创建时间轴")}
        </button>
      </div>
      {confirming && (
        <div className="voiceover-composer">
          <strong>{t("确认识别音轨")}</strong>
          <p>
            {config?.model} · {config?.language || t("自动检测")}
          </p>
          <div className="review-cost">
            <span>{t("预计成本")}</span>
            {transcriptionEstimate.cost !== undefined ? (
              <>
                <strong>
                  ≈ {transcriptionEstimate.currency}
                  {Number(transcriptionEstimate.cost.toFixed(4))}
                </strong>
                <small>
                  · {transcriptionEstimate.seconds} {t("秒")}
                  {t("，以服务商账单为准。")}
                </small>
              </>
            ) : (
              <small>
                · {transcriptionEstimate.seconds} {t("秒")}
              </small>
            )}
          </div>
          <p>
            {t(
              "仅发送本镜头实际使用的音频片段，不含背景音乐。服务商可能收费。",
            )}
          </p>
          <div className="button-row">
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {t("取消")}
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy || (running && !acceptedJob)}
              onClick={() => void recognize()}
            >
              {t(acceptedJob ? "刷新识别结果" : "确认并识别")}
            </button>
          </div>
        </div>
      )}
      {acceptedJob && !confirming && (
        <p role="status">{t("识别任务已创建，完成后选择字幕候选。")}</p>
      )}
      {candidates.length > 0 && (
        <div className="caption-candidates">
          <strong>{t("识别候选")}</strong>
          {candidates.map((j) => (
            <button
              type="button"
              className="btn"
              key={j.id}
              disabled={busy}
              onClick={() => {
                setDraft(structuredClone(j.captionResult));
                setEdited(false);
              }}
            >
              {j.captionResult!.cues.length} {t("条字幕")} ·{" "}
              {j.createdAt.slice(11, 19)}
            </button>
          ))}
        </div>
      )}
      {draft && (
        <>
          {!current && (
            <p role="status" className="form-error">
              {t("音轨或剪辑已改变，请重新核对字幕")}
            </p>
          )}
          {!valid && (
            <p role="status" className="form-error">
              {t("字幕时间必须顺序排列、不重叠且位于镜头时长内")}
            </p>
          )}
          {!draft.cues.length && (
            <p>{t("当前时间轴为空，应用后此镜头不显示字幕。")}</p>
          )}
          <div className="caption-cue-list">
            {draft.cues.map((cue, i) => (
              <div className="caption-cue" key={i}>
                <div className="field-row">
                  <label className="field">
                    <span>
                      {t("开始 / 秒")} {i + 1}
                    </span>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={shot.duration}
                      value={cue.start}
                      disabled={busy || saved}
                      onChange={(e) =>
                        changeCue(i, "start", Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      {t("结束 / 秒")} {i + 1}
                    </span>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={shot.duration}
                      value={cue.end}
                      disabled={busy || saved}
                      onChange={(e) =>
                        changeCue(i, "end", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>
                    {t("字幕文本")} {i + 1}
                  </span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={cue.text}
                    disabled={busy || saved}
                    onChange={(e) => changeCue(i, "text", e.target.value)}
                  />
                </label>
                <div className="button-row">
                  <button
                    className="btn"
                    type="button"
                    aria-label={`${t("试听字幕")} ${i + 1}`}
                    disabled={!current}
                    onClick={() => {
                      if (media.current) {
                        media.current.currentTime = source!.start + cue.start;
                        void media.current
                          .play()
                          .catch(() => setError(t("音频预览失败，请检查素材")));
                      }
                    }}
                  >
                    <Play size={12} />
                    {t("试听")}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${t("删除字幕")} ${i + 1}`}
                    disabled={busy || saved}
                    onClick={() => {
                      setEdited(true);
                      setDraft({
                        ...draft,
                        cues: draft.cues.filter((_, n) => n !== i),
                      });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn"
            type="button"
            disabled={
              busy ||
              saved ||
              draft.cues.length >= 300 ||
              (draft.cues.at(-1)?.end ?? 0) >= shot.duration
            }
            onClick={() => {
              setEdited(true);
              const start = draft.cues.at(-1)?.end ?? 0;
              setDraft({
                ...draft,
                cues: [
                  ...draft.cues,
                  { start, end: Math.min(shot.duration, start + 1), text: "" },
                ],
              });
            }}
          >
            <Plus size={14} />
            {t("添加字幕段")}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <footer className="modal-footer">
        <button className="btn" type="button" disabled={busy} onClick={onClose}>
          {t("关闭")}
        </button>
        {shot.captionTrack && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
          >
            {t("切回台词字幕")}
          </button>
        )}
        <button
          className="btn primary"
          type="button"
          disabled={busy || (!saved && (!valid || !current))}
          onClick={() => draft && void save(draft)}
        >
          {t(saved ? "刷新已保存字幕" : "应用时间轴字幕")}
        </button>
      </footer>
    </div>
  );
}
