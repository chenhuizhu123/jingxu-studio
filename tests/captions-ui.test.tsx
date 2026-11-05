// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
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
  mediaUrl: (s: string) => s,
}));
import { CaptionEditor } from "../apps/studio/src/Captions";
import { api, post } from "../apps/studio/src/api";
import { setLocale, t } from "../apps/studio/src/i18n";
const source = { assetId: "voice", start: 0, duration: 3 };
const track = {
  source,
  origin: "asr" as const,
  createdAt: "2026-11-05T00:00:00.000Z",
  cues: [
    { start: 0.2, end: 1, text: "Hello" },
    { start: 1.4, end: 2.5, text: "雨停了" },
  ],
};
function props() {
  return {
    project: {
      id: "p",
      revision: 4,
      assets: [
        { id: "voice", kind: "audio", url: "/voice.wav", name: "Voice.wav" },
      ],
    } as any,
    shot: {
      id: "s",
      duration: 3,
      trimStart: 0,
      audioAssetId: "voice",
      versions: [],
      captionTrack: structuredClone(track),
    } as any,
    jobs: [] as any[],
    config: {
      endpoint: "https://asr.example/v1",
      model: "timestamp-model",
      language: "en",
      hasApiKey: true,
    },
    onSaved: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    openSettings: vi.fn(),
  };
}
beforeEach(() => {
  setLocale("zh");
  vi.mocked(api).mockResolvedValue({});
  vi.mocked(post).mockResolvedValue({ id: "job", state: "queued" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("caption timing editor in memory", () => {
  it.each(["zh", "en"] as const)(
    "%s edits cue timestamps and applies with a revision guard",
    async (lang) => {
      setLocale(lang);
      const p = props();
      render(<CaptionEditor {...p} />);
      fireEvent.change(screen.getByLabelText(`${t("开始 / 秒")} 1`), {
        target: { value: "0.35" },
      });
      fireEvent.change(screen.getByLabelText(`${t("字幕文本")} 1`), {
        target: { value: "Hello, creator" },
      });
      await userEvent.click(
        screen.getByRole("button", { name: t("应用时间轴字幕") }),
      );
      await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce());
      const [, request] = vi.mocked(api).mock.calls[0];
      const body = JSON.parse(request!.body as string);
      expect(body.revision).toBe(4);
      expect(body.captionTrack.cues[0]).toEqual({
        start: 0.35,
        end: 1,
        text: "Hello, creator",
      });
      expect(body.captionTrack.origin).toBe("manual");
    },
  );
  it("overlapping cues cannot be applied, and deleting rows keeps the remaining text", async () => {
    const p = props();
    render(<CaptionEditor {...p} />);
    fireEvent.change(screen.getByLabelText("开始 / 秒 2"), {
      target: { value: "0.5" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "应用时间轴字幕",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("不重叠");
    await userEvent.click(screen.getByRole("button", { name: "删除字幕 1" }));
    expect(
      (screen.getByLabelText("字幕文本 1") as HTMLTextAreaElement).value,
    ).toBe("雨停了");
  });
  it("changed audio cannot reuse an old track, but can explicitly return to script captions", async () => {
    const p = props();
    p.shot.duration = 4;
    render(<CaptionEditor {...p} />);
    expect(
      (
        screen.getByRole("button", {
          name: "应用时间轴字幕",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "切回台词字幕" }));
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(
      JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).captionTrack,
    ).toBeNull();
  });
  it("recognition requires explicit confirmation and sends the current source without device keys", async () => {
    const p = props();
    render(<CaptionEditor {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "识别当前音轨" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/服务商可能收费/)).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "确认并识别" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledExactlyOnceWith(
        "/projects/p/shots/s/transcribe",
        { source },
      ),
    );
  });
  it("an accepted recognition refresh failure never submits paid work twice", async () => {
    const p = props();
    p.onSaved.mockRejectedValueOnce(Error("offline"));
    const { rerender } = render(<CaptionEditor {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "识别当前音轨" }));
    await userEvent.click(screen.getByRole("button", { name: "确认并识别" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "重试只刷新",
    );
    rerender(
      <CaptionEditor
        {...p}
        jobs={
          [
            { id: "job", type: "transcribe", shotId: "s", state: "running" },
          ] as any
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "刷新识别结果" }));
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledOnce();
  });
  it("a saved track refresh failure only refreshes and retains the saved revision", async () => {
    const p = props();
    p.onSaved.mockRejectedValueOnce(Error("offline"));
    render(<CaptionEditor {...p} />);
    await userEvent.click(
      screen.getByRole("button", { name: "应用时间轴字幕" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "字幕已保存",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "刷新已保存字幕" }),
    );
    await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledOnce();
  });
  it("recognition candidates stay separate until the user selects and applies one", async () => {
    const p = props();
    p.shot.captionTrack = undefined;
    p.jobs = [
      {
        id: "candidate",
        type: "transcribe",
        shotId: "s",
        state: "succeeded",
        createdAt: track.createdAt,
        captionResult: track,
      },
    ];
    render(<CaptionEditor {...p} />);
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("字幕文本 1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /2 条字幕/ }));
    expect(screen.getByLabelText("字幕文本 1")).toBeDefined();
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "应用时间轴字幕" }),
    );
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
  });
  it("manual empty tracks intentionally suppress captions and missing config opens settings", async () => {
    const p = props();
    render(<CaptionEditor {...p} config={undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "配置语音识别" }));
    expect(p.openSettings).toHaveBeenCalledOnce();
    await userEvent.click(
      screen.getByRole("button", { name: "手动创建时间轴" }),
    );
    expect(screen.getByText(/当前时间轴为空/)).toBeDefined();
    await userEvent.click(
      screen.getByRole("button", { name: "应用时间轴字幕" }),
    );
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(
      JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).captionTrack
        .cues,
    ).toEqual([]);
  });
});
