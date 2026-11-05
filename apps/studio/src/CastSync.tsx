import React, { useEffect, useRef, useState } from "react";
import { Image, Loader2, Users } from "lucide-react";
import type {
  CastSyncPlan,
  CastSyncState,
  CastSyncTarget,
} from "../../../packages/core/src/series-cast";
import type {
  SceneSyncPlan,
  SceneSyncState,
} from "../../../packages/core/src/series-scene";
import type { ReferenceSyncResult } from "../../../packages/core/src/reference-sync";
import { api, mediaUrl, post } from "./api";
import { t } from "./i18n";
import { episodeLabel } from "./Series";

type CastPreview = Omit<CastSyncPlan, "source" | "targets"> & {
  source: CastSyncPlan["source"] & { referenceUrl: string };
  targets: (CastSyncTarget & { referenceUrl?: string })[];
};
type ScenePreview = Omit<SceneSyncPlan, "source"> & {
  source: SceneSyncPlan["source"] & { referenceUrl: string };
};
type Preview = CastPreview | ScenePreview;
type SyncCallbacks = {
  onClose: () => void;
  onApplied: (result: ReferenceSyncResult) => Promise<void>;
};

const castStateLabel: Record<CastSyncState, string> = {
  fill: "补全角色参考",
  replace: "会替换已有设置",
  same: "参考和人设一致",
  missing: "本集无同名角色",
  ambiguous: "有多个同名角色",
  busy: "相关镜头正在生成",
  "asset-limit": "本集素材已达上限",
};

const sceneStateLabel: Record<SceneSyncState, string> = {
  fill: "可添加场景参考",
  review: "请核对本集镜头",
  same: "已使用这张参考图",
  missing: "本集无同名场景",
  blocked: "本集暂无可更新镜头",
};
const shotStateLabel: Record<
  SceneSyncPlan["targets"][number]["shots"][number]["state"],
  string
> = {
  add: "将添加参考图",
  same: "已使用这张参考图",
  busy: "镜头正在生成",
  "reference-limit": "镜头参考已达上限",
  "asset-limit": "本集素材已达上限",
};

export function CastSyncForm({
  projectId,
  characterId,
  ...callbacks
}: SyncCallbacks & { projectId: string; characterId: string }) {
  return (
    <ReferenceSyncForm
      path={`/projects/${projectId}/characters/${characterId}/cast-sync`}
      {...callbacks}
    />
  );
}

export function SceneSyncForm({
  projectId,
  shotId,
  assetId,
  ...callbacks
}: SyncCallbacks & { projectId: string; shotId: string; assetId: string }) {
  return (
    <ReferenceSyncForm
      path={`/projects/${projectId}/shots/${shotId}/scene-sync/${assetId}`}
      scene
      {...callbacks}
    />
  );
}

function ReferenceSyncForm({
  path,
  scene = false,
  onClose,
  onApplied,
}: SyncCallbacks & { path: string; scene?: boolean }) {
  const [plan, setPlan] = useState<Preview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<ReferenceSyncResult>();
  const [busy, setBusy] = useState(false);
  const requestId = useRef("");
  const submitting = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    setPlan(undefined);
    setError("");
    void api<Preview>(path, { signal: abort.signal })
      .then((data) => {
        if (abort.signal.aborted) return;
        setPlan(data);
        setSelected(
          new Set(
            data.targets
              .filter((row) => row.state === "fill")
              .map((row) => row.projectId),
          ),
        );
        requestId.current = crypto.randomUUID();
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setError(error instanceof Error ? error.message : t("请求失败"));
      });
    return () => abort.abort();
  }, [path, refreshKey]);

  async function submit() {
    if (submitting.current || !plan || (!accepted && !selected.size)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result =
        accepted ??
        (await post<ReferenceSyncResult>(path, {
          requestId: requestId.current,
          review: plan.review,
          targets: plan.targets
            .filter((row) => row.review && selected.has(row.projectId))
            .map((row) => ({ projectId: row.projectId, review: row.review })),
        }));
      setAccepted(result);
      await onApplied(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("请求失败"));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {!plan && !error && (
        <p role="status">
          <Loader2 className="spin" size={16} />{" "}
          {t(scene ? "正在读取各集场景" : "正在读取各集角色")}
        </p>
      )}
      {plan && (
        <>
          <div className="cast-sync-source">
            <img
              src={mediaUrl(plan.source.referenceUrl)}
              alt={plan.source.reference.name}
            />
            <div>
              <div className="eyebrow">
                {plan.seriesName} · {episodeLabel(plan.source.number)}
              </div>
              <h3>{plan.source.name}</h3>
              {"description" in plan.source && <p>{plan.source.description}</p>}
            </div>
          </div>
          <p className="modal-intro">
            {t(
              scene
                ? "将上方参考图添加到所选分集的同名场景。保留已有参考和选片，更新的镜头需要重新核对。"
                : "将上方定妆图和人设应用到勾选的同名角色。相关镜头需要重新核对。",
            )}
          </p>
          <ul className="cast-sync-targets">
            {plan.targets.map((row) => (
              <li key={row.projectId} data-state={row.state}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(row.projectId)}
                    disabled={!row.review || busy || !!accepted}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelected((old) => {
                        const next = new Set(old);
                        if (checked) next.add(row.projectId);
                        else next.delete(row.projectId);
                        return next;
                      });
                    }}
                  />
                  <span>
                    {episodeLabel(row.number)} · {row.title}
                  </span>
                  <small>
                    {t(
                      "shots" in row
                        ? sceneStateLabel[row.state]
                        : castStateLabel[row.state],
                    )}
                  </small>
                </label>
                {"shots" in row && row.shots.length > 0 && (
                  <details>
                    <summary>
                      {row.shots.length} {t("个同名场景镜头 · 查看明细")}
                    </summary>
                    <ul className="scene-sync-shots">
                      {row.shots.map((shot) => (
                        <li key={shot.id}>
                          <span>
                            {shot.order}. {shot.title}
                          </span>
                          <small>{t(shotStateLabel[shot.state])}</small>
                          {shot.references.length > 0 && (
                            <p>
                              {t("已有参考")} · {shot.references.join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {row.state === "replace" && (
                  <details>
                    <summary>{t("查看本集当前参考")}</summary>
                    <div className="cast-sync-current">
                      {row.referenceUrl && (
                        <img
                          src={mediaUrl(row.referenceUrl)}
                          alt={row.reference?.name ?? ""}
                        />
                      )}
                      <p>{row.description || t("尚未填写人设")}</p>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {!plan.targets.length && (
            <p className="caption">
              {t(
                scene
                  ? "添加其他分集后可同步场景。"
                  : "添加其他分集后可同步角色。",
              )}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="series-error">
          {error}
        </p>
      )}
      <footer className="modal-footer">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          {t("关闭")}
        </button>
        {error && !accepted && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            {t("重新预览")}
          </button>
        )}
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !plan || (!selected.size && !accepted)}
        >
          {scene ? <Image size={14} /> : <Users size={14} />}
          {t(busy ? "处理中" : accepted ? "返回工作台" : "应用到所选分集")}
        </button>
      </footer>
    </form>
  );
}
