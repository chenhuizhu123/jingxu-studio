import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { createServer, type Server } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, stat, unlink, readdir } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { captionSourceSchema } from "../../../packages/core/src/captions";
import { z } from "zod";
import matter from "gray-matter";
import { version } from "../../../package.json";
import { Store } from "../../../packages/core/src/store";
import {
  AppError,
  createProject,
  projectInput,
  id,
  now,
  updateShot,
  reorderShots,
  buildStoryboard,
  addVersion,
  inspectProject,
  invalidateCharacterReview,
  makeSrt,
  storyboardCsv,
  settingsInput,
  type Asset,
  type Project,
  type Job,
  getShot,
} from "../../../packages/core/src/model";
import {
  createDemoAsset,
  exportArchive,
} from "../../../packages/core/src/media";
import { endpoint, redactError } from "../../../packages/core/src/providers";
import { JobQueue } from "../../../packages/core/src/queue";
import { McpHub } from "../../../packages/core/src/mcp";
import { DirectorAgent, readSkills } from "../../../packages/core/src/agent";
import { reviewShot } from "../../../packages/core/src/vision";
import {
  importProjectPackage,
  recoverInterruptedImports,
} from "../../../packages/core/src/package-archive";
import { createFirstFilmSamples } from "../../../packages/core/src/first-film";
import { packageLimits } from "../../../packages/core/src/project-package";
import {
  createSeriesEpisodes,
  planSeries,
  seriesEpisodes,
} from "../../../packages/core/src/series";
import { episodeReady } from "../../../packages/shared/episode-status";
import { seriesDelivery } from "../../../packages/core/src/series-delivery";
import {
  exportSeriesPackage,
  importSeriesPackage,
} from "../../../packages/core/src/series-package";
import {
  applyCastSync,
  previewCastSync,
} from "../../../packages/core/src/series-cast";
import {
  applySceneSync,
  previewSceneSync,
} from "../../../packages/core/src/series-scene";

export type ServerOptions = {
  root: string;
  port?: number;
  host?: string;
  studioRoot?: string;
  sampleRoot?: string;
  skillRoot?: string;
  wasmPath?: string;
  token?: string;
  seed?: boolean;
  startQueue?: boolean;
  allowedOrigins?: string[];
};
export async function createApp(options: ServerOptions) {
  const store = await Store.open(options.root, options.wasmPath);
  await recoverInterruptedImports(store);
  const tokenFile = join(options.root, ".session-token");
  if (!existsSync(tokenFile))
    writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  const token = options.token ?? readFileSync(tokenFile, "utf8");
  const queue = new JobQueue(store),
    mcp = new McpHub(store),
    skillRoot = options.skillRoot ?? resolve("packages/core/skills"),
    agent = new DirectorAgent(store, skillRoot, mcp);
  const firstFilm = createFirstFilmSamples(
    store,
    options.sampleRoot ?? resolve("apps/website/src/samples"),
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  const allowed = new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
    ...(options.allowedOrigins ?? []),
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const localOrigin = origin === `http://${req.headers.host}`;
    if (origin && !localOrigin && !allowed.has(origin))
      return res.status(403).json({ error: "不允许的来源" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,X-Jingxu-Token",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version, product: "镜序 Studio" }),
  );
  const same = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const authorized = (req: Request) => {
    const bearer =
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ??
      req.headers["x-jingxu-token"] ??
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("jx_session="))
        ?.slice(11);
    return typeof bearer === "string" && same(bearer, token);
  };
  app.get("/api/session", (req, res) => {
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    );
    const origin = req.headers.origin;
    const acceptableHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(
      req.headers.host ?? "",
    );
    if (
      !authorized(req) &&
      !(
        local &&
        acceptableHost &&
        (!origin ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.startsWith("http://localhost:"))
      )
    )
      return res.status(401).json({ error: "请先输入工作站配对令牌" });
    res.setHeader("Cache-Control", "no-store");
    res.cookie("jx_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: req.secure,
    });
    res.json({ token, version });
  });
  app.use("/api", (req, res, next) => {
    if (!authorized(req))
      return res.status(401).json({ error: "连接已失效，请重新连接工作站" });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const sign = (path: string, expires: string) =>
    createHmac("sha256", token).update(`${path}:${expires}`).digest("hex");
  const mediaUrl = (path: string) => {
    const expires = String(
      Math.ceil(Date.now() / (10 * 60 * 1000)) * 10 * 60 * 1000 +
        10 * 60 * 1000,
    );
    return `${path}?expires=${expires}&signature=${sign(path, expires)}`;
  };
  function exportSubtitle(e: Project["exports"][number]) {
    if (e.kind !== "video") return undefined;
    const file =
      e.subtitlesFile ??
      (/\.mp4$/i.test(e.file) ? e.file.replace(/\.mp4$/i, ".srt") : undefined);
    return file && existsSync(store.path(file)) ? file : undefined;
  }
  function decorate(p: Project) {
    return {
      ...p,
      firstFilmSample: firstFilm.languageFor(p.id),
      seriesDeliveryUrl: p.episode
        ? mediaUrl(`/series-delivery/${p.episode.seriesId}`)
        : undefined,
      seriesPackageUrl: p.episode
        ? mediaUrl(`/series-package/${p.episode.seriesId}`)
        : undefined,
      assets: p.assets.map((a) => ({
        ...a,
        url: mediaUrl(`/media/${p.id}/${a.id}`),
      })),
      exports: p.exports.map((e) => ({
        ...e,
        url: mediaUrl(`/download/${p.id}/${e.id}`),
        subtitlesUrl: exportSubtitle(e)
          ? mediaUrl(`/download/${p.id}/${e.id}/subtitles`)
          : undefined,
      })),
    };
  }
  const route =
    (handler: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => handler(req, res))
        .catch(next);
  const param = (req: Request, key: string) => String(req.params[key]);
  const language = (req: Request) =>
    req.headers["accept-language"]?.startsWith("en") ? "en" : "zh";
  app.post(
    "/api/series/preview",
    route((req, res) => res.json(planSeries(store, req.body, language(req)))),
  );
  app.post(
    "/api/series",
    route((req, res) => {
      const result = createSeriesEpisodes(store, req.body, language(req));
      res.status(result.created ? 201 : 200).json({
        seriesId: result.seriesId,
        projects: result.projects.map(decorate),
      });
    }),
  );
  app.post(
    "/api/series/:id/render",
    route((req, res) => {
      const episodes = seriesEpisodes(store, param(req, "id"));
      if (!episodes.length) throw new AppError(404, "剧集不存在");
      const active = new Set(
        store
          .jobs()
          .filter(
            (job) =>
              job.type === "export" &&
              ["queued", "running"].includes(job.state),
          )
          .map((job) => job.projectId),
      );
      const jobs: Job[] = [],
        skipped: { projectId: string; reason: "busy" | "incomplete" }[] = [];
      for (const episode of episodes) {
        if (active.has(episode.id))
          skipped.push({ projectId: episode.id, reason: "busy" });
        else if (!episodeReady(episode))
          skipped.push({ projectId: episode.id, reason: "incomplete" });
        else jobs.push(queue.enqueue(episode.id, "export"));
      }
      res.status(202).json({ jobs, skipped });
    }),
  );
  app.post(
    "/api/samples/first-film",
    route(async (req, res) => {
      const project = await firstFilm.open(language(req));
      if (!res.destroyed) res.json(decorate(project));
    }),
  );
  app.get(
    "/api/projects",
    route((_req, res) => res.json(store.projects().map(decorate))),
  );
  app.post(
    "/api/projects",
    route((req, res) => {
      const p = createProject(req.body);
      store.put("project", p.id, p);
      res.status(201).json(decorate(p));
    }),
  );
  app.get(
    "/api/projects/:id",
    route((req, res) => res.json(decorate(store.project(param(req, "id"))))),
  );
  const incoming = join(store.root, "incoming");
  await mkdir(incoming, { recursive: true, mode: 0o700 });
  // Before accepting uploads, remove only Multer's owned crash leftovers.
  for (const file of await readdir(incoming, { withFileTypes: true })) {
    if (file.isFile() && /^[a-f0-9]{32}$/.test(file.name))
      await unlink(join(incoming, file.name));
  }
  const importUpload = multer({
    dest: incoming,
    limits: { fileSize: packageLimits.totalBytes, files: 1 },
  });
  async function withUploadedPackage<T>(
    req: Request,
    res: Response,
    read: (file: string, signal: AbortSignal) => Promise<T>,
  ) {
    if (!req.file) throw new AppError(400, "请选择项目包 ZIP 文件");
    const file = req.file.path;
    const controller = new AbortController();
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", disconnected);
    try {
      if (res.destroyed) disconnected();
      return await read(file, controller.signal);
    } finally {
      res.off("close", disconnected);
      await unlink(file).catch(() => {});
    }
  }
  app.post(
    "/api/projects/import",
    importUpload.single("file"),
    route(async (req, res) => {
      const project = await withUploadedPackage(req, res, (file, signal) =>
        importProjectPackage(store, file, signal),
      );
      if (!res.destroyed) res.status(201).json(decorate(project));
    }),
  );
  app.post(
    "/api/series/import",
    importUpload.single("file"),
    route(async (req, res) => {
      const result = await withUploadedPackage(req, res, (file, signal) =>
        importSeriesPackage(
          store,
          file,
          z.uuid().parse(req.body.requestId),
          signal,
        ),
      );
      if (!res.destroyed)
        res.status(result.created ? 201 : 200).json({
          seriesId: result.seriesId,
          projects: result.projects.map(decorate),
        });
    }),
  );
  app.patch(
    "/api/projects/:id",
    route((req, res) => {
      const patch = projectInput
        .partial()
        .extend({
          revision: z.number().int().optional(),
          musicAssetId: z.string().nullable().optional(),
          musicVolume: z.number().min(0).max(1).optional(),
          burnSubtitles: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const { revision, ...fields } = patch;
      const p = store.mutate(
        param(req, "id"),
        (p) => {
          if (
            fields.musicAssetId &&
            !p.assets.some(
              (a) => a.id === fields.musicAssetId && a.kind === "audio",
            )
          )
            throw new AppError(400, "背景音乐素材不存在");
          Object.assign(p, fields, {
            musicAssetId:
              fields.musicAssetId === null
                ? undefined
                : (fields.musicAssetId ?? p.musicAssetId),
          });
        },
        revision,
      );
      res.json(decorate(p));
    }),
  );
  app.delete(
    "/api/projects/:id",
    route((req, res) => {
      const key = param(req, "id");
      store.project(key);
      if (
        store
          .jobs()
          .some(
            (j) =>
              j.projectId === key && ["queued", "running"].includes(j.state),
          )
      )
        throw new AppError(409, "请先取消该项目的运行任务");
      store.delete("project", key);
      for (const a of store.approvals().filter((a) => a.projectId === key))
        store.delete("approval", a.id);
      res.sendStatus(204);
    }),
  );
  app.post(
    "/api/projects/:id/storyboard",
    route((req, res) => {
      const key = param(req, "id");
      const p = store.mutate(key, (p) => {
        if (p.shots.some((s) => s.versions.length))
          throw new AppError(409, "已有镜头素材，请创建副本后重新拆镜");
        if (!p.script.trim()) throw new AppError(400, "请先输入剧本");
        buildStoryboard(
          p,
          req.headers["accept-language"]?.startsWith("en") ? "en" : "zh",
        );
      });
      res.json(decorate(p));
    }),
  );
  app.post(
    "/api/projects/:id/duplicate",
    route((req, res) => {
      const { episode: _episode, ...source } = store.project(param(req, "id"));
      const p = {
        ...structuredClone(source),
        id: id(),
        name: `${source.name} · 副本`,
        revision: 1,
        createdAt: now(),
        updatedAt: now(),
        exports: [],
        messages: [],
      };
      store.put("project", p.id, p);
      res.status(201).json(decorate(p));
    }),
  );
  app.post(
    "/api/projects/:id/shots",
    route((req, res) => {
      const p = store.mutate(param(req, "id"), (p) => {
        if (p.shots.length >= 60)
          throw new AppError(400, "单项目最多 60 个镜头");
        p.shots.push({
          id: id(),
          order: p.shots.length + 1,
          title: "新镜头",
          scene: "待确认场景",
          type: "中景",
          duration: 4,
          dialogue: "",
          prompt: "",
          characterIds: [],
          referenceIds: [],
          versions: [],
          review: "pending",
          note: "",
        });
      });
      res.json(decorate(p));
    }),
  );
  app.post(
    "/api/projects/:id/reorder",
    route((req, res) => {
      const p = store.mutate(
        param(req, "id"),
        (p) => {
          reorderShots(p, req.body.shotIds);
        },
        z.number().int().parse(req.body.revision),
      );
      res.json(decorate(p));
    }),
  );
  app.patch(
    "/api/projects/:id/shots/:shotId",
    route((req, res) => {
      const { revision, ...patch } = req.body;
      const expected =
        revision === undefined ? undefined : z.number().int().parse(revision);
      const p = store.mutate(
        param(req, "id"),
        (p) => {
          updateShot(p, param(req, "shotId"), patch);
        },
        expected,
      );
      res.json(decorate(p));
    }),
  );
  app.delete(
    "/api/projects/:id/shots/:shotId",
    route((req, res) => {
      const key = param(req, "id"),
        shotId = param(req, "shotId");
      if (
        store
          .jobs()
          .some(
            (j) =>
              j.projectId === key &&
              j.shotId === shotId &&
              ["queued", "running"].includes(j.state),
          )
      )
        throw new AppError(409, "请先取消该镜头的任务");
      const p = store.mutate(key, (p) => {
        getShot(p, shotId);
        p.shots = p.shots.filter((s) => s.id !== shotId);
        p.shots.forEach((s, i) => (s.order = i + 1));
      });
      res.json(decorate(p));
    }),
  );
  app.post(
    "/api/projects/:id/characters",
    route((req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(1).max(100),
          description: z.string().max(3000).default(""),
        })
        .parse(req.body);
      res.json(
        decorate(
          store.mutate(param(req, "id"), (p) => {
            p.characters.push({ ...data, id: id() });
          }),
        ),
      );
    }),
  );
  app.patch(
    "/api/projects/:id/characters/:characterId",
    route((req, res) => {
      const data = z
        .object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(3000).optional(),
          referenceId: z.string().nullable().optional(),
        })
        .strict()
        .parse(req.body);
      res.json(
        decorate(
          store.mutate(param(req, "id"), (p) => {
            const c = p.characters.find(
              (c) => c.id === param(req, "characterId"),
            );
            if (!c) throw new AppError(404, "角色不存在");
            if (
              data.referenceId &&
              !p.assets.some(
                (a) => a.id === data.referenceId && a.kind === "image",
              )
            )
              throw new AppError(400, "参考图不存在");
            const previous = { ...c };
            Object.assign(c, data, {
              referenceId:
                data.referenceId === null
                  ? undefined
                  : (data.referenceId ?? c.referenceId),
            });
            if (
              previous.name !== c.name ||
              previous.description !== c.description ||
              previous.referenceId !== c.referenceId
            )
              invalidateCharacterReview(p, c.id);
          }),
        ),
      );
    }),
  );
  app.get(
    "/api/projects/:id/characters/:characterId/cast-sync",
    route((req, res) => {
      const plan = previewCastSync(
        store,
        param(req, "id"),
        param(req, "characterId"),
      );
      res.json({
        ...plan,
        source: {
          ...plan.source,
          referenceUrl: mediaUrl(
            `/media/${plan.source.projectId}/${plan.source.reference.id}`,
          ),
        },
        targets: plan.targets.map((target) => ({
          ...target,
          referenceUrl: target.reference
            ? mediaUrl(`/media/${target.projectId}/${target.reference.id}`)
            : undefined,
        })),
      });
    }),
  );
  app.post(
    "/api/projects/:id/characters/:characterId/cast-sync",
    route((req, res) =>
      res.json(
        applyCastSync(
          store,
          param(req, "id"),
          param(req, "characterId"),
          req.body,
        ),
      ),
    ),
  );
  const sceneSyncPath = "/api/projects/:id/shots/:shotId/scene-sync/:assetId";
  app.get(
    sceneSyncPath,
    route((req, res) => {
      const plan = previewSceneSync(
        store,
        param(req, "id"),
        param(req, "shotId"),
        param(req, "assetId"),
      );
      res.json({
        ...plan,
        source: {
          ...plan.source,
          referenceUrl: mediaUrl(
            `/media/${plan.source.projectId}/${plan.source.reference.id}`,
          ),
        },
      });
    }),
  );
  app.post(
    sceneSyncPath,
    route((req, res) =>
      res.json(
        applySceneSync(
          store,
          param(req, "id"),
          param(req, "shotId"),
          param(req, "assetId"),
          req.body,
        ),
      ),
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/projects/:id/assets",
    upload.single("file"),
    route(async (req, res) => {
      const key = param(req, "id");
      store.project(key);
      const file = req.file;
      if (!file) throw new AppError(400, "请选择文件");
      const ext = extname(file.originalname).toLowerCase();
      const kinds: Record<string, { kind: Asset["kind"]; mime: string }> = {
        ".png": { kind: "image", mime: "image/png" },
        ".jpg": { kind: "image", mime: "image/jpeg" },
        ".jpeg": { kind: "image", mime: "image/jpeg" },
        ".webp": { kind: "image", mime: "image/webp" },
        ".mp4": { kind: "video", mime: "video/mp4" },
        ".mp3": { kind: "audio", mime: "audio/mpeg" },
        ".wav": { kind: "audio", mime: "audio/wav" },
        ".txt": { kind: "document", mime: "text/plain" },
        ".srt": { kind: "document", mime: "text/plain" },
      };
      const info = kinds[ext];
      if (!info)
        throw new AppError(400, "支持 PNG/JPG/WebP、MP4、MP3/WAV、TXT/SRT");
      if (info.kind === "image") {
        const sharp = (await import("sharp")).default;
        await sharp(file.buffer).metadata();
      }
      if (
        info.kind === "video" &&
        (file.buffer.length < 12 ||
          file.buffer.toString("ascii", 4, 8) !== "ftyp")
      )
        throw new AppError(400, "文件不是有效 MP4");
      const assetId = id(),
        relative = `media/${assetId}${ext}`;
      await writeFile(store.path(relative), file.buffer);
      const asset: Asset = {
        id: assetId,
        name: file.originalname.replace(/[\/\\\x00-\x1f]/g, "_").slice(0, 200),
        file: relative,
        ...info,
        size: file.size,
        createdAt: now(),
      };
      const p = store.mutate(key, (p) => {
        p.assets.push(asset);
      });
      res.status(201).json(decorate(p));
    }),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/import",
    route((req, res) => {
      const assetId = z.string().parse(req.body.assetId);
      const p = store.mutate(param(req, "id"), (p) => {
        const a = p.assets.find(
          (a) => a.id === assetId && ["image", "video"].includes(a.kind),
        );
        if (!a) throw new AppError(400, "请选择项目内的图片或视频");
        addVersion(
          p,
          param(req, "shotId"),
          a,
          "手动导入素材",
          "local",
          "imported",
        );
      });
      res.json(decorate(p));
    }),
  );
  app.get(
    "/api/projects/:id/check",
    route((req, res) =>
      res.json(inspectProject(store.project(param(req, "id")))),
    ),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/visual-review",
    route(async (req, res) =>
      res.json(await reviewShot(store, param(req, "id"), param(req, "shotId"))),
    ),
  );
  app.get(
    "/api/projects/:id/subtitles",
    route((req, res) => {
      res
        .type("text/plain")
        .send(makeSrt(store.project(param(req, "id")).shots));
    }),
  );
  app.get(
    "/api/projects/:id/storyboard.csv",
    route((req, res) =>
      res.type("text/csv").send(storyboardCsv(store.project(param(req, "id")))),
    ),
  );
  app.post(
    "/api/projects/:id/generate",
    route((req, res) => {
      const key = param(req, "id"),
        shotIds = z.array(z.string()).min(1).max(60).parse(req.body.shotIds);
      const p = store.project(key);
      for (const s of shotIds) getShot(p, s);
      const jobs: Job[] = [],
        skipped: string[] = [];
      for (const shotId of [...new Set(shotIds)]) {
        try {
          jobs.push(queue.enqueue(key, "generate", shotId));
        } catch (e) {
          if (e instanceof AppError && e.status === 409) skipped.push(shotId);
          else throw e;
        }
      }
      res.status(202).json({ jobs, skipped });
    }),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/image",
    route((req, res) => {
      const input = z
        .object({
          revision: z.number().int().positive(),
          endpoint: z.string().max(2000),
          model: z.string().max(200),
        })
        .strict()
        .parse(req.body);
      res
        .status(202)
        .json(
          queue.enqueueImage(
            param(req, "id"),
            param(req, "shotId"),
            input.revision,
            input,
          ),
        );
    }),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/first-frame",
    route((req, res) => {
      const input = z
        .object({
          revision: z.number().int().positive(),
          endpoint: z.string().max(2000),
          model: z.string().max(200),
          assetId: z.string().min(1).max(100),
        })
        .strict()
        .parse(req.body);
      res
        .status(202)
        .json(
          queue.enqueue(
            param(req, "id"),
            "generate",
            param(req, "shotId"),
            input,
          ),
        );
    }),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/speech",
    route((req, res) => {
      const input = z
        .object({ text: z.string().trim().min(1).max(3000) })
        .strict()
        .parse(req.body);
      res
        .status(202)
        .json(
          queue.enqueueSpeech(
            param(req, "id"),
            param(req, "shotId"),
            input.text,
          ),
        );
    }),
  );
  app.post(
    "/api/projects/:id/shots/:shotId/transcribe",
    route((req, res) => {
      const data = z
        .object({ source: captionSourceSchema })
        .strict()
        .parse(req.body);
      res
        .status(202)
        .json(
          queue.enqueueTranscription(
            param(req, "id"),
            param(req, "shotId"),
            data.source,
          ),
        );
    }),
  );
  app.post(
    "/api/projects/:id/render",
    route((req, res) =>
      res.status(202).json(queue.enqueue(param(req, "id"), "export")),
    ),
  );
  app.post(
    "/api/projects/:id/archive",
    route(async (req, res) => {
      const key = param(req, "id");
      const exported = await exportArchive(store, store.project(key));
      res.json(decorate(store.mutate(key, (p) => p.exports.push(exported))));
    }),
  );
  app.get(
    "/api/jobs",
    route((_req, res) => res.json(store.jobs())),
  );
  app.post(
    "/api/jobs/:id/cancel",
    route((req, res) => res.json(queue.cancel(param(req, "id")))),
  );
  app.post(
    "/api/jobs/:id/retry",
    route((req, res) => res.status(202).json(queue.retry(param(req, "id")))),
  );
  app.get(
    "/api/settings",
    route((_req, res) => res.json(store.publicSettings())),
  );
  app.put(
    "/api/settings",
    route((req, res) => {
      const parsed = settingsInput.parse(req.body),
        old = store.settings();
      if (parsed.generation.endpoint) endpoint(parsed.generation.endpoint);
      if (parsed.agent.endpoint) endpoint(parsed.agent.endpoint);
      if (parsed.image?.endpoint) endpoint(parsed.image.endpoint);
      if (parsed.speech?.endpoint) endpoint(parsed.speech.endpoint);
      if (parsed.transcription?.endpoint)
        endpoint(parsed.transcription.endpoint);
      if (new Set(parsed.mcp.map((s) => s.id)).size !== parsed.mcp.length)
        throw new AppError(400, "MCP 服务 ID 不能重复");
      for (const m of parsed.mcp) {
        if (m.transport === "http") endpoint(m.url ?? "");
        else if (!m.command?.trim())
          throw new AppError(400, "本地 MCP 服务需要启动命令");
      }
      store.saveSettings({
        ...parsed,
        image: parsed.image
          ? { ...parsed.image, apiKey: parsed.image.apiKey ?? old.image.apiKey }
          : old.image,
        transcription: parsed.transcription
          ? {
              ...parsed.transcription,
              apiKey: parsed.transcription.apiKey ?? old.transcription.apiKey,
            }
          : old.transcription,
        speech: parsed.speech
          ? {
              ...parsed.speech,
              apiKey: parsed.speech.apiKey ?? old.speech.apiKey,
            }
          : old.speech,
        generation: {
          ...parsed.generation,
          apiKey: parsed.generation.apiKey ?? old.generation.apiKey,
        },
        agent: {
          ...parsed.agent,
          apiKey: parsed.agent.apiKey ?? old.agent.apiKey,
        },
      });
      res.json(store.publicSettings());
    }),
  );
  app.get(
    "/api/skills",
    route(async (_req, res) => res.json(await readSkills(store, skillRoot))),
  );
  app.post(
    "/api/skills",
    route(async (req, res) => {
      const data = z
        .object({
          name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
          description: z.string().min(1).max(1000),
          content: z.string().min(1).max(40000),
        })
        .parse(req.body);
      await writeFile(
        store.path(`skills/${data.name}.md`),
        matter.stringify(data.content, {
          name: data.name,
          description: data.description,
        }),
      );
      res.status(201).json({ ok: true });
    }),
  );
  app.get(
    "/api/projects/:id/agent-runs",
    route((req, res) => res.json(agent.runs(param(req, "id")))),
  );
  app.post(
    "/api/projects/:id/chat",
    route(async (req, res) => {
      const data = z
        .object({
          text: z.string().trim().min(1).max(10000),
          skill: z.string().optional(),
        })
        .parse(req.body);
      res.json({
        text: await agent.chat(
          param(req, "id"),
          data.text,
          data.skill,
          req.headers["accept-language"]?.startsWith("en") ? "en" : "zh",
        ),
      });
    }),
  );
  app.get(
    "/api/mcp/:id/tools",
    route(async (req, res) => res.json(await mcp.tools(param(req, "id")))),
  );
  app.get(
    "/api/approvals",
    route((_req, res) => res.json(store.approvals())),
  );
  app.post(
    "/api/approvals/:id/decide",
    route(async (req, res) =>
      res.json(
        await mcp.decide(param(req, "id"), z.boolean().parse(req.body.approve)),
      ),
    ),
  );
  app.get(
    "/api/backup",
    route((_req, res) => {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="jingxu-backup.json"',
      );
      res.json({
        format: "jingxu-backup-v1",
        createdAt: now(),
        projects: store.projects(),
      });
    }),
  );
  app.get(
    "/api/connection",
    route((_req, res) =>
      res.json({
        token,
        host: options.host ?? "127.0.0.1",
        port: options.port ?? 4318,
        note: "手机连接需要可达的 HTTPS 工作站地址，配对令牌等同工作站访问权限。",
      }),
    ),
  );
  function mediaAuth(req: Request, res: Response, next: NextFunction) {
    const expires = String(req.query.expires ?? ""),
      signature = String(req.query.signature ?? "");
    if (
      authorized(req) ||
      (/^\d+$/.test(expires) &&
        Number(expires) > Date.now() &&
        Number(expires) < Date.now() + 21 * 60 * 1000 &&
        same(signature, sign(req.path, expires)))
    )
      return next();
    res.status(401).json({ error: "素材链接已过期，请刷新项目" });
  }
  async function sendZip(
    res: Response,
    zip: NodeJS.ReadableStream,
    filename: string,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    res.attachment(filename);
    try {
      await pipeline(zip, res);
    } catch (error) {
      if (!res.destroyed) throw error;
    }
  }
  app.get(
    "/series-delivery/:id",
    mediaAuth,
    route(async (req, res) => {
      const id = param(req, "id");
      const zip = await seriesDelivery(store, seriesEpisodes(store, id));
      await sendZip(res, zip, `Jingxu-series-${id.slice(0, 8)}.zip`);
    }),
  );
  app.get(
    "/series-package/:id",
    mediaAuth,
    route(async (req, res) => {
      const id = param(req, "id");
      const zip = await exportSeriesPackage(store, seriesEpisodes(store, id));
      await sendZip(res, zip, `Jingxu-series-project-${id.slice(0, 8)}.zip`);
    }),
  );
  app.get(
    "/media/:projectId/:assetId",
    mediaAuth,
    route((req, res) => {
      const p = store.project(param(req, "projectId")),
        a = p.assets.find((a) => a.id === param(req, "assetId"));
      if (!a) throw new AppError(404, "素材不存在");
      res.type(a.mime).sendFile(store.path(a.file));
    }),
  );
  app.get(
    "/download/:projectId/:exportId",
    mediaAuth,
    route((req, res) => {
      const p = store.project(param(req, "projectId")),
        e = p.exports.find((e) => e.id === param(req, "exportId"));
      if (!e) throw new AppError(404, "导出不存在");
      res.download(store.path(e.file), e.name);
    }),
  );
  app.get(
    "/download/:projectId/:exportId/subtitles",
    mediaAuth,
    route((req, res) => {
      const p = store.project(param(req, "projectId")),
        e = p.exports.find((e) => e.id === param(req, "exportId"));
      const file = e && exportSubtitle(e);
      if (!e || !file) throw new AppError(404, "该导出没有保存字幕文件");
      res.download(store.path(file), e.name.replace(/\.mp4$/i, "") + ".srt");
    }),
  );
  if (options.studioRoot && existsSync(options.studioRoot)) {
    app.use(express.static(options.studioRoot, { index: "index.html" }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(join(options.studioRoot!, "index.html")),
    );
  }
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (res.destroyed) return;
      const status =
        error instanceof AppError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error instanceof multer.MulterError
              ? 413
              : 500;
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}：${i.message}`)
              .join("；")
          : redactError(error, store.settings());
      res.status(status).json({ error: message });
    },
  );
  if (options.seed !== false && store.projects().length === 0) {
    const p = createProject({
      name: "雨夜来信",
      description: "一封迟到三年的信，让两个陌生人的命运在雨夜交汇。",
      style: "电影写实 · 雨夜青绿色调",
      script:
        "角色：林晚、陈序\n雨夜，旧城的末班公交刚刚离站。林晚独自站在便利店门前。\n林晚：这封信，为什么现在才送到？\n陈序从雨中走来，手里握着另一封一模一样的信。\n陈序：因为写信的人，三年前就已经离开了。\n林晚抬头，便利店的灯忽然熄灭。\n街对面的电话亭里，一部没有接线的电话响了。",
    });
    buildStoryboard(p);
    for (const [i, s] of p.shots.entries()) {
      s.scene = i < 4 ? "旧城便利店 · 夜 · 雨" : "街口电话亭 · 夜 · 雨";
      s.duration = 4;
      const asset = await createDemoAsset(store, i);
      addVersion(p, s.id, asset, s.prompt, "demo", "demo");
    }
    p.characters.forEach((c, i) => {
      c.description =
        i === 0
          ? "26 岁女性，深色短发，灰绿色风衣，内敛而坚定。"
          : "30 岁男性，黑色短发，深色大衣，沉静。";
      c.referenceId = p.assets[i].id;
    });
    store.put("project", p.id, p);
  }
  if (options.startQueue !== false) queue.start();
  return {
    app,
    store,
    queue,
    token,
    close: async () => {
      await queue.close();
      store.close();
    },
  };
}
export async function startServer(options: ServerOptions) {
  const instance = await createApp(options);
  const server = createServer(instance.app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4318, options.host ?? "127.0.0.1", () =>
      resolve(),
    );
  });
  const address = server.address();
  return {
    ...instance,
    server,
    port: typeof address === "object" && address ? address.port : 4318,
    close: async () => {
      await instance.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
