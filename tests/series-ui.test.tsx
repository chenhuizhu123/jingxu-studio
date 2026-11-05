// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeriesBoard, SeriesImportForm } from "../apps/studio/src/Series";
import { post } from "../apps/studio/src/api";
import { setLocale, t } from "../apps/studio/src/i18n";
import { buildStoryboard, createProject } from "../packages/core/src/model";

vi.mock("../apps/studio/src/api", () => ({
  post: vi.fn(),
  download: vi.fn(),
  mediaUrl: (url: string) => url,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each(["zh", "en"] as const)(
  "%s previews the exact opening and ending before creating episode projects",
  async (locale) => {
    setLocale(locale);
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const opening = "Maya: Who sent this?",
      ending = "The light goes out.";
    const script = `Episode 1: The letter\n${opening}\n${ending}`;
    vi.mocked(post)
      .mockResolvedValueOnce({
        review: "reviewed",
        marked: true,
        name: "Rain Letters",
        episodes: [
          {
            number: 1,
            title: "The letter",
            opening,
            ending,
            shotCount: 2,
            script,
          },
        ],
      })
      .mockResolvedValueOnce({ seriesId: "series-id", projects: [] });
    render(<SeriesImportForm close={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText(t("剧集名称")), {
      target: { value: "Rain Letters" },
    });
    fireEvent.change(screen.getByLabelText(t("剧本 / 小说片段")), {
      target: { value: script },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t("预览分集") }));
    const article = await screen.findByRole("article");
    expect(within(article).getByText(opening)).toBeDefined();
    expect(within(article).getByText(ending)).toBeDefined();
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: t("创建分集项目") }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("series-id"));
    expect(post).toHaveBeenNthCalledWith(
      1,
      "/series/preview",
      expect.objectContaining({ script }),
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/series",
      expect.objectContaining({
        script,
        review: "reviewed",
        requestId: expect.any(String),
      }),
    );
  },
);

it("reopens a committed series after refresh fails without sending another creation request", async () => {
  setLocale("en");
  const onCreated = vi
    .fn()
    .mockRejectedValueOnce(new Error("Refresh failed"))
    .mockResolvedValue(undefined);
  vi.mocked(post)
    .mockResolvedValueOnce({
      review: "reviewed",
      marked: false,
      name: "Rain Letters",
      episodes: [],
    })
    .mockResolvedValueOnce({ seriesId: "series-id", projects: [] });
  render(<SeriesImportForm close={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Series name"), {
    target: { value: "Rain Letters" },
  });
  fireEvent.change(screen.getByLabelText(t("剧本 / 小说片段")), {
    target: { value: "Story." },
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Preview episodes" }));
  await user.click(
    await screen.findByRole("button", { name: "Create episode projects" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Refresh failed",
  );
  await user.click(screen.getByRole("button", { name: "Open series" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
  expect(post).toHaveBeenCalledTimes(2);
});

it("groups matching episodes, sorts by episode number and links the batch delivery", async () => {
  setLocale("en");
  const first = createProject({
    name: "The letter",
    script: "Maya: Who sent this?",
  });
  const second = createProject({ name: "The call" });
  buildStoryboard(first, "en");
  first.episode = { seriesId: "series", seriesName: "Rain Letters", number: 1 };
  second.episode = { ...first.episode, number: 2 };
  const firstVideo = {
    id: "render",
    kind: "video" as const,
    file: "exports/v.mp4",
    url: "/download/signed",
    size: 10,
    revision: 1,
    name: "The letter.mp4",
    createdAt: first.createdAt,
  };
  const openEpisode = vi.fn(),
    appendEpisodes = vi.fn();
  render(
    <SeriesBoard
      projects={[
        {
          ...second,
          exports: [],
          seriesDeliveryUrl: "/series-delivery/signed",
          seriesPackageUrl: "/series-package/signed",
        },
        {
          ...first,
          exports: [firstVideo],
          seriesDeliveryUrl: "/series-delivery/signed",
          seriesPackageUrl: "/series-package/signed",
        },
      ]}
      jobs={[]}
      query="THE CALL"
      busy={false}
      openEpisode={openEpisode}
      appendEpisodes={appendEpisodes}
      onRender={vi.fn()}
      onDelete={vi.fn()}
      onError={vi.fn()}
    />,
  );
  const group = within(screen.getByRole("region", { name: "Rain Letters" }));
  const list = group.getAllByRole("listitem");
  expect(list[0].textContent).toContain("The letter");
  expect(list[1].textContent).toContain("The call");
  expect(
    group.getByRole("link", { name: "Export editable series" }),
  ).toHaveProperty("pathname", "/series-package/signed");
  expect(
    group.getByRole("link", { name: "Download videos and subtitles ZIP" }),
  ).toHaveProperty("pathname", "/series-delivery/signed");
  const user = userEvent.setup();
  await user.click(group.getByRole("button", { name: /Episode 2.*The call/ }));
  expect(openEpisode).toHaveBeenCalledWith(second.id);
  await user.click(group.getByRole("button", { name: "Add episodes" }));
  expect(appendEpisodes).toHaveBeenCalledWith(
    expect.objectContaining({ id: "series", name: "Rain Letters" }),
  );
});
