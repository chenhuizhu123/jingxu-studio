import React from "react";
import { Link2, X } from "lucide-react";
import type { Asset } from "../../../packages/core/src/model";
import { mediaUrl } from "./api";
import { t } from "./i18n";

export function ShotReferences({
  assets,
  value,
  onChange,
  onSync,
  onDiscard,
  disabled,
  changed,
}: {
  assets: (Asset & { url: string })[];
  value: string[];
  onChange: (ids: string[]) => void;
  onSync?: (assetId: string) => void;
  onDiscard?: () => void;
  disabled: boolean;
  changed: boolean;
}) {
  const images = assets.filter((asset) => asset.kind === "image");
  const available = images.filter((image) => !value.includes(image.id));
  return (
    <section className="field shot-references" aria-label={t("镜头参考图")}>
      <label className="field">
        <span>{t("镜头参考图")}</span>
        <select
          value=""
          disabled={
            disabled || !!onDiscard || value.length >= 20 || !available.length
          }
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">{t("从项目素材添加参考图")}</option>
          {available.map((image) => (
            <option key={image.id} value={image.id}>
              {image.name}
            </option>
          ))}
        </select>
      </label>
      {!images.length && (
        <p className="caption">{t("先在「参考资产」上传场景图片。")}</p>
      )}
      {value.length > 0 && (
        <ul className="shot-reference-list">
          {value.map((id) => {
            const image = images.find((asset) => asset.id === id);
            const name = image?.name ?? t("参考素材不存在");
            return (
              <li key={id}>
                {image && <img src={mediaUrl(image.url)} alt="" />}
                <span>{name}</span>
                {image && onSync && (
                  <button
                    type="button"
                    className="icon-btn"
                    title={t("跨集同步场景参考")}
                    aria-label={`${t("跨集同步场景参考")} · ${name}`}
                    disabled={disabled || changed}
                    onClick={() => onSync(id)}
                  >
                    <Link2 size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${t("移除镜头参考")} · ${name}`}
                  disabled={disabled || !!onDiscard}
                  onClick={() =>
                    onChange(value.filter((value) => value !== id))
                  }
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onDiscard ? (
        <div>
          <p className="caption" role="alert">
            {t("此镜头的参考图已更新，请载入已保存的参考后继续。")}
          </p>
          <button type="button" className="btn" onClick={onDiscard}>
            {t("载入已保存参考")}
          </button>
        </div>
      ) : (
        onSync &&
        value.length > 0 && (
          <p className="caption">
            {t(
              changed
                ? "保存修改后可同步场景参考。"
                : "使用链接按钮将这张图应用到其他集的同名场景。",
            )}
          </p>
        )
      )}
    </section>
  );
}
