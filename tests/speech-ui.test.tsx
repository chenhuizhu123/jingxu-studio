// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../apps/studio/src/api", () => ({
  post: vi.fn(),
  api: vi.fn(),
  mediaUrl: (v: string) => v,
  initializeConnection: vi.fn(),
  connect: vi.fn(),
  download: vi.fn(),
  saveText: vi.fn(),
  native: false,
  serverBase: () => "",
}));
import {
  VoiceoverComposer,
  SpeechSettingsFields,
  type PublicSpeech,
} from "../apps/studio/src/Voiceover";
import { AudioPreview } from "../apps/studio/src/main";
import { post } from "../apps/studio/src/api";
import { setLocale, t } from "../apps/studio/src/i18n";
const config: PublicSpeech = {
  endpoint: "https://speech.example/v1",
  model: "studio-voice",
  voice: "narrator",
  speed: 1,
  hasApiKey: true,
};
function props() {
  return {
    projectId: "p",
    shotId: "s",
    dialogue: "Hello, creator.",
    config,
    disabled: false,
    running: false,
    saveDraft: vi.fn().mockResolvedValue(true),
    onQueued: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn(),
  };
}
beforeEach(() => {
  setLocale("zh");
  vi.mocked(post).mockResolvedValue({ id: "job", type: "speech" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("localizes speech service HTTP status without translating creative text", () => {
  setLocale("en");
  expect(t("语音服务返回 HTTP 429")).toBe("Speech service returned HTTP 429");
  expect(t("Hello creator")).toBe("Hello creator");
});
describe("voiceover review and preview UI without a browser", () => {
  it.each(["zh", "en"] as const)(
    "%s reviews the exact text and provider before submitting once",
    async (locale) => {
      setLocale(locale);
      const p = props();
      render(<VoiceoverComposer {...p} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: t("生成台词配音") }));
      expect(post).not.toHaveBeenCalled();
      expect(screen.getByText(p.dialogue)).toBeDefined();
      expect(screen.getByText(/studio-voice · narrator/)).toBeDefined();
      await user.click(screen.getByRole("button", { name: t("创建配音任务") }));
      await waitFor(() => expect(p.onQueued).toHaveBeenCalledOnce());
      expect(post).toHaveBeenCalledExactlyOnceWith(
        "/projects/p/shots/s/speech",
        { text: p.dialogue },
      );
      expect(p.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(post).mock.invocationCallOrder[0],
      );
      expect(screen.getByRole("status").textContent).toContain(
        t("配音任务已创建，可在任务队列查看。完成后在配音列表试听并选用。"),
      );
    },
  );
  it("failed save retains review and never submits paid work", async () => {
    const p = props();
    p.saveDraft.mockResolvedValue(false);
    render(<VoiceoverComposer {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "生成台词配音" }));
    await userEvent.click(screen.getByRole("button", { name: "创建配音任务" }));
    await waitFor(() => expect(p.saveDraft).toHaveBeenCalledOnce());
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(p.dialogue)).toBeDefined();
  });
  it("refresh retry keeps the accepted job and never submits a second request", async () => {
    const p = props();
    p.onQueued.mockRejectedValueOnce(new Error("refresh offline"));
    const { rerender } = render(<VoiceoverComposer {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "生成台词配音" }));
    await userEvent.click(screen.getByRole("button", { name: "创建配音任务" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "重试只刷新任务",
    );
    rerender(<VoiceoverComposer {...p} running />);
    await userEvent.click(screen.getByRole("button", { name: "刷新配音任务" }));
    await waitFor(() => expect(p.onQueued).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledOnce();
    expect(p.saveDraft).toHaveBeenCalledOnce();
  });
  it("provider errors retain dialogue and can be retried deliberately", async () => {
    const p = props();
    vi.mocked(post).mockRejectedValueOnce(new Error("service unavailable"));
    render(<VoiceoverComposer {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "生成台词配音" }));
    await userEvent.click(screen.getByRole("button", { name: "创建配音任务" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "service unavailable",
    );
    expect(screen.getByText(p.dialogue)).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "创建配音任务" }));
    await waitFor(() => expect(p.onQueued).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledTimes(2);
  });
  it("missing configuration opens settings and running/blank dialogue disables generation", async () => {
    const p = props();
    const { rerender } = render(
      <VoiceoverComposer {...p} config={{ ...config, hasApiKey: false }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "配置台词配音" }));
    expect(p.openSettings).toHaveBeenCalledOnce();
    rerender(<VoiceoverComposer {...p} dialogue=" " />);
    expect(
      (
        screen.getByRole("button", {
          name: "生成台词配音",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    rerender(<VoiceoverComposer {...p} running />);
    expect(
      (screen.getByRole("button", { name: "配音执行中" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("canceling review never creates a task", async () => {
    render(<VoiceoverComposer {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "生成台词配音" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(post).not.toHaveBeenCalled();
  });
  it("native audio metadata warns when selected voiceover would be truncated", () => {
    const asset: any = { id: "a", url: "/voice.wav", name: "AI Voiceover.wav" };
    render(<AudioPreview asset={asset} duration={3} />);
    const audio = screen.getByLabelText("试听镜头配音");
    Object.defineProperty(audio, "duration", {
      configurable: true,
      value: 7.5,
    });
    fireEvent.loadedMetadata(audio);
    expect(screen.getByRole("status").textContent).toContain("成片会截断");
    expect(screen.getByText(/7.5s/)).toBeDefined();
  });
  it("speech fields preserve saved credentials without exposing them and edit independently", async () => {
    function Form() {
      const [value, setValue] = useState(config);
      return (
        <>
          <SpeechSettingsFields value={value} onChange={setValue} />
          <output>{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Form />);
    expect(
      (screen.getByLabelText(/语音 API Key/) as HTMLInputElement).type,
    ).toBe("password");
    fireEvent.change(screen.getByLabelText("音色 ID"), {
      target: { value: "bilingual" },
    });
    fireEvent.change(screen.getByLabelText("配音语速"), {
      target: { value: "1.25" },
    });
    expect(screen.getByRole("status").textContent).toContain(
      '"voice":"bilingual"',
    );
    expect(screen.getByRole("status").textContent).toContain('"speed":1.25');
    expect(screen.getByRole("status").textContent).not.toContain('"apiKey":');
  });
});
