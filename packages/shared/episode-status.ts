import { captionsCurrent } from "../core/src/captions";
import type { Project } from "../core/src/model";

export function episodeReady(project: Pick<Project, "assets" | "shots">) {
  return (
    project.shots.length > 0 &&
    project.shots.every((shot) => {
      const selected = shot.versions.find(
        (v) => v.id === shot.selectedVersionId,
      );
      return (
        !!selected &&
        project.assets.some(
          (asset) =>
            asset.id === selected.assetId &&
            (asset.kind === "image" || asset.kind === "video"),
        ) &&
        (!shot.captionTrack || captionsCurrent(shot))
      );
    })
  );
}
