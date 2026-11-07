import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("原生桌面本地试用导出，项目可创建并重启保留", async () => {
  const root = await mkdtemp(join(tmpdir(), "jingxu-electron-"));
  const launch = () =>
    electron.launch({
      args: ["."],
      acceptDownloads: true,
      env: { ...process.env, JINGXU_DATA_DIR: root, JINGXU_ELECTRON_TEST: "1" },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByLabel("Language / 语言").selectOption("zh");
    await expect(
      page.getByRole("heading", { name: "先做出第一支短片" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "打开试用工程" }).click();
    await expect(page.getByRole("heading", { name: /雨夜来信/ })).toBeVisible();
    await page.getByRole("button", { name: "渲染成片", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "试用导出进度" }),
    ).toContainText("成片已就绪", { timeout: 20_000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载", exact: true }).click();
    const video = await download;
    expect(video.suggestedFilename()).toMatch(/\.mp4$/);
    expect(
      (await readFile((await video.path())!)).toString("ascii", 4, 8),
    ).toBe("ftyp");
    await expect(page.getByRole("button", { name: /^SRT · R/ })).toBeVisible();
    const safety = await page.evaluate(() => ({
      require: typeof (window as any).require,
      process: typeof (window as any).process,
    }));
    expect(safety.require).toBe("undefined");
    expect(safety.process).toBe("undefined");
    await page.getByRole("button", { name: "所有项目", exact: true }).click();
    await page
      .getByRole("button", { name: "新建项目", exact: true })
      .last()
      .click();
    await page.getByLabel("项目名称").fill("桌面持久作品");
    await page.getByRole("button", { name: "创建项目", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "桌面持久作品", exact: false }),
    ).toBeVisible();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByLabel("Language / 语言").selectOption("zh");
    await page.getByRole("button", { name: "所有项目", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "桌面持久作品", exact: false }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
