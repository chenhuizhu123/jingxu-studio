import { z } from "zod";
import type { Shot } from "./model";
export const captionSourceSchema = z.object({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  start: z.number().min(0).max(86400),
  duration: z.number().min(2).max(30),
});
export const cueSchema = z.object({
  start: z.number().min(0).max(30),
  end: z.number().min(0).max(30),
  text: z
    .string()
    .min(1)
    .max(1000)
    .refine((text) => !!text.trim()),
});
export const captionTrackSchema = z
  .object({
    source: captionSourceSchema,
    origin: z.enum(["asr", "manual"]),
    createdAt: z.iso.datetime(),
    cues: z.array(cueSchema).max(300),
  })
  .superRefine((track, ctx) => {
    let end = 0;
    for (const [i, cue] of track.cues.entries()) {
      if (
        cue.end <= cue.start ||
        cue.start < end ||
        cue.end > track.source.duration + 0.001
      )
        ctx.addIssue({
          code: "custom",
          path: ["cues", i],
          message: "字幕时间必须顺序排列、不重叠且位于镜头时长内",
        });
      end = cue.end;
    }
  });
export type CaptionSource = z.infer<typeof captionSourceSchema>;
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
export function captionSource(shot: Shot): CaptionSource | undefined {
  if (shot.audioAssetId)
    return { assetId: shot.audioAssetId, start: 0, duration: shot.duration };
  const version = shot.versions.find((v) => v.id === shot.selectedVersionId);
  return version
    ? {
        assetId: version.assetId,
        start: shot.trimStart ?? 0,
        duration: shot.duration,
      }
    : undefined;
}
export function sameCaptionSource(a?: CaptionSource, b?: CaptionSource) {
  return (
    !!a &&
    !!b &&
    a.assetId === b.assetId &&
    a.start === b.start &&
    a.duration === b.duration
  );
}
export function captionsCurrent(shot: Shot) {
  return (
    !!shot.captionTrack &&
    sameCaptionSource(shot.captionTrack.source, captionSource(shot))
  );
}
export function plainSubtitle(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/-->/g, "→")
    .trim();
}
