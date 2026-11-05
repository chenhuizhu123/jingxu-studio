// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CastSyncForm, SceneSyncForm } from "../apps/studio/src/CastSync";
import { api, post } from "../apps/studio/src/api";
import { setLocale, t } from "../apps/studio/src/i18n";

vi.mock("../apps/studio/src/api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  mediaUrl: (url: string) => url,
}));

const preview = {
  review: "source-review",
  seriesName: "Rain letters",
  source: {
    projectId: "source",
    number: 1,
    title: "The letter",
    name: "Maya",
    description: "Silver locket",
    reference: { id: "p", name: "Maya portrait" },
    referenceUrl: "/media/source/portrait",
  },
  targets: [
    {
      projectId: "fill",
      number: 2,
      title: "The call",
      state: "fill",
      review: "fill-review",
    },
    {
      projectId: "replace",
      number: 3,
      title: "The answer",
      state: "replace",
      review: "replace-review",
      description: "Original coat",
    },
    { projectId: "busy", number: 4, title: "The message", state: "busy" },
  ],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each(["zh", "en"] as const)(
  "%s previews the portrait and requires an explicit selection to replace existing settings",
  async (locale) => {
    setLocale(locale);
    const onApplied = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api).mockResolvedValue(preview);
    vi.mocked(post).mockResolvedValue({ updatedEpisodes: 2, linkedShots: 5 });
    render(
      <CastSyncForm
        projectId="source"
        characterId="role"
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );
    expect(
      (await screen.findByRole("img", { name: "Maya portrait" })).getAttribute(
        "src",
      ),
    ).toBe("/media/source/portrait");
    expect(screen.getByText("Silver locket")).toBeDefined();
    expect(post).not.toHaveBeenCalled();
    const fill = screen.getByRole<HTMLInputElement>("checkbox", {
      name: /The call/,
    });
    const replace = screen.getByRole<HTMLInputElement>("checkbox", {
      name: /The answer/,
    });
    expect(fill.checked).toBe(true);
    expect(replace.checked).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: /The message/ })
        .disabled,
    ).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByText(t("查看本集当前参考")));
    expect(screen.getByText("Original coat")).toBeDefined();
    await user.click(replace);
    await user.click(screen.getByRole("button", { name: t("应用到所选分集") }));
    await waitFor(() =>
      expect(onApplied).toHaveBeenCalledWith({
        updatedEpisodes: 2,
        linkedShots: 5,
      }),
    );
    expect(post).toHaveBeenCalledExactlyOnceWith(
      "/projects/source/characters/role/cast-sync",
      {
        requestId: expect.any(String),
        review: "source-review",
        targets: [
          { projectId: "fill", review: "fill-review" },
          { projectId: "replace", review: "replace-review" },
        ],
      },
    );
  },
);

it("refreshes after a committed sync without sending it again", async () => {
  setLocale("en");
  const onApplied = vi
    .fn()
    .mockRejectedValueOnce(new Error("Refresh failed"))
    .mockResolvedValue(undefined);
  vi.mocked(api).mockResolvedValue(preview);
  vi.mocked(post).mockResolvedValue({ updatedEpisodes: 1, linkedShots: 2 });
  render(
    <CastSyncForm
      projectId="source"
      characterId="role"
      onClose={vi.fn()}
      onApplied={onApplied}
    />,
  );
  const user = userEvent.setup();
  await screen.findByRole("img", { name: "Maya portrait" });
  await user.click(screen.getByRole("button", { name: t("应用到所选分集") }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Refresh failed",
  );
  await user.click(screen.getByRole("button", { name: t("返回工作台") }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(2));
  expect(post).toHaveBeenCalledTimes(1);
});

it.each(["zh", "en"] as const)(
  "%s previews affected scene shots and defaults to adding only where no references need review",
  async (locale) => {
    setLocale(locale);
    const user = userEvent.setup();
    const onApplied = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api).mockResolvedValue({
      ...preview,
      source: {
        ...preview.source,
        name: "Café · Night",
        reference: { id: "ref", name: "Café set" },
      },
      targets: [
        {
          ...preview.targets[0],
          shots: [
            { id: "a", order: 1, title: "Door", state: "add", references: [] },
          ],
        },
        {
          ...preview.targets[1],
          state: "review",
          shots: [
            {
              id: "b",
              order: 1,
              title: "Counter",
              state: "add",
              references: ["Interior.jpg"],
            },
            {
              id: "c",
              order: 2,
              title: "Exterior",
              state: "busy",
              references: [],
            },
          ],
        },
      ],
    });
    vi.mocked(post).mockResolvedValue({ updatedEpisodes: 2, linkedShots: 2 });
    render(
      <SceneSyncForm
        projectId="source"
        shotId="shot"
        assetId="ref"
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );
    await screen.findByRole("img", { name: "Café set" });
    expect(screen.getByText("Café · Night")).toBeDefined();
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: /The call/ })
        .checked,
    ).toBe(true);
    const manual = screen.getByRole<HTMLInputElement>("checkbox", {
      name: /The answer/,
    });
    expect(manual.checked).toBe(false);
    await user.click(screen.getByText(`2 ${t("个同名场景镜头 · 查看明细")}`));
    expect(screen.getByText(/Interior\.jpg/)).toBeDefined();
    expect(screen.getByText(t("镜头正在生成"))).toBeDefined();
    await user.click(manual);
    await user.click(screen.getByRole("button", { name: t("应用到所选分集") }));
    await waitFor(() =>
      expect(onApplied).toHaveBeenCalledExactlyOnceWith({
        updatedEpisodes: 2,
        linkedShots: 2,
      }),
    );
    expect(post).toHaveBeenCalledExactlyOnceWith(
      "/projects/source/shots/shot/scene-sync/ref",
      {
        requestId: expect.any(String),
        review: "source-review",
        targets: [
          { projectId: "fill", review: "fill-review" },
          { projectId: "replace", review: "replace-review" },
        ],
      },
    );
  },
);
