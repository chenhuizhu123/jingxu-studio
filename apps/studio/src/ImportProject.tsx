import React, { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { api } from "./api";
import { t } from "./i18n";
import type { Project } from "../../../packages/core/src/model";

export type RestoredSeries = { seriesId: string; projects: Project[] };

export function ImportProjectForm<T = Project>({
  onImported,
  onClose,
  series = false,
}: {
  onImported: (result: T) => Promise<void>;
  onClose: () => void;
  series?: boolean;
}) {
  const [file, setFile] = useState<File>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<T>();
  const alive = useRef(true),
    request = useRef<AbortController | undefined>(undefined),
    requestId = useRef("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (request.current) return;
    if (!imported && (!file || !file.name.toLowerCase().endsWith(".zip"))) {
      setError(
        t(series ? "请选择镜序整季工程 ZIP" : "请选择镜序项目 ZIP 文件"),
      );
      return;
    }
    if (!imported && file!.size > 2 * 1024 ** 3) {
      setError(
        t(
          series
            ? "整季工程包超过 2 GB 或文件数量上限，请按单集迁移"
            : "项目包最大为 2 GB，请拆分项目后重试",
        ),
      );
      return;
    }
    setLoading(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    let result = imported;
    try {
      if (!result) {
        const form = new FormData();
        form.append("file", file!);
        if (series) form.append("requestId", requestId.current);
        result = await api<T>(series ? "/series/import" : "/projects/import", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        if (!alive.current || controller.signal.aborted) return;
        setImported(result);
      }
      await onImported(result);
    } catch (e) {
      if (alive.current && !controller.signal.aborted)
        setError(
          (result
            ? t(
                series
                  ? "剧集已恢复，重试将打开已恢复的剧集。"
                  : "项目已导入，打开失败。重试只会打开已导入的项目。",
              ) + " "
            : "") + (e as Error).message,
        );
    } finally {
      request.current = undefined;
      if (alive.current) setLoading(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} aria-busy={loading}>
      <p className="modal-intro">
        {t(
          series
            ? "将整季工程恢复为新的剧集，保留集号、素材和可编辑镜头。"
            : "将项目包恢复为独立项目，保留已有项目与候选版本。",
        )}
      </p>
      <label className="field">
        <span>{t(series ? "整季工程 ZIP" : "项目包 ZIP")}</span>
        <input
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          disabled={loading || !!imported}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            if (series && e.target.files?.[0])
              requestId.current = crypto.randomUUID();
            setError("");
          }}
        />
      </label>
      {file && (
        <p className="subtle">
          {file.name} · {(file.size / 1024 ** 2).toFixed(1)} MB
        </p>
      )}
      <p className="subtle">
        {t("只导入项目内容，不导入 API Key 与工具授权。")}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">{t("正在导入并检查素材，请稍候…")}</p>}
      <p className="subtle">{t("取消等待后，可在项目列表核对是否已导入。")}</p>
      <footer className="modal-footer">
        <button
          className="btn"
          type="button"
          onClick={() => {
            request.current?.abort();
            onClose();
          }}
        >
          {loading ? t("取消等待") : t("取消")}
        </button>
        <button
          className="btn primary"
          type="submit"
          disabled={loading || (!file && !imported)}
        >
          {loading ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {t(
            series
              ? imported
                ? "打开已恢复剧集"
                : "恢复为新剧集"
              : imported
                ? "打开已导入项目"
                : "导入为新项目",
          )}
        </button>
      </footer>
    </form>
  );
}
