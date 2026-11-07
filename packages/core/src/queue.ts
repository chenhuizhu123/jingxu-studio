import { setTimeout as delay } from "node:timers/promises";
import PQueue from "p-queue";
import {
  transcribeShot,
  transcriptionAsset,
  validateTranscription,
  recoverTranscriptionFiles,
} from "./transcription";
import { sameCaptionSource, type CaptionSource } from "./captions";
import { rm } from "node:fs/promises";
import {
  synthesizeSpeech,
  validateSpeechConfig,
  recoverSpeechFiles,
} from "./speech";
import {
  addVersion,
  getShot,
  id,
  now,
  AppError,
  type Job,
  type Settings,
  type Asset,
} from "./model";
import {
  generateShotImage,
  imageReferences,
  recoverGeneratedImages,
  validateImageConfig,
} from "./image-generation";
import {
  firstFrameSeconds,
  imagePrompt,
  referenceIds,
} from "../../shared/shot-references";
import type { Store } from "./store";
import { episodeBlockers } from "../../shared/episode-status";
import { createDemoAsset, renderVideo, renderAnimatic } from "./media";
import {
  downloadVideo,
  generationState,
  pollGeneration,
  redactError,
  submitGeneration,
} from "./providers";
import type { LicenseGate } from "./license";

export class JobQueue {
  private active = new Map<string, AbortController>();
  private queue?: PQueue;
  private admitted = new Set<string>();
  private stopped = false;
  constructor(
    private store: Store,
    private license?: LicenseGate,
  ) {}
  start() {
    if (this.queue) return;
    recoverSpeechFiles(this.store);
    recoverTranscriptionFiles(this.store);
    recoverGeneratedImages(this.store);
    for (const j of this.store.jobs().filter((j) => j.state === "running")) {
      if (j.phase === "submitting" && !j.remoteId && j.provider !== "demo") {
        this.save({
          ...j,
          state: "failed",
          message: "提交结果未知，请先在生成服务后台核对，避免重复计费",
          error: "重启时任务处于提交阶段；未自动再次提交。",
        });
      } else
        this.save({
          ...j,
          state: "queued",
          message: j.remoteId
            ? "已恢复，继续查询远程任务"
            : "已恢复，等待继续执行",
        });
    }
    this.queue = new PQueue({ concurrency: this.store.settings().concurrency });
    this.admit();
  }
  // Move persisted queued jobs into p-queue. Jobs are admitted newest-first to
  // preserve the previous scheduler's ordering; admission is idempotent.
  private admit() {
    const queue = this.queue;
    if (!queue || this.stopped) return;
    queue.concurrency = this.store.settings().concurrency;
    for (const j of this.store
      .jobs()
      .filter((j) => j.state === "queued")
      .reverse()) {
      if (this.admitted.has(j.id)) continue;
      this.admitted.add(j.id);
      void queue.add(() => this.execute(j.id));
    }
  }
  refreshConcurrency() {
    if (this.queue && !this.stopped)
      this.queue.concurrency = this.store.settings().concurrency;
  }
  private async execute(jobId: string) {
    try {
      const job = this.store.get<Job>("job", jobId);
      // A queued job can be cancelled while waiting for a free slot.
      if (!job || job.state !== "queued") return;
      const controller = new AbortController();
      this.active.set(jobId, controller);
      await this.run(job, controller.signal);
    } finally {
      this.active.delete(jobId);
      this.admitted.delete(jobId);
      this.admit();
    }
  }
  private save(job: Job) {
    job.updatedAt = now();
    this.store.put("job", job.id, job);
    return job;
  }
  enqueue(
    projectId: string,
    type: Exclude<Job["type"], "image">,
    shotId?: string,
    firstFrame?: {
      assetId: string;
      revision: number;
      endpoint: string;
      model: string;
    },
  ) {
    if (type === "transcribe")
      return this.enqueueTranscription(projectId, shotId!);
    if (type === "speech") return this.enqueueSpeech(projectId, shotId!);
    if (type === "animatic") {
      const ap = this.store.project(projectId);
      if (!ap.shots.length) throw new AppError(400, "请先添加分镜");
      if (
        this.store
          .jobs()
          .some(
            (j) =>
              j.projectId === projectId &&
              (j.type === "animatic" || j.type === "export") &&
              ["queued", "running"].includes(j.state),
          )
      )
        throw new AppError(409, "已有渲染任务，请等待完成");
      const animaticJob: Job = {
        id: id(),
        projectId,
        type,
        state: "queued",
        progress: 0,
        message: "等待预演",
        createdAt: now(),
        updatedAt: now(),
        provider: "local",
        attempts: 0,
        exportRevision: ap.revision,
      };
      this.store.put("snapshot", animaticJob.id, ap);
      const saved = this.save(animaticJob);
      this.admit();
      return saved;
    }
    const p = this.store.project(projectId),
      settings = this.store.settings();
    if (type === "generate") {
      this.license?.assertActive();
      if (!shotId) throw new AppError(400, "缺少镜头");
      const s = getShot(p, shotId);
      if (firstFrame) {
        if (settings.generation.provider !== "ark")
          throw new AppError(400, "首帧生成需要配置 Seedance 视频服务");
        if (
          p.revision !== firstFrame.revision ||
          settings.generation.endpoint !== firstFrame.endpoint ||
          settings.generation.model !== firstFrame.model
        )
          throw new AppError(409, "项目或视频服务已更新，请刷新后重新确认");
        if (
          !s.versions.some(
            (v) =>
              v.id === s.selectedVersionId && v.assetId === firstFrame.assetId,
          )
        )
          throw new AppError(409, "当前选片已改变，请重新确认首帧");
        imageReferences(p, [firstFrame.assetId]);
      }
      if (
        this.store
          .jobs()
          .some(
            (j) =>
              j.projectId === projectId &&
              j.shotId === shotId &&
              j.type === "generate" &&
              ["queued", "running"].includes(j.state),
          )
      )
        throw new AppError(409, "该镜头已有生成任务");
      if (
        settings.generation.provider !== "demo" &&
        (!settings.generation.apiKey || !settings.generation.model)
      )
        throw new AppError(400, "请在设置中配置视频 API Key 和模型");
      const job: Job = {
        id: id(),
        projectId,
        shotId,
        type,
        state: "queued",
        progress: 0,
        message: "等待执行",
        createdAt: now(),
        updatedAt: now(),
        provider: settings.generation.provider,
        attempts: 0,
        prompt: firstFrame
          ? s.prompt
          : s.prompt + (s.note ? `\nRepair instructions: ${s.note}` : ""),
        firstFrameAssetId: firstFrame?.assetId,
        referenceIds: [...s.referenceIds],
        duration: firstFrame ? firstFrameSeconds(s) : s.duration,
      };
      this.store.put("snapshot", job.id, p);
      this.store.put("job-config", job.id, {
        ...settings.generation,
        apiKey: this.store.encrypt(settings.generation.apiKey),
      });
      this.save(job);
      this.admit();
      return job;
    }
    const blockers = episodeBlockers(p);
    if (!p.shots.length || blockers.some((b) => b.missingMedia))
      throw new AppError(400, "请为每个镜头选择素材后再渲染");
    if (blockers.some((b) => b.staleCaptions))
      throw new AppError(409, "音轨或剪辑已改变，请重新核对字幕");
    if (
      this.store
        .jobs()
        .some(
          (j) =>
            j.projectId === projectId &&
            j.type === "export" &&
            ["queued", "running"].includes(j.state),
        )
    )
      throw new AppError(409, "已有成片渲染任务");
    const job: Job = {
      id: id(),
      projectId,
      type,
      state: "queued",
      progress: 0,
      message: "等待渲染",
      createdAt: now(),
      updatedAt: now(),
      provider: "local",
      attempts: 0,
      exportRevision: p.revision,
    };
    this.store.put("snapshot", job.id, p);
    const exported = this.save(job);
    this.admit();
    return exported;
  }
  enqueueImage(
    projectId: string,
    shotId: string,
    revision: number,
    destination: Pick<Settings["image"], "endpoint" | "model">,
  ) {
    this.license?.assertActive();
    const project = this.store.project(projectId),
      shot = getShot(project, shotId);
    const config = this.store.settings().image;
    validateImageConfig(config);
    if (
      project.revision !== revision ||
      config.endpoint !== destination.endpoint ||
      config.model !== destination.model
    )
      throw new AppError(409, "项目或图片服务已更新，请刷新后重新确认");
    if (!shot.prompt.trim())
      throw new AppError(400, "请先填写并保存镜头提示词");
    const refs = referenceIds(project, shot);
    imageReferences(project, refs);
    if (
      this.store
        .jobs()
        .some(
          (j) =>
            j.projectId === projectId &&
            j.shotId === shotId &&
            j.type === "image" &&
            ["queued", "running"].includes(j.state),
        )
    )
      throw new AppError(409, "该镜头已有图片生成任务");
    const job: Job = {
      id: id(),
      projectId,
      shotId,
      type: "image",
      state: "queued",
      progress: 0,
      message: "等待生成图片",
      createdAt: now(),
      updatedAt: now(),
      provider: "seedream",
      attempts: 0,
      prompt: imagePrompt(project, shot),
      referenceIds: refs,
    };
    this.store.put("snapshot", job.id, project);
    this.store.put("image-config", job.id, {
      ...config,
      apiKey: this.store.encrypt(config.apiKey),
    });
    const imageJob = this.save(job);
    this.admit();
    return imageJob;
  }
  enqueueSpeech(projectId: string, shotId: string, expectedText?: string) {
    this.license?.assertActive();
    const p = this.store.project(projectId),
      shot = getShot(p, shotId),
      config = this.store.settings().speech;
    validateSpeechConfig(config);
    const text = shot.dialogue.trim();
    if (!text || text.length > 3000)
      throw new AppError(400, "请填写不超过 3000 字的镜头对白");
    if (expectedText !== undefined && text !== expectedText.trim())
      throw new AppError(409, "对白已改变，请保存并重新确认配音内容");
    if (
      this.store
        .jobs()
        .some(
          (j) =>
            j.projectId === projectId &&
            j.shotId === shotId &&
            j.type === "speech" &&
            ["queued", "running"].includes(j.state),
        )
    )
      throw new AppError(409, "该镜头已有配音任务");
    const job: Job = {
      id: id(),
      projectId,
      shotId,
      type: "speech",
      state: "queued",
      progress: 0,
      message: "配音等待执行",
      createdAt: now(),
      updatedAt: now(),
      provider: "speech-compatible",
      attempts: 0,
      speechText: text,
    };
    this.store.put("snapshot", job.id, p);
    this.store.put("speech-config", job.id, {
      ...config,
      apiKey: this.store.encrypt(config.apiKey),
    });
    const speechJob = this.save(job);
    this.admit();
    return speechJob;
  }
  enqueueTranscription(
    projectId: string,
    shotId: string,
    expected?: CaptionSource,
  ) {
    this.license?.assertActive();
    const p = this.store.project(projectId),
      shot = getShot(p, shotId),
      config = this.store.settings().transcription;
    validateTranscription(config);
    const { source } = transcriptionAsset(p, shot);
    if (expected && !sameCaptionSource(source, expected))
      throw new AppError(409, "音轨或剪辑已改变，请重新核对字幕");
    if (
      this.store
        .jobs()
        .some(
          (j) =>
            j.projectId === projectId &&
            j.shotId === shotId &&
            j.type === "transcribe" &&
            ["queued", "running"].includes(j.state),
        )
    )
      throw new AppError(409, "该镜头已有识别任务");
    const job: Job = {
      id: id(),
      projectId,
      shotId,
      type: "transcribe",
      provider: "transcription-compatible",
      state: "queued",
      progress: 0,
      message: "等待识别镜头音轨",
      createdAt: now(),
      updatedAt: now(),
      attempts: 0,
      usage: { seconds: source.duration },
    };
    this.store.put("snapshot", job.id, p);
    this.store.put("asr-config", job.id, {
      ...config,
      apiKey: this.store.encrypt(config.apiKey),
    });
    const saved = this.save(job);
    this.admit();
    return saved;
  }
  cancel(jobId: string) {
    const j = this.store.get<Job>("job", jobId);
    if (!j) throw new AppError(404, "任务不存在");
    if (!["queued", "running"].includes(j.state))
      throw new AppError(409, "任务已结束");
    this.active.get(jobId)?.abort();
    return this.save({
      ...j,
      state: "cancelled",
      message:
        j.remoteId ||
        j.phase === "submitting" ||
        ["speech", "transcribe"].includes(j.type)
          ? "已停止本地跟踪；远程服务可能继续执行，请到服务后台确认"
          : "任务已取消",
    });
  }
  retry(jobId: string) {
    const j = this.store.get<Job>("job", jobId);
    if (!j) throw new AppError(404, "任务不存在");
    if (!["failed", "cancelled"].includes(j.state))
      throw new AppError(409, "只能重试失败或取消的任务");
    if (this.active.has(jobId))
      throw new AppError(409, "任务正在结束，请稍后重试");
    if (j.type === "image" || j.firstFrameAssetId)
      throw new AppError(
        409,
        "请回到镜头重新确认生成内容，提交前核对服务商记录",
      );
    return this.enqueue(j.projectId, j.type, j.shotId);
  }
  private async run(job: Job, signal: AbortSignal) {
    const settings = this.store.settings();
    const speech = this.store.get<Settings["speech"]>("speech-config", job.id);
    const savedConfig = this.store.get<Settings["generation"]>(
      "job-config",
      job.id,
    );
    if (savedConfig)
      settings.generation = {
        ...savedConfig,
        apiKey: this.store.decrypt(savedConfig.apiKey),
      };
    try {
      if (job.type === "transcribe") {
        const saved = this.store.get<Settings["transcription"]>(
          "asr-config",
          job.id,
        );
        if (!saved) throw new AppError(500, "缺少识别配置快照");
        settings.transcription = {
          ...saved,
          apiKey: this.store.decrypt(saved.apiKey),
        };
      }
      if (job.type === "speech" && speech)
        settings.speech = {
          ...speech,
          apiKey: this.store.decrypt(speech.apiKey),
        };
      this.save({
        ...job,
        state: "running",
        attempts: job.attempts + 1,
        message:
          job.type === "export" || job.type === "animatic"
            ? "正在合成镜头"
            : "正在准备镜头",
        progress: 5,
      });
      if (job.type === "image") {
        const config = this.store.get<Settings["image"]>(
          "image-config",
          job.id,
        );
        const snapshot = this.store.get<ReturnType<Store["project"]>>(
          "snapshot",
          job.id,
        );
        if (!config || !snapshot || !job.prompt)
          throw new AppError(500, "缺少图片生成任务快照");
        settings.image = {
          ...config,
          apiKey: this.store.decrypt(config.apiKey),
        };
        getShot(this.store.project(job.projectId), job.shotId!);
        const asset = await generateShotImage(
          this.store,
          settings.image,
          snapshot,
          job.prompt,
          job.referenceIds ?? [],
          signal,
          () =>
            this.save({
              ...this.current(job.id),
              phase: "submitting",
              progress: 15,
              message: "正在生成图片，请勿重复提交",
            }),
        );
        const resultId = await this.saveCandidate(
          job,
          asset,
          getShot(snapshot, job.shotId!).prompt,
          signal,
        );
        this.save({
          ...this.current(job.id),
          state: "succeeded",
          progress: 100,
          message: "图片候选已保存",
          resultId,
        });
        return;
      }
      if (job.type === "speech") {
        if (!speech || !job.speechText)
          throw new AppError(500, "缺少配音任务快照");
        const snapshot = this.store.get<ReturnType<Store["project"]>>(
          "snapshot",
          job.id,
        );
        if (!snapshot) throw new AppError(500, "缺少配音任务快照");
        this.save({
          ...this.current(job.id),
          phase: "submitting",
          message: "正在生成配音，请勿重复提交",
        });
        const asset = await synthesizeSpeech(
          this.store,
          settings.speech,
          job.speechText,
          getShot(snapshot, job.shotId!).order,
          signal,
        );
        try {
          signal.throwIfAborted();
          this.store.mutate(job.projectId, (p) => {
            getShot(p, job.shotId!);
            p.assets.push(asset);
          });
        } catch (error) {
          // A storage error may arrive after the project write. Never remove
          // an asset already referenced by the project, or one we cannot read.
          let referenced = true;
          try {
            referenced = this.store
              .project(job.projectId)
              .assets.some((a) => a.id === asset.id);
          } catch (readError) {
            if (readError instanceof AppError && readError.status === 404)
              referenced = false;
          }
          if (!referenced)
            await rm(this.store.path(asset.file), { force: true }).catch(
              () => {},
            );
          throw error;
        }
        this.save({
          ...this.current(job.id),
          state: "succeeded",
          progress: 100,
          message: "配音已保存为素材，请试听后选用",
          resultId: asset.id,
        });
        return;
      }
      if (job.type === "transcribe") {
        const snapshot = this.store.get<ReturnType<Store["project"]>>(
          "snapshot",
          job.id,
        );
        if (!snapshot) throw new AppError(500, "缺少识别配置快照");
        this.save({
          ...this.current(job.id),
          phase: "rendering",
          message: "正在准备镜头音轨",
        });
        const result = await transcribeShot(
          this.store,
          snapshot,
          getShot(snapshot, job.shotId!),
          settings.transcription,
          signal,
          () => {
            this.save({
              ...this.current(job.id),
              phase: "submitting",
              message: "正在识别音轨，请勿重复提交",
            });
          },
        );
        signal.throwIfAborted();
        this.save({
          ...this.current(job.id),
          state: "succeeded",
          progress: 100,
          captionResult: result,
          message: "时间轴字幕已识别，核对后应用到镜头",
        });
        return;
      }
      if (job.type === "export" || job.type === "animatic") {
        const snapshot = this.store.get<ReturnType<Store["project"]>>(
          "snapshot",
          job.id,
        );
        if (!snapshot) throw new AppError(500, "缺少导出快照");
        const isAnimatic = job.type === "animatic";
        const result = await (isAnimatic ? renderAnimatic : renderVideo)(
          this.store,
          snapshot,
          (n) => {
            if (!signal.aborted)
              this.save({
                ...this.current(job.id),
                progress: n,
                message: `正在合成 ${n}%`,
              });
          },
          signal,
        );
        signal.throwIfAborted();
        this.store.mutate(job.projectId, (p) => p.exports.push(result));
        this.save({
          ...this.current(job.id),
          state: "succeeded",
          progress: 100,
          message: isAnimatic
            ? "免费预演片已生成，可在交付中心预览节奏与连贯度"
            : "成片已导出，可在交付中心下载 MP4 与字幕",
          resultId: result.id,
        });
        return;
      }
      const p =
          this.store.get<ReturnType<Store["project"]>>("snapshot", job.id) ??
          this.store.project(job.projectId),
        shot = {
          ...getShot(p, job.shotId!),
          prompt: job.prompt ?? getShot(p, job.shotId!).prompt,
          referenceIds: job.referenceIds ?? [],
          duration: job.duration ?? 4,
        };
      let asset;
      if (job.provider === "demo") {
        await delay(500, undefined, { signal });
        asset = await createDemoAsset(
          this.store,
          shot.order + shot.versions.length,
        );
      } else {
        if (settings.generation.provider !== job.provider)
          throw new AppError(409, "服务配置已改变，请重新创建任务");
        let remoteId = job.remoteId;
        if (!remoteId) {
          this.save({
            ...this.current(job.id),
            phase: "submitting",
            message: "正在提交远程生成，请勿重复操作",
          });
          remoteId = await submitGeneration(
            this.store,
            settings,
            p,
            shot,
            signal,
            job.firstFrameAssetId,
          );
          this.save({
            ...this.current(job.id),
            remoteId,
            phase: "polling",
            message: "远程任务已创建，等待生成",
            progress: 15,
          });
        }
        const deadline = Date.now() + 30 * 60 * 1000;
        let url = "";
        while (Date.now() < deadline) {
          signal.throwIfAborted();
          const state = generationState(
            await pollGeneration(settings, remoteId, signal),
          );
          if (state.state === "failed")
            throw new AppError(502, state.message || "远程生成失败");
          if (state.state === "succeeded") {
            url = state.url!;
            break;
          }
          await delay(settings.generation.pollIntervalMs, undefined, {
            signal,
          });
        }
        if (!url)
          throw new AppError(
            504,
            "生成等待超时，远程任务 ID 已保留，可到服务后台核对",
          );
        this.save({
          ...this.current(job.id),
          progress: 85,
          message: "正在下载生成视频",
        });
        asset = await downloadVideo(this.store, url, signal);
      }
      const resultId = await this.saveCandidate(
        job,
        asset,
        shot.prompt,
        signal,
      );
      this.save({
        ...this.current(job.id),
        state: "succeeded",
        progress: 100,
        message:
          job.provider === "demo"
            ? "演示候选已创建（非在线 AI 生成）"
            : "候选版本已保存，等待选择",
        resultId,
      });
    } catch (error) {
      if (signal.aborted) {
        const current = this.current(job.id);
        const unknown =
          current.phase === "submitting" &&
          !current.remoteId &&
          current.provider !== "demo";
        if (current.state !== "cancelled")
          this.save({
            ...current,
            state: unknown ? "failed" : "queued",
            message: unknown
              ? "提交结果未知，请先核对服务商记录"
              : "执行已暂停，启动后恢复",
          });
        return;
      }
      const message = redactError(error, settings);
      this.save({
        ...this.current(job.id),
        state: "failed",
        message: "任务失败",
        error: message,
      });
    }
  }
  private async saveCandidate(
    job: Job,
    asset: Asset,
    prompt: string,
    signal: AbortSignal,
  ) {
    let resultId = "";
    try {
      signal.throwIfAborted();
      this.store.mutate(job.projectId, (project) => {
        resultId = addVersion(
          project,
          job.shotId!,
          asset,
          prompt,
          job.provider,
          job.provider === "demo" ? "demo" : "generated",
        ).id;
      });
      return resultId;
    } catch (error) {
      let referenced = true;
      try {
        referenced = this.store
          .project(job.projectId)
          .assets.some((a) => a.id === asset.id);
      } catch (readError) {
        if (readError instanceof AppError && readError.status === 404)
          referenced = false;
      }
      if (!referenced)
        await rm(this.store.path(asset.file), { force: true }).catch(() => {});
      throw error;
    }
  }
  private current(id: string) {
    const j = this.store.get<Job>("job", id);
    if (!j) throw new Error("任务记录丢失");
    return j;
  }
  async close() {
    this.stopped = true;
    // Pending tasks must not start after shutdown; they stay "queued" in the
    // store and are recovered on the next launch.
    this.queue?.clear();
    for (const c of this.active.values()) c.abort();
    const end = Date.now() + 5000;
    while (this.active.size && Date.now() < end) await delay(25);
  }
}
