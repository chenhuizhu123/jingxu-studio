import React, { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import type { Settings, Job, Pricing } from "../../../packages/core/src/model";
import { post } from "./api";
import { t } from "./i18n";
import { estimateSpeech } from "../../../packages/core/src/usage";

export type PublicSpeech = Omit<Settings["speech"], "apiKey"> & {
  apiKey?: string;
  hasApiKey: boolean;
};
export function SpeechSettingsFields({
  value,
  onChange,
}: {
  value: PublicSpeech;
  onChange: (v: PublicSpeech) => void;
}) {
  return (
    <section className="settings-card">
      <header>
        <Volume2 size={20} />
        <div>
          <h2>{t("台词配音服务")}</h2>
          <p>
            {t("兼容 Speech API，返回 WAV 音频。模型与音色由你的服务商提供。")}
          </p>
        </div>
      </header>
      <label className="field">
        <span>{t("语音 API 服务地址 / 不含 audio/speech")}</span>
        <input
          type="url"
          value={value.endpoint}
          onChange={(e) => onChange({ ...value, endpoint: e.target.value })}
          placeholder="https://provider.example/v1"
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t("语音模型 ID")}</span>
          <input
            value={value.model}
            maxLength={200}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{t("音色 ID")}</span>
          <input
            value={value.voice}
            maxLength={200}
            onChange={(e) => onChange({ ...value, voice: e.target.value })}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t("配音语速")}</span>
          <input
            type="number"
            min={0.25}
            max={4}
            step={0.05}
            value={value.speed}
            onChange={(e) =>
              onChange({ ...value, speed: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          <span>
            {t("语音 API Key")}{" "}
            {value.hasApiKey && <small>{t("已保存")}</small>}
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
      </div>
      <p className="caption">
        {t(
          "不预设模型。请使用服务商当前支持的模型和音色，生成费用由服务商收取。",
        )}
      </p>
    </section>
  );
}
export function VoiceoverComposer({
  projectId,
  shotId,
  dialogue,
  config,
  disabled,
  running,
  saveDraft,
  onQueued,
  openSettings,
  pricing,
}: {
  projectId: string;
  shotId: string;
  dialogue: string;
  config: PublicSpeech;
  disabled: boolean;
  running: boolean;
  saveDraft: () => Promise<boolean>;
  onQueued: () => Promise<void>;
  openSettings: () => void;
  pricing?: Pricing;
}) {
  const [confirming, setConfirming] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState<Job>();
  const ready = !!(
    config.endpoint &&
    config.model &&
    config.voice &&
    config.hasApiKey
  );
  const speechEstimate = estimateSpeech(dialogue.trim().length, pricing);
  async function submit() {
    if (pending || disabled || (running && !accepted)) return;
    const text = dialogue.trim();
    setPending(true);
    setError("");
    let result = accepted;
    try {
      if (!result) {
        if (!(await saveDraft())) return;
        result = await post<Job>(
          `/projects/${projectId}/shots/${shotId}/speech`,
          { text },
        );
        setAccepted(result);
      }
      await onQueued();
      setConfirming(false);
    } catch (e) {
      setError(
        (result ? t("配音任务已创建，刷新失败。重试只刷新任务。") + " " : "") +
          (e as Error).message,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="voiceover-composer" aria-label={t("台词配音")}>
      {!ready ? (
        <button className="btn" type="button" onClick={openSettings}>
          <Volume2 size={14} />
          {t("配置台词配音")}
        </button>
      ) : !confirming ? (
        <button
          className="btn"
          type="button"
          disabled={disabled || running || !dialogue.trim()}
          onClick={() => {
            setConfirming(true);
            setAccepted(undefined);
            setError("");
          }}
        >
          <Volume2 size={14} />
          {running ? t("配音执行中") : t("生成台词配音")}
        </button>
      ) : (
        <>
          <strong>{t("确认配音内容")}</strong>
          <p className="caption">
            {config.model} · {config.voice} · {config.speed}×
          </p>
          <blockquote>{dialogue.trim()}</blockquote>
          <div className="review-cost">
            <span>{t("预计成本")}</span>
            {speechEstimate.cost !== undefined ? (
              <>
                <strong>
                  ≈ {speechEstimate.currency}
                  {Number(speechEstimate.cost.toFixed(4))}
                </strong>
                <small>
                  · {speechEstimate.chars} {t("字")}
                  {t("，以服务商账单为准。")}
                </small>
              </>
            ) : (
              <small>
                · {speechEstimate.chars} {t("字")}
              </small>
            )}
          </div>
          <p className="caption">
            {t(
              "台词将发送给你配置的语音服务并可能计费。生成后先试听，再选为镜头配音；现有音轨会保留。",
            )}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("取消")}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={
                pending ||
                disabled ||
                (running && !accepted) ||
                !dialogue.trim()
              }
              onClick={() => void submit()}
            >
              {pending && <Loader2 size={14} className="spin" />}
              {accepted ? t("刷新配音任务") : t("创建配音任务")}
            </button>
          </div>
        </>
      )}
      {accepted && !confirming && (
        <p role="status" className="caption">
          {t("配音任务已创建，可在任务队列查看。完成后在配音列表试听并选用。")}
        </p>
      )}
    </section>
  );
}
