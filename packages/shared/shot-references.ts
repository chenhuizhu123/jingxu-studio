import type { Project, Shot } from "../core/src/model";

export const imageReferenceLimit = 10;

export function referenceIds(
  project: Pick<Project, "characters">,
  shot: Pick<Shot, "referenceIds" | "characterIds">,
) {
  const cast = shot.characterIds
    .map(
      (id) =>
        project.characters.find((character) => character.id === id)
          ?.referenceId,
    )
    .filter((id): id is string => !!id);
  return [...new Set([...shot.referenceIds, ...cast])];
}

export function imagePrompt(
  project: Pick<Project, "characters" | "style">,
  shot: Shot,
) {
  return [
    shot.prompt,
    project.style,
    shot.scene,
    shot.type,
    shot.note,
    ...shot.characterIds.map((id) => {
      const character = project.characters.find((c) => c.id === id);
      return character ? `${character.name}: ${character.description}` : "";
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

export function videoPrompt(project: Pick<Project, "characters">, shot: Shot) {
  return [
    shot.prompt,
    `场景：${shot.scene}；景别：${shot.type}`,
    shot.note ? `返修要求：${shot.note}` : "",
    ...shot.characterIds.map((id) => {
      const character = project.characters.find((c) => c.id === id);
      return character
        ? `角色 ${character.name}：${character.description}`
        : "";
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

export function firstFrameSeconds(shot: Pick<Shot, "duration">) {
  return Math.max(4, Math.round(shot.duration));
}
