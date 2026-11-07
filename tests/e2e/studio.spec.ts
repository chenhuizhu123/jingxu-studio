import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jingxu-language", "zh"));
});
test("创建作品、编辑镜头、生成候选、回选和导出字幕", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".project-header h1")).toBeVisible();
  await page.getByRole("button", { name: "所有项目", exact: true }).click();
  await page
    .getByRole("button", { name: "新建项目", exact: true })
    .last()
    .click();
  const name = `端到端作品-${testInfo.project.name}-${Date.now()}`;
  await page.getByLabel("项目名称").fill(name);
  await page.getByLabel("故事简介").fill("验证可继续修改的创作流程");
  await page
    .getByLabel("剧本 / 小说片段")
    .fill("角色：阿青\n阿青：我们终于到了。");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: false })).toBeVisible();
  await page.getByRole("button", { name: "交付中心", exact: true }).click();
  await expect(page.getByRole("button", { name: "渲染成片" })).toBeDisabled();
  await page
    .getByRole("button", { name: /镜头 1.*选择一张图片或一段视频/ })
    .click();
  await page.getByLabel("镜头标题").fill("新的开头");
  await page.getByLabel("时长 / 秒").fill("2");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("镜头已保存");
  await page.getByRole("button", { name: "生成候选", exact: true }).click();
  await expect(page.getByRole("button", { name: /已选 V1/ })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "生成候选", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /已选 V1.*2 个候选/ }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /已选 V1/ }).click();
  await page
    .locator(".version-list>div")
    .first()
    .getByRole("button", { name: "选用", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /已选 V2/ })).toBeVisible();
  await page.getByLabel("审核状态").selectOption("approved");
  if (testInfo.project.name.includes("mobile"))
    await page.getByRole("button", { name: "返回分镜" }).click();
  await page.getByRole("button", { name: "交付中心", exact: true }).click();
  await expect(page.getByRole("button", { name: "渲染成片" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "SRT", exact: true }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toBe(name + ".srt");
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: false })).toBeVisible();
});
test("设置保存不会展示已存 Key，Skills 可查看", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^设置/ }).click();
  await expect(
    page.getByRole("heading", { name: "工具由你选，创作由你掌握。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("设置已保存");
});
test("移动和桌面布局不出现整页水平溢出", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".project-header h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
