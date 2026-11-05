import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  stat,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { Store } from "../packages/core/src/store";
import {
  createProject,
  buildStoryboard,
  addVersion,
  id,
  now,
  type Asset,
} from "../packages/core/src/model";
import {
  createDemoAsset,
  renderVideo,
  runFfmpeg,
  probeMedia,
} from "../packages/core/src/media";
import { reviewShot } from "../packages/core/src/vision";
let store: Store | undefined, server: Server | undefined;
afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  }
  if (store) {
    const root = store.root;
    store.close();
    await rm(root, { recursive: true, force: true });
    store = undefined;
  }
});
async function setup() {
  store = await Store.open(await mkdtemp(join(tmpdir(), "jingxu-vision-")));
  const p = createProject({
    name: "视听测试",
    script: "阿青：今晚的雨终于停了。",
  });
  buildStoryboard(p);
  p.shots[0].duration = 2;
  const a = await createDemoAsset(store, 0);
  addVersion(p, p.shots[0].id, a, "雨夜人物", "demo", "demo");
  p.characters[0].referenceId = a.id;
  store.put("project", p.id, p);
  return p;
}
async function audio(frequency: number): Promise<Asset> {
  const a: Asset = {
    id: id(),
    name: "测试音频.wav",
    kind: "audio",
    mime: "audio/wav",
    file: `media/${id()}.wav`,
    size: 0,
    createdAt: now(),
  };
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:sample_rate=48000`,
    "-t",
    "1.5",
    store!.path(a.file),
  ]);
  a.size = (await stat(store!.path(a.file))).size;
  return a;
}
describe("真实音轨与字幕输出", () => {
  it("媒体探测识别音轨与时长，并拒绝损坏文件", async () => {
    await setup();
    const a = await audio(440);
    const result = await probeMedia(store!.path(a.file));
    expect(result.hasAudio).toBe(true);
    expect(result.duration).toBeCloseTo(1.5, 1);
    await writeFile(store!.path("media/bad.mp4"), "not-a-movie");
    await expect(probeMedia(store!.path("media/bad.mp4"))).rejects.toThrow(
      "无法识别",
    );
  });
  it("镜头配音与 BGM 混合，字幕烧录改变真实视频画面", async () => {
    const p = await setup(),
      voice = await audio(440),
      music = await audio(220);
    p.assets.push(voice, music);
    p.shots[0].audioAssetId = voice.id;
    p.musicAssetId = music.id;
    p.musicVolume = 0.1;
    p.burnSubtitles = false;
    const plain = await renderVideo(store!, p, () => {});
    p.burnSubtitles = true;
    const captioned = await renderVideo(store!, p, () => {});
    for (const e of [plain, captioned]) {
      const meta = await probeMedia(store!.path(e.file));
      expect(meta.hasAudio).toBe(true);
      expect(meta.duration).toBeCloseTo(2, 1);
    }
    const frames: string[] = [];
    for (const e of [plain, captioned]) {
      const f = store!.path(`media/${id()}.png`);
      await runFfmpeg([
        "-ss",
        "1",
        "-i",
        store!.path(e.file),
        "-frames:v",
        "1",
        f,
      ]);
      frames.push(
        createHash("sha256")
          .update(await readFile(f))
          .digest("hex"),
      );
    }
    expect(frames[0]).not.toBe(frames[1]);
  }, 30000);
  it("导入有声视频保留源音轨", async () => {
    const p = await setup(),
      videoId = id(),
      file = `media/${videoId}.mp4`;
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=navy:s=128x128:r=25",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      store!.path(file),
    ]);
    const a: Asset = {
      id: videoId,
      file,
      name: "有声视频.mp4",
      kind: "video",
      mime: "video/mp4",
      size: (await stat(store!.path(file))).size,
      createdAt: now(),
    };
    const v = addVersion(p, p.shots[0].id, a, "导入", "local", "imported");
    p.shots[0].selectedVersionId = v.id;
    p.burnSubtitles = false;
    const result = await renderVideo(store!, p, () => {});
    const audio = store!.path("media/audio.raw");
    await runFfmpeg([
      "-i",
      store!.path(result.file),
      "-map",
      "0:a:0",
      "-f",
      "s16le",
      audio,
    ]);
    const pcm = await readFile(audio);
    expect(pcm.some((b) => b !== 0)).toBe(true);
  }, 30000);
  it("视频裁切从指定时间开始，尾部冻结而不是循环，并拒绝越界起点", async () => {
    const p = await setup(),
      file = `media/${id()}.mp4`;
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=128x128:r=25:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=128x128:r=25:d=1",
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      store!.path(file),
    ]);
    const asset: Asset = {
      id: id(),
      file,
      name: "trim.mp4",
      kind: "video",
      mime: "video/mp4",
      size: (await stat(store!.path(file))).size,
      createdAt: now(),
    };
    const v = addVersion(p, p.shots[0].id, asset, "trim", "local", "imported");
    p.shots[0].selectedVersionId = v.id;
    p.shots[0].trimStart = 1;
    p.burnSubtitles = false;
    const result = await renderVideo(store!, p, () => {});
    expect((await probeMedia(store!.path(result.file))).duration).toBeCloseTo(
      2,
      1,
    );
    const frame = store!.path("media/trim-frame.rgb");
    await runFfmpeg([
      "-ss",
      "1.5",
      "-i",
      store!.path(result.file),
      "-vf",
      "scale=1:1",
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      frame,
    ]);
    const rgb = await readFile(frame);
    expect(rgb[2]).toBeGreaterThan(150);
    expect(rgb[0]).toBeLessThan(50);
    p.shots[0].trimStart = 3;
    await expect(renderVideo(store!, p, () => {})).rejects.toThrow("裁切起点");
  }, 30000);
});
describe("视觉模型检查边界", () => {
  it("没有 Key 时不假称已检查人脸", async () => {
    const p = await setup();
    await expect(reviewShot(store!, p.id, p.shots[0].id)).rejects.toThrow(
      "图像输入",
    );
    expect(store!.project(p.id).shots[0].visualReview).toBeUndefined();
  });
  it("发送参考和实际帧，结果绑定对应版本，不自动批准镜头", async () => {
    const p = await setup();
    let payload: any;
    server = createServer(async (req, res) => {
      let text = "";
      for await (const c of req) text += c;
      payload = JSON.parse(text);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "静态候选：服装颜色可观察到差异。建议保留场景并重新生成。运动无法判断。",
              },
            },
          ],
        }),
      );
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const s = store!.settings();
    s.agent = {
      endpoint: `http://127.0.0.1:${(server.address() as any).port}`,
      model: "vision-test",
      apiKey: "vision-secret",
    };
    store!.saveSettings(s);
    const result = await reviewShot(store!, p.id, p.shots[0].id);
    expect(
      payload.messages[0].content.filter((c: any) => c.type === "image_url"),
    ).toHaveLength(2);
    expect(result.referenceIds).toEqual([p.assets[0].id]);
    expect(result.versionId).toBe(p.shots[0].selectedVersionId);
    expect(result.text).toContain("无法判断");
    const saved = store!.project(p.id).shots[0];
    expect(saved.review).toBe("pending");
    expect(saved.visualReview?.frameCount).toBe(1);
    expect(JSON.stringify(saved)).not.toContain("vision-secret");
  });
});
