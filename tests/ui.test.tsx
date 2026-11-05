// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
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
import { ShotEditor, Modal, NewProject } from "../apps/studio/src/main";
import { post } from "../apps/studio/src/api";
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
