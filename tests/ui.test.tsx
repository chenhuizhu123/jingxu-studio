// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../apps/studio/src/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  initializeConnection: vi.fn(),
  connect: vi.fn(),
  mediaUrl: (s: string) => s,
  download: vi.fn(),
  saveText: vi.fn(),
  native: false,
  serverBase: () => "",
}));
import {
  Delivery,
  ShotEditor,
  Modal,
  NewProject,
  WorkspaceUsage,
  BatchCostConfirm,
  monthBudgetWarning,
  AgentPanel,
  Jobs,
  Skills,
  Assets,
} from "../apps/studio/src/main";
import { api, post, saveText } from "../apps/studio/src/api";
import { VoiceoverComposer } from "../apps/studio/src/Voiceover";
import type { PublicSpeech } from "../apps/studio/src/Voiceover";
import { CaptionEditor } from "../apps/studio/src/Captions";
import { setLocale } from "../apps/studio/src/i18n";
beforeEach(() => setLocale("zh"));
const project: any = {
  id: "p1",
  name: "本地组件测试",
  format: "9:16",
  characters: [{ id: "c1", name: "阿青" }],
  shots: [],
  assets: [],
  exports: [],
};
const shot: any = {
  id: "s1",
  order: 1,
  title: "原始镜头",
  scene: "街头",
  type: "中景",
  duration: 4,
  dialogue: "你好",
  prompt: "雨夜街头",
  characterIds: [],
  referenceIds: [],
  versions: [],
  review: "pending",
  note: "",
};
const props = () => ({
  shot: structuredClone(shot),
  project: structuredClone(project),
  busy: false,
  running: false,
  onSave: vi.fn().mockResolvedValue(true),
  onGenerate: vi.fn().mockResolvedValue(true),
  onImport: vi.fn().mockResolvedValue(true),
  onDelete: vi.fn().mockResolvedValue(true),
  onVisualReview: vi.fn().mockResolvedValue(true),
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("内存 DOM 组件测试（不打开浏览器、不访问本地网址）", () => {
  it("shows render blockers and opens the relevant shot before submitting any job", async () => {
    const p = structuredClone(project);
    const onOpenStoryboard = vi.fn(),
      act = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <Delivery
        project={p}
        jobs={[]}
        act={act}
        onOpenStoryboard={onOpenStoryboard}
      />,
    );
    const renderButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "渲染成片",
    });
    expect(renderButton.disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "打开分镜工作台" }));
    expect(onOpenStoryboard).toHaveBeenLastCalledWith();
    const selected = {
      ...shot,
      selectedVersionId: "v1",
      versions: [{ id: "v1", assetId: "a1" }],
      captionTrack: { source: { assetId: "a1", start: 0, duration: 3 } },
    };
    const withSelection = {
      ...p,
      shots: [selected],
      assets: [{ id: "a1", kind: "image" }],
    };
    rerender(
      <Delivery
        project={withSelection}
        jobs={[]}
        act={act}
        onOpenStoryboard={onOpenStoryboard}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /原始镜头.*重新核对字幕/ }),
    );
    expect(onOpenStoryboard).toHaveBeenLastCalledWith("s1");
    expect(renderButton.disabled).toBe(true);
    expect(act).not.toHaveBeenCalled();
    const ready = {
      ...withSelection,
      shots: [{ ...selected, captionTrack: undefined }],
    };
    setLocale("en");
    rerender(
      <Delivery
        project={ready}
        jobs={[]}
        act={act}
        onOpenStoryboard={onOpenStoryboard}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /1 \/ 1.*shots have media/,
    );
    expect(renderButton.disabled).toBe(false);
  });
  it("免费预演无需素材就绪即可发起，预演成品带标识", async () => {
    setLocale("zh");
    const p = { ...structuredClone(project), shots: [structuredClone(shot)] };
    const act = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <Delivery project={p} jobs={[]} act={act} onOpenStoryboard={vi.fn()} />,
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "渲染成片" })
        .disabled,
    ).toBe(true);
    const animaticButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "生成免费预演片",
    });
    expect(animaticButton.disabled).toBe(false);
    const user = userEvent.setup();
    await user.click(animaticButton);
    expect(act).toHaveBeenCalledWith(
      "animatic",
      expect.any(Function),
      expect.stringContaining("预演"),
    );
    const withAnimatic = {
      ...p,
      exports: [
        {
          id: "e1",
          name: "本地组件测试-animatic-r1.mp4",
          kind: "animatic",
          file: "exports/e1.mp4",
          createdAt: new Date().toISOString(),
          size: 2048,
          revision: 1,
        },
      ],
    };
    rerender(
      <Delivery
        project={withAnimatic}
        jobs={[]}
        act={act}
        onOpenStoryboard={vi.fn()}
      />,
    );
    expect(screen.getAllByText("预演").length).toBeGreaterThan(0);
  });
  it("交付中心展示本项目成功任务的 AI 用量", () => {
    const jobs: any[] = [
      {
        id: "j1",
        projectId: "p1",
        type: "generate",
        state: "succeeded",
        duration: 6,
      },
      { id: "j2", projectId: "p1", type: "image", state: "succeeded" },
      {
        id: "j3",
        projectId: "p1",
        type: "speech",
        state: "succeeded",
        speechText: "你好",
      },
      {
        id: "j4",
        projectId: "p1",
        type: "transcribe",
        state: "succeeded",
        usage: { seconds: 8 },
      },
      { id: "j5", projectId: "p1", type: "image", state: "failed" },
      { id: "j6", projectId: "p2", type: "image", state: "succeeded" },
    ];
    render(
      <Delivery
        project={project}
        jobs={jobs}
        act={vi.fn()}
        onOpenStoryboard={vi.fn()}
      />,
    );
    const region = screen.getByRole("region", { name: "本项目 AI 用量" });
    const cards = within(region).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    expect(region.textContent).toContain("6");
    expect(region.textContent).toContain("1");
    expect(within(region).getByText("视频生成")).toBeTruthy();
    expect(within(region).getByText("图片生成")).toBeTruthy();
    expect(within(region).getByText("配音合成")).toBeTruthy();
    expect(within(region).getByText("语音识别")).toBeTruthy();
    expect(within(region).getAllByText(/次成功任务/)).toHaveLength(4);

    cleanup();
    render(
      <Delivery
        project={project}
        jobs={[]}
        act={vi.fn()}
        onOpenStoryboard={vi.fn()}
      />,
    );
    expect(
      screen.getByText("还没有成功的在线生成任务。本地渲染不计入。"),
    ).toBeTruthy();
  });
  it("按用户填写的单价估算成本，单价编辑器保存到设置", async () => {
    const jobs: any[] = [
      {
        id: "j1",
        projectId: "p1",
        type: "generate",
        state: "succeeded",
        duration: 6,
      },
      { id: "j2", projectId: "p1", type: "image", state: "succeeded" },
      {
        id: "j3",
        projectId: "p1",
        type: "speech",
        state: "succeeded",
        speechText: "你好",
      },
    ];
    const settings: any = {
      pricing: {
        currency: "¥",
        videoPerSecond: 2,
        imagePerImage: 1,
        speechPerKiloChar: 4,
      },
    };
    const onSettings = vi.fn();
    const runAction = vi.fn(
      async (_key: string, fn: () => Promise<unknown>) => {
        await fn();
        return true;
      },
    );
    const savedSettings = {
      ...settings,
      pricing: { ...settings.pricing, videoPerSecond: 3 },
    };
    vi.mocked(api).mockResolvedValue(savedSettings);
    render(
      <Delivery
        project={project}
        jobs={jobs}
        act={runAction}
        onOpenStoryboard={vi.fn()}
        settings={settings}
        onSettings={onSettings}
      />,
    );
    const region = screen.getByRole("region", { name: "本项目 AI 用量" });
    expect(within(region).getByText("估算合计")).toBeTruthy();
    // 12 (6s video x 2) + 1 (1 image) + 0.008 (2 chars / 1000 x 4)
    expect(region.textContent).toContain("≈ ¥13.008");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "设置单价" }));
    const videoPrice = screen.getByRole("spinbutton", {
      name: "视频 · 每秒",
    }) as HTMLInputElement;
    expect(videoPrice.value).toBe("2");
    await user.clear(videoPrice);
    await user.type(videoPrice, "3");
    await user.click(screen.getByRole("button", { name: "保存单价" }));

    expect(api).toHaveBeenCalledWith(
      "/settings",
      expect.objectContaining({ method: "PUT" }),
    );
    const putCall = vi
      .mocked(api)
      .mock.calls.find((c) => c[0] === "/settings")!;
    const body = JSON.parse((putCall[1] as { body: string }).body);
    expect(body.pricing).toMatchObject({
      currency: "¥",
      videoPerSecond: 3,
      imagePerImage: 1,
      speechPerKiloChar: 4,
    });
    expect(onSettings).toHaveBeenCalledWith(savedSettings);
  });
  it("任务队列页汇总全部项目用量与成本，可按时间过滤并导出 CSV", async () => {
    const nowIso = new Date().toISOString();
    const jobs: any[] = [
      {
        id: "j1",
        projectId: "p1",
        type: "generate",
        state: "succeeded",
        duration: 6,
        createdAt: nowIso,
      },
      {
        id: "j2",
        projectId: "p1",
        type: "image",
        state: "succeeded",
        createdAt: nowIso,
      },
      {
        id: "j3",
        projectId: "p2",
        type: "generate",
        state: "succeeded",
        duration: 4,
        createdAt: nowIso,
      },
      {
        id: "j4",
        projectId: "p1",
        type: "image",
        state: "failed",
        createdAt: nowIso,
      },
      {
        id: "j5",
        projectId: "old",
        type: "image",
        state: "succeeded",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    const settings: any = {
      pricing: { currency: "¥", videoPerSecond: 2, imagePerImage: 1 },
    };
    render(
      <WorkspaceUsage
        jobs={jobs}
        projects={
          [
            { id: "p1", name: "第一集" },
            { id: "p2", name: "第二集" },
          ] as any[]
        }
        settings={settings}
      />,
    );
    const region = screen.getByRole("region", { name: "用量与成本总览" });
    const rows = within(region).getAllByRole("row");
    // header + 2 current-month projects (sorted by cost desc)
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("第一集")).toBeTruthy();
    expect(within(rows[1]).getByText("≈ ¥13")).toBeTruthy();
    expect(within(rows[2]).getByText("第二集")).toBeTruthy();
    expect(within(rows[2]).getByText("≈ ¥8")).toBeTruthy();
    expect(region.textContent).toContain("≈ ¥21");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "全部" }));
    expect(within(region).getAllByRole("row")).toHaveLength(4);
    expect(within(region).getByText("项目已删除")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "导出 CSV" }));
    expect(saveText).toHaveBeenCalledTimes(1);
    const [name, csv, mime] = vi.mocked(saveText).mock.calls[0];
    expect(name).toMatch(/^jingxu-usage-all-.*\.csv$/);
    expect(mime).toContain("text/csv");
    const lines = (csv as string).replace(/^﻿/, "").trim().split("\n");
    expect(lines[0]).toContain("项目");
    expect(lines.at(-1)).toMatch(/^合计,10,2,0,0,4,22$/);

    await user.click(screen.getByRole("button", { name: "本月" }));
    expect(within(region).getAllByRole("row")).toHaveLength(3);
  });
  it("任务队列页可直接填写单价，保存后总览成本与全局设置同步更新", async () => {
    const jobs: any[] = [
      {
        id: "j1",
        projectId: "p1",
        type: "transcribe",
        state: "succeeded",
        createdAt: new Date().toISOString(),
        usage: { seconds: 10 },
      },
    ];
    const settings: any = { pricing: { currency: "¥" } };
    const onSettings = vi.fn();
    const savedSettings: any = {
      pricing: { currency: "¥", transcriptionPerSecond: 0.5 },
    };
    vi.mocked(api).mockResolvedValue(savedSettings);
    render(
      <WorkspaceUsage
        jobs={jobs}
        projects={[{ id: "p1", name: "第一集" }] as any[]}
        settings={settings}
        onSettings={onSettings}
      />,
    );
    const region = screen.getByRole("region", { name: "用量与成本总览" });
    expect(within(region).queryByText("≈ ¥5")).toBeNull();

    const user = userEvent.setup();
    await user.click(within(region).getByRole("button", { name: "设置单价" }));
    const input = screen.getByRole("spinbutton", {
      name: "识别 · 每秒",
    }) as HTMLInputElement;
    await user.type(input, "0.5");
    await user.click(screen.getByRole("button", { name: "保存单价" }));

    await waitFor(() => expect(onSettings).toHaveBeenCalledWith(savedSettings));
    const putCalls = vi
      .mocked(api)
      .mock.calls.filter((c) => c[0] === "/settings");
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse((putCalls[0][1] as { body: string }).body);
    expect(body.pricing).toMatchObject({
      currency: "¥",
      transcriptionPerSecond: 0.5,
    });
  });
  it("本月预算护栏按估算花费显示进度与超支，仅本月显示", async () => {
    const jobs: any[] = [
      {
        id: "j1",
        projectId: "p1",
        type: "generate",
        state: "succeeded",
        duration: 6,
        createdAt: new Date().toISOString(),
      },
    ];
    const projects = [{ id: "p1", name: "第一集" }] as any[];
    const over: any = {
      pricing: { currency: "¥", videoPerSecond: 2, monthlyBudget: 10 },
    };
    const { rerender } = render(
      <WorkspaceUsage jobs={jobs} projects={projects} settings={over} />,
    );
    const guard = document.querySelector(".budget-guard")!;
    expect(guard.classList.contains("over")).toBe(true);
    expect(guard.textContent).toContain("本月预算 ¥10");
    expect(guard.textContent).toContain("已超出");
    expect(
      (screen.getByRole("progressbar") as HTMLDivElement).getAttribute(
        "aria-valuenow",
      ),
    ).toBe("100");

    // Under budget -> ok, remaining = 100 - 12 = 88.
    const ok: any = {
      pricing: { currency: "¥", videoPerSecond: 2, monthlyBudget: 100 },
    };
    rerender(<WorkspaceUsage jobs={jobs} projects={projects} settings={ok} />);
    const guard2 = document.querySelector(".budget-guard")!;
    expect(guard2.classList.contains("ok")).toBe(true);
    expect(guard2.textContent).toContain("剩余预算 ¥88");

    // Budget is per calendar month: hidden on the all-time tab.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "全部" }));
    expect(document.querySelector(".budget-guard")).toBeNull();

    // No budget configured -> guard hidden.
    await user.click(screen.getByRole("button", { name: "本月" }));
    const none: any = { pricing: { currency: "¥", videoPerSecond: 2 } };
    rerender(
      <WorkspaceUsage jobs={jobs} projects={projects} settings={none} />,
    );
    expect(document.querySelector(".budget-guard")).toBeNull();
  });
  it("批量生成确认弹窗显示镜头数、总时长与估算金额，确认后才入队", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <BatchCostConfirm
        estimate={{
          shotCount: 3,
          videoSeconds: 16.5,
          currency: "¥",
          videoCost: 33,
        }}
        allSelected={false}
        demo={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "生成前确认" });
    expect(dialog.textContent).toContain("3");
    expect(dialog.textContent).toContain("16.5");
    expect(dialog.textContent).toContain("≈ ¥33");
    expect(onConfirm).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "确认加入队列" }));
    expect(onConfirm).toHaveBeenCalledOnce();

    render(
      <BatchCostConfirm
        estimate={{ shotCount: 2, videoSeconds: 12, currency: "¥" }}
        allSelected
        demo={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "所有镜头都已有选定候选，本次将为全部镜头重新生成视频候选。",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/尚未设置视频每秒单价/)).toBeTruthy();
  });
  it("monthBudgetWarning 只在本月成功用量+本批预计触达阈值时提醒", () => {
    const pricing: any = {
      currency: "¥",
      videoPerSecond: 2,
      monthlyBudget: 100,
    };
    const thisMonth = new Date().toISOString();
    const old = new Date(2000, 0, 1).toISOString();
    const videoJob = (overrides: any): any => ({
      id: "j",
      projectId: "p",
      type: "generate",
      duration: 40,
      createdAt: thisMonth,
      ...overrides,
    });
    // spent 80 + incoming 30 = 110 -> over
    const over = monthBudgetWarning(
      [videoJob({ state: "succeeded" })],
      pricing,
      30,
    );
    expect(over?.level).toBe("over");
    expect(over?.projected).toBe(110);
    expect(over?.spent).toBe(80);
    expect(over?.budget).toBe(100);
    // incoming 0 keeps projection at 80 (80%) -> near, still surfaced
    const near = monthBudgetWarning(
      [videoJob({ state: "succeeded" })],
      pricing,
      undefined,
    );
    expect(near?.level).toBe("near");
    // below threshold -> null
    expect(monthBudgetWarning([], pricing, 10)).toBeNull();
    // no budget -> null
    expect(
      monthBudgetWarning(
        [videoJob({ state: "succeeded" })],
        {
          currency: "¥",
          videoPerSecond: 2,
        } as any,
        999,
      ),
    ).toBeNull();
    // failed and out-of-month jobs are excluded -> null
    expect(
      monthBudgetWarning(
        [
          videoJob({ state: "failed" }),
          videoJob({ state: "succeeded", createdAt: old }),
        ],
        pricing,
        0,
      ),
    ).toBeNull();
  });
  it("批量确认在超预算时给出醒目提醒但不阻止生成，演示模式隐藏提醒", async () => {
    const onConfirm = vi.fn();
    const warning = {
      level: "over" as const,
      currency: "¥",
      spent: 80,
      projected: 110,
      budget: 100,
    };
    const { unmount } = render(
      <BatchCostConfirm
        estimate={{
          shotCount: 3,
          videoSeconds: 15,
          currency: "¥",
          videoCost: 30,
        }}
        allSelected={false}
        demo={false}
        budgetWarning={warning}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "生成前确认" });
    const box = dialog.querySelector(".budget-warning.over");
    expect(box).not.toBeNull();
    expect(box?.textContent).toContain("本批生成后将超出月度预算");
    expect(box?.textContent).toContain("¥110");
    expect(box?.textContent).toContain("¥100");
    expect(box?.textContent).toContain("预算仅在本地提醒，不会阻止生成");
    const confirmButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "确认加入队列",
    });
    expect(confirmButton.disabled).toBe(false);
    const user = userEvent.setup();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
    unmount();

    render(
      <BatchCostConfirm
        estimate={{
          shotCount: 3,
          videoSeconds: 15,
          currency: "¥",
          videoCost: 30,
        }}
        allSelected={false}
        demo
        budgetWarning={warning}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(document.querySelector(".budget-warning")).toBeNull();
  });
  it("后台刷新导致父组件重渲染时，弹窗不会把编辑焦点跳回首字段", () => {
    const firstClose = vi.fn(),
      latestClose = vi.fn();
    const content = (
      <>
        <input aria-label="Name" />
        <textarea aria-label="Description" />
      </>
    );
    const { rerender } = render(
      <Modal title="Project" onClose={firstClose}>
        {content}
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    screen.getByLabelText("Description").focus();
    rerender(
      <Modal title="Project" onClose={latestClose}>
        {content}
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Description"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(latestClose).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
  });
  it("编辑保存在本地草稿，点击保存才提交", async () => {
    const p = props();
    render(<ShotEditor {...p} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText("镜头标题");
    await user.clear(input);
    await user.type(input, "新的开头");
    expect(p.onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(p.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ title: "新的开头" }),
      ),
    );
  });
  it("保存失败时保留草稿，不继续提交生成任务", async () => {
    const p = props();
    p.onSave.mockResolvedValue(false);
    render(<ShotEditor {...p} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("局部返修要求"), "保留场景");
    await user.click(screen.getByRole("button", { name: "生成候选" }));
    await waitFor(() => expect(p.onSave).toHaveBeenCalled());
    expect(p.onGenerate).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("局部返修要求") as HTMLTextAreaElement).value,
    ).toBe("保留场景");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeDefined();
  });
  it("生成前保存脏草稿，已运行时禁用重复生成", async () => {
    const p = props();
    const { rerender } = render(<ShotEditor {...p} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("局部返修要求"), "保持外套颜色");
    await user.click(screen.getByRole("button", { name: "生成候选" }));
    await waitFor(() => expect(p.onGenerate).toHaveBeenCalledOnce());
    expect(p.onSave.mock.invocationCallOrder[0]).toBeLessThan(
      p.onGenerate.mock.invocationCallOrder[0],
    );
    rerender(<ShotEditor {...p} running />);
    expect(
      (screen.getByRole("button", { name: "生成候选" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("在线模式配置单价后，单镜生成按钮显示预计成本，演示模式不显示", () => {
    const p = props();
    const pricing: any = { currency: "¥", videoPerSecond: 2 };
    const { rerender } = render(
      <ShotEditor {...p} pricing={pricing} demo={false} />,
    );
    expect(screen.getByText(/≈ ¥8/)).toBeTruthy();
    expect(screen.getByText(/4\s*秒/)).toBeTruthy();

    rerender(<ShotEditor {...p} pricing={pricing} demo />);
    expect(screen.queryByText(/≈ ¥8/)).toBeNull();

    rerender(<ShotEditor {...p} pricing={{ currency: "¥" }} demo={false} />);
    expect(screen.queryByText(/≈ ¥/)).toBeNull();
  });
  it("图片生成确认弹窗按每张单价显示预估，演示模式与未定价不显示", async () => {
    const p = props();
    const image: any = {
      endpoint: "https://example.test",
      model: "image-model",
      hasApiKey: true,
    };
    const { rerender } = render(
      <ShotEditor
        {...p}
        image={image}
        onImageRequest={vi.fn()}
        pricing={{ currency: "¥", imagePerImage: 0.5 }}
        demo={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "生成图片候选" }));
    const dialog = screen.getByRole("dialog", { name: "确认生成图片" });
    expect(dialog.textContent).toContain("≈ ¥0.5");
    expect(dialog.textContent).toContain("1 张");

    fireEvent.keyDown(document, { key: "Escape" });
    rerender(
      <ShotEditor
        {...p}
        image={image}
        onImageRequest={vi.fn()}
        pricing={{ currency: "¥", imagePerImage: 0.5 }}
        demo
      />,
    );
    await user.click(screen.getByRole("button", { name: "生成图片候选" }));
    expect(
      screen.getByRole("dialog", { name: "确认生成图片" }).textContent,
    ).not.toContain("≈ ¥");
  });
  it("配音确认显示字符数与按千字符估算金额，未定价只显字数", async () => {
    const config: PublicSpeech = {
      endpoint: "https://e.test",
      model: "m",
      voice: "v",
      speed: 1,
      hasApiKey: true,
    };
    const base = {
      projectId: "p1",
      shotId: "s1",
      dialogue: "a".repeat(1250),
      config,
      disabled: false,
      running: false,
      saveDraft: vi.fn().mockResolvedValue(true),
      onQueued: vi.fn().mockResolvedValue(undefined),
      openSettings: vi.fn(),
    };
    const { rerender } = render(
      <VoiceoverComposer
        {...base}
        pricing={{ currency: "¥", speechPerKiloChar: 4 }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "生成台词配音" }));
    const strip = document.querySelector(".review-cost")!;
    expect(strip.textContent).toContain("≈ ¥5");
    expect(strip.textContent).toContain("1250 字");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    rerender(<VoiceoverComposer {...base} pricing={{ currency: "¥" }} />);
    await user.click(screen.getByRole("button", { name: "生成台词配音" }));
    const strip2 = document.querySelector(".review-cost")!;
    expect(strip2.textContent).toContain("1250 字");
    expect(strip2.textContent).not.toContain("≈ ¥");
  });
  it("识别确认按音频秒数显示预估，未定价只显秒数", async () => {
    const p = props();
    p.shot.audioAssetId = "audio1";
    const captionProject: any = {
      ...project,
      id: "p1",
      assets: [{ id: "audio1", kind: "audio", name: "a.wav", url: "a.wav" }],
    };
    const config: any = {
      endpoint: "https://e.test",
      model: "asr",
      language: "",
      hasApiKey: true,
    };
    const base = {
      project: captionProject,
      shot: p.shot,
      jobs: [],
      config,
      onSaved: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
      openSettings: vi.fn(),
    };
    const { rerender } = render(
      <CaptionEditor
        {...base}
        pricing={{ currency: "¥", transcriptionPerSecond: 0.2 }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "识别当前音轨" }));
    const strip = document.querySelector(".review-cost")!;
    expect(strip.textContent).toContain("≈ ¥0.8");
    expect(strip.textContent).toContain("4 秒");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    rerender(<CaptionEditor {...base} pricing={{ currency: "¥" }} />);
    await user.click(screen.getByRole("button", { name: "识别当前音轨" }));
    const strip2 = document.querySelector(".review-cost")!;
    expect(strip2.textContent).toContain("4 秒");
    expect(strip2.textContent).not.toContain("≈ ¥");
  });
  it("候选选择提交版本 ID，不覆盖候选内容", async () => {
    const p = props();
    p.shot.versions = [
      { id: "v1", number: 1, assetId: "a1", source: "demo" },
      { id: "v2", number: 2, assetId: "a2", source: "generated" },
    ];
    p.shot.selectedVersionId = "v1";
    render(<ShotEditor {...p} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /已选 V1/ }));
    await user.click(screen.getByRole("button", { name: "选用" }));
    expect(p.onSave).toHaveBeenCalledWith({ selectedVersionId: "v2" });
    expect(p.shot.versions).toHaveLength(2);
  });
  it("视觉检查和人工审核分开执行", async () => {
    const p = props();
    p.shot.selectedVersionId = "v1";
    render(<ShotEditor {...p} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "视觉检查当前候选" }));
    expect(p.onVisualReview).toHaveBeenCalledOnce();
    expect(p.onSave).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("审核状态"), "approved");
    expect(p.onSave).toHaveBeenCalledWith({ review: "approved" });
  });
  it("弹窗支持 Escape 关闭，表单有可访问标签", async () => {
    const close = vi.fn();
    render(
      <Modal title="测试弹窗" onClose={close}>
        <input aria-label="名称" />
        <button>确认</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "测试弹窗" })).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("创建项目先创建记录，再拆镜，完成后回调", async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined),
      notify = vi.fn();
    vi.mocked(post)
      .mockResolvedValueOnce({ id: "new-project" })
      .mockResolvedValueOnce({ id: "new-project", shots: [{ id: "s1" }] });
    render(
      <NewProject onClose={vi.fn()} onCreated={onCreated} notify={notify} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("项目名称"), "组件测试故事");
    await user.type(screen.getByLabelText(/剧本 \/ 小说片段/), "阿青：出发。");
    await user.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new-project" }),
      ),
    );
    expect(post).toHaveBeenCalledWith("/projects/new-project/storyboard");
  });
});

it("英文镜头界面保留原始创作内容", () => {
  setLocale("en");
  const p = props();
  render(<ShotEditor {...p} />);
  expect(screen.getByLabelText("Shot title")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Generate candidate" }),
  ).toBeDefined();
  expect((screen.getByLabelText("Shot title") as HTMLInputElement).value).toBe(
    "原始镜头",
  );
  expect(screen.getByRole("option", { name: "Medium shot" })).toBeDefined();
});

it("英文界面新建项目的视觉风格选项显示英文而非原始中文", () => {
  setLocale("en");
  render(
    <NewProject
      onClose={vi.fn()}
      onCreated={vi.fn().mockResolvedValue(undefined)}
      notify={vi.fn()}
    />,
  );
  expect(screen.getByRole("option", { name: "Cinematic" })).toBeDefined();
  expect(
    screen.getByRole("option", { name: "Chinese animation" }),
  ).toBeDefined();
  expect(screen.getByRole("option", { name: "Hand-drawn" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Product ad" })).toBeDefined();
  expect(screen.getByRole("option", { name: "Custom" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "电影写实" })).toBeNull();
  // 显示翻译，但提交值必须保持规范中文枚举（写入项目/提示词用）。
  const styleSelect = screen.getByLabelText(
    "Visual style",
  ) as HTMLSelectElement;
  expect(styleSelect.value).toBe("电影写实");
  expect(Array.from(styleSelect.options).map((o) => o.value)).toEqual([
    "电影写实",
    "国风动画",
    "治愈手绘",
    "产品广告",
    "自定义",
  ]);
  setLocale("zh");
});

it("binds a scene image through the editor and opens sync only after saving", async () => {
  const p = props();
  const onSceneSync = vi.fn();
  p.project.revision = 4;
  p.project.assets = [
    { id: "cafe", kind: "image", name: "Cafe.jpg", url: "/media/cafe" },
  ];
  const { rerender } = render(<ShotEditor {...p} onSceneSync={onSceneSync} />);
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "镜头参考图" }),
    "cafe",
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: /跨集同步场景参考/ })
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "保存修改" }));
  expect(p.onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ referenceIds: ["cafe"] }),
    4,
  );
  rerender(
    <ShotEditor
      {...p}
      project={{ ...p.project, revision: 5 }}
      shot={{ ...p.shot, referenceIds: ["cafe"] }}
      onSceneSync={onSceneSync}
    />,
  );
  await user.click(screen.getByRole("button", { name: /跨集同步场景参考/ }));
  expect(onSceneSync).toHaveBeenCalledExactlyOnceWith("cafe");
});

it("protects saved references from a stale draft and keeps unrelated edits", async () => {
  const p = props();
  p.project.revision = 4;
  p.project.assets = [
    { id: "a", kind: "image", name: "A.png", url: "/a" },
    { id: "b", kind: "image", name: "B.png", url: "/b" },
  ];
  const { rerender } = render(<ShotEditor {...p} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("镜头标题"), "更新");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "镜头参考图" }),
    "a",
  );
  rerender(
    <ShotEditor
      {...p}
      shot={{ ...p.shot, referenceIds: ["b"] }}
      project={{ ...p.project, revision: 5 }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveProperty(
    "textContent",
    "此镜头的参考图已更新，请载入已保存的参考后继续。",
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "保存修改" })
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "载入已保存参考" }));
  expect(
    screen.getByRole("button", { name: "移除镜头参考 · B.png" }),
  ).toBeDefined();
  await user.click(screen.getByRole("button", { name: "保存修改" }));
  expect(p.onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "原始镜头更新" }),
  );
  expect(p.onSave.mock.calls[0][0]).not.toHaveProperty("referenceIds");
});

describe("AgentPanel Skill 选择", () => {
  const skills = [
    { id: "shot-repair", name: "返修助手", description: "逐镜返修对白与画面" },
    { id: "brand", name: "品牌规范", description: "检查品牌与产品外观" },
  ];
  const configuredAgent = {
    agent: { endpoint: "https://llm.test/v1", model: "gpt-x", hasApiKey: true },
  } as any;
  function mount(extra?: { settings?: any; onConfigure?: () => void }) {
    return render(
      <AgentPanel
        project={{ ...structuredClone(project), messages: [] }}
        skills={skills}
        approvals={[]}
        refresh={vi.fn().mockResolvedValue(undefined)}
        notify={vi.fn()}
        settings={extra?.settings ?? configuredAgent}
        onConfigure={extra?.onConfigure}
      />,
    );
  }
  it("默认不指定 Skill，显示通用提示，选择后显示该 Skill 用途并随消息发送", async () => {
    const user = userEvent.setup();
    vi.mocked(post).mockResolvedValue({} as any);
    mount();
    const select = screen.getByLabelText("选择 Skill") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(
      screen.getByText("不套用特定创作规则，由通用导演助手通读项目后给建议。"),
    ).toBeDefined();
    expect(screen.queryByText("逐镜返修对白与画面")).toBeNull();

    await user.selectOptions(select, "shot-repair");
    expect(select.value).toBe("shot-repair");
    expect(screen.getByText("逐镜返修对白与画面")).toBeDefined();
    expect(
      screen.queryByText(
        "不套用特定创作规则，由通用导演助手通读项目后给建议。",
      ),
    ).toBeNull();

    await user.type(screen.getByLabelText("给导演助手的消息"), "帮我优化开头");
    await user.click(screen.getByLabelText("发送给导演助手"));
    expect(post).toHaveBeenCalledWith("/projects/p1/chat", {
      text: "帮我优化开头",
      skill: "shot-repair",
    });
  });

  it("默认发送空 skill（走通用导演助手，不强套返修规则）", async () => {
    const user = userEvent.setup();
    vi.mocked(post).mockResolvedValue({} as any);
    mount();
    await user.type(screen.getByLabelText("给导演助手的消息"), "让冲突更明确");
    await user.click(screen.getByLabelText("发送给导演助手"));
    expect(post).toHaveBeenCalledWith("/projects/p1/chat", {
      text: "让冲突更明确",
      skill: "",
    });
  });

  it("从 Skills 带入 initialSkill 时预选该 Skill 并显示其用途", () => {
    render(
      <AgentPanel
        project={{ ...structuredClone(project), messages: [] }}
        skills={skills}
        initialSkill="brand"
        approvals={[]}
        refresh={vi.fn().mockResolvedValue(undefined)}
        notify={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("选择 Skill") as HTMLSelectElement;
    expect(select.value).toBe("brand");
    expect(screen.getByText("检查品牌与产品外观")).toBeDefined();
    expect(
      screen.queryByText(
        "不套用特定创作规则，由通用导演助手通读项目后给建议。",
      ),
    ).toBeNull();
  });

  it("未配置助手模型时显示引导、禁用发送，点“去配置模型”跳转设置且不发起对话", async () => {
    const user = userEvent.setup();
    const onConfigure = vi.fn();
    mount({
      settings: { agent: { endpoint: "", model: "", hasApiKey: false } },
      onConfigure,
    });
    expect(screen.getByText("还没有配置导演助手模型")).toBeDefined();
    expect(screen.getByRole("button", { name: "去配置模型" })).toBeDefined();
    const send = screen.getByRole<HTMLButtonElement>("button", {
      name: "发送给导演助手",
    });
    expect(send.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "去配置模型" }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it("只配了 Key 缺模型或地址时仍视为未配置", () => {
    mount({
      settings: {
        agent: { endpoint: "https://llm.test/v1", model: "", hasApiKey: true },
      },
    });
    expect(screen.getByText("还没有配置导演助手模型")).toBeDefined();
  });

  it("模型配置完整时不显示引导、可正常发送", async () => {
    const user = userEvent.setup();
    vi.mocked(post).mockResolvedValue({} as any);
    mount();
    expect(screen.queryByText("还没有配置导演助手模型")).toBeNull();
    await user.type(screen.getByLabelText("给导演助手的消息"), "检查开场");
    const send = screen.getByRole<HTMLButtonElement>("button", {
      name: "发送给导演助手",
    });
    expect(send.disabled).toBe(false);
  });
});

describe("Skills 自定义 Skill 名称", () => {
  it("新建时分别填写可读名称与 slug 标识，提交携带两者且卡片显示名称", async () => {
    const user = userEvent.setup();
    vi.mocked(post).mockResolvedValue({} as any);
    const skills = [
      {
        id: "brand-video-review",
        name: "品牌视频审查",
        description: "逐镜检查品牌外观",
        content: "规则",
        builtin: false,
      },
    ];
    render(
      <Skills
        skills={skills}
        refresh={vi.fn().mockResolvedValue(undefined)}
        notify={vi.fn()}
        onUseSkill={vi.fn()}
      />,
    );
    // 已有自定义 Skill 的卡片显示可读名称，而不是 slug。
    expect(screen.getByRole("heading", { name: "品牌视频审查" })).toBeDefined();
    expect(screen.queryByText("brand-video-review")).toBeNull();

    await user.click(screen.getByRole("button", { name: /新建 Skill/ }));
    await user.type(screen.getByLabelText("名称"), "品牌视频审查");
    await user.type(
      screen.getByPlaceholderText("brand-video-review"),
      "brand-video-review",
    );
    await user.type(screen.getByLabelText("用途说明"), "逐镜检查品牌外观");
    await user.type(
      screen.getByLabelText("操作流程与验收标准"),
      "先读取品牌规范，再逐镜核对产品外观。",
    );
    await user.click(screen.getByRole("button", { name: "保存 Skill" }));
    expect(post).toHaveBeenCalledWith("/skills", {
      name: "brand-video-review",
      title: "品牌视频审查",
      description: "逐镜检查品牌外观",
      content: "先读取品牌规范，再逐镜核对产品外观。",
    });
  });
});

describe("Assets 参考资产筛选空态", () => {
  const projectWithImage = {
    ...structuredClone(project),
    assets: [
      {
        id: "a1",
        name: "定妆图.png",
        kind: "image",
        url: "/media/a1.png",
        size: 1024,
        createdAt: new Date().toISOString(),
      },
    ],
  } as any;
  function mount() {
    return render(
      <Assets project={projectWithImage} upload={vi.fn()} onCreate={vi.fn()} />,
    );
  }
  it("有素材但当前筛选无内容时给出分类空态，切回有内容分类后消失", async () => {
    const user = userEvent.setup();
    mount();
    // 默认“全部素材”能看到该图片，不显示任何空态。
    expect(screen.getByText("定妆图.png")).toBeDefined();
    expect(screen.queryByText("该分类还没有素材")).toBeNull();
    expect(screen.queryByText("把你的素材带进来")).toBeNull();
    // 切到没有素材的“文档”。
    await user.click(screen.getByRole("button", { name: "文档" }));
    expect(screen.getByText("该分类还没有素材")).toBeDefined();
    expect(screen.queryByText("定妆图.png")).toBeNull();
    // 切回“图片”恢复。
    await user.click(screen.getByRole("button", { name: "图片" }));
    expect(screen.getByText("定妆图.png")).toBeDefined();
    expect(screen.queryByText("该分类还没有素材")).toBeNull();
  });
  it("完全没有素材时显示首用导入空态而非分类空态", () => {
    render(
      <Assets
        project={{ ...structuredClone(project), assets: [] } as any}
        upload={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByText("把你的素材带进来")).toBeDefined();
    expect(screen.queryByText("该分类还没有素材")).toBeNull();
  });
});

describe("Jobs 任务队列分区", () => {
  const now = new Date().toISOString();
  const jobs = [
    {
      id: "j1",
      state: "succeeded",
      type: "generate",
      projectId: "p1",
      shotId: "s1",
      provider: "demo",
      createdAt: now,
      progress: 100,
      message: "",
    },
    {
      id: "j2",
      state: "running",
      type: "generate",
      projectId: "p1",
      shotId: "s1",
      provider: "demo",
      createdAt: now,
      progress: 40,
      message: "",
    },
    {
      id: "j3",
      state: "succeeded",
      type: "generate",
      projectId: "p1",
      shotId: "s1",
      provider: "demo",
      createdAt: now,
      progress: 100,
      message: "",
    },
  ] as any[];
  const mount = (list: any[] = jobs) =>
    render(
      <Jobs
        jobs={list}
        projects={[structuredClone(project)]}
        act={vi.fn()}
        settings={{ pricing: { currency: "¥" } } as any}
      />,
    );
  it("进行中任务置顶于用量总览之前，历史任务在其后，无重复", () => {
    mount();
    const active = document.querySelector(".jobs-band.active")!;
    const history = document.querySelector(".jobs-band.history")!;
    const usage = document.querySelector(".workspace-usage")!;
    expect(active).toBeTruthy();
    expect(history).toBeTruthy();
    expect(
      active.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      usage.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(active as HTMLElement).getByText("进行中的任务 · 1"),
    ).toBeDefined();
    expect(within(active as HTMLElement).getByText("执行中")).toBeDefined();
    expect(
      within(active as HTMLElement).getByRole("button", { name: "取消" }),
    ).toBeDefined();
    expect(within(history as HTMLElement).getAllByText("已完成")).toHaveLength(
      2,
    );
    expect(within(history as HTMLElement).queryByText("执行中")).toBeNull();
  });
  it("无进行中任务时不显示进行分区，用量总览在最上", () => {
    mount(jobs.filter((j) => j.state === "succeeded"));
    expect(document.querySelector(".jobs-band.active")).toBeNull();
    expect(document.querySelector(".jobs-band.history")).toBeTruthy();
    expect(document.querySelector(".workspace-usage")).toBeTruthy();
  });
});
