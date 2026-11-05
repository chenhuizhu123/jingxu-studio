import { join } from "node:path";
import { importProjectPackage } from "./package-archive";
import type { Project } from "./model";
import type { Store } from "./store";

const recordKind = "first-film-sample";
const languages = ["zh", "en"] as const;
export type SampleLanguage = (typeof languages)[number];

export function createFirstFilmSamples(store: Store, directory: string) {
  const pending = new Map<SampleLanguage, Promise<Project>>();
  const saved = (language: SampleLanguage) =>
    store.get<{ projectId: string }>(recordKind, language)?.projectId;

  return {
    languageFor(projectId: string) {
      return languages.find((language) => saved(language) === projectId);
    },
    open(language: SampleLanguage): Promise<Project> {
      const projectId = saved(language);
      const project = projectId && store.get<Project>("project", projectId);
      if (project) return Promise.resolve(project);
      const underway = pending.get(language);
      if (underway) return underway;

      const task = importProjectPackage(
        store,
        join(directory, `jingxu-rain-sample-${language}.zip`),
        undefined,
        (p) => {
          store.writeBatch([
            { kind: "project", id: p.id, value: p },
            { kind: recordKind, id: language, value: { projectId: p.id } },
          ]);
        },
      ).finally(() => pending.delete(language));
      pending.set(language, task);
      return task;
    },
  };
}
