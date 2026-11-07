import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { startServer } from "../apps/server/src/app";
import { probeMedia } from "../packages/core/src/media";
const root = resolve("apps/website/src");
describe("官网静态与内存交互验证（不打开浏览器）", () => {
  for (const page of [
    "index.html",
    "en/index.html",
    "privacy.html",
    "terms.html",
    "en/privacy.html",
    "en/terms.html",
  ]) {
    it(`${page} 的本地链接与资源可达`, () => {
      const dom = new JSDOM(readFileSync(resolve(root, page), "utf8"));
      for (const el of dom.window.document.querySelectorAll("[src],[href]")) {
        const link = el.getAttribute("src") ?? el.getAttribute("href")!;
        if (link.startsWith("#") && link.length > 1)
          expect(
            dom.window.document.getElementById(link.slice(1)),
            link,
          ).not.toBeNull();
        if (link.startsWith("/") && !link.startsWith("//")) {
          const path = link.endsWith("/") ? link + "index.html" : link;
          expect(existsSync(resolve(root, "." + path)), link).toBe(true);
        }
      }
      dom.window.close();
    });
  }
  for (const language of ["zh", "en"]) {
    it(`${language} 官网示例 ZIP 可导入空工作区并导出 MP4 与 SRT`, async () => {
      const doc = new JSDOM(
        readFileSync(
          resolve(root, language === "en" ? "en/index.html" : "index.html"),
          "utf8",
        ),
      );
      const href = doc.window.document
        .querySelector("#downloads a[download]")
        ?.getAttribute("href");
      doc.window.close();
      expect(href).toBe(`/samples/jingxu-rain-sample-${language}.zip`);
      const filename = resolve(root, "." + href);
      const bytes = await readFile(filename);
      const workspace = await mkdtemp(join(tmpdir(), "jingxu-site-test-"));
      const app = await startServer({ root: workspace, seed: false, port: 0 });
      const base = `http://127.0.0.1:${app.port}`;
      const headers = { Authorization: `Bearer ${app.token}` };
      try {
        expect(app.store.projects()).toHaveLength(0);
        const form = new FormData();
        form.append(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
          "sample.zip",
        );
        const imported = await fetch(base + "/api/projects/import", {
          method: "POST",
          headers,
          body: form,
        });
        expect(imported.status).toBe(201);
        const project = await imported.json();
        expect(project.format).toBe("9:16");
        expect(project.shots).toHaveLength(3);
        expect(project.exports).toEqual([]);
        for (const shot of project.shots) {
          expect(shot.versions[0]).toMatchObject({
            source: "demo",
            id: shot.selectedVersionId,
          });
        }
        const path = `/api/projects/${project.id}`;
        const render = await fetch(base + path + "/render", {
          method: "POST",
          headers,
        });
        expect(render.status).toBe(202);
        await vi.waitFor(
          () => {
            const job = app.store.jobs()[0];
            expect(job.state, job.error).toBe("succeeded");
          },
          { timeout: 20_000, interval: 100 },
        );
        const current = await (await fetch(base + path, { headers })).json();
        const [entry] = current.exports;
        expect(entry.kind).toBe("video");
        const media = await probeMedia(app.store.path(entry.file));
        expect(media.hasVideo).toBe(true);
        // The muxed AAC tail can extend the container by one frame.
        expect(Math.abs(media.duration - 12)).toBeLessThanOrEqual(0.05);
        const video = await fetch(base + entry.url);
        expect(video.status).toBe(200);
        expect(
          Buffer.from(await video.arrayBuffer())
            .subarray(4, 8)
            .toString(),
        ).toBe("ftyp");
        const subtitles = await fetch(base + entry.subtitlesUrl);
        expect(subtitles.status).toBe(200);
        expect(await subtitles.text()).toContain(
          language === "zh" ? "你为什么现在才来？" : "Why did you come back?",
        );
      } finally {
        await app.close();
        await rm(workspace, { recursive: true, force: true });
      }
    });
    it(`${language} 候选添加保留选择，回选历史不删除版本`, () => {
      const dom = new JSDOM(
        readFileSync(
          resolve(root, language === "en" ? "en/index.html" : "index.html"),
          "utf8",
        ),
        { runScripts: "outside-only", url: "https://preview.example/" },
      );
      dom.window.eval(readFileSync(resolve(root, "app.js"), "utf8"));
      const doc = dom.window.document;
      expect(doc.querySelectorAll("[data-shot]")).toHaveLength(6);
      (doc.querySelector("#create-candidate") as HTMLButtonElement).click();
      expect(doc.querySelector("#selected-version")?.textContent).toContain(
        "V1",
      );
      expect(doc.querySelector("#version-count")?.textContent).toContain("2");
      (doc.querySelector('[data-version="2"]') as HTMLButtonElement).click();
      expect(doc.querySelector("#selected-version")?.textContent).toContain(
        "V2",
      );
      (doc.querySelector('[data-version="1"]') as HTMLButtonElement).click();
      expect(doc.querySelector("#selected-version")?.textContent).toContain(
        "V1",
      );
      expect(doc.querySelectorAll("[data-version]")).toHaveLength(2);
      (doc.querySelector('[data-step="2"]') as HTMLButtonElement).click();
      expect(
        doc.querySelector('[data-step="2"]')?.getAttribute("aria-selected"),
      ).toBe("true");
      expect(doc.querySelector("#process-panel")?.textContent).toContain(
        language === "en" ? "New candidates" : "候选分开",
      );
      dom.window.close();
    });
  }
  it("时间线排版动效可暂停，流程标签支持键盘切换", () => {
    const dom = new JSDOM(readFileSync(resolve(root, "index.html"), "utf8"), {
      runScripts: "outside-only",
    });
    dom.window.eval(readFileSync(resolve(root, "app.js"), "utf8"));
    const doc = dom.window.document;
    const motion = doc.querySelector("#hero-motion") as HTMLButtonElement;
    motion.click();
    expect(motion.getAttribute("aria-pressed")).toBe("true");
    expect(
      doc.querySelector(".hero-art")?.classList.contains("is-playing"),
    ).toBe(true);
    motion.click();
    expect(motion.getAttribute("aria-pressed")).toBe("false");
    doc.querySelector('[data-step="0"]')!.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }),
    );
    expect(
      doc.querySelector('[data-step="1"]')?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      doc.querySelector("#process-panel")?.getAttribute("aria-labelledby"),
    ).toBe("process-tab-1");
    dom.window.close();
  });
  it("减少动态效果偏好不会启动时间线动效", () => {
    const dom = new JSDOM(
      readFileSync(resolve(root, "en/index.html"), "utf8"),
      { runScripts: "outside-only" },
    );
    Object.defineProperty(dom.window, "matchMedia", {
      value: () => ({ matches: true }),
    });
    dom.window.eval(readFileSync(resolve(root, "app.js"), "utf8"));
    const button = dom.window.document.querySelector(
      "#hero-motion",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    dom.window.close();
  });
  const ORIGIN = "https://jingxu-studio.toughjoy.chatgpt.site";
  it.each(["zh", "en"] as const)(
    "%s 首页具备 canonical / hreflang 与社交分享卡 meta",
    (language) => {
      const file = language === "en" ? "en/index.html" : "index.html";
      const dom = new JSDOM(readFileSync(resolve(root, file), "utf8"));
      const doc = dom.window.document;
      const canonicalPath = language === "en" ? "/en/" : "/";
      const meta = (selector: string) =>
        doc.querySelector(selector)?.getAttribute("content");
      const alt = (hreflang: string) =>
        doc
          .querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`)
          ?.getAttribute("href");
      expect(
        doc
          .querySelector("link[rel='canonical']")
          ?.getAttribute("href"),
      ).toBe(ORIGIN + canonicalPath);
      expect(alt(language === "en" ? "en" : "zh-CN")).toBe(
        ORIGIN + canonicalPath,
      );
      expect(alt(language === "en" ? "zh-CN" : "en")).toBe(
        language === "en" ? ORIGIN + "/" : ORIGIN + "/en/",
      );
      expect(alt("x-default")).toBe(ORIGIN + "/");
      expect(meta('meta[property="og:type"]')).toBe("website");
      expect(meta('meta[property="og:locale"]')).toBe(
        language === "en" ? "en_US" : "zh_CN",
      );
      expect(meta('meta[property="og:url"]')).toBe(ORIGIN + canonicalPath);
      expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
      const image = meta('meta[property="og:image"]')!;
      const twitterImage = meta('meta[name="twitter:image"]');
      expect(image).toBe(twitterImage);
      expect(image.startsWith(ORIGIN + "/assets/og-card-")).toBe(true);
      const localImage = resolve(root, "." + new URL(image).pathname);
      expect(existsSync(localImage)).toBe(true);
      expect(
        readFileSync(localImage).subarray(0, 8).toString("hex"),
      ).toBe("89504e470d0a1a0a");
      dom.window.close();
    },
  );
  it("隐私与使用说明中英版本日期一致、关键澄清对等", () => {
    const zhPrivacy = readFileSync(resolve(root, "privacy.html"), "utf8");
    const enPrivacy = readFileSync(resolve(root, "en/privacy.html"), "utf8");
    const zhTerms = readFileSync(resolve(root, "terms.html"), "utf8");
    const enTerms = readFileSync(resolve(root, "en/terms.html"), "utf8");
    const sameDate =
      zhPrivacy.includes("2026 年 11 月 4 日") &&
      zhTerms.includes("2026 年 11 月 4 日") &&
      enPrivacy.includes("November 4, 2026") &&
      enTerms.includes("November 4, 2026");
    expect(sameDate).toBe(true);
    // Clarifications that previously existed only in English must stay mirrored.
    expect(zhTerms).toContain("未签名的安装包不是正式签名公开发布版本");
    expect(enTerms).toContain("An unsigned build is not a signed public release");
    expect(zhTerms).toContain("按镜头计时的字幕不是自动语音对齐");
    expect(enTerms).toContain("Shot-timed subtitles are not automatic speech alignment");
    expect(zhPrivacy).toContain("项目导出包不包含凭据");
    expect(enPrivacy).toContain("Project packages exclude credentials");
  });
});

it.each(["zh", "en"] as const)(
  "%s records trial completion and price feedback separately in a local file",
  async (language) => {
    const filename = language === "en" ? "en/index.html" : "index.html";
    const dom = new JSDOM(readFileSync(resolve(root, filename), "utf8"), {
      runScripts: "outside-only",
      url: "https://preview.example/",
    });
    try {
      const { document, URL, FileReader } = dom.window;
      const dialog = document.querySelector("dialog")!;
      const open = vi.fn(),
        close = vi.fn();
      Object.assign(dialog, { showModal: open, close });
      const createObjectURL = vi.fn((_blob: Blob) => "blob:local-feedback");
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
      const clicked = vi.fn();
      dom.window.HTMLAnchorElement.prototype.click = clicked;
      dom.window.eval(readFileSync(resolve(root, "app.js"), "utf8"));
      document
        .querySelector<HTMLButtonElement>("#downloads [data-trial-feedback]")!
        .click();
      expect(open).toHaveBeenCalledOnce();
      const form = document.querySelector<HTMLFormElement>("#feedback-form")!;
      expect(form.checkValidity()).toBe(false);
      for (const [name, value] of Object.entries({
        platform: "windows",
        outcome: "exported",
        willingness: "no",
      })) {
        const field = form.elements.namedItem(name) as HTMLSelectElement;
        expect(field.value).toBe("");
        field.value = value;
      }
      expect(form.checkValidity()).toBe(true);
      expect(
        form.dispatchEvent(
          new dom.window.Event("submit", { cancelable: true }),
        ),
      ).toBe(false);
      expect(clicked).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledOnce();
      const blob = createObjectURL.mock.calls[0]?.[0];
      const exported = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      expect(JSON.parse(exported)).toMatchObject({
        schemaVersion: 2,
        language,
        platform: "windows",
        outcome: "exported",
        willingness: "no",
        priceHypothesis: "99 CNY/month",
      });
    } finally {
      dom.window.close();
    }
  },
);
