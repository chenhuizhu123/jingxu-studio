import { statSync } from "node:fs";
import {
  AppError,
  defaultCharacterDescription,
  id,
  invalidateCharacterReview,
  now,
  type Asset,
  type Character,
  type Project,
} from "./model";
import { seriesEpisodes } from "./series";
import type { Store } from "./store";
import { applyReviewedReferenceSync, fingerprint } from "./reference-sync";

export type CastSyncState =
  | "fill"
  | "replace"
  | "same"
  | "missing"
  | "ambiguous"
  | "busy"
  | "asset-limit";
export type CastSyncTarget = {
  projectId: string;
  number: number;
  title: string;
  state: CastSyncState;
  characterId?: string;
  description?: string;
  reference?: Pick<Asset, "id" | "name">;
  review?: string;
  linkedShots?: number;
};
export type CastSyncPlan = {
  review: string;
  seriesName: string;
  source: {
    projectId: string;
    number: number;
    title: string;
    name: string;
    description: string;
    reference: Pick<Asset, "id" | "name">;
  };
  targets: CastSyncTarget[];
};
const nameKey = (value: string) => value.normalize("NFC").trim().toLowerCase();
const publicAsset = ({ id, name }: Asset) => ({ id, name });

function reusableAsset(project: Project, source: Asset, character: Character) {
  return project.assets.find(
    (a) =>
      a.kind === "image" &&
      a.file === source.file &&
      (!a.characterId || a.characterId === character.id),
  );
}

function inspect(store: Store, projectId: string, characterId: string) {
  const source = store.project(projectId);
  if (!source.episode) throw new AppError(400, "请从短剧系列中的分集同步角色");
  const character = source.characters.find((c) => c.id === characterId);
  if (!character) throw new AppError(404, "角色不存在");
  const portrait = source.assets.find(
    (a) => a.kind === "image" && a.id === character.referenceId,
  );
  if (!portrait) throw new AppError(400, "请先为源角色绑定定妆图");
  const info = statSync(store.path(portrait.file), { throwIfNoEntry: false });
  if (!info?.isFile()) throw new AppError(400, "源角色的定妆图文件已丢失");
  const review = fingerprint([
    source.id,
    source.episode,
    character,
    portrait,
    info.size,
    info.mtimeMs,
  ]);
  const episodes = seriesEpisodes(store, source.episode.seriesId).filter(
    (p) => p.id !== source.id,
  );
  const active = store
    .jobs()
    .filter(
      (j) =>
        (j.type === "generate" || j.type === "image") &&
        (j.state === "queued" || j.state === "running"),
    );
  const targets = episodes.map((p): CastSyncTarget => {
    const row = { projectId: p.id, number: p.episode!.number, title: p.name };
    const matches = p.characters.filter(
      (c) => nameKey(c.name) === nameKey(character.name),
    );
    if (!matches.length) return { ...row, state: "missing" };
    if (matches.length > 1) return { ...row, state: "ambiguous" };
    const c = matches[0];
    const current = p.assets.find(
      (a) => a.kind === "image" && a.id === c.referenceId,
    );
    const linked = p.shots.filter((s) => s.characterIds.includes(c.id));
    const detail = {
      ...row,
      characterId: c.id,
      description: c.description,
      reference: current && publicAsset(current),
      linkedShots: linked.length,
    };
    if (
      current?.file === portrait.file &&
      c.description === character.description
    )
      return { ...detail, state: "same" };
    if (
      active.some(
        (j) => j.projectId === p.id && linked.some((s) => s.id === j.shotId),
      )
    )
      return { ...detail, state: "busy" };
    if (p.assets.length >= 1000 && !reusableAsset(p, portrait, c))
      return { ...detail, state: "asset-limit" };
    const customDescription =
      c.description.trim() &&
      !Object.values(defaultCharacterDescription).includes(c.description);
    return {
      ...detail,
      state:
        c.referenceId ||
        (customDescription && c.description !== character.description)
          ? "replace"
          : "fill",
      review: fingerprint([review, p.id, p.revision, c]),
    };
  });
  const plan: CastSyncPlan = {
    review,
    seriesName: source.episode.seriesName,
    source: {
      projectId: source.id,
      number: source.episode.number,
      title: source.name,
      name: character.name,
      description: character.description,
      reference: publicAsset(portrait),
    },
    targets,
  };
  return { plan, episodes, portrait };
}

export function previewCastSync(
  store: Store,
  projectId: string,
  characterId: string,
) {
  return inspect(store, projectId, characterId).plan;
}

export function applyCastSync(
  store: Store,
  projectId: string,
  characterId: string,
  input: unknown,
) {
  return applyReviewedReferenceSync(
    store,
    "cast-sync-receipt",
    [projectId, characterId],
    input,
    "同步请求已处理，请重新打开角色同步",
    (sourceReview, chosen) => {
      const { plan, episodes, portrait } = inspect(
        store,
        projectId,
        characterId,
      );
      const changed = () =>
        new AppError(409, "角色参考或目标分集已改变，请重新预览同步");
      if (plan.review !== sourceReview) throw changed();
      const updates: Project[] = [];
      let linkedShots = 0;
      for (const [targetId, review] of chosen) {
        const target = plan.targets.find((row) => row.projectId === targetId);
        const episode = episodes.find((p) => p.id === targetId);
        if (!episode || !target || !target.review || target.review !== review)
          throw changed();
        const c = episode.characters.find((c) => c.id === target.characterId)!;
        let asset = reusableAsset(episode, portrait, c);
        if (!asset) {
          // Image files are immutable. Each episode owns its metadata and ZIP entry.
          asset = {
            ...portrait,
            id: id(),
            characterId: c.id,
            createdAt: now(),
          };
          episode.assets.push(asset);
        }
        c.description = plan.source.description;
        c.referenceId = asset.id;
        linkedShots += invalidateCharacterReview(episode, c.id);
        episode.revision++;
        episode.updatedAt = now();
        updates.push(episode);
      }
      return { updates, linkedShots };
    },
  );
}
