import { captionsCurrent } from "../core/src/captions";
import type { Project } from "../core/src/model";

export function episodeBlockers(project: Pick<Project, "assets" | "shots">) {
  const media = new Set(
    project.assets
      .filter((a) => a.kind === "image" || a.kind === "video")
      .map((a) => a.id),
  );
  return project.shots.flatMap((shot) => {
    const selected = shot.versions.find((v) => v.id === shot.selectedVersionId);
    const missingMedia = !selected || !media.has(selected.assetId);
    const staleCaptions = !!shot.captionTrack && !captionsCurrent(shot);
    return missingMedia || staleCaptions
      ? [{ shot, missingMedia, staleCaptions }]
      : [];
  });
}

export function episodeReady(project: Pick<Project, "assets" | "shots">) {
  return project.shots.length > 0 && episodeBlockers(project).length === 0;
}
