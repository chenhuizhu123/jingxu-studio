import { en } from "../../../packages/shared/locales/en";
export type Locale = "en" | "zh";
const listeners = new Set<() => void>();
const preferred = () => {
  try {
    return localStorage.getItem("jingxu-language");
  } catch {
    return null;
  }
};
let locale: Locale =
  preferred() === "zh"
    ? "zh"
    : preferred() === "en"
      ? "en"
      : typeof navigator !== "undefined" &&
          navigator.language.toLowerCase().startsWith("zh")
        ? "zh"
        : "en";
export function getLocale() {
  return locale;
}
export function setLocale(value: Locale) {
  locale = value;
  try {
    localStorage.setItem("jingxu-language", value);
  } catch {}
  if (typeof document !== "undefined")
    document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
  listeners.forEach((fn) => fn());
}
export function subscribeLocale(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function t(text: string) {
  if (locale === "zh") return text;
  const transcriptionHttp = text.match(/^识别服务返回 HTTP (\d+)$/);
  if (transcriptionHttp)
    return `Transcription service returned HTTP ${transcriptionHttp[1]}`;
  const speechHttp = text.match(/^语音服务返回 HTTP (\d+)$/);
  if (speechHttp) return `Speech service returned HTTP ${speechHttp[1]}`;
  const imageHttp = text.match(/^图片服务返回 HTTP (\d+)$/);
  if (imageHttp) return `Image service returned HTTP ${imageHttp[1]}`;
  return en[text] ?? text;
}

if (typeof document !== "undefined")
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
