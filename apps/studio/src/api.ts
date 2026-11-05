import { getLocale, t } from "./i18n";

// The desktop engine runs in the app process. A remote workspace is optional.
let base = "",
  token = "";
export const native = false;
export async function initializeConnection() {
  base = localStorage.getItem("jingxu-server") ?? "";
  token = sessionStorage.getItem("jingxu-token") ?? "";
  return { base, token };
}
export async function connect(url: string, key: string) {
  const parsed = url ? new URL(url) : undefined;
  if (
    parsed &&
    (parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(parsed.hostname)))
  )
    throw new Error(t("远程工作站请使用 HTTPS 地址"));
  const newBase = url.replace(/\/$/, "");
  const r = await fetch(newBase + "/api/session", {
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "Accept-Language": getLocale(),
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ? t(data.error) : t("连接失败"));
  base = newBase;
  token = data.token;
  localStorage.setItem("jingxu-server", base);
  sessionStorage.setItem("jingxu-token", token);
  return data;
}
export const serverBase = () => base;
export function mediaUrl(url?: string) {
  return url ? base + url : "";
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept-Language", getLocale());
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(base + "/api" + path, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const data = type.includes("json") ? await res.json() : {};
    throw new Error(
      data.error ? t(data.error) : `${t("请求失败")} (${res.status})`,
    );
  }
  return (type.includes("json") ? await res.json() : await res.text()) as T;
}
export const post = <T = any>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export async function saveText(
  name: string,
  text: string,
  mime = "text/plain",
) {
  await saveBlob(name, new Blob([text], { type: mime }));
}
export async function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function download(url: string, name: string) {
  const r = await fetch(mediaUrl(url));
  if (!r.ok) throw new Error(t("下载链接已过期，请刷新后重试"));
  await saveBlob(name, await r.blob());
}
