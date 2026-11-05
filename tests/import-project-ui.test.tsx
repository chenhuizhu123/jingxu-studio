// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../apps/studio/src/api", () => ({ api: vi.fn() }));
import { api } from "../apps/studio/src/api";
import { ImportProjectForm } from "../apps/studio/src/ImportProject";
import { setLocale, t } from "../apps/studio/src/i18n";
const imported: any = { id: "restored", name: "Restored project" };
beforeEach(() => {
  vi.resetAllMocks();
  setLocale("zh");
});
afterEach(cleanup);
it.each(["zh", "en"] as const)(
  "%s keeps the series upload receipt across a retry and opens the confirmed copy",
  async (locale) => {
    setLocale(locale);
    const restoredSeries = { seriesId: "new-series", projects: [imported] };
    const onImported = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValue(restoredSeries);
    render(
      <ImportProjectForm series onImported={onImported} onClose={vi.fn()} />,
    );
    const file = new File(["PK test"], "season.zip", {
      type: "application/zip",
    });
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(t("整季工程 ZIP")), file);
    await user.click(screen.getByRole("button", { name: t("恢复为新剧集") }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Connection interrupted",
    );
    await user.click(screen.getByRole("button", { name: t("恢复为新剧集") }));
    await waitFor(() =>
      expect(onImported).toHaveBeenCalledWith(restoredSeries),
    );
    const calls = vi.mocked(api).mock.calls;
    expect(calls.map(([path]) => path)).toEqual([
      "/series/import",
      "/series/import",
    ]);
    const [first, second] = calls.map(([, init]) => init?.body as FormData);
    expect(first.get("file")).toBe(file);
    expect(first.get("requestId")).toMatch(/^[a-f0-9-]{36}$/);
    expect(second.get("requestId")).toBe(first.get("requestId"));
  },
);
function setup() {
  const props = {
    onClose: vi.fn(),
    onImported: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(<ImportProjectForm {...props} />);
  const input = screen.getByLabelText("项目包 ZIP");
  return { props, view, input };
}
describe("Project restore form in memory DOM", () => {
  it("uploads a real File as multipart and opens the returned project", async () => {
    vi.mocked(api).mockResolvedValue(imported);
    const { props, input } = setup();
    const file = new File(["PK test"], "my-project.zip", {
      type: "application/zip",
    });
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    await waitFor(() =>
      expect(props.onImported).toHaveBeenCalledWith(imported),
    );
    const [path, options] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("/projects/import");
    expect(options?.method).toBe("POST");
    expect((options?.body as FormData).get("file")).toBe(file);
    expect(options?.signal).toBeDefined();
  });
  it("keeps the selected file and error visible after a failed import", async () => {
    vi.mocked(api).mockRejectedValue(new Error("项目包缺少引用的素材"));
    const { props, input } = setup();
    await userEvent.upload(input, new File(["PK"], "broken.zip"));
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "项目包缺少引用的素材",
    );
    expect(props.onImported).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).files?.[0].name).toBe("broken.zip");
    expect(
      (
        screen.getByRole("button", {
          name: "导入为新项目",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("retries opening a committed project without uploading it a second time", async () => {
    vi.mocked(api).mockResolvedValue(imported);
    const { props, input } = setup();
    props.onImported.mockRejectedValueOnce(new Error("Refresh failed"));
    await userEvent.upload(input, new File(["PK"], "project.zip"));
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    await screen.findByRole("alert");
    await userEvent.click(
      screen.getByRole("button", { name: "打开已导入项目" }),
    );
    await waitFor(() => expect(props.onImported).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("rejects wrong file extensions and packages over 2 GB before sending", async () => {
    const { input } = setup();
    fireEvent.change(input, {
      target: { files: [new File(["text"], "notes.txt")] },
    });
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    expect(screen.getByRole("alert").textContent).toContain("ZIP");
    const large = new File(["PK"], "large.zip");
    Object.defineProperty(large, "size", { value: 2 * 1024 ** 3 + 1 });
    fireEvent.change(input, { target: { files: [large] } });
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    expect(screen.getByRole("alert").textContent).toContain("2 GB");
    expect(api).not.toHaveBeenCalled();
  });
  it("aborts an in-flight request when the form is dismissed", async () => {
    vi.mocked(api).mockReturnValue(new Promise(() => {}));
    const { props, view, input } = setup();
    await userEvent.upload(input, new File(["PK"], "project.zip"));
    await userEvent.click(screen.getByRole("button", { name: "导入为新项目" }));
    await screen.findByRole("status");
    expect(
      (
        screen.getByRole("button", {
          name: "导入为新项目",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "取消等待" }));
    expect(vi.mocked(api).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(props.onClose).toHaveBeenCalledOnce();
    view.unmount();
  });
  it("localizes restore instructions and actions in English", () => {
    setLocale("en");
    render(
      <ImportProjectForm onClose={() => {}} onImported={async () => {}} />,
    );
    expect(screen.getByLabelText("Project ZIP")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Import as a new project" }),
    ).toBeDefined();
    expect(
      screen.getByText(/API keys and tool permissions stay/),
    ).toBeDefined();
  });
});
