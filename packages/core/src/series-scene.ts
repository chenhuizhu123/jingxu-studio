import { statSync } from "node:fs";
import { AppError, getShot, id, now, updateShot, type Project } from "./model";
import {
  referenceIds,
  imageReferenceLimit,
} from "../../shared/shot-references";
import { applyReviewedReferenceSync, fingerprint } from "./reference-sync";
import { seriesEpisodes } from "./series";
import type { Store } from "./store";

type ShotState = "add" | "same" | "busy" | "reference-limit" | "asset-limit";
export type SceneSyncState = "fill" | "review" | "same" | "missing" | "blocked";
type SceneSyncTarget = {
  projectId: string;
  number: number;
  title: string;
  state: SceneSyncState;
  review?: string;
  shots: {
    id: string;
    order: number;
    title: string;
    state: ShotState;
    references: string[];
  }[];
};
export type SceneSyncPlan = {
  review: string;
  seriesName: string;
  source: {
    projectId: string;
    number: number;
    title: string;
    name: string;
    reference: { id: string; name: string };
  };
  targets: SceneSyncTarget[];
};

const sceneKey = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();

function inspect(
  store: Store,
  projectId: string,
  shotId: string,
  assetId: string,
) {
  const source = store.project(projectId);
  if (!source.episode) throw new AppError(400, "请从短剧系列中的分集同步场景");
  const shot = getShot(source, shotId);
  const key = sceneKey(shot.scene);
  if (!key || ["待确认场景", "scene to confirm"].includes(key))
    throw new AppError(400, "请先保存明确的场景名称");
  const image = source.assets.find(
    (a) =>
      a.id === assetId &&
      a.kind === "image" &&
      shot.referenceIds.includes(a.id),
  );
  if (!image) throw new AppError(400, "请先为源镜头绑定这张参考图");
  const info = statSync(store.path(image.file), { throwIfNoEntry: false });
  if (!info?.isFile()) throw new AppError(400, "源场景的参考图文件已丢失");
  if (info.size > 15 * 1024 * 1024)
    throw new AppError(400, "单张参考图不能超过 15 MB");
  const review = fingerprint([
    source.id,
    source.episode,
    shot.id,
    shot.scene,
    image,
    info.size,
    info.mtimeMs,
  ]);
  const episodes = seriesEpisodes(store, source.episode.seriesId).filter(
    (p) => p.id !== source.id,
  );
  const active = new Set(
    store
      .jobs()
      .filter(
        (j) =>
          (j.type === "generate" || j.type === "image") &&
          (j.state === "queued" || j.state === "running"),
      )
      .map((j) => `${j.projectId}/${j.shotId}`),
  );
  const candidates = episodes.map((episode) => {
    const images = episode.assets.filter((a) => a.kind === "image");
    const imagesById = new Map(images.map((a) => [a.id, a]));
    const reusable = images.find(
      (a) => !a.characterId && a.file === image.file,
    );
    const shots: SceneSyncTarget["shots"] = episode.shots
      .filter((s) => sceneKey(s.scene) === key)
      .map((s) => {
        const references = s.referenceIds.map(
          (id) => imagesById.get(id)?.name ?? id,
        );
        let state: ShotState = "add";
        if (
          s.referenceIds.some((id) => imagesById.get(id)?.file === image.file)
        )
          state = "same";
        else if (active.has(`${episode.id}/${s.id}`)) state = "busy";
        else if (
          s.referenceIds.length >= 20 ||
          referenceIds(episode, s).length >= imageReferenceLimit
        )
          state = "reference-limit";
        else if (!reusable && episode.assets.length >= 1000)
          state = "asset-limit";
        return { id: s.id, order: s.order, title: s.title, state, references };
      });
    const eligible = shots.filter((s) => s.state === "add");
    let state: SceneSyncState = "missing";
    if (eligible.length)
      state = shots.some((s) => s.state !== "add" || s.references.length)
        ? "review"
        : "fill";
    else if (shots.length)
      state = shots.every((s) => s.state === "same") ? "same" : "blocked";
    const target: SceneSyncTarget = {
      projectId: episode.id,
      number: episode.episode!.number,
      title: episode.name,
      state,
      shots,
      review: eligible.length
        ? fingerprint([review, episode.id, episode.revision, shots])
        : undefined,
    };
    return { episode, target, eligible, reusable };
  });
  const plan: SceneSyncPlan = {
    review,
    seriesName: source.episode.seriesName,
    source: {
      projectId: source.id,
      number: source.episode.number,
      title: source.name,
      name: shot.scene,
      reference: { id: image.id, name: image.name },
    },
    targets: candidates.map((row) => row.target),
  };
  return { plan, image, candidates };
}

export function previewSceneSync(
  store: Store,
  projectId: string,
  shotId: string,
  assetId: string,
) {
  return inspect(store, projectId, shotId, assetId).plan;
}

export function applySceneSync(
  store: Store,
  projectId: string,
  shotId: string,
  assetId: string,
  input: unknown,
) {
  return applyReviewedReferenceSync(
    store,
    "scene-sync-receipt",
    [`${projectId}/${shotId}`, assetId],
    input,
    "同步请求已处理，请重新打开场景同步",
    (review, chosen) => {
      const { plan, image, candidates } = inspect(
        store,
        projectId,
        shotId,
        assetId,
      );
      const changed = () =>
        new AppError(409, "场景参考或目标镜头已改变，请重新预览同步");
      if (review !== plan.review) throw changed();
      const updates: Project[] = [];
      let linkedShots = 0;
      for (const [targetId, token] of chosen) {
        const row = candidates.find(({ episode }) => episode.id === targetId);
        if (!row || !row.target.review || token !== row.target.review)
          throw changed();
        const { episode, eligible, reusable } = row;
        const asset = reusable ?? {
          ...image,
          id: id(),
          characterId: undefined,
          createdAt: now(),
        };
        if (!reusable) episode.assets.push(asset);
        for (const { id } of eligible) {
          const shot = getShot(episode, id);
          updateShot(episode, id, {
            referenceIds: [...shot.referenceIds, asset.id],
          });
        }
        linkedShots += eligible.length;
        episode.revision++;
        episode.updatedAt = now();
        updates.push(episode);
      }
      return { updates, linkedShots };
    },
  );
}
