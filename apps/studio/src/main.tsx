import {
  CaptionEditor,
  TranscriptionSettings,
  type PublicTranscription,
} from "./Captions";
import { t, getLocale, setLocale, subscribeLocale } from "./i18n";
import {
  firstFrameSeconds,
  imagePrompt,
  referenceIds,
  videoPrompt,
} from "../../../packages/shared/shot-references";
import { version as appVersion } from "../../../package.json";
import { episodeBlockers } from "../../../packages/shared/episode-status";
import {
  VoiceoverComposer,
  SpeechSettingsFields,
  type PublicSpeech,
} from "./Voiceover";
import { ImportProjectForm, type RestoredSeries } from "./ImportProject";
import { CastSyncForm, SceneSyncForm } from "./CastSync";
import { FirstFilmLauncher, FirstFilmProgress } from "./FirstFilm";
import { ShotReferences } from "./ShotReferences";
import {
  SeriesBoard,
  SeriesImportForm,
  episodeLabel,
  type AppendSeries,
} from "./Series";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Clapperboard,
  LayoutGrid,
  Image as ImageIcon,
  ListTodo,
  Settings2,
  BookOpen,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Check,
  CheckCircle2,
  Clock3,
  Cloud,
  Copy,
  Download,
  Ellipsis,
  Film,
  FolderOpen,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  AlertCircle,
  Monitor,
  Smartphone,
  KeyRound,
  Plug,
  FileText,
  CheckCheck,
  PanelRightClose,
  Volume2,
  ExternalLink,
  WifiOff,
  Gauge,
  Calculator,
} from "lucide-react";
import type {
  Project,
  Shot,
  Asset,
  Job,
  Character,
  Finding,
  Approval,
  Settings as AppSettings,
  Pricing,
} from "../../../packages/core/src/model";
import {
  summarizeUsage,
  estimateCost,
  estimateGeneration,
  workspaceUsage,
  usageReportCsv,
  budgetStatus,
} from "../../../packages/core/src/usage";
import type { GenerationEstimate } from "../../../packages/core/src/usage";
import {
  api,
  post,
  initializeConnection,
  connect,
  mediaUrl,
  download,
  saveText,
  native,
  serverBase,
  getLicense,
  startTrial,
  checkoutLicense,
  activateLicense,
  validateLicense,
  deactivateLicense,
  type LicenseState,
} from "./api";
import "./styles.css";

type View =
  "workspace" | "projects" | "assets" | "jobs" | "skills" | "settings";
type P = Omit<Project, "assets" | "exports"> & {
  firstFilmSample?: "zh" | "en";
  assets: (Asset & { url: string })[];
  exports: (Project["exports"][number] & {
    url: string;
    subtitlesUrl?: string;
  })[];
};
type PublicSettings = Omit<
  AppSettings,
  "generation" | "agent" | "speech" | "transcription" | "image"
> & {
  image: Omit<AppSettings["image"], "apiKey"> & {
    hasApiKey: boolean;
    apiKey?: string;
  };
  speech: PublicSpeech;
  transcription: PublicTranscription;
  generation: Omit<AppSettings["generation"], "apiKey"> & {
    hasApiKey: boolean;
    apiKey?: string;
  };
  agent: Omit<AppSettings["agent"], "apiKey"> & {
    hasApiKey: boolean;
    apiKey?: string;
  };
};
const fmt = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const bytes = (n: number) =>
  n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
const version = (s: Shot) =>
  s.versions.find((v) => v.id === s.selectedVersionId);
const date = (s: string) =>
  new Date(s).toLocaleString(getLocale() === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function Button({
  children,
  variant = "",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Empty({
  icon: Icon = Film,
  title,
  description,
  children,
}: {
  icon?: typeof Film;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const first =
      ref.current?.querySelector<HTMLElement>(
        "input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
      ) ?? ref.current?.querySelector<HTMLElement>("button:not(:disabled)");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t("关闭")}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function App() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);

  const [ready, setReady] = useState(false),
    [connectionError, setConnectionError] = useState(""),
    [connectionOpen, setConnectionOpen] = useState(false);
  const [projects, setProjects] = useState<P[]>([]),
    [projectId, setProjectId] = useState(""),
    [view, setView] = useState<View>("workspace"),
    [tab, setTab] = useState("storyboard"),
    [shotId, setShotId] = useState(""),
    [jobs, setJobs] = useState<Job[]>([]),
    [settings, setSettings] = useState<PublicSettings>(),
    [license, setLicense] = useState<LicenseState>(),
    [welcomeHidden, setWelcomeHidden] = useState(
      () => localStorage.getItem("jx-welcome-dismissed") === "1",
    ),
    [skills, setSkills] = useState<any[]>([]),
    [approvals, setApprovals] = useState<Approval[]>([]);
  const [toast, setToast] = useState<{ message: string; error?: boolean }>(),
    [newOpen, setNewOpen] = useState(false),
    [seriesOpen, setSeriesOpen] = useState<AppendSeries | "new">(),
    [castSync, setCastSync] = useState<{
      projectId: string;
      characterId: string;
    }>(),
    [sceneSync, setSceneSync] = useState<{
      projectId: string;
      shotId: string;
      assetId: string;
    }>(),
    [importOpen, setImportOpen] = useState(false),
    [seriesImportOpen, setSeriesImportOpen] = useState(false),
    [scriptOpen, setScriptOpen] = useState(false),
    [busy, setBusy] = useState(""),
    [mobileInspector, setMobileInspector] = useState(false),
    [inspector, setInspector] = useState<"shot" | "agent">("shot"),
    [pendingSkill, setPendingSkill] = useState<string | undefined>(),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [reorderOpen, setReorderOpen] = useState(false),
    [batchOpen, setBatchOpen] = useState(false);
  const project = projects.find((p) => p.id === projectId),
    shot = project?.shots.find((s) => s.id === shotId) ?? project?.shots[0];
  const siblingEpisodes = project?.episode
    ? projects
        .filter((p) => p.episode?.seriesId === project.episode?.seriesId)
        .sort((a, b) => a.episode!.number - b.episode!.number)
    : [];
  const batchTargets = project
    ? (project.shots.some((s) => !s.selectedVersionId)
        ? project.shots.filter((s) => !s.selectedVersionId)
        : project.shots
      ).map((s) => s.id)
    : [];
  const batchEstimate = project
    ? estimateGeneration(
        project.shots
          .filter((s) => batchTargets.includes(s.id))
          .map((s) => s.duration),
        settings?.pricing,
      )
    : null;
  const batchAllSelected =
    !!project &&
    project.shots.length > 0 &&
    batchTargets.length === project.shots.length &&
    project.shots.every((s) => s.selectedVersionId);
  function openEpisode(id: string) {
    setProjectId(id);
    setShotId("");
    setTab("storyboard");
    setView("workspace");
    setMobileInspector(false);
  }
  function openStoryboard(shotId?: string) {
    setTab("storyboard");
    setFilter("all");
    setInspector("shot");
    if (shotId) setShotId(shotId);
    setMobileInspector(!!shotId);
  }
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(undefined), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const refresh = useCallback(async () => {
    const [p, j, a] = await Promise.all([
      api<P[]>("/projects"),
      api<Job[]>("/jobs"),
      api<Approval[]>("/approvals"),
    ]);
    setProjects(p);
    setJobs(j);
    setApprovals(a);
    setProjectId((old) =>
      p.some((x) => x.id === old) ? old : (p[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const c = await initializeConnection();
        if (native && !c.base) {
          setConnectionOpen(true);
          setReady(true);
          return;
        }
        await connect(c.base, c.token);
        await refresh();
        setSettings(await api("/settings"));
        setLicense(await getLicense());
        setSkills(await api("/skills"));
        setReady(true);
      } catch (e) {
        setConnectionError((e as Error).message);
        setConnectionOpen(true);
        setReady(true);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (!ready || !license?.creem.configured) return;
    const interval = setInterval(() => {
      void getLicense()
        .then(setLicense)
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [ready, license?.creem.configured]);
  useEffect(() => {
    if (!ready || connectionError || connectionOpen) return;
    const interval = setInterval(() => void refresh().catch(() => {}), 2000);
    return () => clearInterval(interval);
  }, [ready, connectionError, connectionOpen, refresh]);
  async function act(
    key: string,
    fn: () => Promise<unknown>,
    message?: string,
  ) {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function openFirstFilm() {
    // Opening the guided trial sample is the first real product action:
    // begin the 14-day trial then, without stacking a welcome modal on the
    // first-run onboarding.
    if (license?.status === "none") {
      const next = await startTrial().catch(() => null);
      if (next) setLicense(next);
    }
    let sampleId: string | undefined;
    const ok = await act("first-film", async () => {
      const sample = await post<P>("/samples/first-film");
      sampleId = sample.id;
    });
    if (ok && sampleId) {
      openEpisode(sampleId);
      setTab("delivery");
    }
  }
  const firstFilmLauncher = (
    <FirstFilmLauncher
      disabled={!ready || !!connectionError || !!busy}
      opening={busy === "first-film"}
      onOpen={() => void openFirstFilm()}
    />
  );
  function useSkillInAgent(skillId: string) {
    if (!project) {
      notify(t("请先打开或新建一个作品，再让导演助手使用该 Skill。"), true);
      return;
    }
    setPendingSkill(skillId);
    setInspector("agent");
    setMobileInspector(true);
    setView("workspace");
  }
  async function patchShot(
    shot: Shot,
    patch: Partial<Shot>,
    revision?: number,
  ) {
    await api(`/projects/${project!.id}/shots/${shot.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, revision }),
    });
    await refresh();
  }
  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    await api(`/projects/${projectId}/assets`, { method: "POST", body: form });
  }
  const activeJobs = jobs.filter((j) =>
    ["queued", "running"].includes(j.state),
  );
  const nav = [
    { id: "workspace", icon: Clapperboard, label: t("创作工作台") },
    { id: "projects", icon: FolderOpen, label: t("所有项目") },
    { id: "assets", icon: ImageIcon, label: t("参考资产") },
    {
      id: "jobs",
      icon: ListTodo,
      label: t("任务队列"),
      count: activeJobs.length,
    },
    { id: "skills", icon: BookOpen, label: t("创作 Skills") },
    { id: "settings", icon: Settings2, label: t("设置与连接") },
  ] as const;
  if (!ready)
    return (
      <div className="boot">
        <div className="brand-symbol">{t("镜")}</div>
        <Loader2 className="spin" />
        <p>{t("正在打开你的创作空间")}</p>
      </div>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("workspace");
          }}
        >
          <div className="brand-symbol">
            <Clapperboard size={23} />
          </div>
          <div>
            {t("镜序")}
            <span>STUDIO</span>
            <small>{t("让每个镜头，值得交付。")}</small>
          </div>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">{t("创")}</span>
          <div>
            {t("我的创作空间")}
            <small>{t("本地工作站 · BYOK")}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">{t("工作空间")}</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => {
                setView(n.id);
                setMobileInspector(false);
              }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {"count" in n && !!n.count && <b>{n.count}</b>}
            </button>
          ))}
        </nav>
        <div className="recent">
          <div className="nav-label">
            {t("最近项目")}
            <button aria-label={t("新建项目")} onClick={() => setNewOpen(true)}>
              <Plus size={14} />
            </button>
          </div>
          {projects.slice(0, 4).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProjectId(p.id);
                setShotId("");
                setView("workspace");
              }}
              className={p.id === projectId ? "selected" : ""}
            >
              <span className="project-dot" />
              {p.name}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="plan-card">
            <Sparkles size={17} />
            <strong>{t("把灵感，做成作品")}</strong>
            <p>
              {t("素材留在工作站")}
              <br />
              {t("生成服务由你选择")}
            </p>
            <button onClick={() => setView("settings")}>
              {t("配置生成服务")}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="connection-status"
            onClick={() => setConnectionOpen(true)}
          >
            <span
              className={connectionError ? "status-dot offline" : "status-dot"}
            />
            {serverBase() ? t("已连接远程工作站") : t("本地数据已保存")}
            <ChevronRight size={13} />
          </button>
          <small className="version-label">
            Jingxu Studio {appVersion} · {t("开发预览")}
          </small>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="breadcrumbs">
            <span>{t("我的工作空间")}</span>
            <ChevronRight size={13} />
            <strong>
              {view === "workspace"
                ? (project?.name ?? t("创作工作台"))
                : nav.find((n) => n.id === view)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              {t("导入项目包")}
            </Button>
            <select
              className="language-select"
              aria-label="Language / 语言"
              value={locale}
              onChange={(e) => setLocale(e.target.value as "zh" | "en")}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
            <span className="local-pill">
              <ShieldCheck size={13} /> {t("本地优先")}
            </span>
            <button
              className="icon-btn"
              onClick={() => setConnectionOpen(true)}
              aria-label={t("可选远程工作站")}
            >
              <Smartphone size={18} />
            </button>
            <button
              className="user-avatar"
              onClick={() => setView("settings")}
              aria-label={t("打开设置")}
            >
              {t("创")}
            </button>
          </div>
        </div>
        {license && (
          <EntitlementBanner
            license={license}
            onOpenSettings={() => setView("settings")}
          />
        )}
        {view === "workspace" && project ? (
          <>
            <header className="project-header">
              <div>
                <div className="eyebrow">
                  {project.episode
                    ? `${project.episode.seriesName} / ${episodeLabel(project.episode.number)}`
                    : `PROJECT / ${String(projects.findIndex((p) => p.id === projectId) + 1).padStart(2, "0")}`}
                </div>
                <h1>
                  {project.name}
                  <span className="badge">{t("制作中")}</span>
                </h1>
                <p>
                  {project.description || t("每一个好故事，都从一个镜头开始。")}
                </p>
                <div className="project-meta">
                  <span>
                    <Film size={13} />
                    {project.format} {t("竖横比例")}
                  </span>
                  <span>
                    <Clapperboard size={13} />
                    {project.shots.length} {t("个镜头")}
                  </span>
                  <span>
                    <Clock3 size={13} />
                    {fmt(project.shots.reduce((n, s) => n + s.duration, 0))}
                  </span>
                  <span className="save-status">
                    <CheckCheck size={13} />
                    {t("已保存到工作站")}
                  </span>
                </div>
              </div>
              <div className="header-actions">
                {project.episode && (
                  <select
                    className="series-switch"
                    aria-label={t("切换分集")}
                    value={project.id}
                    onChange={(e) => openEpisode(e.target.value)}
                  >
                    {siblingEpisodes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {episodeLabel(p.episode!.number)} · {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button onClick={() => setScriptOpen(true)}>
                  <FileText size={15} />
                  {t("剧本")}
                </Button>
                <Button
                  onClick={() =>
                    void act(
                      "archive",
                      () => post(`/projects/${projectId}/archive`),
                      t("素材包已生成，在交付中心查看"),
                    )
                  }
                  disabled={!!busy}
                >
                  <Download size={15} />
                  {t("素材包")}
                </Button>
                <Button variant="primary" onClick={() => setTab("delivery")}>
                  <ArrowUpRight size={16} />
                  {t("导出成片")}
                </Button>
              </div>
            </header>
            <div className="workspace-tabs">
              <div>
                {[
                  { id: "storyboard", name: "分镜工作台", icon: LayoutGrid },
                  { id: "characters", name: "角色与场景", icon: Users },
                  { id: "quality", name: "检查与返修", icon: ShieldCheck },
                  { id: "delivery", name: "交付中心", icon: Download },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    onClick={() => {
                      setTab(item.id);
                      setMobileInspector(false);
                    }}
                  >
                    <item.icon size={15} />
                    {t(item.name)}
                    {item.id === "quality" &&
                      project.shots.some((s) => s.review === "changes") && (
                        <i />
                      )}
                  </button>
                ))}
              </div>
              <span className="subtle hide-mobile">
                R{project.revision} · {date(project.updatedAt)}
              </span>
            </div>
            {tab === "storyboard" ? (
              <div
                className={`workspace ${mobileInspector ? "show-inspector" : ""}`}
              >
                <section className="storyboard-panel">
                  <div className="board-toolbar">
                    <div>
                      <h2>
                        {t("把故事，拍成镜头")}
                        <span>{project.shots.length}</span>
                      </h2>
                      <p>{t("先确认分镜与参考，再生成候选。")}</p>
                    </div>
                    <div className="board-tools">
                      <Button
                        onClick={() => setReorderOpen(true)}
                        disabled={project.shots.length < 2}
                      >
                        {t("调整顺序")}
                      </Button>
                      <button
                        className="icon-btn"
                        title={t("添加镜头")}
                        onClick={() =>
                          void act("add", () =>
                            post(`/projects/${projectId}/shots`),
                          )
                        }
                      >
                        <Plus size={18} />
                      </button>
                      <Button
                        variant="soft"
                        disabled={!!busy || !project.shots.length}
                        onClick={() => setBatchOpen(true)}
                      >
                        <Sparkles size={14} />
                        {busy === "batch" ? t("加入中…") : t("批量生成")}
                      </Button>
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="segmented">
                      {[
                        { id: "all", name: "全部镜头" },
                        { id: "pending", name: "待确认" },
                        { id: "changes", name: "需返修" },
                        { id: "approved", name: "已通过" },
                      ].map((f) => (
                        <button
                          key={f.id}
                          className={filter === f.id ? "active" : ""}
                          onClick={() => setFilter(f.id)}
                        >
                          {t(f.name)}
                        </button>
                      ))}
                    </div>
                    <span className="subtle">
                      {settings?.generation.provider === "demo"
                        ? t("演示模式 · 不消耗额度")
                        : t("自带 Key · 在线生成")}
                    </span>
                  </div>
                  <div className="shot-grid">
                    {project.shots
                      .filter((s) => filter === "all" || s.review === filter)
                      .map((s) => {
                        const v = version(s),
                          asset = project.assets.find(
                            (a) => a.id === v?.assetId,
                          ),
                          running = activeJobs.find((j) => j.shotId === s.id);
                        return (
                          <button
                            key={s.id}
                            className={`shot-card ${shot?.id === s.id ? "selected" : ""}`}
                            onClick={() => {
                              setShotId(s.id);
                              setMobileInspector(true);
                            }}
                            aria-label={`${t("编辑镜头")} ${s.order} ${s.title}`}
                          >
                            <div className="shot-image">
                              {asset ? (
                                asset.kind === "video" ? (
                                  <video
                                    src={mediaUrl(asset.url)}
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                ) : (
                                  <img
                                    src={mediaUrl(asset.url)}
                                    alt={s.title}
                                    loading="lazy"
                                  />
                                )
                              ) : (
                                <div className="shot-placeholder">
                                  <Film size={25} />
                                  <span>{t("等待你的第一个画面")}</span>
                                </div>
                              )}
                              <span className="shot-number">
                                {String(s.order).padStart(2, "0")}
                              </span>
                              <span className="shot-duration">
                                {fmt(s.duration)}
                              </span>
                              {v?.source === "demo" && (
                                <span className="demo-mark">
                                  {t("演示素材")}
                                </span>
                              )}
                              {running && (
                                <div className="generating">
                                  <Loader2 className="spin" size={18} />
                                  {running.state === "queued"
                                    ? t("排队中")
                                    : t("正在生成")}
                                </div>
                              )}
                              <div className="card-play">
                                <Play size={17} fill="currentColor" />
                              </div>
                            </div>
                            <div className="shot-info">
                              <div>
                                <strong>{s.title}</strong>
                                <span className={`review-dot ${s.review}`} />
                              </div>
                              <p>
                                {s.type} <i /> {s.scene}
                              </p>
                              <div className="shot-bottom">
                                <span>
                                  {s.characterIds
                                    .map(
                                      (id) =>
                                        project.characters.find(
                                          (c) => c.id === id,
                                        )?.name,
                                    )
                                    .filter(Boolean)
                                    .join(" · ") || t("场景镜头")}
                                </span>
                                <small>
                                  {v ? `V${v.number}` : t("无素材")}{" "}
                                  <ChevronRight size={11} />
                                </small>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    <button
                      className="add-shot-card"
                      onClick={() =>
                        void act("add", () =>
                          post(`/projects/${projectId}/shots`),
                        )
                      }
                    >
                      <Plus size={24} />
                      <strong>{t("添加一个镜头")}</strong>
                      <span>{t("故事，还有更多可能")}</span>
                    </button>
                  </div>
                  <div className="board-note">
                    <ShieldCheck size={14} />
                    <span>
                      {t(
                        "参考图帮助维持一致性，生成结果仍需逐镜检查。演示素材不代表模型效果。",
                      )}
                    </span>
                  </div>
                </section>
                <aside className="inspector">
                  <div className="inspector-tabs">
                    <button
                      className={inspector === "shot" ? "active" : ""}
                      onClick={() => setInspector("shot")}
                    >
                      <SlidersHorizontal size={14} />
                      {t("镜头设置")}
                    </button>
                    <button
                      className={inspector === "agent" ? "active" : ""}
                      onClick={() => setInspector("agent")}
                    >
                      <Sparkles size={14} />
                      {t("导演助手")}
                      {approvals.filter(
                        (a) =>
                          a.projectId === projectId && a.state === "pending",
                      ).length > 0 && <i />}
                    </button>
                    <button
                      className="icon-btn mobile-only"
                      onClick={() => setMobileInspector(false)}
                      aria-label={t("返回分镜")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  {inspector === "shot" && shot ? (
                    <ShotEditor
                      key={shot.id}
                      shot={shot}
                      project={project}
                      busy={!!busy}
                      running={activeJobs.some(
                        (j) => j.shotId === shot.id && j.type === "generate",
                      )}
                      image={settings?.image}
                      video={settings?.generation}
                      pricing={settings?.pricing}
                      demo={settings?.generation.provider === "demo"}
                      imageRunning={activeJobs.some(
                        (j) => j.shotId === shot.id && j.type === "image",
                      )}
                      onImageRequest={async (kind, request) => {
                        let accepted = false;
                        await act(
                          kind,
                          async () => {
                            await post(
                              `/projects/${projectId}/shots/${shot.id}/${kind}`,
                              request,
                            );
                            accepted = true;
                          },
                          t("候选生成已加入队列"),
                        );
                        return accepted;
                      }}
                      speech={settings?.speech}
                      transcription={settings?.transcription}
                      captionJobs={jobs.filter(
                        (j) => j.projectId === project.id,
                      )}
                      speechRunning={activeJobs.some(
                        (j) => j.shotId === shot.id && j.type === "speech",
                      )}
                      onSpeechQueued={refresh}
                      onSpeechSettings={() => setView("settings")}
                      onSceneSync={
                        siblingEpisodes.length > 1
                          ? (assetId) =>
                              setSceneSync({
                                projectId: project.id,
                                shotId: shot.id,
                                assetId,
                              })
                          : undefined
                      }
                      onSave={(patch, revision) =>
                        act(
                          "save",
                          () => patchShot(shot, patch, revision),
                          t("镜头已保存"),
                        )
                      }
                      onGenerate={() =>
                        act(
                          "generate",
                          () =>
                            post(`/projects/${projectId}/generate`, {
                              shotIds: [shot.id],
                            }),
                          t("候选生成已加入队列"),
                        )
                      }
                      onImport={(assetId) =>
                        act(
                          "import",
                          () =>
                            post(
                              `/projects/${projectId}/shots/${shot.id}/import`,
                              { assetId },
                            ),
                          t("素材已添加为候选"),
                        )
                      }
                      onVisualReview={() =>
                        act(
                          "visual",
                          () =>
                            post(
                              `/projects/${projectId}/shots/${shot.id}/visual-review`,
                            ),
                          t("视觉检查结果已保存"),
                        )
                      }
                      onDelete={() =>
                        act(
                          "delete",
                          () =>
                            api(`/projects/${projectId}/shots/${shot.id}`, {
                              method: "DELETE",
                            }),
                          t("镜头已移除"),
                        )
                      }
                    />
                  ) : (
                    <AgentPanel
                      project={project}
                      skills={skills}
                      initialSkill={pendingSkill}
                      approvals={approvals.filter(
                        (a) => a.projectId === projectId,
                      )}
                      refresh={refresh}
                      notify={notify}
                      settings={settings}
                      onConfigure={() => {
                        setView("settings");
                        setMobileInspector(false);
                      }}
                    />
                  )}
                </aside>
                <div className="timeline">
                  <div className="timeline-heading">
                    <div>
                      <Film size={15} />
                      <strong>{t("故事时间线")}</strong>
                      <span>
                        {fmt(project.shots.reduce((n, s) => n + s.duration, 0))}
                      </span>
                    </div>
                    <span>{t("按已选候选版本导出")}</span>
                  </div>
                  <div className="timeline-track">
                    {project.shots.map((s) => {
                      const a = project.assets.find(
                        (a) => a.id === version(s)?.assetId,
                      );
                      return (
                        <button
                          key={s.id}
                          style={{ flex: s.duration }}
                          className={shot?.id === s.id ? "active" : ""}
                          onClick={() => {
                            setShotId(s.id);
                            setMobileInspector(true);
                          }}
                        >
                          {a?.kind === "image" && (
                            <img src={mediaUrl(a.url)} alt="" />
                          )}
                          <span>
                            {String(s.order).padStart(2, "0")} · {s.duration}s
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="audio-track">
                    <Volume2 size={12} />
                    <span>{t("对白与字幕轨道")}</span>
                    <div className="wave">
                      {Array.from({ length: 65 }, (_, i) => (
                        <i key={i} style={{ height: 4 + ((i * 13) % 17) }} />
                      ))}
                    </div>
                    <span>
                      {project.shots.filter((s) => s.dialogue).length}{" "}
                      {t("条对白 · 按镜头时长排列")}
                    </span>
                  </div>
                </div>
              </div>
            ) : tab === "characters" ? (
              <Characters
                project={project}
                onSync={
                  siblingEpisodes.length > 1
                    ? (characterId) =>
                        setCastSync({ projectId: project.id, characterId })
                    : undefined
                }
                upload={(file) =>
                  act("upload", () => upload(file), t("素材已导入"))
                }
                act={act}
              />
            ) : tab === "quality" ? (
              <Quality project={project} onSelect={openStoryboard} act={act} />
            ) : (
              <Delivery
                project={project}
                jobs={jobs}
                act={act}
                onOpenStoryboard={openStoryboard}
                settings={settings}
                onSettings={setSettings}
                notify={notify}
              />
            )}
          </>
        ) : view === "workspace" ? (
          <div className="page-content first-film-welcome">
            {firstFilmLauncher}
            <Empty
              title={t("开始你的第一部作品")}
              description={t(
                "新建项目，导入剧本，把灵感变成可以继续修改的镜头。",
              )}
            >
              <Button variant="primary" onClick={() => setNewOpen(true)}>
                <Plus size={16} />
                {t("新建项目")}
              </Button>
              <Button onClick={() => setSeriesOpen("new")}>
                <Clapperboard size={16} /> {t("导入分集剧本")}
              </Button>
            </Empty>
          </div>
        ) : null}
        {view === "projects" && (
          <div className="page-content">
            <div className="page-title">
              <div className="eyebrow">YOUR STORIES</div>
              <h1>{t("每个故事，都有一个开始。")}</h1>
              <p>{t("继续创作，或为下一部作品打开新的空间。")}</p>
              <div className="series-actions project-title-actions">
                <Button variant="primary" onClick={() => setNewOpen(true)}>
                  <Plus size={16} />
                  {t("新建项目")}
                </Button>
                <Button onClick={() => setSeriesOpen("new")}>
                  <Clapperboard size={16} /> {t("导入分集剧本")}
                </Button>
                <Button onClick={() => setSeriesImportOpen(true)}>
                  <Upload size={16} /> {t("恢复整季工程")}
                </Button>
              </div>
            </div>
            {firstFilmLauncher}
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label={t("搜索项目")}
                placeholder={t("搜索你的项目…")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <SeriesBoard
              projects={projects}
              jobs={jobs}
              query={query}
              busy={!!busy}
              openEpisode={openEpisode}
              appendEpisodes={setSeriesOpen}
              onRender={async (id) => {
                await act("series-render", async () => {
                  const batch = await post<{ jobs: Job[]; skipped: unknown[] }>(
                    `/series/${id}/render`,
                  );
                  notify(
                    `${batch.jobs.length} ${t("集加入渲染队列")} · ${batch.skipped.length} ${t("集跳过")}`,
                  );
                });
              }}
              onDelete={(id, title) => {
                if (
                  confirm(
                    `${t("删除项目并移除记录？请先导出素材包。")} ${title}`,
                  )
                )
                  void act(
                    "delete",
                    () => api(`/projects/${id}`, { method: "DELETE" }),
                    t("项目已删除"),
                  );
              }}
              onError={(error) =>
                notify(
                  error instanceof Error ? error.message : t("请求失败"),
                  true,
                )
              }
            />
            <div className="project-grid">
              {projects
                .filter(
                  (p) =>
                    !p.episode &&
                    p.name.toLowerCase().includes(query.trim().toLowerCase()),
                )
                .map((p) => (
                  <article className="project-card" key={p.id}>
                    <button
                      onClick={() => {
                        setProjectId(p.id);
                        setView("workspace");
                        setShotId("");
                      }}
                    >
                      {p.assets[0] ? (
                        <img src={mediaUrl(p.assets[0].url)} alt={p.name} />
                      ) : (
                        <div className="project-cover-placeholder">
                          <Clapperboard size={40} />
                        </div>
                      )}
                      <div className="project-card-body">
                        <span className="eyebrow">
                          {p.format} · {p.style}
                        </span>
                        <h2>{p.name}</h2>
                        <p>{p.description || t("一个正在发生的故事")}</p>
                        <footer>
                          <span>
                            {p.shots.length} {t("镜头 ·")}
                            {date(p.updatedAt)}
                          </span>
                          <ArrowUpRight size={17} />
                        </footer>
                      </div>
                    </button>
                    <div className="project-card-actions">
                      <button
                        onClick={() =>
                          void act(
                            "duplicate",
                            () => post(`/projects/${p.id}/duplicate`),
                            t("项目副本已创建"),
                          )
                        }
                      >
                        <Copy size={13} />
                        {t("副本")}
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `${t("删除项目并移除记录？请先导出素材包。")} ${p.name}`,
                            )
                          )
                            void act(
                              "delete",
                              () =>
                                api(`/projects/${p.id}`, { method: "DELETE" }),
                              t("项目已删除"),
                            );
                        }}
                      >
                        <Trash2 size={13} />
                        {t("删除")}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        )}
        {view === "assets" && (
          <Assets
            project={project}
            upload={(file) =>
              act("upload", () => upload(file), t("素材已导入工作站"))
            }
            onCreate={() => setNewOpen(true)}
          />
        )}
        {view === "jobs" && (
          <Jobs
            jobs={jobs}
            projects={projects}
            act={act}
            settings={settings}
            onSettings={setSettings}
            notify={notify}
          />
        )}
        {view === "skills" && (
          <Skills
            skills={skills}
            refresh={async () => setSkills(await api("/skills"))}
            notify={notify}
            onUseSkill={useSkillInAgent}
          />
        )}
        {batchOpen && project && batchEstimate && (
          <BatchCostConfirm
            estimate={batchEstimate}
            allSelected={batchAllSelected}
            demo={settings?.generation.provider === "demo"}
            busy={busy === "batch"}
            budgetWarning={monthBudgetWarning(
              jobs,
              settings?.pricing,
              batchEstimate.videoCost,
            )}
            onCancel={() => setBatchOpen(false)}
            onConfirm={() =>
              void act(
                "batch",
                () =>
                  post(`/projects/${projectId}/generate`, {
                    shotIds: batchTargets,
                  }),
                t("生成任务已加入队列"),
              ).then((ok) => {
                if (ok) setBatchOpen(false);
              })
            }
          />
        )}
        {reorderOpen && project && (
          <ReorderProject
            project={project}
            onClose={() => setReorderOpen(false)}
            onSave={(ids) =>
              act(
                "reorder",
                () =>
                  post(`/projects/${project.id}/reorder`, {
                    shotIds: ids,
                    revision: project.revision,
                  }),
                t("顺序已保存"),
              )
            }
          />
        )}
        {view === "settings" && settings && (
          <>
            {license && (
              <LicenseCard
                license={license}
                onChanged={setLicense}
                notify={notify}
              />
            )}
            <Settings
              value={settings}
              onSaved={setSettings}
              notify={notify}
              onConnect={() => setConnectionOpen(true)}
            />
          </>
        )}
      </main>
      <nav className="mobile-nav">
        {nav
          .filter((n) =>
            ["workspace", "projects", "jobs", "settings"].includes(n.id),
          )
          .map((n) => (
            <button
              className={view === n.id ? "active" : ""}
              key={n.id}
              onClick={() => {
                setView(n.id);
                setMobileInspector(false);
              }}
            >
              <n.icon size={20} />
              <span>{n.label.replace("创作", "").replace("与连接", "")}</span>
            </button>
          ))}
      </nav>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(undefined)}
            aria-label={t("关闭提示")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {seriesOpen && (
        <Modal
          title={t(seriesOpen === "new" ? "导入分集剧本" : "添加分集")}
          wide
          onClose={() => setSeriesOpen(undefined)}
        >
          <SeriesImportForm
            append={seriesOpen === "new" ? undefined : seriesOpen}
            close={() => setSeriesOpen(undefined)}
            onCreated={async () => {
              await refresh();
              setQuery("");
              setView("projects");
              setSeriesOpen(undefined);
              notify(t("分集项目已创建"));
            }}
          />
        </Modal>
      )}
      {castSync && (
        <Modal
          title={t("跨集同步角色")}
          wide
          onClose={() => setCastSync(undefined)}
        >
          <CastSyncForm
            {...castSync}
            onClose={() => setCastSync(undefined)}
            onApplied={async (result) => {
              await refresh();
              setCastSync(undefined);
              notify(
                `${result.updatedEpisodes} ${t("集已更新角色参考")} · ${result.linkedShots} ${t("个镜头待核对")}`,
              );
            }}
          />
        </Modal>
      )}
      {sceneSync && (
        <Modal
          title={t("跨集同步场景参考")}
          wide
          onClose={() => setSceneSync(undefined)}
        >
          <SceneSyncForm
            {...sceneSync}
            onClose={() => setSceneSync(undefined)}
            onApplied={async (result) => {
              await refresh();
              setSceneSync(undefined);
              notify(
                `${result.updatedEpisodes} ${t("集已添加场景参考")} · ${result.linkedShots} ${t("个镜头待核对")}`,
              );
            }}
          />
        </Modal>
      )}
      {ready &&
        license?.status === "none" &&
        !welcomeHidden &&
        !connectionError &&
        // The first-run onboarding surfaces already invite the user to open
        // the trial sample (which starts the trial); do not stack modals.
        !(view === "workspace" && !project) &&
        view !== "projects" && (
          <TrialWelcome
            busy={!!busy}
            onStart={async () => {
              try {
                setLicense(await startTrial());
                notify(t("14 天试用已开始"));
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
            onLater={() => {
              localStorage.setItem("jx-welcome-dismissed", "1");
              setWelcomeHidden(true);
              setView("settings");
            }}
          />
        )}
      {newOpen && (
        <NewProject
          onClose={() => setNewOpen(false)}
          onCreated={async (p) => {
            await refresh();
            setProjectId(p.id);
            setShotId("");
            setView("workspace");
            setTab("storyboard");
            setNewOpen(false);
            notify(t("项目已创建"));
          }}
          notify={notify}
        />
      )}
      {importOpen && (
        <Modal title={t("导入项目包")} onClose={() => setImportOpen(false)}>
          <ImportProjectForm
            onClose={() => setImportOpen(false)}
            onImported={async (p) => {
              await refresh();
              setProjectId(p.id);
              setShotId("");
              setView("workspace");
              setTab("storyboard");
              setImportOpen(false);
              notify(t("项目包已恢复为新项目"));
            }}
          />
        </Modal>
      )}
      {seriesImportOpen && (
        <Modal
          title={t("恢复整季工程")}
          onClose={() => setSeriesImportOpen(false)}
        >
          <ImportProjectForm<RestoredSeries>
            series
            onClose={() => setSeriesImportOpen(false)}
            onImported={async (result) => {
              await refresh();
              openEpisode(result.projects[0].id);
              setSeriesImportOpen(false);
              notify(`${result.projects.length} ${t("集已恢复为新剧集")}`);
            }}
          />
        </Modal>
      )}
      {scriptOpen && project && (
        <ScriptEditor
          project={project}
          onClose={() => setScriptOpen(false)}
          refresh={refresh}
          notify={notify}
        />
      )}
      {connectionOpen && (
        <Connection
          error={connectionError}
          onClose={() => setConnectionOpen(false)}
          onConnect={async () => {
            setConnectionError("");
            await refresh();
            setSettings(await api("/settings"));
            setSkills(await api("/skills"));
            setConnectionOpen(false);
            notify(t("工作站已连接"));
          }}
        />
      )}
    </div>
  );
}

function ReorderProject({
  project,
  onClose,
  onSave,
}: {
  project: P;
  onClose: () => void;
  onSave: (ids: string[]) => Promise<boolean>;
}) {
  const [ids, setIds] = useState(project.shots.map((s) => s.id));
  const [busy, setBusy] = useState(false);
  function move(index: number, delta: number) {
    setIds((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <Modal title={t("调整镜头顺序")} onClose={onClose}>
      <p className="caption">{t("调整故事顺序，保留全部候选版本。")}</p>
      <ol className="reorder-list">
        {ids.map((id, index) => {
          const s = project.shots.find((s) => s.id === id)!;
          return (
            <li key={id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{s.title}</strong>
              <Button
                disabled={index === 0 || busy}
                aria-label={`${t("上移")} ${s.title}`}
                onClick={() => move(index, -1)}
              >
                ↑
              </Button>
              <Button
                disabled={index === ids.length - 1 || busy}
                aria-label={`${t("下移")} ${s.title}`}
                onClick={() => move(index, 1)}
              >
                ↓
              </Button>
            </li>
          );
        })}
      </ol>
      <footer className="modal-footer">
        <Button
          disabled={busy}
          variant="primary"
          onClick={() => {
            setBusy(true);
            void onSave(ids)
              .then((ok) => {
                if (ok) onClose();
              })
              .finally(() => setBusy(false));
          }}
        >
          {t("保存顺序")}
        </Button>
      </footer>
    </Modal>
  );
}
export function AudioPreview({
  asset,
  duration,
}: {
  asset?: P["assets"][number];
  duration: number;
}) {
  const [seconds, setSeconds] = useState<number>();
  if (!asset) return null;
  return (
    <div className="voiceover-preview">
      <audio
        controls
        preload="metadata"
        src={mediaUrl(asset.url)}
        aria-label={t("试听镜头配音")}
        onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration)}
      />
      {seconds !== undefined && Number.isFinite(seconds) && (
        <p className="caption">
          {t("音轨时长")} {seconds.toFixed(1)}s · {t("镜头")} {duration}s
        </p>
      )}
      {seconds !== undefined && seconds > duration + 0.1 && (
        <p role="status" className="form-error">
          {t(
            "配音长于镜头，成片会截断。请缩短台词、调整语速或延长镜头后重新试听。",
          )}
        </p>
      )}
    </div>
  );
}
export function ShotEditor({
  shot,
  project,
  busy,
  running,
  onSave,
  onSceneSync,
  onGenerate,
  onImport,
  onDelete,
  onVisualReview,
  image,
  video,
  imageRunning = false,
  onImageRequest,
  speech,
  speechRunning = false,
  transcription,
  captionJobs = [],
  onSpeechQueued,
  onSpeechSettings,
  pricing,
  demo,
}: {
  shot: Shot;
  project: P;
  busy: boolean;
  running: boolean;
  onSave: (p: Partial<Shot>, revision?: number) => Promise<boolean>;
  onSceneSync?: (assetId: string) => void;
  onGenerate: () => Promise<boolean>;
  onImport: (id: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onVisualReview: () => Promise<boolean>;
  image?: PublicSettings["image"];
  video?: PublicSettings["generation"];
  imageRunning?: boolean;
  onImageRequest?: (
    kind: "image" | "first-frame",
    request: {
      revision: number;
      endpoint: string;
      model: string;
      assetId?: string;
    },
  ) => Promise<boolean>;
  transcription?: PublicTranscription;
  captionJobs?: Job[];
  speech?: PublicSpeech;
  speechRunning?: boolean;
  onSpeechQueued?: () => Promise<void>;
  onSpeechSettings?: () => void;
  pricing?: Pricing;
  demo?: boolean;
}) {
  const [draft, setDraft] = useState(shot),
    [changed, setChanged] = useState(false),
    [preview, setPreview] = useState<string>(),
    [versionTab, setVersionTab] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [captionsOpen, setCaptionsOpen] = useState(false);
  const [referenceBase, setReferenceBase] = useState<string[]>();
  const referenceConflict =
    !!referenceBase &&
    JSON.stringify(referenceBase) !== JSON.stringify(shot.referenceIds);
  const [imageReview, setImageReview] = useState<{
    kind: "image" | "first-frame";
    revision: number;
    endpoint: string;
    model: string;
    prompt: string;
    refs: { id: string; name: string; url?: string }[];
    assetId?: string;
    duration?: number;
  }>();
  const chosen = version(shot),
    asset = project.assets.find((a) => a.id === (preview ?? chosen?.assetId));
  const selectedImage = project.assets.find(
    (a) => a.id === chosen?.assetId && a.kind === "image",
  );
  const imageConfigured = image?.endpoint && image.model && image.hasApiKey;
  const singleEstimate = estimateGeneration([draft.duration], pricing);
  const reviewEstimate =
    !demo && imageReview
      ? imageReview.kind === "image"
        ? typeof pricing?.imagePerImage === "number" &&
          pricing.imagePerImage > 0
          ? {
              amount: pricing.imagePerImage,
              unit: getLocale() === "en" ? "image" : t("张"),
              qty: 1,
              currency: pricing.currency?.trim() || "¥",
            }
          : null
        : imageReview.duration
          ? (() => {
              const e = estimateGeneration([imageReview.duration!], pricing);
              return e.videoCost !== undefined
                ? {
                    amount: e.videoCost,
                    unit: t("秒"),
                    qty: e.videoSeconds,
                    currency: e.currency,
                  }
                : null;
            })()
          : null
      : null;
  useEffect(() => {
    if (!changed) setDraft(shot);
  }, [shot, changed]);
  function change(key: keyof Shot, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
    setChanged(true);
  }
  const save = async () => {
    if (referenceConflict) return false;
    const patch = {
      title: draft.title,
      scene: draft.scene,
      type: draft.type,
      duration: Number(draft.duration),
      trimStart: Number(draft.trimStart ?? 0),
      dialogue: draft.dialogue,
      prompt: draft.prompt,
      note: draft.note,
      characterIds: draft.characterIds,
      audioAssetId: draft.audioAssetId ?? "",
    };
    const ok = referenceBase
      ? await onSave(
          { ...patch, referenceIds: draft.referenceIds },
          project.revision,
        )
      : await onSave(patch);
    if (ok) {
      setReferenceBase(undefined);
      setChanged(false);
    }
    return ok;
  };
  return (
    <>
      {captionsOpen && onSpeechQueued && onSpeechSettings && (
        <Modal
          title={t("时间轴字幕")}
          onClose={() => setCaptionsOpen(false)}
          wide
        >
          <CaptionEditor
            project={project}
            shot={shot}
            jobs={captionJobs}
            config={transcription}
            pricing={pricing}
            onSaved={onSpeechQueued}
            onClose={() => setCaptionsOpen(false)}
            openSettings={() => {
              setCaptionsOpen(false);
              onSpeechSettings();
            }}
          />
        </Modal>
      )}
      <div className="inspector-scroll">
        <div className="inspector-heading">
          <div className="eyebrow">
            SHOT {String(shot.order).padStart(2, "0")}
          </div>
          <button
            className="icon-btn danger-hover"
            onClick={() => {
              if (confirm(t("删除这个镜头？候选版本将随镜头记录移除。")))
                void onDelete();
            }}
            aria-label={t("删除镜头")}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="preview-stage">
          {asset ? (
            asset.kind === "video" ? (
              <video
                key={asset.id}
                controls
                playsInline
                src={mediaUrl(asset.url)}
              />
            ) : (
              <img src={mediaUrl(asset.url)} alt={t("镜头预览")} />
            )
          ) : (
            <div>
              <Film size={30} />
              <span>{t("尚无镜头素材")}</span>
            </div>
          )}
          <span className="preview-format">{project.format}</span>
          {chosen?.source === "demo" && (
            <span className="preview-demo">{t("演示素材 · 非模型输出")}</span>
          )}
        </div>
        <div className="version-picker">
          <button onClick={() => setVersionTab(!versionTab)}>
            <span>
              {chosen ? `${t("已选")} V${chosen.number}` : t("尚未选择版本")}
            </span>
            <small>
              {shot.versions.length} {t("个候选")}
            </small>
            <ChevronDown size={13} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setImportOpen(true)}
            aria-label={t("导入镜头素材")}
          >
            <Upload size={14} />
          </button>
        </div>
        {versionTab && (
          <div className="version-list">
            {[...shot.versions].reverse().map((v) => (
              <div
                key={v.id}
                className={v.id === shot.selectedVersionId ? "selected" : ""}
              >
                <button onClick={() => setPreview(v.assetId)}>
                  <Play size={13} />V{v.number}
                  <small>
                    {v.source === "demo"
                      ? t("演示")
                      : v.source === "imported"
                        ? t("导入")
                        : t("生成")}
                  </small>
                </button>
                <button
                  onClick={() =>
                    void onSave({ selectedVersionId: v.id }).then(() =>
                      setPreview(undefined),
                    )
                  }
                >
                  {v.id === shot.selectedVersionId ? (
                    <Check size={14} />
                  ) : (
                    t("选用")
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="field">
          <span>{t("镜头标题")}</span>
          <input
            value={draft.title}
            onChange={(e) => change("title", e.target.value)}
            maxLength={120}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t("景别")}</span>
            <select
              value={draft.type}
              onChange={(e) => change("type", e.target.value)}
            >
              {["远景", "全景", "中景", "近景", "特写"].map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("时长 / 秒")}</span>
            <input
              type="number"
              min={2}
              max={30}
              value={draft.duration}
              onChange={(e) => change("duration", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("裁切起点 / 秒")}</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={draft.trimStart ?? 0}
            onChange={(e) => change("trimStart", e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("场景设定")}</span>
          <input
            value={draft.scene}
            onChange={(e) => change("scene", e.target.value)}
            placeholder={t("地点 · 时间 · 光线")}
            maxLength={300}
          />
        </label>
        <ShotReferences
          assets={project.assets}
          value={referenceBase ? draft.referenceIds : shot.referenceIds}
          changed={changed}
          disabled={busy}
          onSync={onSceneSync}
          onDiscard={
            referenceConflict ? () => setReferenceBase(undefined) : undefined
          }
          onChange={(ids) => {
            setReferenceBase((base) => base ?? shot.referenceIds);
            change("referenceIds", ids);
          }}
        />
        <label className="field">
          <span>{t("对白 / 字幕")}</span>
          <textarea
            rows={2}
            value={draft.dialogue}
            onChange={(e) => change("dialogue", e.target.value)}
            placeholder={t("此镜头的对白或旁白")}
          />
        </label>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!changed || (await save())) setCaptionsOpen(true);
          }}
        >
          <FileText size={14} />
          {t("时间轴字幕")}
        </button>
        <label className="field">
          <span>{t("镜头配音 / 可导入音频")}</span>
          <select
            value={draft.audioAssetId ?? ""}
            onChange={(e) => change("audioAssetId", e.target.value)}
          >
            <option value="">{t("保留源视频音轨 / 无音轨则静音")}</option>
            {project.assets
              .filter((a) => a.kind === "audio")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        {draft.audioAssetId && (
          <AudioPreview
            key={draft.audioAssetId}
            asset={project.assets.find((a) => a.id === draft.audioAssetId)}
            duration={Number(draft.duration)}
          />
        )}
        {speech && onSpeechQueued && onSpeechSettings && (
          <VoiceoverComposer
            projectId={project.id}
            shotId={shot.id}
            dialogue={draft.dialogue}
            config={speech}
            disabled={busy}
            running={speechRunning}
            saveDraft={async () => !changed || (await save())}
            onQueued={onSpeechQueued}
            openSettings={onSpeechSettings}
            pricing={pricing}
          />
        )}
        <div className="field">
          <span>{t("出场角色")}</span>
          <div className="character-chips">
            {project.characters.map((c) => (
              <button
                key={c.id}
                className={draft.characterIds.includes(c.id) ? "selected" : ""}
                onClick={() =>
                  change(
                    "characterIds",
                    draft.characterIds.includes(c.id)
                      ? draft.characterIds.filter((x) => x !== c.id)
                      : [...draft.characterIds, c.id],
                  )
                }
              >
                <Users size={11} />
                {c.name}
                {draft.characterIds.includes(c.id) && <Check size={11} />}
              </button>
            ))}
            {!project.characters.length && (
              <small>{t("在“角色与场景”中添加角色")}</small>
            )}
          </div>
        </div>
        <label className="field">
          <span>
            <Sparkles size={13} />
            {t("生成提示词")}
          </span>
          <textarea
            rows={4}
            value={draft.prompt}
            onChange={(e) => change("prompt", e.target.value)}
            placeholder={t("画面、动作、运镜、风格和需要保留的内容")}
          />
        </label>
        <label className="field">
          <span>{t("局部返修要求")}</span>
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => change("note", e.target.value)}
            placeholder={t("如：保留服装和场景，修正人物转头后的面部")}
          />
        </label>
        <div className="visual-review">
          <Button
            variant="soft"
            disabled={busy || !shot.selectedVersionId}
            onClick={() => void onVisualReview()}
          >
            <ShieldCheck size={14} />
            {t("视觉检查当前候选")}
          </Button>
          <p className="caption">
            {t(
              "将当前画面与绑定参考发送至你配置的视觉模型；检查结果供你判断。",
            )}
          </p>
          {shot.visualReview && (
            <div className="visual-result">
              <small>
                {shot.visualReview.versionId === shot.selectedVersionId
                  ? t("针对当前已选版本")
                  : t("针对历史版本，当前候选需要重新检查")}{" "}
                · {shot.visualReview.frameCount} {t("帧")}
              </small>
              <p>{shot.visualReview.text}</p>
            </div>
          )}
        </div>
        <div className="review-controls">
          <span>{t("审核状态")}</span>
          <select
            aria-label={t("审核状态")}
            value={shot.review}
            onChange={(e) =>
              void onSave({ review: e.target.value as Shot["review"] })
            }
          >
            <option value="pending">{t("待确认")}</option>
            <option value="approved">{t("已通过")}</option>
            <option value="changes">{t("需返修")}</option>
          </select>
        </div>
        <p className="caption">
          {t("每次生成新增候选，当前已选版本保持不变。")}
        </p>
        {image && onImageRequest && (
          <section
            className="shot-image-tools"
            aria-label={t("镜头图片与首帧")}
          >
            <div>
              <Button
                disabled={
                  busy ||
                  imageRunning ||
                  (!!imageConfigured && (changed || !shot.prompt.trim()))
                }
                onClick={() => {
                  if (!imageConfigured) return onSpeechSettings?.();
                  setImageReview({
                    kind: "image",
                    revision: project.revision,
                    endpoint: image.endpoint,
                    model: image.model,
                    prompt: imagePrompt(project, shot),
                    refs: referenceIds(project, shot).map((id) => {
                      const reference = project.assets.find((a) => a.id === id);
                      return {
                        id,
                        name: reference?.name ?? t("参考素材不存在"),
                      };
                    }),
                  });
                }}
              >
                {imageRunning ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <ImageIcon size={14} />
                )}
                {t(imageConfigured ? "生成图片候选" : "配置图片服务")}
              </Button>
              {selectedImage &&
                video?.provider === "ark" &&
                video.hasApiKey &&
                video.model && (
                  <Button
                    disabled={busy || changed || running}
                    onClick={() =>
                      setImageReview({
                        kind: "first-frame",
                        revision: project.revision,
                        endpoint: video.endpoint,
                        model: video.model,
                        prompt: videoPrompt(project, shot),
                        refs: [selectedImage],
                        assetId: selectedImage.id,
                        duration: firstFrameSeconds(shot),
                      })
                    }
                  >
                    <Film size={14} /> {t("用选中图片生成视频")}
                  </Button>
                )}
            </div>
            {changed && (
              <p className="caption">
                {t("保存镜头修改后再确认图片或首帧生成。")}
              </p>
            )}
          </section>
        )}
      </div>
      <div className="inspector-footer">
        {!demo && singleEstimate.videoCost !== undefined && (
          <span
            className="shot-cost-hint"
            title={t("按你填写的每秒单价估算，实际以服务商账单为准。")}
          >
            <strong>
              ≈ {singleEstimate.currency}
              {Number(singleEstimate.videoCost.toFixed(4))}
            </strong>{" "}
            · {singleEstimate.videoSeconds}
            {t("秒")}
          </span>
        )}
        <Button
          onClick={() => void save()}
          disabled={busy || !changed || referenceConflict}
        >
          {changed ? t("保存修改") : t("已保存")}
        </Button>
        <Button
          variant="primary"
          disabled={busy || running || referenceConflict}
          onClick={() =>
            void (async () => {
              if (changed && !(await save())) return;
              await onGenerate();
            })()
          }
        >
          {running ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {t("生成候选")}
        </Button>
      </div>
      {imageReview && onImageRequest && (
        <Modal
          title={t(
            imageReview.kind === "image"
              ? "确认生成图片"
              : "确认用首帧生成视频",
          )}
          onClose={() => setImageReview(undefined)}
        >
          <div className="shot-image-review">
            <p className="caption">
              {t("确认后会将以下内容发送到你的服务商，可能产生费用。")}
            </p>
            {reviewEstimate && (
              <div className="review-cost">
                <span>{t("预计成本")}</span>
                <strong>
                  ≈ {reviewEstimate.currency}
                  {Number(reviewEstimate.amount.toFixed(4))}
                </strong>
                <small>
                  · {reviewEstimate.qty} {reviewEstimate.unit}
                  {t("，以服务商账单为准。")}
                </small>
              </div>
            )}
            <p>
              <strong>{imageReview.model}</strong>
              <br />
              <small>{imageReview.endpoint}</small>
            </p>
            {imageReview.refs.some((ref) => ref.url) && (
              <img
                src={mediaUrl(imageReview.refs[0].url!)}
                alt={imageReview.refs[0].name}
              />
            )}
            {imageReview.duration && (
              <p className="caption">
                {t("视频时长")} · {fmt(imageReview.duration)} ·{" "}
                {t("画幅随首帧")}
              </p>
            )}
            <p className="caption">{t("将发送的图片")}</p>
            {imageReview.refs.length ? (
              <ul>
                {imageReview.refs.map((ref) => (
                  <li key={ref.id}>{ref.name}</li>
                ))}
              </ul>
            ) : (
              <p>{t("无参考图")}</p>
            )}
            <p className="caption">{t("将发送的提示词")}</p>
            <pre>{imageReview.prompt}</pre>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                const { kind, revision, endpoint, model, assetId } =
                  imageReview;
                void onImageRequest(kind, {
                  revision,
                  endpoint,
                  model,
                  assetId,
                }).then((ok) => {
                  if (ok) setImageReview(undefined);
                });
              }}
            >
              {t("确认并加入队列")}
            </Button>
          </div>
        </Modal>
      )}
      {importOpen && (
        <Modal title={t("选用项目素材")} onClose={() => setImportOpen(false)}>
          <p className="caption">
            {t("先在参考资产中上传图片或 MP4，再添加为这个镜头的候选。")}
          </p>
          <div className="import-list">
            {project.assets
              .filter((a) => ["image", "video"].includes(a.kind))
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    void onImport(a.id).then(() => setImportOpen(false))
                  }
                >
                  <ImageIcon size={15} />
                  {a.name}
                  <Plus size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function NewProject({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (p: P) => Promise<void>;
  notify: (m: string, e?: boolean) => void;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [script, setScript] = useState(""),
    [format, setFormat] = useState("9:16"),
    [style, setStyle] = useState("电影写实"),
    [loading, setLoading] = useState(false);
  return (
    <Modal title={t("开始一个新故事")} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          void post<P>("/projects", {
            name,
            description,
            script,
            format,
            style,
          })
            .then(async (p) => {
              if (script.trim()) p = await post(`/projects/${p.id}/storyboard`);
              await onCreated(p);
            })
            .catch((e) => notify(e.message, true))
            .finally(() => setLoading(false));
        }}
      >
        <p className="modal-intro">
          {t("从剧本出发，把角色、镜头和每一次修改留在同一个项目里。")}
        </p>
        <label className="field">
          <span>{t("项目名称")}</span>
          <input
            autoFocus
            required
            maxLength={100}
            placeholder={t("为你的作品起个名字")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("故事简介")}</span>
          <input
            maxLength={1000}
            placeholder={t("一句话介绍你的故事")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t("画幅")}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </select>
          </label>
          <label className="field">
            <span>{t("视觉风格")}</span>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {["电影写实", "国风动画", "治愈手绘", "产品广告", "自定义"].map(
                (s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <label className="field">
          <span>
            {t("剧本 / 小说片段")}
            <small>{t("可稍后添加")}</small>
          </span>
          <textarea
            rows={7}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={
              "角色：林晚、陈序\n雨夜，林晚站在便利店门前。\n林晚：这封信，为什么现在才送到？"
            }
          />
        </label>
        <div className="notice">
          <FileText size={16} />
          <span>
            {t(
              "未配置模型时使用本地规则拆镜；每段生成一个初稿镜头，可继续编辑。",
            )}
          </span>
        </div>
        <footer className="modal-footer">
          <Button type="button" onClick={onClose}>
            {t("取消")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}
            {t("创建项目")}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
function ScriptEditor({
  project,
  onClose,
  refresh,
  notify,
}: {
  project: P;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [script, setScript] = useState(project.script),
    [loading, setLoading] = useState(false);
  async function save(split = false) {
    setLoading(true);
    try {
      await api(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ script }),
      });
      if (split) await post(`/projects/${project.id}/storyboard`);
      await refresh();
      notify(split ? t("已生成分镜初稿") : t("剧本已保存"));
      onClose();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title={t("故事从这里开始")} onClose={onClose} wide>
      <p className="caption">
        {t(
          "按段落组织场景与对白。本地拆镜为规则初稿；智能改编可交给已配置模型的导演助手。",
        )}
      </p>
      <textarea
        className="script-editor"
        aria-label={t("项目剧本")}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={14}
      />
      <footer className="modal-footer">
        <Button onClick={() => void save()} disabled={loading}>
          {t("保存剧本")}
        </Button>
        <Button
          variant="primary"
          disabled={
            loading ||
            !script.trim() ||
            project.shots.some((s) => s.versions.length)
          }
          onClick={() => void save(true)}
        >
          <Clapperboard size={16} />
          {t("保存并拆分镜")}
        </Button>
      </footer>
      {project.shots.some((s) => s.versions.length) && (
        <p className="caption">
          {t(
            "项目已有镜头素材。需要重新拆镜时，请先创建副本，以保留现有作品。",
          )}
        </p>
      )}
    </Modal>
  );
}
function Characters({
  project,
  upload,
  act,
  onSync,
}: {
  project: P;
  upload: (f: File) => Promise<unknown>;
  act: Function;
  onSync?: (characterId: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="page-content">
      <div className="section-heading">
        <div>
          <h2>{t("让角色，成为熟悉的人。")}</h2>
          <p>{t("固定人设、服装和参考图，给每个镜头共同的起点。")}</p>
        </div>
        <label className="btn">
          <Upload size={15} />
          {t("上传参考图")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
            }}
          />
        </label>
      </div>
      <div className="character-grid">
        {project.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            project={project}
            onSync={onSync && (() => onSync(c.id))}
            onSave={(data: any) =>
              act(
                "character",
                () =>
                  api(`/projects/${project.id}/characters/${c.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(data),
                  }),
                t("角色已保存"),
              )
            }
          />
        ))}
        <form
          className="new-character"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              "character",
              () => post(`/projects/${project.id}/characters`, { name }),
              t("角色已添加"),
            ).then(() => setName(""));
          }}
        >
          <Users size={30} />
          <h3>{t("添加新角色")}</h3>
          <input
            required
            aria-label={t("新角色名字")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("角色名字")}
            maxLength={100}
          />
          <Button type="submit" variant="soft" disabled={!name.trim()}>
            <Plus size={14} />
            {t("添加角色")}
          </Button>
        </form>
      </div>
      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          {t(
            "绑定参考图可提供一致性约束，无法保证复杂动作与所有角度下完全一致。请逐镜预览确认。",
          )}
        </span>
      </div>
    </div>
  );
}
function CharacterCard({
  character: c,
  project,
  onSave,
  onSync,
}: {
  character: Character;
  project: P;
  onSave: (data: unknown) => Promise<void>;
  onSync?: () => void;
}) {
  const [description, setDescription] = useState(c.description);
  const a = project.assets.find((a) => a.id === c.referenceId);
  return (
    <article className="character-card">
      <div className="character-cover">
        {a ? <img src={mediaUrl(a.url)} alt={c.name} /> : <Users size={40} />}
        <span>{t("角色参考")}</span>
      </div>
      <div>
        <h3>{c.name}</h3>
        <label className="field">
          <span>{t("人设与外观")}</span>
          <textarea
            aria-label={`${c.name} ${t("人设")}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <label className="field">
          <span>{t("定妆参考图")}</span>
          <select
            aria-label={`${c.name} ${t("参考图")}`}
            value={c.referenceId ?? ""}
            onChange={(e) =>
              void onSave({ referenceId: e.target.value || null })
            }
          >
            <option value="">{t("尚未绑定")}</option>
            {project.assets
              .filter((a) => a.kind === "image")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <div className="series-actions">
          <Button onClick={() => void onSave({ description })}>
            {t("保存人设")}
          </Button>
          {onSync && a?.kind === "image" && (
            <Button disabled={description !== c.description} onClick={onSync}>
              <Users size={14} />
              {t("跨集同步角色")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
export function Assets({
  project,
  upload,
  onCreate,
}: {
  project?: P;
  upload: (f: File) => Promise<unknown>;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState("all");
  if (!project)
    return (
      <Empty
        title={t("先创建一个项目")}
        description={t("资产按项目保存，让角色与镜头保持关联。")}
      >
        <Button onClick={onCreate}>{t("创建项目")}</Button>
      </Empty>
    );
  const filters = [
    { id: "all", name: "全部素材" },
    { id: "image", name: "图片" },
    { id: "video", name: "视频" },
    { id: "audio", name: "音频" },
    { id: "document", name: "文档" },
  ];
  const visibleAssets = project.assets.filter(
    (a) => filter === "all" || a.kind === filter,
  );
  return (
    <div className="page-content">
      <div className="section-heading">
        <div>
          <div className="eyebrow">ASSET LIBRARY / {project.name}</div>
          <h1>{t("让好素材，继续被使用。")}</h1>
          <p>{t("图片、视频、音频与参考文档，统一保存在项目中。")}</p>
        </div>
        <label className="btn primary">
          <Upload size={15} />
          {t("导入素材")}
          <input
            type="file"
            aria-label={t("导入素材")}
            accept=".png,.jpg,.jpeg,.webp,.mp4,.mp3,.wav,.txt,.srt"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="segmented">
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? "active" : ""}
            onClick={() => setFilter(f.id)}
          >
            {t(f.name)}
          </button>
        ))}
      </div>
      <div className="asset-grid">
        {visibleAssets.map((a) => (
          <article className="asset-card" key={a.id}>
            <div>
              {a.kind === "image" ? (
                <img src={mediaUrl(a.url)} alt={a.name} />
              ) : a.kind === "video" ? (
                <video src={mediaUrl(a.url)} controls playsInline />
              ) : a.kind === "audio" ? (
                <audio src={mediaUrl(a.url)} controls />
              ) : (
                <FileText size={30} />
              )}
            </div>
            <strong title={a.name}>{a.name}</strong>
            <span>
              {bytes(a.size)} · {date(a.createdAt)}
            </span>
          </article>
        ))}
      </div>
      {!project.assets.length ? (
        <Empty
          icon={ImageIcon}
          title={t("把你的素材带进来")}
          description={t("上传角色定妆图、视频片段或配音，开始组织你的作品。")}
        />
      ) : (
        !visibleAssets.length && (
          <Empty
            icon={ImageIcon}
            title={t("该分类还没有素材")}
            description={t("切换到其他分类查看，或导入新的素材。")}
          />
        )
      )}
    </div>
  );
}
function Quality({
  project,
  onSelect,
  act,
}: {
  project: P;
  onSelect: (id: string) => void;
  act: Function;
}) {
  const [findings, setFindings] = useState<Finding[]>([]),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    void api<Finding[]>(`/projects/${project.id}/check`)
      .then(setFindings)
      .finally(() => setLoading(false));
  }, [project]);
  return (
    <div className="page-content">
      <div className="section-heading">
        <div>
          <div className="eyebrow">REVIEW & REFINE</div>
          <h1>{t("把不满意，变成下一次更好。")}</h1>
          <p>
            {t(
              "规则检查定位可操作的问题。人物和场景的视觉连续性请结合预览判断。",
            )}
          </p>
        </div>
        <span className="badge">
          {findings.length} {t("项待查看")}
        </span>
      </div>
      <div className="quality-metrics">
        <div>
          <CheckCircle2 />
          <strong>
            {project.shots.filter((s) => s.review === "approved").length}
            <small>/ {project.shots.length}</small>
          </strong>
          <span>{t("镜头已通过")}</span>
        </div>
        <div>
          <AlertCircle />
          <strong>
            {project.shots.filter((s) => s.review === "changes").length}
          </strong>
          <span>{t("镜头需要返修")}</span>
        </div>
        <div>
          <ImageIcon />
          <strong>
            {project.characters.filter((c) => c.referenceId).length}
            <small>/ {project.characters.length}</small>
          </strong>
          <span>{t("角色已绑定参考")}</span>
        </div>
      </div>
      <div className="finding-list">
        {findings.map((f, i) => (
          <button key={i} onClick={() => onSelect(f.shotId)}>
            <div className={`finding-icon ${f.severity}`}>
              <AlertCircle size={18} />
            </div>
            <div>
              <strong>{t(f.title)}</strong>
              <p>
                {t("镜头")}
                {project.shots.find((s) => s.id === f.shotId)?.order} ·{" "}
                {t(f.detail)}
              </p>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!loading && !findings.length && (
        <Empty
          icon={ShieldCheck}
          title={t("规则检查通过")}
          description={t(
            "请再预览完整成片，确认面部、服装、场景与剪辑节奏符合你的要求。",
          )}
        />
      )}
    </div>
  );
}
export function Delivery({
  project,
  jobs,
  act,
  onOpenStoryboard,
  settings,
  onSettings,
  notify,
}: {
  project: P;
  jobs: Job[];
  act: Function;
  onOpenStoryboard: (shotId?: string) => void;
  settings?: PublicSettings;
  onSettings?: (s: PublicSettings) => void;
  notify?: (message: string, error?: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const blockers = episodeBlockers(project);
  const canRender = project.shots.length > 0 && blockers.length === 0;
  const readyCount = project.shots.length - blockers.length;
  const busy = jobs.some(
    (j) =>
      j.projectId === project.id &&
      j.type === "export" &&
      ["queued", "running"].includes(j.state),
  );
  const animaticBusy = jobs.some(
    (j) =>
      j.projectId === project.id &&
      j.type === "animatic" &&
      ["queued", "running"].includes(j.state),
  );
  const [animaticLoading, setAnimaticLoading] = useState(false);
  const canAnimatic = project.shots.length > 0;
  const latestRender = project.firstFilmSample
    ? jobs
        .filter((job) => job.projectId === project.id && job.type === "export")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;
  const usage = summarizeUsage(
    jobs.filter((job) => job.projectId === project.id),
  );
  const usageKindLabel: Record<string, string> = {
    video: t("视频生成"),
    image: t("图片生成"),
    speech: t("配音合成"),
    transcription: t("语音识别"),
  };
  const usageUnitLabel: Record<string, string> = {
    seconds: t("秒"),
    images: t("张"),
    characters: t("字"),
  };
  const cost = estimateCost(usage, settings?.pricing);
  const costByKind = Object.fromEntries(cost.rows.map((r) => [r.kind, r]));
  const formatCost = (n: number) => Number(n.toFixed(4)).toString();
  return (
    <div className="page-content">
      <div className="section-heading">
        <div>
          <div className="eyebrow">READY TO SHARE</div>
          <h1>{t("让作品，走向观众。")}</h1>
          <p>
            {t("用已选镜头合成真实 MP4；所有候选、分镜与字幕也可以打包带走。")}
          </p>
        </div>
      </div>
      {project.firstFilmSample && (
        <FirstFilmProgress
          job={latestRender}
          hasVideo={project.exports.some((entry) => entry.kind === "video")}
        />
      )}
      <section
        className="delivery-check"
        aria-labelledby="delivery-check-title"
      >
        <div className="delivery-check-summary">
          <div className={`finding-icon ${canRender ? "info" : ""}`}>
            {canRender ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
          </div>
          <div>
            <h2 id="delivery-check-title">{t("成片准备")}</h2>
            <p id="delivery-check-status" role="status">
              {project.shots.length
                ? `${readyCount} / ${project.shots.length} · ${t("镜头素材和字幕已就绪")}`
                : t("先在分镜工作台添加镜头，再选择图片或视频。")}
            </p>
            {canRender && <p>MP4 · H.264 · {project.format} · 25 fps</p>}
          </div>
          {!project.shots.length && (
            <Button onClick={() => onOpenStoryboard()}>
              {t("打开分镜工作台")}
            </Button>
          )}
          <Button
            variant="primary"
            aria-describedby="delivery-check-status"
            disabled={!canRender || busy || loading}
            onClick={() => {
              setLoading(true);
              void act(
                "render",
                () => post(`/projects/${project.id}/render`),
                t("开始渲染，可在任务队列查看进度"),
              ).finally(() => setLoading(false));
            }}
          >
            {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
            {busy ? t("正在渲染") : t("渲染成片")}
          </Button>
        </div>
        {blockers.length > 0 && (
          <ul className="delivery-check-shots">
            {blockers.map(({ shot, missingMedia, staleCaptions }) => (
              <li key={shot.id}>
                <button type="button" onClick={() => onOpenStoryboard(shot.id)}>
                  <span className="delivery-check-shot">
                    <strong>
                      {t("镜头")} {shot.order} · {shot.title}
                    </strong>
                    <span>
                      {[
                        missingMedia && t("选择一张图片或一段视频"),
                        staleCaptions && t("音轨或剪辑已改变，请重新核对字幕"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        className="delivery-check delivery-animatic"
        aria-labelledby="animatic-title"
      >
        <div className="delivery-check-summary">
          <div className="finding-icon info">
            <Play size={19} />
          </div>
          <div>
            <h2 id="animatic-title">
              {t("免费预演")}
              <span className="animatic-tag">{t("本地 · 0 模型费用")}</span>
            </h2>
            <p role="note">
              {t(
                "正式生成前，先用每个镜头已选的图片或参考图，按时长串成一条带字幕的预演片；还没有素材的镜头会用占位卡代替。不调用任何模型，纯本地合成，用来先判断整场戏的节奏与连贯，再决定把钱花在哪些镜头。",
              )}
            </p>
          </div>
          <Button
            variant="primary"
            disabled={!canAnimatic || animaticBusy || animaticLoading}
            onClick={() => {
              setAnimaticLoading(true);
              void act(
                "animatic",
                () => post(`/projects/${project.id}/animatic`),
                t("开始合成免费预演片，可在任务队列查看进度"),
              ).finally(() => setAnimaticLoading(false));
            }}
          >
            {animaticBusy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Play size={15} />
            )}
            {animaticBusy ? t("正在预演") : t("生成免费预演片")}
          </Button>
        </div>
      </section>
      <section
        className="settings-card usage-card"
        aria-labelledby="usage-title"
      >
        <header>
          <Gauge size={18} />
          <div>
            <h2 id="usage-title">{t("本项目 AI 用量")}</h2>
            <p>
              {t(
                "按成功任务统计你自己的模型服务调用量；费用由服务商直接收取，镜序可按你填写的单价估算成本。",
              )}
            </p>
          </div>
        </header>
        {usage.rows.length ? (
          <ul className="usage-grid">
            {usage.rows.map((row) => {
              const rowCost = costByKind[row.kind]?.cost;
              return (
                <li key={row.kind}>
                  <strong>
                    {row.quantity}
                    <small>{usageUnitLabel[row.unit]}</small>
                  </strong>
                  <span>{usageKindLabel[row.kind]}</span>
                  <em>
                    {row.jobs} {t("次成功任务")}
                  </em>
                  {typeof rowCost === "number" && (
                    <em className="usage-cost">
                      ≈ {cost.currency}
                      {formatCost(rowCost)}
                    </em>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="license-note-info">
            {t("还没有成功的在线生成任务。本地渲染不计入。")}
          </p>
        )}
        <div className="usage-footer">
          {cost.pricedKinds > 0 ? (
            <p className="usage-total">
              {t("估算合计")}
              <strong>
                ≈ {cost.currency}
                {formatCost(cost.total)}
              </strong>
              <span>
                {t(
                  "按你填写的服务商单价估算，仅用于与服务商账单对账，不是镜序收费。",
                )}
              </span>
            </p>
          ) : (
            <p className="license-note-info">
              {t("填入服务商账单上的单价，可在本地估算本项目模型成本。")}
            </p>
          )}
          <PricingEditor
            settings={settings}
            onSettings={onSettings}
            notify={notify}
          />
        </div>
      </section>
      <section className="settings-card export-settings">
        <header>
          <SlidersHorizontal size={18} />
          <div>
            <h2>{t("这一次，怎样交付？")}</h2>
            <p>{t("配音在镜头设置中选择，音频文件可从参考资产导入。")}</p>
          </div>
        </header>
        <div className="field-row">
          <label className="field">
            <span>{t("背景音乐")}</span>
            <select
              value={project.musicAssetId ?? ""}
              onChange={(e) =>
                void act("music", () =>
                  api(`/projects/${project.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      musicAssetId: e.target.value || null,
                    }),
                  }),
                )
              }
            >
              <option value="">{t("不添加背景音乐")}</option>
              {project.assets
                .filter((a) => a.kind === "audio")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>
              {t("音乐音量")}
              {Math.round((project.musicVolume ?? 0.15) * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              defaultValue={project.musicVolume ?? 0.15}
              onChange={(e) =>
                void act("volume", () =>
                  api(`/projects/${project.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      musicVolume: Number(e.target.value),
                    }),
                  }),
                )
              }
            />
          </label>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={project.burnSubtitles !== false}
            onChange={(e) =>
              void act("subtitle-settings", () =>
                api(`/projects/${project.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ burnSubtitles: e.target.checked }),
                }),
              )
            }
          />
          {t("将字幕烧录到画面中（同时保留可编辑 SRT）")}
        </label>
      </section>
      <div className="export-options">
        <article>
          <div className="export-icon">
            <FolderOpen size={27} />
          </div>
          <h2>{t("完整素材包")}</h2>
          <p>
            {t("项目 JSON · 分镜 CSV · 字幕 SRT")}
            <br />
            {t("原始素材与已导出成片")}
          </p>
          <Button
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void act(
                "archive",
                () => post(`/projects/${project.id}/archive`),
                t("素材包已就绪"),
              ).finally(() => setLoading(false));
            }}
          >
            <Download size={15} />
            {t("打包素材")}
          </Button>
        </article>
        <article>
          <div className="export-icon">
            <FileText size={27} />
          </div>
          <h2>{t("字幕与分镜")}</h2>
          <p>
            {t("可编辑的标准 SRT 和 CSV")}
            <br />
            {t("继续在你熟悉的剪辑工具中创作")}
          </p>
          <div className="button-row">
            <Button
              onClick={() =>
                void act("srt", async () =>
                  saveText(
                    `${project.name}.srt`,
                    await api(`/projects/${project.id}/subtitles`),
                  ),
                )
              }
            >
              <Download size={14} />
              SRT
            </Button>
            <Button
              onClick={() =>
                void act("csv", async () =>
                  saveText(
                    `${project.name}.csv`,
                    await api(`/projects/${project.id}/storyboard.csv`),
                    "text/csv",
                  ),
                )
              }
            >
              CSV
            </Button>
          </div>
        </article>
      </div>
      <div className="notice">
        <AlertCircle size={17} />
        <span>
          {t(
            "成片优先使用镜头配音，否则保留源视频音轨；可混入背景音乐并烧录字幕。已应用的时间轴字幕按分段时间显示，其他镜头沿用台词字幕，请试听核对。",
          )}
        </span>
      </div>
      <h2 className="section-label">
        {t("导出记录")}
        <span>{project.exports.length}</span>
      </h2>
      {project.exports.length ? (
        <div className="export-list">
          {[...project.exports].reverse().map((e) => (
            <div key={e.id}>
              <div className="file-icon">
                {e.kind === "video" ? (
                  <Film size={21} />
                ) : e.kind === "animatic" ? (
                  <Play size={21} />
                ) : (
                  <FolderOpen size={21} />
                )}
              </div>
              <div>
                <strong>
                  {e.name}
                  {e.kind === "animatic" && (
                    <span className="export-kind">{t("预演")}</span>
                  )}
                </strong>
                <p>
                  R{e.revision} · {date(e.createdAt)} · {bytes(e.size)}
                </p>
              </div>
              <Button
                onClick={() =>
                  void act("download", () => download(e.url, e.name))
                }
              >
                <Download size={15} />
                {native ? t("保存 / 分享") : t("下载")}
              </Button>
              {e.subtitlesUrl && (
                <Button
                  onClick={() =>
                    void act("download-subtitles", () =>
                      download(
                        e.subtitlesUrl!,
                        e.name.replace(/\.mp4$/i, "") + ".srt",
                      ),
                    )
                  }
                >
                  SRT · R{e.revision}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={Download}
          title={t("成片正在路上")}
          description={t("渲染或打包后，所有可下载版本都会留在这里。")}
        />
      )}
    </div>
  );
}
export type BatchBudgetWarning = {
  level: "near" | "over";
  currency: string;
  spent: number;
  projected: number;
  budget: number;
};
// Project the per-calendar-month budget guardrail onto the moment before a
// paid batch: month-to-date priced spend across the whole workspace plus the
// upcoming batch's priced video cost. Returns null unless a positive monthly
// budget exists and the projection reaches the near/over bands. Advisory only;
// callers must never block generation on this (same discipline as the bar).
export function monthBudgetWarning(
  jobs: Job[],
  pricing: Pricing | undefined,
  incoming: number | undefined,
): BatchBudgetWarning | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthJobs = jobs.filter(
    (j) =>
      j.state === "succeeded" && new Date(j.createdAt).getTime() >= monthStart,
  );
  const spent = estimateCost(summarizeUsage(monthJobs), pricing).total;
  const add =
    typeof incoming === "number" && isFinite(incoming) && incoming > 0
      ? incoming
      : 0;
  const projected = spent + add;
  const status = budgetStatus(projected, pricing?.monthlyBudget);
  if (!status || status.level === "ok") return null;
  return {
    level: status.level,
    currency: pricing?.currency?.trim() || "¥",
    spent,
    projected,
    budget: status.budget,
  };
}
export function BatchCostConfirm({
  estimate,
  allSelected,
  demo,
  busy,
  budgetWarning,
  onCancel,
  onConfirm,
}: {
  estimate: GenerationEstimate;
  allSelected: boolean;
  demo: boolean;
  busy?: boolean;
  budgetWarning?: BatchBudgetWarning | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  const hasIncoming =
    estimate.videoCost !== undefined && estimate.videoCost > 0;
  const diff = Math.abs(
    budgetWarning ? budgetWarning.projected - budgetWarning.budget : 0,
  );
  return (
    <Modal title={t("生成前确认")} onClose={onCancel}>
      <div className="cost-confirm">
        <p className="cost-confirm-lead">
          {allSelected
            ? t("所有镜头都已有选定候选，本次将为全部镜头重新生成视频候选。")
            : t("将为尚未确认的镜头生成视频候选，已确认镜头不受影响。")}
        </p>
        <ul className="cost-confirm-facts">
          <li>
            <span>{t("镜头数量")}</span>
            <strong>
              {estimate.shotCount}
              <small>{t("个")}</small>
            </strong>
          </li>
          <li>
            <span>{t("预计总时长")}</span>
            <strong>
              {estimate.videoSeconds}
              <small>{t("秒")}</small>
            </strong>
          </li>
        </ul>
        {demo ? (
          <div className="notice">
            <Sparkles size={16} />
            <span>{t("演示模式 · 不消耗额度，可放心试用。")}</span>
          </div>
        ) : estimate.videoCost !== undefined ? (
          <div className="cost-confirm-price">
            <span>{t("预计视频成本")}</span>
            <strong>
              ≈ {estimate.currency}
              {Number(estimate.videoCost.toFixed(4))}
            </strong>
            <small>
              {t(
                "按镜头时长与你填写的每秒单价估算，仅含首轮候选；重做或生成多版会再次计费，实际以服务商账单为准。",
              )}
            </small>
          </div>
        ) : (
          <div className="notice">
            <Calculator size={16} />
            <span>
              {t(
                "尚未设置视频每秒单价，无法预估金额。可先到「任务队列 · 用量与成本总览」填写单价，也可以直接继续。",
              )}
            </span>
          </div>
        )}
        {!demo && budgetWarning && (
          <div
            className={`budget-warning ${budgetWarning.level}`}
            role="status"
          >
            <AlertCircle size={16} />
            <div>
              <strong>
                {budgetWarning.level === "over"
                  ? hasIncoming
                    ? t("本批生成后将超出月度预算")
                    : t("本月估算支出已超出月度预算")
                  : hasIncoming
                    ? t("本批生成后将接近月度预算")
                    : t("本月估算支出已接近月度预算")}
              </strong>
              <p className="budget-warning-meta">
                <span>
                  {hasIncoming ? t("本批后估算支出") : t("本月已用估算")}
                </span>
                <b>
                  {budgetWarning.currency}
                  {fmt(budgetWarning.projected)}
                </b>
                <span>{t("月度预算")}</span>
                <b>
                  {budgetWarning.currency}
                  {fmt(budgetWarning.budget)}
                </b>
                <span>
                  {budgetWarning.level === "over" ? t("超出约") : t("剩余约")}
                </span>
                <b>
                  {budgetWarning.currency}
                  {fmt(diff)}
                </b>
              </p>
              <p className="budget-warning-hint">
                {t("预算仅在本地提醒，不会阻止生成。")}
              </p>
            </div>
          </div>
        )}
        <footer className="modal-footer">
          <Button type="button" onClick={onCancel}>
            {t("取消")}
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {t("确认加入队列")}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
function PricingEditor({
  settings,
  onSettings,
  notify,
}: {
  settings?: PublicSettings;
  onSettings?: (s: PublicSettings) => void;
  notify?: (m: string, error?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fields: { key: keyof Omit<Pricing, "currency">; label: string }[] = [
    { key: "videoPerSecond", label: t("视频 · 每秒") },
    { key: "imagePerImage", label: t("图片 · 每张") },
    { key: "speechPerKiloChar", label: t("配音 · 每千字符") },
    { key: "transcriptionPerSecond", label: t("识别 · 每秒") },
  ];
  const toggle = () => {
    if (!open) {
      const p = settings?.pricing;
      setDraft({
        currency: p?.currency ?? "¥",
        videoPerSecond: p?.videoPerSecond?.toString() ?? "",
        imagePerImage: p?.imagePerImage?.toString() ?? "",
        speechPerKiloChar: p?.speechPerKiloChar?.toString() ?? "",
        transcriptionPerSecond: p?.transcriptionPerSecond?.toString() ?? "",
        monthlyBudget: p?.monthlyBudget?.toString() ?? "",
      });
    }
    setOpen(!open);
  };
  const save = async () => {
    if (!settings) return;
    const next: Pricing = { currency: draft.currency?.trim() || "¥" };
    for (const f of fields) {
      const raw = (draft[f.key] ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!isFinite(value) || value < 0) {
        notify?.(t("单价必须是不小于 0 的数字"), true);
        return;
      }
      next[f.key] = value;
    }
    const budgetRaw = (draft.monthlyBudget ?? "").trim();
    if (budgetRaw) {
      const budget = Number(budgetRaw);
      if (!isFinite(budget) || budget < 0) {
        notify?.(t("月度预算必须是不小于 0 的数字"), true);
        return;
      }
      next.monthlyBudget = budget;
    }
    setSaving(true);
    try {
      const saved = await api<PublicSettings>("/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, pricing: next }),
      });
      onSettings?.(saved);
      setOpen(false);
      notify?.(t("单价已保存"));
    } catch (e) {
      notify?.((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="usage-pricing-editor">
      <button
        type="button"
        className="btn soft usage-pricing-toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        <Calculator size={14} />
        {open ? t("收起单价设置") : t("设置单价")}
      </button>
      {open && (
        <div className="usage-pricing">
          <label className="field usage-currency">
            <span>{t("货币符号")}</span>
            <input
              value={draft.currency ?? ""}
              maxLength={8}
              onChange={(e) =>
                setDraft((d) => ({ ...d, currency: e.target.value }))
              }
            />
          </label>
          {fields.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={draft[f.key] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="field usage-budget-field">
            <span>{t("月度预算（可选，仅本地提醒）")}</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0"
              value={draft.monthlyBudget ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, monthlyBudget: e.target.value }))
              }
            />
          </label>
          <div className="usage-pricing-actions">
            <Button onClick={() => void save()}>
              {saving ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              {t("保存单价")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export function WorkspaceUsage({
  jobs,
  projects,
  settings,
  onSettings,
  notify,
}: {
  jobs: Job[];
  projects: P[];
  settings?: PublicSettings;
  onSettings?: (s: PublicSettings) => void;
  notify?: (m: string, error?: boolean) => void;
}) {
  const ranges = [
    { key: "month", label: t("本月") },
    { key: "30d", label: t("近 30 天") },
    { key: "all", label: t("全部") },
  ] as const;
  const [range, setRange] = useState<(typeof ranges)[number]["key"]>("month");
  const kindLabel: Record<string, string> = {
    video: t("视频生成"),
    image: t("图片生成"),
    speech: t("配音合成"),
    transcription: t("语音识别"),
  };
  const unitLabel: Record<string, string> = {
    seconds: t("秒"),
    images: t("张"),
    characters: t("字"),
  };
  const now = Date.now();
  const from =
    range === "all"
      ? 0
      : range === "30d"
        ? now - 30 * 86_400_000
        : new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).getTime();
  const scoped = jobs.filter(
    (j) => new Date(j.createdAt).getTime() >= from && j.state === "succeeded",
  );
  const report = workspaceUsage(
    scoped,
    (id) => projects.find((p) => p.id === id)?.name,
    settings?.pricing,
    t("项目已删除"),
  );
  const formatCost = (n: number) => Number(n.toFixed(4)).toString();
  // The budget is a per-calendar-month ceiling, so it is only compared on
  // the "本月" tab and only when at least one unit price is configured.
  const budget =
    range === "month" && report.total.pricedKinds > 0
      ? budgetStatus(report.total.total, settings?.pricing?.monthlyBudget)
      : null;
  const pct = budget ? Math.min(100, Math.round(budget.ratio * 100)) : 0;
  const exportCsv = () => {
    const csv = usageReportCsv(report, {
      project: t("项目"),
      video: `${t("视频生成")}(${t("秒")})`,
      image: `${t("图片生成")}(${t("张")})`,
      speech: `${t("配音合成")}(${t("字")})`,
      transcription: `${t("语音识别")}(${t("秒")})`,
      jobs: t("成功任务"),
      cost: t("估算成本"),
      total: t("合计"),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    saveText(
      `jingxu-usage-${range}-${stamp}.csv`,
      "﻿" + csv,
      "text/csv;charset=utf-8",
    );
  };
  return (
    <section
      className="settings-card usage-card workspace-usage"
      aria-labelledby="workspace-usage-title"
    >
      <header>
        <Gauge size={18} />
        <div>
          <h2 id="workspace-usage-title">{t("用量与成本总览")}</h2>
          <p>
            {t(
              "按时间范围汇总所有项目的成功任务，按你填写的单价估算，可导出 CSV 与服务商或客户对账。",
            )}
          </p>
        </div>
      </header>
      <div className="usage-range">
        {ranges.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`btn soft${range === r.key ? " active" : ""}`}
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {report.projects.length === 0 ? (
        <p className="license-note-info">{t("没有符合时间范围的成功任务。")}</p>
      ) : (
        <>
          <ul className="usage-grid">
            {report.total.rows.map((row) => (
              <li key={row.kind}>
                <strong>
                  {row.quantity}
                  <small>{unitLabel[row.unit]}</small>
                </strong>
                <span>{kindLabel[row.kind]}</span>
                <em>
                  {row.jobs} {t("次成功任务")}
                </em>
              </li>
            ))}
          </ul>
          {report.total.pricedKinds > 0 && (
            <p className="usage-total">
              {t("估算合计")}
              <strong>
                ≈ {report.total.currency}
                {formatCost(report.total.total)}
              </strong>
            </p>
          )}
          {budget && (
            <div
              className={`budget-guard ${budget.level}`}
              role="status"
              aria-live="polite"
            >
              <div className="budget-head">
                <span className="budget-title">
                  {t("本月预算")} {report.total.currency}
                  {formatCost(budget.budget)}
                </span>
                <span className="budget-meta">
                  {budget.level === "over"
                    ? `${t("已超出")} ${report.total.currency}${formatCost(
                        -budget.remaining,
                      )}（${pct}%）`
                    : `${t("已用")} ${pct}% · ${t("剩余预算")} ${
                        report.total.currency
                      }${formatCost(budget.remaining)}`}
                </span>
              </div>
              <div
                className="budget-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={t("本月预算使用比例")}
              >
                <div className="budget-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="budget-note">
                {budget.level === "over"
                  ? t(
                      "本月估算成本已超过预算。仅本地提醒，不会阻止生成，实际以服务商账单为准。",
                    )
                  : budget.level === "near"
                    ? t(
                        "本月预算已用超过 80%，留意后续生成花费；实际以服务商账单为准。",
                      )
                    : t("按你填写的单价估算，仅本地提醒，不会阻止生成。")}
              </p>
            </div>
          )}
          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>{t("项目")}</th>
                  <th>{t("成功任务")}</th>
                  <th className="num">{t("估算成本")}</th>
                </tr>
              </thead>
              <tbody>
                {report.projects.map((p) => (
                  <tr key={p.projectId}>
                    <td>{p.projectName}</td>
                    <td>{p.summary.totalJobs}</td>
                    <td className="num">
                      {p.cost.pricedKinds > 0
                        ? `≈ ${p.cost.currency}${formatCost(p.cost.total)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="usage-footer">
            <p className="license-note-info">
              {t(
                "成本按你填写的服务商单价估算，仅用于与服务商账单对账，不是镜序收费。",
              )}
            </p>
            <button type="button" className="btn soft" onClick={exportCsv}>
              <Download size={14} />
              {t("导出 CSV")}
            </button>
          </div>
          <PricingEditor
            settings={settings}
            onSettings={onSettings}
            notify={notify}
          />
        </>
      )}
    </section>
  );
}
export function Jobs({
  jobs,
  projects,
  act,
  settings,
  onSettings,
  notify,
}: {
  jobs: Job[];
  projects: P[];
  act: Function;
  settings?: PublicSettings;
  onSettings?: (s: PublicSettings) => void;
  notify?: (m: string, error?: boolean) => void;
}) {
  const active = jobs.filter((j) => ["queued", "running"].includes(j.state));
  const history = jobs.filter((j) => !["queued", "running"].includes(j.state));
  const renderJob = (j: Job) => (
    <article key={j.id}>
      <div className={`job-icon ${j.state}`}>
        {j.state === "running" ? (
          <Loader2 className="spin" size={21} />
        ) : j.state === "succeeded" ? (
          <Check size={21} />
        ) : j.state === "failed" ? (
          <AlertCircle size={21} />
        ) : (
          <Clock3 size={21} />
        )}
      </div>
      <div className="job-detail">
        <div>
          <strong>
            {j.type === "export"
              ? t("成片渲染")
              : j.type === "animatic"
                ? t("免费预演")
                : `${t("镜头")} ${projects.find((p) => p.id === j.projectId)?.shots.find((s) => s.id === j.shotId)?.order ?? ""} ${t({ speech: "台词配音", transcribe: "字幕识别", image: "图片生成", generate: j.firstFrameAssetId ? "首帧视频生成" : "候选生成" }[j.type])}`}
          </strong>
          <span className={`job-state ${j.state}`}>
            {t(
              {
                queued: "排队中",
                running: "执行中",
                succeeded: "已完成",
                failed: "失败",
                cancelled: "已取消",
              }[j.state],
            )}
          </span>
        </div>
        <p>
          {projects.find((p) => p.id === j.projectId)?.name ?? t("项目已删除")}{" "}
          · {j.provider === "demo" ? t("演示素材") : j.provider} ·{" "}
          {date(j.createdAt)}
        </p>
        <div className="job-message">{t(j.error ?? j.message)}</div>
        {j.type === "speech" && (
          <details>
            <summary>{t("配音文本快照")}</summary>
            <p>{j.speechText}</p>
            <small>
              {t(
                "重新创建配音将使用当前已保存的台词与语音设置，可能再次计费。",
              )}
            </small>
          </details>
        )}
        {j.remoteId && (
          <small>
            {t("远程任务：")}
            {j.remoteId}
          </small>
        )}
        {["queued", "running"].includes(j.state) && (
          <div className="progress">
            <i style={{ width: `${j.progress}%` }} />
          </div>
        )}
      </div>
      {["queued", "running"].includes(j.state) ? (
        <Button
          onClick={() =>
            void act(
              "cancel",
              () => post(`/jobs/${j.id}/cancel`),
              t("本地任务已停止"),
            )
          }
        >
          {t("取消")}
        </Button>
      ) : ["failed", "cancelled"].includes(j.state) &&
        j.type !== "image" &&
        !j.firstFrameAssetId ? (
        <Button
          onClick={() =>
            void act(
              "retry",
              () => post(`/jobs/${j.id}/retry`),
              t("新任务已加入队列"),
            )
          }
        >
          <RefreshCw size={14} />
          {t("重新创建")}
        </Button>
      ) : null}
    </article>
  );
  return (
    <div className="page-content">
      <div className="page-title">
        <div className="eyebrow">PRODUCTION QUEUE</div>
        <h1>{t("创作继续，任务有序。")}</h1>
        <p>
          {t(
            "每个任务都有真实状态。已提交的远程任务会保留 ID，便于恢复与核对。",
          )}
        </p>
      </div>
      {active.length > 0 && (
        <section className="jobs-band active">
          <div className="jobs-band-label">
            <Loader2 size={14} className="spin" />
            {t("进行中的任务")} · {active.length}
          </div>
          <div className="job-list">{active.map(renderJob)}</div>
        </section>
      )}
      <WorkspaceUsage
        jobs={jobs}
        projects={projects}
        settings={settings}
        onSettings={onSettings}
        notify={notify}
      />
      {history.length > 0 && (
        <section className="jobs-band history">
          <div className="jobs-band-label">{t("历史任务")}</div>
          <div className="job-list">{history.map(renderJob)}</div>
        </section>
      )}
      {!jobs.length && (
        <Empty
          icon={ListTodo}
          title={t("队列很安静")}
          description={t("生成镜头或渲染成片后，可以在这里查看进度。")}
        />
      )}
    </div>
  );
}
export function AgentPanel({
  project,
  skills,
  initialSkill,
  approvals,
  refresh,
  notify,
  settings,
  onConfigure,
}: {
  project: P;
  skills: any[];
  initialSkill?: string;
  approvals: Approval[];
  refresh: () => Promise<void>;
  notify: (m: string, e?: boolean) => void;
  settings?: PublicSettings;
  onConfigure?: () => void;
}) {
  const [text, setText] = useState(""),
    [skill, setSkill] = useState(initialSkill ?? ""),
    [loading, setLoading] = useState(false);
  const selectedSkill = skills.find((s) => s.id === skill);
  const agentReady = !!(
    settings?.agent.endpoint &&
    settings.agent.model &&
    settings.agent.hasApiKey
  );
  return (
    <>
      <div className="agent-scroll">
        <div className="agent-intro">
          <div>
            <Sparkles size={25} />
          </div>
          <h3>{t("你的导演助手")}</h3>
          <p>
            {t("给它一个具体的修改目标。")}
            <br />
            {t("它会读取项目，再通过工具推进。")}
          </p>
        </div>
        {!agentReady && (
          <div className="agent-setup-notice" role="status">
            <AlertCircle size={17} />
            <div>
              <strong>{t("还没有配置导演助手模型")}</strong>
              <p>
                {t(
                  "导演助手使用你自带的对话模型（与视频生成服务分开配置）。填好服务地址、模型 ID 和 API Key 后即可开始对话。",
                )}
              </p>
              {onConfigure && (
                <Button variant="soft" onClick={onConfigure}>
                  <Settings2 size={14} />
                  {t("去配置模型")}
                </Button>
              )}
            </div>
          </div>
        )}
        {!project.messages.length && (
          <div className="suggestions">
            {[
              "检查对白是否超出镜头时长",
              "帮我优化开头，让冲突更明确",
              "检查角色参考与场景设定缺失",
            ].map((s) => (
              <button key={s} onClick={() => setText(s)}>
                {s}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}
        {project.messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <small>
              {m.role === "user"
                ? t("你")
                : m.role === "tool"
                  ? t("工具结果")
                  : t("导演助手")}
            </small>
            <p>{m.text}</p>
          </div>
        ))}
        {approvals
          .filter((a) => a.state === "pending")
          .map((a) => (
            <div key={a.id} className="approval">
              <strong>
                <ShieldCheck size={15} />
                {t("外部工具等待确认")}
              </strong>
              <p>
                {a.serverId} / {a.tool}
              </p>
              <pre>{JSON.stringify(a.arguments, null, 2)}</pre>
              <div className="button-row">
                {[false, true].map((approve) => (
                  <Button
                    key={String(approve)}
                    variant={approve ? "primary" : ""}
                    onClick={() =>
                      void post(`/approvals/${a.id}/decide`, { approve })
                        .then(refresh)
                        .catch((e) => notify(e.message, true))
                    }
                  >
                    {approve ? t("批准执行") : t("拒绝")}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        {loading && (
          <div className="agent-thinking">
            <Loader2 size={15} className="spin" />
            {t("正在读取项目与调用工具…")}
          </div>
        )}
      </div>
      <form
        className="agent-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!agentReady) {
            onConfigure?.();
            return;
          }
          setLoading(true);
          void post(`/projects/${project.id}/chat`, { text, skill })
            .then(async () => {
              setText("");
              await refresh();
            })
            .catch((e) => notify(e.message, true))
            .finally(() => setLoading(false));
        }}
      >
        <select
          aria-label={t("选择 Skill")}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          <option value="">{t("不指定 · 通用导演助手")}</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="skill-hint">
          {selectedSkill
            ? selectedSkill.description
            : t("不套用特定创作规则，由通用导演助手通读项目后给建议。")}
        </p>
        <textarea
          aria-label={t("给导演助手的消息")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={t("如：保留场景，帮我改写第 3 镜头的返修提示词")}
        />
        <div>
          <span className={agentReady ? undefined : "muted-warn"}>
            {agentReady
              ? t("使用设置中的模型与 Key")
              : t("未配置模型 · 点上方按钮前往设置")}
          </span>
          <button
            type="submit"
            aria-label={t("发送给导演助手")}
            disabled={loading || !agentReady || !text.trim()}
            title={agentReady ? t("发送给导演助手") : t("请先配置导演助手模型")}
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </>
  );
}
export function Skills({
  skills,
  refresh,
  notify,
  onUseSkill,
}: {
  skills: any[];
  refresh: () => Promise<void>;
  notify: (m: string, e?: boolean) => void;
  onUseSkill: (skillId: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<any>(),
    [name, setName] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [content, setContent] = useState("");
  return (
    <div className="page-content">
      <div className="section-heading">
        <div>
          <div className="eyebrow">CREATIVE PLAYBOOKS</div>
          <h1>{t("让你的方法，被记住。")}</h1>
          <p>{t("把创作标准和工作习惯写成 Skills，交给导演助手按需使用。")}</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} />
          {t("新建 Skill")}
        </Button>
      </div>
      <div className="skill-grid">
        {skills.map((s) => (
          <button
            key={s.id}
            className="skill-card"
            onClick={() => setSelected(s)}
          >
            <div>
              <BookOpen size={22} />
              <span className="badge">
                {s.builtin ? t("内置") : t("自定义")}
              </span>
            </div>
            <h2>{s.name}</h2>
            <p>{s.description}</p>
            <footer>
              {t("查看创作规则")}
              <ArrowUpRight size={15} />
            </footer>
          </button>
        ))}
      </div>
      {selected && (
        <Modal
          title={selected.name}
          onClose={() => setSelected(undefined)}
          wide
        >
          <pre className="skill-content">{selected.content}</pre>
          <footer className="modal-footer">
            <Button
              variant="primary"
              onClick={() => {
                onUseSkill(selected.id);
                setSelected(undefined);
              }}
            >
              <Sparkles size={15} />
              {t("用这个 Skill 询问导演助手")}
            </Button>
          </footer>
        </Modal>
      )}
      {open && (
        <Modal
          title={t("创建你的创作 Skill")}
          onClose={() => setOpen(false)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void post("/skills", { name, title, description, content })
                .then(async () => {
                  await refresh();
                  setOpen(false);
                  setName("");
                  setTitle("");
                  setDescription("");
                  setContent("");
                  notify(t("Skill 已保存"));
                })
                .catch((e) => notify(e.message, true));
            }}
          >
            <label className="field">
              <span>{t("名称")}</span>
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("如：品牌视频审查")}
              />
            </label>
            <label className="field">
              <span>{t("标识 / 英文小写与连字符")}</span>
              <input
                required
                pattern="[a-z][a-z0-9-]{0,63}"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="brand-video-review"
              />
              <small>{t("仅用作内部标识，界面会显示上面的名称。")}</small>
            </label>
            <label className="field">
              <span>{t("用途说明")}</span>
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("操作流程与验收标准")}</span>
              <textarea
                required
                rows={9}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("先读取品牌规范，逐镜检查产品外观与字幕…")}
              />
            </label>
            <footer className="modal-footer">
              <Button type="submit" variant="primary">
                {t("保存 Skill")}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
function ImageSettingsFields({
  value,
  onChange,
}: {
  value: PublicSettings["image"];
  onChange: (value: PublicSettings["image"]) => void;
}) {
  return (
    <section className="settings-card">
      <header>
        <ImageIcon size={20} />
        <div>
          <h2>{t("图片生成服务")}</h2>
          <p>{t("Seedream 可用镜头提示词、场景和角色参考生成图片候选。")}</p>
        </div>
      </header>
      <label className="field">
        <span>{t("图片 API 服务地址 / 不含 images/generations")}</span>
        <input
          type="url"
          list="seedream-endpoints"
          value={value.endpoint}
          onChange={(e) => onChange({ ...value, endpoint: e.target.value })}
        />
        <datalist id="seedream-endpoints">
          <option value="https://ark.cn-beijing.volces.com/api/v3">
            Volcengine Ark
          </option>
          <option value="https://ark.ap-southeast.bytepluses.com/api/v3">
            BytePlus ModelArk
          </option>
        </datalist>
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t("Seedream 模型 ID")}</span>
          <input
            value={value.model}
            maxLength={200}
            placeholder={t("填写你已开通的模型或接入点 ID")}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
          />
        </label>
        <label className="field">
          <span>
            {t("图片 API Key")}{" "}
            {value.hasApiKey && <small>{t("已保存")}</small>}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={value.apiKey ?? ""}
            placeholder={
              value.hasApiKey ? t("留空保留已有 Key") : t("输入 API Key")
            }
            onChange={(e) =>
              onChange({
                ...value,
                apiKey: e.target.value || (value.hasApiKey ? undefined : ""),
              })
            }
          />
        </label>
      </div>
      {value.hasApiKey && (
        <Button
          type="button"
          onClick={() => onChange({ ...value, apiKey: "", hasApiKey: false })}
        >
          {t("清除图片 API Key")}
        </Button>
      )}
    </section>
  );
}

function EntitlementBanner({
  license,
  onOpenSettings,
}: {
  license: LicenseState;
  onOpenSettings: () => void;
}) {
  const days = license.daysLeft ?? 0;
  if (!license.blocked && !(license.status === "trial" && days <= 3))
    return null;
  const message = license.blocked
    ? license.reason === "no-trial"
      ? t("还未开始试用：开始 14 天试用或激活许可证后即可使用生成功能。")
      : t("试用或许可已到期：激活后可继续生成，本机作品仍可查看与导出。")
    : t("试用还剩") + ` ${days} ` + t("天，到期后可激活许可证继续使用。");
  return (
    <div
      className={`entitlement-banner ${license.blocked ? "blocked" : "warn"}`}
    >
      {license.blocked ? <AlertCircle size={15} /> : <Clock3 size={15} />}
      <span>{message}</span>
      <button onClick={onOpenSettings}>
        {license.blocked ? t("立即激活") : t("查看许可")}
      </button>
    </div>
  );
}

function LicenseCard({
  license,
  onChanged,
  notify,
}: {
  license: LicenseState;
  onChanged: (s: LicenseState) => void;
  notify: (m: string, e?: boolean) => void;
}) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(""),
    [confirming, setConfirming] = useState(false);
  const creemLicense = license.creem.license;
  const paid = creemLicense?.status === "active";
  const local = !paid && license.status === "active" ? license.license : null;
  const active = paid || !!local;
  const trial = license.status === "trial" && !active;
  const configured = license.creem.configured;
  async function activate() {
    const value = key.trim();
    if (!value) return;
    setBusy("activate");
    try {
      onChanged(await activateLicense(value));
      setKey("");
      notify(t("授权已在本机激活"));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function buy() {
    setBusy("checkout");
    try {
      const { checkoutUrl } = await checkoutLicense();
      window.open(checkoutUrl, "_blank", "noopener");
      notify(t("已打开安全结账页，支付后授权码会出现在确认页并发送到邮箱"));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      className={`settings-card license-card ${active ? "active" : trial ? "trial" : "expired"}`}
    >
      <header>
        <KeyRound size={20} />
        <div>
          <h2>{t("授权与试用")}</h2>
          <p>
            {t(
              "新用户享有 14 天本机试用；购买后用授权码在本机激活。作品与凭据始终保存在你的工作站。",
            )}
          </p>
        </div>
        <span
          className={`license-badge ${active ? "active" : trial ? "trial" : "expired"}`}
        >
          {active
            ? t("已激活")
            : trial
              ? t("试用中")
              : license.status === "expired"
                ? t("已到期")
                : t("未开始")}
        </span>
      </header>

      {paid && creemLicense && (
        <div className="license-detail">
          <div>
            <span>{t("授权码")}</span>
            <strong>{creemLicense.maskedKey}</strong>
          </div>
          <div>
            <span>{t("本机设备")}</span>
            <strong>{creemLicense.instanceName}</strong>
          </div>
          <div>
            <span>{t("有效期限")}</span>
            <strong>
              {creemLicense.expiresAt
                ? new Date(creemLicense.expiresAt).toLocaleDateString()
                : t("永久有效")}
            </strong>
          </div>
          <div>
            <span>{t("设备名额")}</span>
            <strong>
              {creemLicense.activationLimit == null
                ? t("不限设备")
                : `${creemLicense.activation ?? 1} / ${creemLicense.activationLimit}`}
            </strong>
          </div>
          <div>
            <span>{t("最近校验")}</span>
            <strong>
              {creemLicense.validatedAt
                ? new Date(creemLicense.validatedAt).toLocaleString()
                : "—"}
              {creemLicense.offline ? ` · ${t("离线宽限中")}` : ""}
            </strong>
          </div>
          <div className="license-actions">
            <Button
              type="button"
              disabled={!!busy}
              onClick={async () => {
                setBusy("validate");
                try {
                  onChanged(await validateLicense());
                  notify(t("授权已重新校验"));
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "validate" ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <RefreshCw size={15} />
              )}
              {t("立即校验")}
            </Button>
            {confirming ? (
              <>
                <span className="confirm-text">
                  {t(
                    "解绑会释放本机设备名额，解绑后生成功能将停用，确认解绑？",
                  )}
                </span>
                <Button
                  onClick={async () => {
                    setConfirming(false);
                    setBusy("deactivate");
                    try {
                      onChanged(await deactivateLicense());
                      notify(t("设备已解绑"));
                    } catch (e) {
                      notify((e as Error).message, true);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {t("确认解绑")}
                </Button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setConfirming(false)}
                >
                  {t("取消")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-btn danger"
                onClick={() => setConfirming(true)}
              >
                {t("解绑本机设备")}
              </button>
            )}
          </div>
        </div>
      )}

      {local && (
        <div className="license-detail">
          <div>
            <span>{t("授权邮箱")}</span>
            <strong>{local.email}</strong>
          </div>
          <div>
            <span>{t("授权套餐")}</span>
            <strong>{local.plan}</strong>
          </div>
          <div>
            <span>{t("有效期限")}</span>
            <strong>{local.until ? local.until : t("永久有效")}</strong>
          </div>
          <div>
            <span>{t("设备绑定")}</span>
            <strong>
              {local.machineBound ? t("已绑定本机") : t("不限设备")}
            </strong>
          </div>
          <div>
            <span>{t("激活时间")}</span>
            <strong>{new Date(local.activatedAt).toLocaleString()}</strong>
          </div>
          <div className="license-actions">
            {confirming ? (
              <>
                <span className="confirm-text">
                  {t("解绑后生成功能将停用，确认解除本机授权？")}
                </span>
                <Button
                  onClick={async () => {
                    setConfirming(false);
                    setBusy("deactivate");
                    try {
                      onChanged(await deactivateLicense());
                      notify(t("设备已解绑"));
                    } catch (e) {
                      notify((e as Error).message, true);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {t("确认解绑")}
                </Button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setConfirming(false)}
                >
                  {t("取消")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-btn danger"
                onClick={() => setConfirming(true)}
              >
                {t("解除本机授权")}
              </button>
            )}
          </div>
        </div>
      )}

      {trial && license.trial && (
        <div className="license-detail">
          <div>
            <span>{t("试用截止")}</span>
            <strong>
              {new Date(license.trial.endsAt).toLocaleDateString()} ·{" "}
              {t("剩余")} {license.daysLeft} {t("天")}
            </strong>
          </div>
          <div className="trial-meter" aria-hidden="true">
            <i
              style={{
                width: `${Math.min(100, Math.round(((license.daysLeft ?? 0) / 14) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {!active && license.status === "expired" && (
        <p className="license-expired-note">
          {t("服务期已结束，购买并激活授权后继续使用生成功能。")}
        </p>
      )}

      {!active && (
        <div className="license-activate">
          <label className="field">
            <span>{t("授权码")}</span>
            <input
              type="password"
              autoComplete="off"
              placeholder={t("购买后粘贴授权码")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void activate();
                }
              }}
            />
          </label>
          <Button
            onClick={() => void activate()}
            disabled={!!busy || !key.trim()}
          >
            {busy === "activate" ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <KeyRound size={15} />
            )}
            {t("激活授权")}
          </Button>
          {configured && (
            <Button
              variant="primary"
              onClick={() => void buy()}
              disabled={!!busy}
            >
              {busy === "checkout" ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <ExternalLink size={15} />
              )}
              {t("购买镜序桌面版")}
            </Button>
          )}
          {license.status === "none" && (
            <button
              type="button"
              className="text-btn"
              onClick={async () => {
                try {
                  onChanged(await startTrial());
                  notify(t("14 天试用已开始"));
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              {t("开始 14 天免费试用")}
            </button>
          )}
        </div>
      )}
      {!active && !configured && (
        <p className="license-note-info">
          {t("在线结账即将开通；拿到授权码后可直接在此激活。")}
        </p>
      )}
    </section>
  );
}

function TrialWelcome({
  busy,
  onStart,
  onLater,
}: {
  busy: boolean;
  onStart: () => void;
  onLater: () => void;
}) {
  return (
    <div className="modal-backdrop welcome-backdrop">
      <div className="modal welcome-modal" role="dialog" aria-modal="true">
        <div className="welcome-mark">
          <Clapperboard size={26} />
        </div>
        <div className="eyebrow">JINGXU STUDIO</div>
        <h1>{t("把灵感，做成可交付的成片")}</h1>
        <p>
          {t(
            "本地优先的短剧制作工作台：剧本拆镜、角色与场景参考、图片 / 配音 / 字幕、视频生成与成片导出，全部在你的工作站完成。",
          )}
        </p>
        <ul className="welcome-points">
          <li>
            <ShieldCheck size={16} />
            <span>
              <strong>{t("作品留在本机")}</strong>
              {t("项目、素材与凭据默认不出本机")}
            </span>
          </li>
          <li>
            <Sparkles size={16} />
            <span>
              <strong>{t("生成服务自由选择")}</strong>
              {t("自带 API Key，也可先用演示素材走通流程")}
            </span>
          </li>
          <li>
            <Film size={16} />
            <span>
              <strong>{t("14 天完整功能试用")}</strong>
              {t("到期后可用许可证续期，作品始终可查看与导出")}
            </span>
          </li>
        </ul>
        <div className="welcome-actions">
          <Button onClick={onStart} disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {t("开始 14 天免费试用")}
          </Button>
          <button type="button" className="text-btn" onClick={onLater}>
            {t("我已有许可证")}
          </button>
        </div>
        <small className="welcome-note">
          {t("开始试用即表示同意服务条款与隐私政策；试用期不会自动扣费。")}
        </small>
      </div>
    </div>
  );
}

function Settings({
  value,
  onSaved,
  notify,
  onConnect,
}: {
  value: PublicSettings;
  onSaved: (s: PublicSettings) => void;
  notify: (m: string, e?: boolean) => void;
  onConnect: () => void;
}) {
  const [draft, setDraft] = useState(value),
    [mcpText, setMcpText] = useState(JSON.stringify(value.mcp, null, 2)),
    [loading, setLoading] = useState(false),
    [tools, setTools] = useState<any>(),
    [connection, setConnection] = useState<any>();
  return (
    <div className="page-content settings-page">
      <div className="page-title">
        <div className="eyebrow">MAKE IT YOURS</div>
        <h1>{t("工具由你选，创作由你掌握。")}</h1>
        <p>
          {t("自带 API Key。默认在本机保存项目与凭据，生成请求直连服务商。")}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          let mcp;
          try {
            mcp = JSON.parse(mcpText);
          } catch {
            notify(t("MCP 配置不是有效 JSON"), true);
            setLoading(false);
            return;
          }
          void api<PublicSettings>("/settings", {
            method: "PUT",
            body: JSON.stringify({ ...draft, mcp }),
          })
            .then((s) => {
              setDraft(s);
              onSaved(s);
              notify(t("设置已保存"));
            })
            .catch((e) => notify(e.message, true))
            .finally(() => setLoading(false));
        }}
      >
        <section className="settings-card">
          <header>
            <Film size={20} />
            <div>
              <h2>{t("视频生成服务")}</h2>
              <p>{t("未配置 Key 时可以使用演示素材验证完整流程。")}</p>
            </div>
          </header>
          <label className="field">
            <span>{t("生成模式")}</span>
            <select
              value={draft.generation.provider}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  generation: {
                    ...d.generation,
                    provider: e.target.value as any,
                  },
                }))
              }
            >
              <option value="demo">{t("演示素材 · 非在线生成")}</option>
              <option value="ark">{t("火山方舟 / Seedance")}</option>
              <option value="gateway">{t("自定义视频任务网关")}</option>
            </select>
          </label>
          {draft.generation.provider !== "demo" && (
            <>
              <label className="field">
                <span>{t("API 服务地址")}</span>
                <input
                  type="url"
                  required
                  value={draft.generation.endpoint}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      generation: { ...d.generation, endpoint: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>{t("模型 ID")}</span>
                  <input
                    required
                    placeholder={t("填写你已开通的模型或接入点 ID")}
                    value={draft.generation.model}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        generation: { ...d.generation, model: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    API Key{" "}
                    {draft.generation.hasApiKey && <small>{t("已保存")}</small>}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      draft.generation.hasApiKey
                        ? t("留空保留已有 Key")
                        : t("输入 API Key")
                    }
                    value={draft.generation.apiKey ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        generation: {
                          ...d.generation,
                          apiKey: e.target.value || undefined,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </>
          )}
          <p className="caption">
            {t(
              "实际生成费用由服务商收取。生成前请确认服务商额度、模型权限与参考图要求。",
            )}
          </p>
        </section>
        {draft.image && (
          <ImageSettingsFields
            value={draft.image}
            onChange={(image) => setDraft((d) => ({ ...d, image }))}
          />
        )}
        <TranscriptionSettings
          value={draft.transcription}
          onChange={(transcription) =>
            setDraft((d) => ({ ...d, transcription }))
          }
        />
        <SpeechSettingsFields
          value={draft.speech}
          onChange={(speech) => setDraft((d) => ({ ...d, speech }))}
        />
        <section className="settings-card">
          <header>
            <Sparkles size={20} />
            <div>
              <h2>{t("导演助手模型")}</h2>
              <p>{t("支持 Chat Completions 兼容接口，模型需支持工具调用。")}</p>
            </div>
          </header>
          <label className="field">
            <span>{t("API 服务地址 / 不含 chat/completions")}</span>
            <input
              type="url"
              placeholder={t("https://你的服务商/v1")}
              value={draft.agent.endpoint}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  agent: { ...d.agent, endpoint: e.target.value },
                }))
              }
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t("模型名称")}</span>
              <input
                value={draft.agent.model}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    agent: { ...d.agent, model: e.target.value },
                  }))
                }
                placeholder={t("服务商支持的模型 ID")}
              />
            </label>
            <label className="field">
              <span>
                API Key {draft.agent.hasApiKey && <small>{t("已保存")}</small>}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  draft.agent.hasApiKey
                    ? t("留空保留已有 Key")
                    : t("输入 API Key")
                }
                value={draft.agent.apiKey ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    agent: { ...d.agent, apiKey: e.target.value || undefined },
                  }))
                }
              />
            </label>
          </div>
        </section>
        <section className="settings-card">
          <header>
            <Plug size={20} />
            <div>
              <h2>{t("MCP 与浏览器工具")}</h2>
              <p>
                {t(
                  "接入你信任的本地 STDIO 或 HTTP MCP 服务。工具执行需逐次确认。",
                )}
              </p>
            </div>
          </header>
          <textarea
            className="code-input"
            aria-label={t("MCP 服务配置")}
            rows={8}
            value={mcpText}
            onChange={(e) => setMcpText(e.target.value)}
            spellCheck={false}
          />
          <details>
            <summary>{t("查看 Playwright MCP 示例")}</summary>
            <pre>
              {JSON.stringify(
                [
                  {
                    id: "browser",
                    name: "浏览器",
                    transport: "stdio",
                    command: "npx",
                    args: ["-y", "@playwright/mcp"],
                    enabled: true,
                  },
                ],
                null,
                2,
              )}
            </pre>
          </details>
          <div className="button-row">
            {value.mcp
              .filter((m) => m.enabled)
              .map((m) => (
                <Button
                  type="button"
                  key={m.id}
                  onClick={() =>
                    void api(`/mcp/${m.id}/tools`)
                      .then(setTools)
                      .catch((e) => notify(e.message, true))
                  }
                >
                  {t("检查")}
                  {m.name}
                </Button>
              ))}
          </div>
          {tools && (
            <pre className="tool-result">{JSON.stringify(tools, null, 2)}</pre>
          )}
        </section>
        <section className="settings-card">
          <header>
            <Monitor size={20} />
            <div>
              <h2>{t("工作站与数据")}</h2>
              <p>{t("项目与渲染保存在本机；远程工作站连接为可选高级功能。")}</p>
            </div>
          </header>
          <div className="field-row">
            <label className="field">
              <span>{t("并发任务")}</span>
              <select
                value={draft.concurrency}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    concurrency: Number(e.target.value),
                  }))
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>{t("当前连接")}</span>
              <Button type="button" onClick={onConnect}>
                <Link2 size={14} />
                {serverBase() ? t("切换工作站") : t("连接其他工作站")}
              </Button>
            </div>
          </div>
          <div className="button-row">
            <Button
              type="button"
              onClick={() =>
                void api("/backup")
                  .then((data) =>
                    saveText(
                      "jingxu-project-backup.json",
                      JSON.stringify(data, null, 2),
                      "application/json",
                    ),
                  )
                  .catch((e) => notify(e.message, true))
              }
            >
              <Download size={14} />
              {t("导出项目记录")}
            </Button>
            <Button
              type="button"
              onClick={() =>
                void api("/connection")
                  .then(setConnection)
                  .catch((e) => notify(e.message, true))
              }
            >
              <Smartphone size={14} />
              {t("查看配对信息")}
            </Button>
          </div>
          {connection && (
            <div className="pairing">
              <p>
                {t(
                  "令牌等同本工作站的访问权限，只分享给你自己的设备。远程连接需使用 HTTPS 地址。",
                )}
              </p>
              <label className="field">
                <span>{t("配对令牌")}</span>
                <input readOnly type="password" value={connection.token} />
              </label>
              <Button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(connection.token)
                    .then(() => notify(t("配对令牌已复制")))
                }
              >
                <Copy size={14} />
                {t("复制令牌")}
              </Button>
            </div>
          )}
        </section>
        <div className="settings-save">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {t("保存设置")}
          </Button>
          <span>
            <ShieldCheck size={13} /> {t("Key 加密存储，接口不回传明文")}
          </span>
        </div>
      </form>
    </div>
  );
}
function Connection({
  error,
  onClose,
  onConnect,
}: {
  error: string;
  onClose: () => void;
  onConnect: () => Promise<void>;
}) {
  const [url, setUrl] = useState(serverBase()),
    [key, setKey] = useState(""),
    [message, setMessage] = useState(error),
    [loading, setLoading] = useState(false);
  return (
    <Modal title={t("连接你的创作工作站")} onClose={onClose}>
      <p className="modal-intro">
        {t("桌面默认使用本机工作空间，可选连接你自行管理的远程工作站。")}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          void connect(url, key)
            .then(onConnect)
            .catch((e) => setMessage(e.message))
            .finally(() => setLoading(false));
        }}
      >
        <label className="field">
          <span>{t("工作站地址")}</span>
          <input
            type="url"
            placeholder="https://studio.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("配对令牌")}</span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("工作站设置 → 查看配对信息")}
          />
        </label>
        <p className="caption">
          {t(
            "本机浏览器可留空连接地址；手机需填写可达的 HTTPS 工作站地址。没有连接时不会生成或修改项目。",
          )}
        </p>
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <footer className="modal-footer">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Link2 size={16} />
            )}
            {t("连接工作站")}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

const rootElement = document.getElementById("root");
if (rootElement)
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
