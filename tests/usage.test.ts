import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  estimateCost,
  estimateGeneration,
  estimateSpeech,
  estimateTranscription,
  jobUsage,
  summarizeUsage,
  usageReportCsv,
  workspaceUsage,
} from "../packages/core/src/usage";
import type { Job, Pricing } from "../packages/core/src/model";

function job(partial: Partial<Job> & Pick<Job, "type" | "state">): Job {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "p1",
    progress: 0,
    message: "",
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    provider: "test",
    attempts: 0,
    ...partial,
  } as Job;
}

describe("AI 用量台账（只计量、不估价）", () => {
  it("按作业类型折算确定性单位", () => {
    expect(
      jobUsage(job({ type: "generate", state: "succeeded", duration: 6 })),
    ).toEqual({ kind: "video", unit: "seconds", quantity: 6 });
    expect(jobUsage(job({ type: "image", state: "succeeded" }))).toEqual({
      kind: "image",
      unit: "images",
      quantity: 1,
    });
    expect(
      jobUsage(
        job({ type: "speech", state: "succeeded", speechText: "你好世界" }),
      ),
    ).toEqual({ kind: "speech", unit: "characters", quantity: 4 });
    expect(
      jobUsage(
        job({ type: "transcribe", state: "succeeded", usage: { seconds: 8 } }),
      ),
    ).toEqual({ kind: "transcription", unit: "seconds", quantity: 8 });
  });

  it("本地渲染、未成功任务与缺少计量数据的任务不计费", () => {
    expect(jobUsage(job({ type: "export", state: "succeeded" }))).toBeNull();
    expect(
      jobUsage(job({ type: "generate", state: "failed", duration: 6 })),
    ).toBeNull();
    expect(
      jobUsage(job({ type: "generate", state: "running", duration: 6 })),
    ).toBeNull();
    expect(jobUsage(job({ type: "generate", state: "succeeded" }))).toBeNull();
    expect(
      jobUsage(job({ type: "transcribe", state: "succeeded" })),
    ).toBeNull();
  });

  it("按类型聚合并排序，秒数保留两位小数", () => {
    const summary = summarizeUsage([
      job({ type: "generate", state: "succeeded", duration: 4.126 }),
      job({ type: "generate", state: "succeeded", duration: 6 }),
      job({ type: "generate", state: "failed", duration: 10 }),
      job({ type: "image", state: "succeeded" }),
      job({ type: "image", state: "succeeded" }),
      job({ type: "speech", state: "succeeded", speechText: "一二三" }),
      job({ type: "speech", state: "succeeded", speechText: "四五六七" }),
      job({
        type: "transcribe",
        state: "succeeded",
        usage: { seconds: 5.5 },
      }),
      job({ type: "export", state: "succeeded" }),
    ]);
    expect(summary.totalJobs).toBe(7);
    expect(summary.rows).toEqual([
      { kind: "video", unit: "seconds", quantity: 10.13, jobs: 2 },
      { kind: "image", unit: "images", quantity: 2, jobs: 2 },
      { kind: "speech", unit: "characters", quantity: 7, jobs: 2 },
      { kind: "transcription", unit: "seconds", quantity: 5.5, jobs: 1 },
    ]);
  });

  it("空列表与无计费任务返回空行", () => {
    expect(summarizeUsage([])).toEqual({ rows: [], totalJobs: 0 });
    expect(
      summarizeUsage([
        job({ type: "export", state: "succeeded" }),
        job({ type: "image", state: "queued" }),
      ]),
    ).toEqual({ rows: [], totalJobs: 0 });
  });
});

describe("成本估算（单价全部来自用户设置，绝不猜价）", () => {
  const summary = summarizeUsage([
    job({ type: "generate", state: "succeeded", duration: 10 }),
    job({ type: "image", state: "succeeded" }),
    job({ type: "image", state: "succeeded" }),
    job({ type: "speech", state: "succeeded", speechText: "x".repeat(2500) }),
    job({ type: "transcribe", state: "succeeded", usage: { seconds: 20 } }),
  ]);

  it("未配置单价时不产生任何估价", () => {
    const cost = estimateCost(summary);
    expect(cost.total).toBe(0);
    expect(cost.pricedKinds).toBe(0);
    expect(cost.currency).toBe("¥");
    expect(cost.rows.every((r) => r.cost === undefined)).toBe(true);
  });

  it("按用户单价计算，配音按千字符折算，合计只累加已定价类别", () => {
    const pricing: Pricing = {
      currency: "¥",
      videoPerSecond: 2,
      imagePerImage: 0.5,
      speechPerKiloChar: 4,
      // transcription left unpriced on purpose
    };
    const cost = estimateCost(summary, pricing);
    expect(cost.pricedKinds).toBe(3);
    const byKind = Object.fromEntries(
      cost.rows.map((r) => [r.kind, r]),
    ) as Record<string, (typeof cost.rows)[number]>;
    expect(byKind.video).toMatchObject({ cost: 20, unitPrice: 2 });
    expect(byKind.image).toMatchObject({ cost: 1, unitPrice: 0.5 });
    expect(byKind.speech).toMatchObject({ cost: 10, unitPrice: 4 });
    expect(byKind.transcription).not.toHaveProperty("cost");
    expect(byKind.transcription).not.toHaveProperty("unitPrice");
    expect(cost.total).toBe(31);
  });

  it("零或非法单价视为未配置；自定义货币符号生效", () => {
    const cost = estimateCost(summary, {
      currency: "$",
      videoPerSecond: 0,
      transcriptionPerSecond: 0.1,
    });
    expect(cost.currency).toBe("$");
    expect(cost.pricedKinds).toBe(1);
    expect(cost.total).toBe(2);
    expect(cost.rows.find((r) => r.kind === "video")?.cost).toBeUndefined();
  });
});

describe("全工作区用量汇总与 CSV", () => {
  const pricing: Pricing = {
    currency: "¥",
    videoPerSecond: 2,
    imagePerImage: 1,
  };
  const jobs: Job[] = [
    job({
      id: "j1",
      projectId: "a",
      type: "generate",
      state: "succeeded",
      duration: 5,
    }),
    job({ id: "j2", projectId: "a", type: "image", state: "succeeded" }),
    job({ id: "j3", projectId: "a", type: "image", state: "failed" }),
    job({
      id: "j4",
      projectId: "b",
      type: "generate",
      state: "succeeded",
      duration: 2,
    }),
    job({ id: "j5", projectId: "gone", type: "image", state: "succeeded" }),
    job({ id: "j6", projectId: "c", type: "export", state: "succeeded" }),
  ];
  const names: Record<string, string> = {
    a: "第一集",
    b: "第二集,上",
    c: "无用量",
  };

  it("按项目拆分、跳过无计费项目、成本高者在前、删除项目有兜底名", () => {
    const report = workspaceUsage(
      jobs,
      (id) => names[id],
      pricing,
      "项目已删除",
    );
    expect(report.projects.map((p) => p.projectId)).toEqual(["a", "b", "gone"]);
    expect(report.projects[0].projectName).toBe("第一集");
    expect(report.projects[0].cost.total).toBe(11);
    expect(report.projects[1].cost.total).toBe(4);
    expect(report.projects[2].projectName).toBe("项目已删除");
    expect(report.total.total).toBe(16);
    expect(report.total.rows).toContainEqual(
      expect.objectContaining({ kind: "video", quantity: 7 }),
    );
  });

  it("CSV 含表头、每项目行与合计行，并对逗号/引号转义", () => {
    const report = workspaceUsage(
      jobs,
      (id) => names[id],
      pricing,
      "项目已删除",
    );
    const csv = usageReportCsv(report, {
      project: "项目",
      video: "视频秒",
      image: "图片张",
      speech: "配音字",
      transcription: "识别秒",
      jobs: "任务",
      cost: "成本",
      total: "合计",
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("项目,视频秒,图片张,配音字,识别秒,任务,成本(¥)");
    expect(lines).toContain("第一集,5,1,0,0,2,11");
    expect(lines).toContain('"第二集,上",2,0,0,0,1,4');
    expect(lines.at(-1)).toBe("合计,7,2,0,0,4,16");
  });
});

describe("estimateGeneration 批量生成前预估", () => {
  it("按镜头时长汇总秒数并以用户视频单价估算", () => {
    const pricing: Pricing = { currency: "¥", videoPerSecond: 2 };
    const estimate = estimateGeneration([5, 7, 4.5], pricing);
    expect(estimate).toMatchObject({
      shotCount: 3,
      videoSeconds: 16.5,
      currency: "¥",
      videoCost: 33,
    });
  });

  it("未配置视频单价时只给秒数不给金额", () => {
    const estimate = estimateGeneration([5, 7], { currency: "$" });
    expect(estimate.shotCount).toBe(2);
    expect(estimate.videoSeconds).toBe(12);
    expect(estimate.currency).toBe("$");
    expect(estimate.videoCost).toBeUndefined();
  });

  it("忽略无效时长，零或负单价视为未定价", () => {
    const estimate = estimateGeneration([5, -1, 0, Number.NaN], {
      currency: "¥",
      videoPerSecond: 0,
    });
    expect(estimate.shotCount).toBe(1);
    expect(estimate.videoSeconds).toBe(5);
    expect(estimate.videoCost).toBeUndefined();
  });
});

describe("estimateSpeech 配音前预估", () => {
  it("按千字符折算配音成本", () => {
    const estimate = estimateSpeech(1250, {
      currency: "¥",
      speechPerKiloChar: 4,
    });
    expect(estimate.chars).toBe(1250);
    expect(estimate.cost).toBe(5);
  });

  it("空文本给 0 字符且不估价", () => {
    const estimate = estimateSpeech(0, {
      currency: "¥",
      speechPerKiloChar: 4,
    });
    expect(estimate.chars).toBe(0);
    expect(estimate.cost).toBeUndefined();
  });

  it("未配置配音单价时只给字符数", () => {
    const estimate = estimateSpeech(300, { currency: "$" });
    expect(estimate.chars).toBe(300);
    expect(estimate.currency).toBe("$");
    expect(estimate.cost).toBeUndefined();
  });
});

describe("estimateTranscription 识别前预估", () => {
  it("按音频秒数与每秒单价估算", () => {
    const estimate = estimateTranscription(12.5, {
      currency: "¥",
      transcriptionPerSecond: 0.2,
    });
    expect(estimate.seconds).toBe(12.5);
    expect(estimate.cost).toBe(2.5);
  });

  it("空片段或无效秒数不估价", () => {
    const estimate = estimateTranscription(0, {
      currency: "¥",
      transcriptionPerSecond: 0.2,
    });
    expect(estimate.seconds).toBe(0);
    expect(estimate.cost).toBeUndefined();
  });

  it("未配置识别单价时只给秒数", () => {
    const estimate = estimateTranscription(8, { currency: "¥" });
    expect(estimate.seconds).toBe(8);
    expect(estimate.cost).toBeUndefined();
  });
});

describe("budgetStatus 月度预算护栏", () => {
  it("无预算或非正预算返回 null", () => {
    expect(budgetStatus(50)).toBeNull();
    expect(budgetStatus(50, 0)).toBeNull();
    expect(budgetStatus(50, -1)).toBeNull();
  });

  it("低于 80% 为 ok，给出剩余额", () => {
    const s = budgetStatus(50, 100)!;
    expect(s.level).toBe("ok");
    expect(s.ratio).toBe(0.5);
    expect(s.remaining).toBe(50);
  });

  it("达到 80% 为 near，达到或超过 100% 为 over", () => {
    expect(budgetStatus(80, 100)!.level).toBe("near");
    const over = budgetStatus(120, 100)!;
    expect(over.level).toBe("over");
    expect(over.ratio).toBe(1.2);
    expect(over.remaining).toBe(-20);
  });

  it("无效花费按 0 处理", () => {
    const s = budgetStatus(Number.NaN, 100)!;
    expect(s.spent).toBe(0);
    expect(s.level).toBe("ok");
  });
});
