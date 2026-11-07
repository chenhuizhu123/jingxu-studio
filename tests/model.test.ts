import { describe, it, expect } from "vitest";
import {
  createProject,
  buildStoryboard,
  reorderShots,
  updateShot,
  addVersion,
  inspectProject,
  makeSrt,
  srtTime,
  storyboardCsv,
  csvCell,
  selectedVersion,
  projectInput,
  settingsInput,
  id,
  now,
  type Asset,
} from "../packages/core/src/model";
import {
  endpoint,
  generationState,
  redactError,
} from "../packages/core/src/providers";
const fixture = () => {
  const p = createProject({
    name: "测试作品",
    script: "角色：林晚、陈序\n林晚：你终于来了。\n陈序走到窗边。",
  });
  buildStoryboard(p);
  return p;
};
const asset = (): Asset => ({
  id: id(),
  name: "素材.png",
  file: `media/${id()}.png`,
  kind: "image",
  mime: "image/png",
  size: 20,
  createdAt: now(),
});
describe("项目与分镜", () => {
  it("创建独立项目，拒绝空名称", () => {
    expect(createProject({ name: " A " }).name).toBe("A");
    expect(() => createProject({ name: " " })).toThrow();
    expect(createProject({ name: "A" }).id).not.toBe(
      createProject({ name: "A" }).id,
    );
  });
  it("角色和对白拆解为可编辑初稿", () => {
    const p = fixture();
    expect(p.characters.map((c) => c.name)).toEqual(["林晚", "陈序"]);
    expect(p.shots).toHaveLength(2);
    expect(p.shots[0].dialogue).toBe("你终于来了。");
    expect(p.shots[0].characterIds).toEqual([p.characters[0].id]);
    expect(p.shots[1].dialogue).toBe("");
  });
  it("空剧本没有虚构分镜", () => {
    const p = createProject({ name: "空" });
    expect(buildStoryboard(p)).toEqual([]);
  });
  it("限制分镜数量", () => {
    const p = createProject({
      name: "长剧",
      script: Array.from({ length: 100 }, (_, i) => `场景${i}`).join("\n"),
    });
    expect(buildStoryboard(p)).toHaveLength(60);
  });
  it("英文分镜提示词使用英文风格描述且不含中文枚举，中文保持原样", () => {
    const en = createProject({
      name: "EN",
      script: "A-Lin walks to the window.",
      style: "电影写实",
    });
    buildStoryboard(en, "en");
    const enPrompt = en.shots[0].prompt;
    expect(enPrompt).toContain("cinematic realism");
    expect(enPrompt).toContain("9:16 aspect ratio");
    expect(enPrompt).not.toContain("电影写实");

    const zh = createProject({
      name: "中",
      script: "阿青走到窗边。",
      style: "电影写实",
    });
    buildStoryboard(zh, "zh");
    expect(zh.shots[0].prompt).toContain("电影写实");
    expect(zh.shots[0].prompt).toContain("9:16画幅");
  });
  it("未知镜头不能修改", () => {
    expect(() => updateShot(fixture(), "bad", { title: "A" })).toThrow(
      "镜头不存在",
    );
  });
  it.each([0, -1, 31, NaN])("拒绝无效镜头时长 %s", (n) => {
    const p = fixture();
    expect(() => updateShot(p, p.shots[0].id, { duration: n })).toThrow();
  });
  it("拒绝未知字段与跨项目参考", () => {
    const p = fixture();
    expect(() => updateShot(p, p.shots[0].id, { versions: [] })).toThrow();
    expect(() =>
      updateShot(p, p.shots[0].id, { referenceIds: ["foreign"] }),
    ).toThrow("参考图");
    expect(() =>
      updateShot(p, p.shots[0].id, { characterIds: ["foreign"] }),
    ).toThrow("角色");
  });
  it("可以选择本项目图片参考", () => {
    const p = fixture(),
      a = asset();
    p.assets.push(a);
    updateShot(p, p.shots[0].id, { referenceIds: [a.id] });
    expect(p.shots[0].referenceIds).toEqual([a.id]);
  });
});
describe("版本与返修", () => {
  it("首次候选默认选用，后续候选不覆盖已选", () => {
    const p = fixture(),
      s = p.shots[0];
    const a = addVersion(p, s.id, asset(), "第一次", "demo", "demo");
    const b = addVersion(p, s.id, asset(), "第二次", "demo", "demo");
    expect(s.selectedVersionId).toBe(a.id);
    expect(b.number).toBe(2);
    expect(s.versions).toHaveLength(2);
    expect(p.assets).toHaveLength(2);
  });
  it("允许回选历史版本，保留全部候选", () => {
    const p = fixture(),
      s = p.shots[0],
      a = addVersion(p, s.id, asset(), "A", "demo", "demo"),
      b = addVersion(p, s.id, asset(), "B", "demo", "demo");
    updateShot(p, s.id, { selectedVersionId: b.id });
    expect(selectedVersion(s)?.prompt).toBe("B");
    updateShot(p, s.id, { selectedVersionId: a.id });
    expect(selectedVersion(s)?.prompt).toBe("A");
    expect(s.versions).toHaveLength(2);
  });
  it("拒绝不存在的候选", () => {
    const p = fixture();
    expect(() =>
      updateShot(p, p.shots[0].id, { selectedVersionId: "foreign" }),
    ).toThrow();
  });
  it("新候选清除通过状态，返修说明保留", () => {
    const p = fixture(),
      s = p.shots[0];
    s.review = "approved";
    s.note = "保留服装";
    addVersion(p, s.id, asset(), "A", "local", "imported");
    expect(s.review).toBe("pending");
    expect(s.note).toBe("保留服装");
  });
});
describe("规则检查与标准文件", () => {
  it("报告缺失素材与角色参考，不声称看过人脸", () => {
    const p = fixture(),
      findings = inspectProject(p);
    expect(findings.some((f) => f.code === "missing-media")).toBe(true);
    expect(findings.some((f) => f.code === "missing-reference")).toBe(true);
    expect(findings.some((f) => f.code === "scene-unset")).toBe(true);
  });
  it("标记过长对白与返修镜头", () => {
    const p = fixture();
    p.shots[0].duration = 2;
    p.shots[0].dialogue = "这是明显超过两秒钟能够自然表达完毕的对白内容";
    p.shots[0].review = "changes";
    const findings = inspectProject(p);
    expect(findings.map((f) => f.code)).toContain("dialogue-long");
    expect(findings.map((f) => f.code)).toContain("changes-requested");
  });
  it.each([
    [0, "00:00:00,000"],
    [1.234, "00:00:01,234"],
    [61.5, "00:01:01,500"],
    [3661.001, "01:01:01,001"],
  ])("SRT 时间 %s", (n, s) => expect(srtTime(n as number)).toBe(s));
  it("静默镜头占据时间，字幕连续编号", () => {
    const p = fixture();
    p.shots[0].dialogue = "";
    p.shots[0].duration = 3;
    p.shots[1].dialogue = "你好";
    p.shots[1].duration = 5;
    expect(makeSrt(p.shots)).toBe("1\n00:00:03,000 --> 00:00:08,000\n你好\n");
  });
  it("CSV 支持中文和引号换行，并防公式注入", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
    const p = fixture();
    p.shots[0].dialogue = "你好,\n世界";
    expect(storyboardCsv(p)).toContain('"你好,\n世界"');
    expect(storyboardCsv(p)).toContain("镜号");
  });
});
describe("服务协议与错误边界", () => {
  it.each([
    "file:///etc/passwd",
    "http://example.com",
    "https://user:pass@example.com",
    "not-url",
    "https://example.com/?key=secret",
  ])("拒绝不合适的服务地址 %s", (s) => expect(() => endpoint(s)).toThrow());
  it("允许 HTTPS 和本机开发网关", () => {
    expect(endpoint("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1",
    );
    expect(endpoint("http://127.0.0.1:8888")).toBe("http://127.0.0.1:8888");
  });
  it("归一化供应商状态并验证视频地址", () => {
    expect(generationState({ status: "running" }).state).toBe("pending");
    expect(
      generationState({
        status: "succeeded",
        content: { video_url: "https://x/v.mp4" },
      }).url,
    ).toContain("mp4");
    expect(
      generationState({ status: "failed", error: { message: "余额不足" } })
        .message,
    ).toBe("余额不足");
    expect(() => generationState({ status: "succeeded" })).toThrow("视频地址");
  });
  it("错误信息不泄漏 API Key", () => {
    const settings: any = {
      agent: { apiKey: "secret-a" },
      generation: { apiKey: "secret-b" },
    };
    expect(redactError(new Error("secret-a secret-b"), settings)).toBe(
      "[已隐藏] [已隐藏]",
    );
  });
});

describe("无损剪辑", () => {
  it("调整顺序保留镜头ID、版本和字幕时间", () => {
    const p = fixture(),
      [a, b] = p.shots;
    addVersion(p, a.id, asset(), "keep", "local", "imported");
    a.duration = 3;
    b.duration = 4;
    b.dialogue = "First";
    reorderShots(p, [b.id, a.id]);
    expect(p.shots.map((s) => s.id)).toEqual([b.id, a.id]);
    expect(p.shots.map((s) => s.order)).toEqual([1, 2]);
    expect(p.shots[1].versions).toHaveLength(1);
    expect(makeSrt(p.shots)).toContain("00:00:00,000 --> 00:00:04,000");
  });
  it.each([[[]], [["missing"]], [["same", "same"]]])(
    "拒绝不完整或重复顺序 %s",
    (ids) => {
      const p = fixture();
      const before = JSON.stringify(p);
      expect(() => reorderShots(p, ids)).toThrow();
      expect(JSON.stringify(p)).toBe(before);
    },
  );
  it("未改变时长的普通保存保留已确认检查", () => {
    const p = fixture(),
      s = p.shots[0];
    s.review = "approved";
    s.visualReview = {
      versionId: "v1",
      createdAt: now(),
      text: "checked",
      frameCount: 1,
      referenceIds: [],
    };
    updateShot(p, s.id, {
      duration: s.duration,
      trimStart: 0,
      title: "New title",
    });
    expect(s.review).toBe("approved");
    expect(s.visualReview?.text).toBe("checked");
  });
  it("裁切和换版本使旧检查失效", () => {
    const p = fixture(),
      s = p.shots[0];
    s.review = "approved";
    s.visualReview = {
      versionId: "old",
      createdAt: now(),
      text: "ok",
      frameCount: 1,
      referenceIds: [],
    };
    updateShot(p, s.id, { trimStart: 1.5 });
    expect(s.trimStart).toBe(1.5);
    expect(s.review).toBe("pending");
    expect(s.visualReview).toBeUndefined();
    expect(() => updateShot(p, s.id, { trimStart: -1 })).toThrow();
  });
});
