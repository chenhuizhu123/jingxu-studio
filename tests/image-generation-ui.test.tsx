// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShotEditor } from "../apps/studio/src/main";
import { setLocale, t } from "../apps/studio/src/i18n";
import {
  addVersion,
  buildStoryboard,
  createProject,
  defaultSettings,
  now,
} from "../packages/core/src/model";

afterEach(cleanup);

it.each(["zh", "en"] as const)(
  "%s reviews provider and references before submitting a paid generation",
  async (language) => {
    setLocale(language);
    const source = createProject({
      name: "Scene",
      script: "Cast: Maya\nMaya: A close-up in the rain.",
    });
    buildStoryboard(source, "en");
    const shot = source.shots[0];
    const first = {
      id: "first",
      kind: "image" as const,
      mime: "image/png",
      name: "Selected image.png",
      file: "media/first.png",
      url: "/media/first.png",
      size: 500,
      createdAt: now(),
    };
    addVersion(source, shot.id, first, shot.prompt, "imported", "imported");
    const reference = {
      ...first,
      id: "reference",
      name: "Cast reference.png",
      file: "media/ref.png",
      url: "/media/ref.png",
    };
    source.characters[0].referenceId = reference.id;
    const project = { ...source, assets: [first, reference], exports: [] };
    const image = {
      endpoint: "https://image.example/api/v3",
      model: "seedream-test",
      hasApiKey: true,
    };
    const video = {
      ...defaultSettings.generation,
      provider: "ark" as const,
      endpoint: "https://video.example/api/v3",
      model: "seedance-test",
      hasApiKey: true,
    };
    const submit = vi.fn().mockResolvedValue(true);
    const noop = vi.fn().mockResolvedValue(true);
    render(
      <ShotEditor
        shot={shot}
        project={project}
        image={image}
        video={video}
        onImageRequest={submit}
        busy={false}
        running={false}
        onSave={noop}
        onGenerate={noop}
        onImport={noop}
        onDelete={noop}
        onVisualReview={noop}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t("生成图片候选") }));
    expect(submit).not.toHaveBeenCalled();
    const imageDialog = within(
      screen.getByRole("dialog", { name: t("确认生成图片") }),
    );
    expect(imageDialog.getByText(image.endpoint)).toBeDefined();
    expect(imageDialog.getByText(reference.name)).toBeDefined();
    expect(imageDialog.getByText(/A close-up in the rain/)).toBeDefined();
    await user.click(
      imageDialog.getByRole("button", { name: t("确认并加入队列") }),
    );
    expect(submit).toHaveBeenNthCalledWith(1, "image", {
      endpoint: image.endpoint,
      model: image.model,
      revision: source.revision,
      assetId: undefined,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      screen.getByRole("button", { name: t("用选中图片生成视频") }),
    );
    const videoDialog = within(
      screen.getByRole("dialog", { name: t("确认用首帧生成视频") }),
    );
    expect(videoDialog.getByRole("img", { name: first.name })).toBeDefined();
    expect(videoDialog.queryByText(reference.name)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    await user.click(
      videoDialog.getByRole("button", { name: t("确认并加入队列") }),
    );
    expect(submit).toHaveBeenNthCalledWith(2, "first-frame", {
      endpoint: video.endpoint,
      model: video.model,
      revision: source.revision,
      assetId: first.id,
    });
  },
);
