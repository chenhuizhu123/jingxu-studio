import type { Job, Pricing } from "./model";

// Local, privacy-preserving usage ledger. The app is BYOK: providers bill the
// user directly, and their APIs do not return a trusted price for these calls,
// so this module reports *measured units only* and never invents a cost.
// Pricing stays a separate, user-configured concern.
export type UsageKind = "video" | "image" | "speech" | "transcription";
export type UsageUnit = "seconds" | "images" | "characters";

export interface UsageRow {
  kind: UsageKind;
  unit: UsageUnit;
  // Measured billable quantity across successful jobs, rounded to avoid
  // floating point noise (seconds to two decimals).
  quantity: number;
  // Successful billable jobs contributing to this row. Failed, cancelled and
  // still-running jobs are not counted.
  jobs: number;
}

export interface UsageSummary {
  rows: UsageRow[];
  // Successful billable job total across every kind (local renders excluded).
  totalJobs: number;
}

const order: UsageKind[] = ["video", "image", "speech", "transcription"];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Deterministic units for one succeeded job; null for non-billable / local
// jobs (local MP4 render) or jobs missing the data needed to measure.
export function jobUsage(
  job: Job,
): { kind: UsageKind; unit: UsageUnit; quantity: number } | null {
  if (job.state !== "succeeded") return null;
  switch (job.type) {
    case "generate":
      return typeof job.duration === "number" && job.duration > 0
        ? { kind: "video", unit: "seconds", quantity: job.duration }
        : null;
    case "image":
      return { kind: "image", unit: "images", quantity: 1 };
    case "speech":
      return job.speechText
        ? {
            kind: "speech",
            unit: "characters",
            quantity: job.speechText.length,
          }
        : null;
    case "transcribe":
      return typeof job.usage?.seconds === "number" && job.usage.seconds > 0
        ? {
            kind: "transcription",
            unit: "seconds",
            quantity: job.usage.seconds,
          }
        : null;
    default:
      return null;
  }
}

export function summarizeUsage(jobs: Job[]): UsageSummary {
  const acc = new Map<
    UsageKind,
    { unit: UsageUnit; quantity: number; jobs: number }
  >();
  let totalJobs = 0;
  for (const job of jobs) {
    const measured = jobUsage(job);
    if (!measured) continue;
    totalJobs += 1;
    const row = acc.get(measured.kind) ?? {
      unit: measured.unit,
      quantity: 0,
      jobs: 0,
    };
    row.quantity += measured.quantity;
    row.jobs += 1;
    acc.set(measured.kind, row);
  }
  const rows: UsageRow[] = order
    .filter((kind) => acc.has(kind))
    .map((kind) => {
      const row = acc.get(kind)!;
      return {
        kind,
        unit: row.unit,
        quantity: row.unit === "seconds" ? round2(row.quantity) : row.quantity,
        jobs: row.jobs,
      };
    });
  return { rows, totalJobs };
}

export interface CostRow extends UsageRow {
  // Unit price the user configured for this kind, when present.
  unitPrice?: number;
  // Quantity converted to the pricing unit (speech is priced per 1000 chars)
  // times the unit price. Absent when no price is configured for that kind.
  cost?: number;
}

export interface CostSummary {
  rows: CostRow[];
  // Sum of priced rows computed from unrounded values, then rounded.
  total: number;
  currency: string;
  // Number of kinds that have a positive configured unit price.
  pricedKinds: number;
}

const priceKey: Record<UsageKind, keyof Pricing> = {
  video: "videoPerSecond",
  image: "imagePerImage",
  speech: "speechPerKiloChar",
  transcription: "transcriptionPerSecond",
};

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

// Turns measured units into a *user-anchored* estimate: prices come solely
// from the user's own settings (copied from their provider bill). The app
// never supplies or guesses a price; kinds without a price stay unpriced.
export function estimateCost(
  summary: UsageSummary,
  pricing?: Pricing,
): CostSummary {
  let total = 0;
  let pricedKinds = 0;
  const rows: CostRow[] = summary.rows.map((row) => {
    const unitPrice = pricing?.[priceKey[row.kind]];
    if (typeof unitPrice !== "number" || !isFinite(unitPrice) || unitPrice <= 0)
      return row;
    const pricedUnits =
      row.kind === "speech" ? row.quantity / 1000 : row.quantity;
    const raw = pricedUnits * unitPrice;
    total += raw;
    pricedKinds += 1;
    return { ...row, unitPrice, cost: round4(raw) };
  });
  return {
    rows,
    total: round4(total),
    currency: pricing?.currency?.trim() || "¥",
    pricedKinds,
  };
}

export interface GenerationEstimate {
  shotCount: number;
  videoSeconds: number;
  currency: string;
  // Estimated video candidate cost from the user's per-second price;
  // absent when no valid video price is configured.
  videoCost?: number;
}

// Pre-flight estimate for a batch of video candidate generations: each shot
// yields one candidate clip of its own duration. Prices come solely from the
// user's configured video per-second price; nothing is ever guessed.
export function estimateGeneration(
  durations: number[],
  pricing?: Pricing,
): GenerationEstimate {
  const valid = durations.filter(
    (d) => typeof d === "number" && isFinite(d) && d > 0,
  );
  const videoSeconds = round2(valid.reduce((a, b) => a + b, 0));
  const out: GenerationEstimate = {
    shotCount: valid.length,
    videoSeconds,
    currency: pricing?.currency?.trim() || "¥",
  };
  const price = pricing?.videoPerSecond;
  if (typeof price === "number" && isFinite(price) && price > 0) {
    out.videoCost = round4(videoSeconds * price);
  }
  return out;
}

export interface SpeechEstimate {
  chars: number;
  currency: string;
  // Estimated TTS cost from the user's per-kilocharacter price;
  // absent for empty text or when no valid price is configured.
  cost?: number;
}

// Pre-flight estimate for one speech synthesis: billed per thousand
// characters of the trimmed dialogue.
export function estimateSpeech(
  charCount: number,
  pricing?: Pricing,
): SpeechEstimate {
  const chars =
    typeof charCount === "number" && isFinite(charCount) && charCount > 0
      ? Math.floor(charCount)
      : 0;
  const out: SpeechEstimate = {
    chars,
    currency: pricing?.currency?.trim() || "¥",
  };
  const price = pricing?.speechPerKiloChar;
  if (chars > 0 && typeof price === "number" && isFinite(price) && price > 0) {
    out.cost = round4((chars / 1000) * price);
  }
  return out;
}

export interface TranscriptionEstimate {
  seconds: number;
  currency: string;
  // Estimated ASR cost from the user's per-second price;
  // absent for empty clips or when no valid price is configured.
  cost?: number;
}

// Pre-flight estimate for one audio transcription: only the actually used
// clip seconds are sent, billed per second.
export function estimateTranscription(
  seconds: number,
  pricing?: Pricing,
): TranscriptionEstimate {
  const valid =
    typeof seconds === "number" && isFinite(seconds) && seconds > 0
      ? round2(seconds)
      : 0;
  const out: TranscriptionEstimate = {
    seconds: valid,
    currency: pricing?.currency?.trim() || "¥",
  };
  const price = pricing?.transcriptionPerSecond;
  if (valid > 0 && typeof price === "number" && isFinite(price) && price > 0) {
    out.cost = round4(valid * price);
  }
  return out;
}

export type BudgetLevel = "ok" | "near" | "over";

export interface BudgetStatus {
  budget: number;
  spent: number;
  // spent / budget; may exceed 1 once over budget.
  ratio: number;
  level: BudgetLevel;
  // Positive while under budget, zero or negative once reached.
  remaining: number;
}

// Compare the current period's estimated spend with the user's soft monthly
// budget. Returns null when no positive budget is configured. This is a
// guardrail only — it never blocks a job.
export function budgetStatus(
  spent: number,
  budget?: number,
): BudgetStatus | null {
  const b =
    typeof budget === "number" && isFinite(budget) && budget > 0 ? budget : 0;
  if (b <= 0) return null;
  const s =
    typeof spent === "number" && isFinite(spent) && spent > 0 ? spent : 0;
  const ratio = s / b;
  const level: BudgetLevel = ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok";
  return {
    budget: b,
    spent: s,
    ratio,
    level,
    remaining: round4(b - s),
  };
}

export interface ProjectUsage {
  projectId: string;
  projectName: string;
  summary: UsageSummary;
  cost: CostSummary;
}

export interface WorkspaceUsageReport {
  total: CostSummary;
  // Projects with at least one billable job, most expensive first.
  projects: ProjectUsage[];
}

// Workspace-wide reconciliation view: totals plus a per-project breakdown,
// all measured from succeeded jobs and priced only with user unit prices.
export function workspaceUsage(
  jobs: Job[],
  resolveName: (projectId: string) => string | undefined,
  pricing?: Pricing,
  deletedLabel = "(deleted)",
): WorkspaceUsageReport {
  const byProject = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = byProject.get(job.projectId) ?? [];
    list.push(job);
    byProject.set(job.projectId, list);
  }
  const projects: ProjectUsage[] = [];
  for (const [projectId, projectJobs] of byProject) {
    const summary = summarizeUsage(projectJobs);
    if (summary.totalJobs === 0) continue;
    projects.push({
      projectId,
      projectName: resolveName(projectId) || deletedLabel,
      summary,
      cost: estimateCost(summary, pricing),
    });
  }
  projects.sort(
    (a, b) =>
      b.cost.total - a.cost.total ||
      b.summary.totalJobs - a.summary.totalJobs ||
      a.projectName.localeCompare(b.projectName),
  );
  return {
    total: estimateCost(summarizeUsage(jobs), pricing),
    projects,
  };
}

export interface UsageCsvLabels {
  project: string;
  video: string;
  image: string;
  speech: string;
  transcription: string;
  jobs: string;
  cost: string;
  total: string;
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Flat reconciliation table: one row per project plus a TOTAL row.
export function usageReportCsv(
  report: WorkspaceUsageReport,
  labels: UsageCsvLabels,
): string {
  const quantityOf = (p: ProjectUsage, kind: UsageKind) =>
    p.summary.rows.find((r) => r.kind === kind)?.quantity ?? 0;
  const header = [
    labels.project,
    labels.video,
    labels.image,
    labels.speech,
    labels.transcription,
    labels.jobs,
    `${labels.cost}(${report.total.currency})`,
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const p of report.projects) {
    lines.push(
      [
        p.projectName,
        quantityOf(p, "video"),
        quantityOf(p, "image"),
        quantityOf(p, "speech"),
        quantityOf(p, "transcription"),
        p.summary.totalJobs,
        p.cost.total,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const totalJobs = report.projects.reduce(
    (n, p) => n + p.summary.totalJobs,
    0,
  );
  const totalQuantity = (kind: UsageKind) =>
    report.total.rows.find((r) => r.kind === kind)?.quantity ?? 0;
  lines.push(
    [
      labels.total,
      totalQuantity("video"),
      totalQuantity("image"),
      totalQuantity("speech"),
      totalQuantity("transcription"),
      totalJobs,
      report.total.total,
    ]
      .map(csvCell)
      .join(","),
  );
  return lines.join("\n") + "\n";
}
