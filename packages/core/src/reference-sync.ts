import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, type Project } from "./model";
import type { Store } from "./store";

export type ReferenceSyncResult = {
  updatedEpisodes: number;
  linkedShots: number;
};

const token = z.string().regex(/^[a-f0-9]{64}$/);
const applyInput = z
  .object({
    requestId: z.uuid(),
    review: token,
    targets: z
      .array(z.object({ projectId: z.uuid(), review: token }).strict())
      .min(1)
      .max(98),
  })
  .strict();

export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function applyReviewedReferenceSync(
  store: Store,
  kind: "cast-sync-receipt" | "scene-sync-receipt",
  sourceIds: [string, string],
  input: unknown,
  alreadyApplied: string,
  apply: (
    review: string,
    targets: ReadonlyMap<string, string>,
  ) => {
    updates: Project[];
    linkedShots: number;
  },
): ReferenceSyncResult {
  const data = applyInput.parse(input);
  const chosen = new Map(
    data.targets.map((row) => [row.projectId, row.review]),
  );
  if (chosen.size !== data.targets.length)
    throw new AppError(400, "同步目标分集不能重复");
  const digest = fingerprint([...sourceIds, data.review, [...chosen].sort()]);
  const previous = store.get<{ digest: string; result: ReferenceSyncResult }>(
    kind,
    data.requestId,
  );
  if (previous) {
    if (previous.digest !== digest) throw new AppError(409, alreadyApplied);
    return previous.result;
  }
  const { updates, linkedShots } = apply(data.review, chosen);
  const result = { updatedEpisodes: updates.length, linkedShots };
  store.writeBatch([
    ...updates.map((p) => ({ kind: "project", id: p.id, value: p })),
    { kind, id: data.requestId, value: { digest, result } },
  ]);
  return result;
}
