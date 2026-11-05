import React from "react";
import { ArrowUpRight, Clapperboard, Film } from "lucide-react";
import type { Job } from "../../../packages/core/src/model";
import { t } from "./i18n";

export function FirstFilmLauncher({
  onOpen,
  disabled,
  opening,
}: {
  onOpen: () => void;
  disabled: boolean;
  opening: boolean;
}) {
  return (
    <section className="first-film-launcher" aria-label={t("新手试用")}>
      <div className="first-film-mark" aria-hidden="true">
        <Clapperboard size={26} />
      </div>
      <div>
        <div className="eyebrow">{t("新手试用 · 无需 API Key")}</div>
        <h2>{t("先做出第一支短片")}</h2>
        <p>
          {t("打开「雨夜来信」，用三个内置竖屏镜头试一次本地成片与字幕导出。")}
        </p>
      </div>
      <button
        type="button"
        className="btn primary"
        disabled={disabled}
        onClick={onOpen}
      >
        {t(opening ? "正在打开示例" : "打开试用工程")}{" "}
        <ArrowUpRight size={15} />
      </button>
    </section>
  );
}

export function FirstFilmProgress({
  job,
  hasVideo,
}: {
  job?: Job;
  hasVideo: boolean;
}) {
  const rendering = job?.state === "queued" || job?.state === "running";
  const failed = job?.state === "failed";
  return (
    <section className="first-film-progress" aria-label={t("试用导出进度")}>
      <Film size={20} aria-hidden="true" />
      <div>
        <h2>{t("本地导出试用")}</h2>
        {rendering ? (
          <>
            <p role="status">
              {t(job.state === "queued" ? "正在等待本地渲染" : "正在本地渲染")}
            </p>
            <progress
              aria-label={t("试用导出进度")}
              max={100}
              value={job.progress}
            />
          </>
        ) : failed ? (
          <>
            <p role="alert">{t("本地渲染失败，请检查下方原因后重试。")}</p>
            {job.error && <p className="first-film-error">{t(job.error)}</p>}
          </>
        ) : hasVideo ? (
          <p role="status">
            {t("成片已就绪，可从下方导出记录下载 MP4 和 SRT。")}
          </p>
        ) : (
          <p>
            {t(
              "点击「渲染成片」，完成后在下方下载 MP4 和 SRT。整个流程在此设备运行。",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
