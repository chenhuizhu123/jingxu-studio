// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  FirstFilmLauncher,
  FirstFilmProgress,
} from "../apps/studio/src/FirstFilm";
import { setLocale } from "../apps/studio/src/i18n";
import type { Job } from "../packages/core/src/model";

afterEach(cleanup);

it.each([
  ["zh", "打开试用工程", "正在打开示例"],
  ["en", "Open the sample project", "Opening sample"],
] as const)(
  "%s opens the local trial and disables the pending action",
  async (locale, label, busyLabel) => {
    setLocale(locale);
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <FirstFilmLauncher onOpen={onOpen} opening={false} disabled={false} />,
    );
    await user.click(screen.getByRole("button", { name: label }));
    expect(onOpen).toHaveBeenCalledOnce();
    rerender(<FirstFilmLauncher onOpen={onOpen} opening disabled />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: busyLabel })
        .disabled,
    ).toBe(true);
  },
);

it("shows actual job progress, failures and available deliverables", () => {
  setLocale("en");
  const { rerender } = render(<FirstFilmProgress hasVideo={false} />);
  expect(screen.queryByRole("progressbar")).toBeNull();
  const job = {
    id: "render",
    projectId: "trial",
    type: "export",
    state: "running",
    progress: 43,
    message: "",
    createdAt: "",
    updatedAt: "",
    provider: "local",
    attempts: 1,
  } satisfies Job;
  rerender(<FirstFilmProgress job={job} hasVideo={false} />);
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("43");
  rerender(
    <FirstFilmProgress
      job={{ ...job, state: "failed", error: "Fixture: disk full" }}
      hasVideo={false}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("failed");
  expect(screen.getByText("Fixture: disk full")).toBeDefined();
  rerender(<FirstFilmProgress job={{ ...job, state: "succeeded" }} hasVideo />);
  expect(screen.getByRole("status").textContent).toContain("MP4 and SRT");
});
