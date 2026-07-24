import { useState, useEffect } from "react";
import { History, ChevronDown, ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import ExcelJS from "exceljs";
import type { ManualAnalysisWorkbook, ManualAnalysisParseResponse } from "../../types/manual-analysis";
import { emptyWorkbook, cleanWorkbookForSubmit } from "../../types/manual-analysis";
import ManualAnalysisForm from "./manual-analysis-form";
import SocialReportView from "./social-report-view";
import type { ScrapingResponse, CompanyOption, PastReportItem } from "../../types/scraping";
import { sourceLabel } from "../../types/scraping";

/** Message from an unknown thrown value — `catch` gives no type guarantee. */
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

/* ------------------------------------------------------------------ */
/*  Draft auto-save                                                    */
/*  The manual-analysis form can be long to fill, so we persist the    */
/*  in-progress draft to localStorage. It is never applied silently:   */
/*  a new tab always starts blank and offers the draft for recovery,   */
/*  so one company's analysis can't leak into the next one.            */
/* ------------------------------------------------------------------ */
const DRAFT_KEY = "ey_social_scraping_draft";
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type SocialDraft = {
  brandName?: string;
  facebookUrl?: string;
  trustpilotDomain?: string;
  googleLocation?: string;
  trustpilotPeriod?: string;
  manualAnalysisMode?: "upload" | "form";
  manualAnalysis?: ManualAnalysisWorkbook | null;
  savedAt?: string;
};

/** Returns the stored draft only when it still holds content and hasn't expired. */
function readSocialDraft(): SocialDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as SocialDraft;

    const savedAt = draft.savedAt ? Date.parse(draft.savedAt) : NaN;
    if (isNaN(savedAt) || Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    const hasContent =
      !!draft.brandName?.trim() ||
      !!draft.facebookUrl?.trim() ||
      !!draft.trustpilotDomain?.trim() ||
      !!draft.googleLocation?.trim() ||
      !!draft.manualAnalysis;
    return hasContent ? draft : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Active job tracking                                                */
/*  A scrape runs server-side and takes minutes. Remembering its id    */
/*  means closing the tab or reloading rejoins the run in progress     */
/*  instead of losing it.                                              */
/* ------------------------------------------------------------------ */
const ACTIVE_JOB_KEY = "ey_social_scraping_active_job";
const JOB_POLL_MS = 3000;

type JobStatus = {
  job_id: number;
  brand_name: string;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: string | null;
  error: string | null;
  result?: ScrapingResponse;
};

function readActiveJobId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeActiveJobId(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_JOB_KEY);
    else localStorage.setItem(ACTIVE_JOB_KEY, String(id));
  } catch {
    /* ignore */
  }
}

function draftAgeLabel(savedAt?: string): string {
  if (!savedAt) return "";
  const ms = Date.now() - Date.parse(savedAt);
  if (isNaN(ms)) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/* ------------------------------------------------------------------ */
/*  Shared form styling + layout primitives                            */
/* ------------------------------------------------------------------ */
const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-[#C5A04F] focus:ring-2 focus:ring-[#C5A04F]/15";

function StepCard({
  step,
  title,
  description,
  right,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[11px] font-bold text-white">
            {step}
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{description}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SourceRow({
  name,
  color,
  active,
  note,
  children,
}: {
  name: string;
  color: string;
  active: boolean;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? color : "#e2e8f0" }} />
        <span className="text-sm font-bold text-slate-800">{name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
          }`}
        >
          {active ? "Active" : "Skipped"}
        </span>
        <span className="w-full text-[11px] text-slate-400 sm:w-auto">{note}</span>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pulse animation (No emojis - Uses pure standard CSS spinner)        */
/* ------------------------------------------------------------------ */
function ScrapeLoader({ progress }: { progress?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <div className="relative flex h-16 w-16 items-center justify-center">
        {/* Modern clean dual-ring loading spinner */}
        <div className="absolute h-full w-full rounded-full border-4 border-slate-200" />
        <div className="absolute h-full w-full rounded-full border-4 border-t-amber-500 animate-spin" />
      </div>
      <p className="text-sm font-semibold text-slate-700">
        {progress || "Collecting and analysing customer feedback"}
      </p>
      <p className="max-w-sm text-center text-[11px] leading-relaxed text-slate-500">
        This typically takes around two minutes. The analysis runs on the server — you can close
        this tab and come back to it.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Excel Export                                                       */
/* ------------------------------------------------------------------ */
async function exportToExcel(data: ScrapingResponse) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EY CX Studio";
  wb.created = new Date();

  const EY_CHARCOAL = "FF2E2E38";
  const EY_GOLD = "FFC5A04F";

  const formatExcelDate = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    } catch {
      // Unparseable dates are written through as the platform supplied them.
    }
    return dateStr;
  };

  /* ---- Shared styling helpers ---- */
  const styleHeader = (row: ExcelJS.Row) => {
    row.height = 26;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_CHARCOAL } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "medium", color: { argb: EY_GOLD } } };
    });
  };
  const titleRow = (sheet: ExcelJS.Worksheet, text: string) => {
    const row = sheet.addRow([text]);
    row.font = { bold: true, size: 14, color: { argb: EY_CHARCOAL } };
    row.height = 24;
    sheet.addRow([]);
    return row;
  };

  const report = data.detailed_report;

  /* ---- Sheet 1: Executive summary (only when a report exists) ---- */
  if (report) {
    const s = wb.addWorksheet("Summary", { properties: { defaultColWidth: 20 } });
    s.getColumn(1).width = 26;
    s.getColumn(2).width = 96;

    titleRow(s, `Social & Web CX Analysis — ${data.brand_name}`);

    const meta: [string, string][] = [
      ["Generated", new Date(data.scraped_at).toLocaleString()],
      ["Reviews analysed", String(data.total_reviews)],
      ["Channels covered", String(report.channel_breakdown.length)],
    ];
    if (report.overall_sentiment) {
      const os = report.overall_sentiment;
      meta.push(["Sentiment (positive)", `${os.positive_pct}%`]);
      meta.push(["Sentiment (neutral)", `${os.neutral_pct}%`]);
      meta.push(["Sentiment (negative)", `${os.negative_pct}%`]);
      meta.push(["Reviews classified", String(os.classified_count)]);
    }
    for (const [k, v] of meta) {
      const r = s.addRow([k, v]);
      r.getCell(1).font = { bold: true, size: 10, color: { argb: "FF6B6B76" } };
      r.getCell(2).alignment = { vertical: "middle" };
    }

    s.addRow([]);
    const execHead = s.addRow(["Executive summary", ""]);
    styleHeader(execHead);
    const execRow = s.addRow(["", report.executive_summary]);
    execRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
    execRow.height = 110;

    s.addRow([]);
    const methodHead = s.addRow(["Methodology", ""]);
    styleHeader(methodHead);
    const methodRow = s.addRow(["", report.methodology_note]);
    methodRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
    methodRow.height = 46;

    if (report.website_assessment) {
      s.addRow([]);
      const webHead = s.addRow(["Website assessment", ""]);
      styleHeader(webHead);
      const webRow = s.addRow(["", report.website_assessment]);
      webRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
      webRow.height = 70;
    }

    /* ---- Sheet 2: Friction points ---- */
    const f = wb.addWorksheet("Friction Points", { properties: { defaultColWidth: 20 } });
    const fHead = f.addRow(["#", "Theme", "Source", "Mentions", "Share", "Description", "Supporting evidence"]);
    styleHeader(fHead);
    f.getColumn(1).width = 6;
    f.getColumn(2).width = 34;
    f.getColumn(3).width = 18;
    f.getColumn(4).width = 11;
    f.getColumn(5).width = 10;
    f.getColumn(6).width = 62;
    f.getColumn(7).width = 62;
    report.top_friction_points.forEach((fp, i) => {
      const row = f.addRow([
        i + 1,
        fp.theme,
        sourceLabel(fp.source),
        fp.mention_count ?? "—",
        fp.share_pct != null ? `${fp.share_pct}%` : "—",
        fp.description,
        (fp.supporting_evidence || []).join("\n"),
      ]);
      row.height = 62;
      row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      row.getCell(2).font = { bold: true };
      row.getCell(3).alignment = { vertical: "top" };
      row.getCell(4).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(5).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(6).alignment = { wrapText: true, vertical: "top" };
      row.getCell(7).alignment = { wrapText: true, vertical: "top" };
    });
    f.views = [{ state: "frozen", ySplit: 1 }];

    /* ---- Sheet: Evidence (computed figures, so the deck can cite them directly) ---- */
    const ev = report.evidence;
    if (ev && ev.reviews_classified > 0) {
      const e = wb.addWorksheet("Evidence", { properties: { defaultColWidth: 18 } });
      e.getColumn(1).width = 34;
      e.getColumn(2).width = 14;
      e.getColumn(3).width = 14;
      e.getColumn(4).width = 14;
      e.getColumn(5).width = 14;
      e.getColumn(6).width = 16;

      titleRow(e, "Computed evidence");
      const cov = e.addRow([`${ev.reviews_classified} of ${ev.reviews_collected} collected reviews classified`]);
      cov.getCell(1).font = { italic: true, size: 10, color: { argb: "FF6B6B76" } };
      e.addRow([]);

      if (ev.platform_sentiment.length > 0) {
        styleHeader(e.addRow(["Channel", "Analysed", "Avg rating", "Positive", "Neutral", "Negative"]));
        ev.platform_sentiment.forEach((p) => {
          e.addRow([
            p.platform,
            p.classified_count,
            p.avg_rating ?? "—",
            `${p.positive_pct}%`,
            `${p.neutral_pct}%`,
            `${p.negative_pct}%`,
          ]).getCell(1).font = { bold: true };
        });
        e.addRow([]);
      }

      if (ev.rating_distribution) {
        const d = ev.rating_distribution;
        styleHeader(e.addRow(["Rating spread", "1★", "2★", "3★", "4★", "5★"]));
        e.addRow([`Average ${d.average ?? "—"}/5 · ${d.total} rated`, d.one, d.two, d.three, d.four, d.five]);
        e.addRow([]);
      }

      if (ev.top_complaints.length > 0) {
        styleHeader(e.addRow(["Complaint category", "Mentions", "% of negative reviews"]));
        ev.top_complaints.forEach((c) => e.addRow([c.label, c.count, `${c.share_pct}%`]));
        e.addRow([]);
      }

      if (ev.top_themes.length > 0) {
        styleHeader(e.addRow(["Theme", "Mentions", "% of reviews", "% negative"]));
        ev.top_themes.forEach((t) => e.addRow([t.label, t.count, `${t.share_pct}%`, `${t.negative_pct}%`]));
        e.addRow([]);
      }

      if (ev.verbatims.length > 0) {
        styleHeader(e.addRow(["Label", "Channel", "Rating", "Sentiment", "Verbatim"]));
        e.getColumn(5).width = 90;
        ev.verbatims.forEach((v) => {
          const row = e.addRow([v.label, v.platform, v.rating ?? "—", v.sentiment ?? "—", v.text]);
          row.getCell(5).alignment = { wrapText: true, vertical: "top" };
          row.height = 44;
        });
      }
    }

    /* ---- Sheet 3: Strengths & recommendations ---- */
    const a = wb.addWorksheet("Strengths & Actions", { properties: { defaultColWidth: 20 } });
    a.getColumn(1).width = 12;
    a.getColumn(2).width = 100;
    a.getColumn(3).width = 34;
    a.getColumn(4).width = 12;
    const aHead = a.addRow(["Type", "Item", "Addresses / evidence", "Mentions"]);
    styleHeader(aHead);
    report.top_strengths.forEach((sItem) => {
      const row = a.addRow([
        "Strength",
        sItem.text,
        sItem.related_label ?? "",
        sItem.mention_count ?? "",
      ]);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      row.height = 30;
    });
    report.recommendations.forEach((rItem, i) => {
      const row = a.addRow([
        `Action ${i + 1}`,
        rItem.text,
        rItem.addresses ?? "",
        rItem.mention_count ?? "",
      ]);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      row.height = 38;
    });
    a.views = [{ state: "frozen", ySplit: 1 }];

    /* ---- Sheet 4: Channel breakdown ---- */
    const c = wb.addWorksheet("Channels", { properties: { defaultColWidth: 20 } });
    const cHead = c.addRow(["Channel", "Summary", "Key stats", "Strengths", "Friction points"]);
    styleHeader(cHead);
    c.getColumn(1).width = 20;
    c.getColumn(2).width = 62;
    c.getColumn(3).width = 40;
    c.getColumn(4).width = 40;
    c.getColumn(5).width = 40;
    report.channel_breakdown.forEach((sec) => {
      const row = c.addRow([
        sec.channel,
        sec.summary,
        (sec.key_stats || []).join("\n"),
        (sec.strengths || []).join("\n"),
        (sec.friction_points || []).join("\n"),
      ]);
      row.height = 76;
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { vertical: "top" };
      for (let i = 2; i <= 5; i++) row.getCell(i).alignment = { wrapText: true, vertical: "top" };
    });
    c.views = [{ state: "frozen", ySplit: 1 }];
  }

  // Raw review log for all platforms
  const ws = wb.addWorksheet("All Feedback", {
    properties: { defaultColWidth: 20 },
  });

  // Header row (with Platform column)
  const headerRow = ws.addRow([
    "Platform",
    "Review Content", 
    "Date", 
    "Stars / Rating", 
    "Sentiment", 
    "Themes", 
    "Complaint Category"
  ]);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_CHARCOAL } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: EY_GOLD } },
    };
  });

  // Column widths
  ws.getColumn(1).width = 18;  // Platform
  ws.getColumn(2).width = 70;  // Review Content
  ws.getColumn(3).width = 22;  // Date
  ws.getColumn(4).width = 15;  // Stars
  ws.getColumn(5).width = 15;  // Sentiment
  ws.getColumn(6).width = 25;  // Themes
  ws.getColumn(7).width = 25;  // Complaint Category

  // Data rows
  for (const platform of data.platforms) {
    const reviewsList = platform.reviews || [];
    for (const r of reviewsList) {
      const ratingText = r.rating != null ? `${r.rating} / 5` : "—";
      const sentimentText = r.classification?.sentiment ?? "—";
      const themesText = r.classification?.themes?.join(", ") ?? "—";
      const complaintText = r.classification?.complaint_category ?? "—";

      const row = ws.addRow([
        platform.platform,
        r.text,
        formatExcelDate(r.date),
        ratingText,
        sentimentText,
        themesText,
        complaintText,
      ]);
      row.height = 52;
      row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(2).alignment = { wrapText: true, vertical: "top", horizontal: "left" };
      row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(6).alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
      row.getCell(7).alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
    }
  }

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.brand_name.replace(/\s+/g, "_")}_social_cx_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function SocialScraping({ onBack }: { onBack: () => void }) {
  // A new tab always starts blank. Any saved draft is held aside and only applied
  // if the consultant explicitly resumes it.
  const [brandName, setBrandName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [trustpilotDomain, setTrustpilotDomain] = useState("");
  const [googleLocation, setGoogleLocation] = useState("");
  const [trustpilotPeriod, setTrustpilotPeriod] = useState("last12months");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [pastReports, setPastReports] = useState<PastReportItem[]>([]);
  /* Filename of the report whose delete button has been armed — deletion is irreversible,
     so it always takes two clicks. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // A job left running when the tab closed is picked back up on the next render.
  const [activeJobId, setActiveJobId] = useState<number | null>(() => readActiveJobId());
  const [jobProgress, setJobProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => readActiveJobId() != null);
  const [result, setResult] = useState<ScrapingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Manual analysis workbook (Excel upload OR in-app form, filled by the consultant before scraping)
  const [manualAnalysisMode, setManualAnalysisMode] = useState<"upload" | "form">("upload");
  const [manualAnalysisFileName, setManualAnalysisFileName] = useState<string | null>(null);
  const [manualAnalysis, setManualAnalysis] = useState<ManualAnalysisWorkbook | null>(null);
  const [manualAnalysisWarnings, setManualAnalysisWarnings] = useState<string[]>([]);
  const [manualAnalysisUploading, setManualAnalysisUploading] = useState(false);
  const [manualAnalysisError, setManualAnalysisError] = useState<string | null>(null);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(false);

  /* Read once on first render. Kept in state (not re-read) so the recovery offer
     survives the auto-save overwriting localStorage as the consultant types. */
  const [recoverableDraft, setRecoverableDraft] = useState<SocialDraft | null>(() => readSocialDraft());

  // Google Maps always runs; the other two switch on once a link is provided.
  const activeSourceCount = 1 + (facebookUrl.trim() ? 1 : 0) + (trustpilotDomain.trim() ? 1 : 0);

  // Fetch companies list
  useEffect(() => {
    fetch(`${API_BASE_URL}/scraping/companies`)
      .then((r) => r.json())
      .then((d) => setCompanies(d))
      .catch(() => {});
  }, []);

  // Persist the draft on every change.
  useEffect(() => {
    try {
      if (brandName || facebookUrl || trustpilotDomain || googleLocation || manualAnalysis) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            brandName,
            facebookUrl,
            trustpilotDomain,
            googleLocation,
            trustpilotPeriod,
            manualAnalysisMode,
            manualAnalysis,
            savedAt: new Date().toISOString(),
          }),
        );
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* quota exceeded — ignore */
    }
  }, [brandName, facebookUrl, trustpilotDomain, trustpilotPeriod, googleLocation, manualAnalysisMode, manualAnalysis]);

  /* Poll the active job until it reaches a terminal state.
     Network errors keep the loop alive: the run is safe server-side, so a dropped
     connection should retry rather than abandon a scrape that is still working. */
  useEffect(() => {
    if (activeJobId == null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      writeActiveJobId(null);
      setActiveJobId(null);
      setJobProgress(null);
      setLoading(false);
    };

    const poll = async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/scraping/jobs/${activeJobId}`);
        if (cancelled) return;

        if (resp.status === 404) {
          // The job predates a database reset, or was never created.
          setError("That analysis is no longer available. Please run it again.");
          finish();
          return;
        }
        if (!resp.ok) throw new Error(`Server error ${resp.status}`);

        const job: JobStatus = await resp.json();
        if (cancelled) return;
        setJobProgress(job.progress);

        if (job.status === "succeeded" && job.result) {
          setResult(job.result);
          /* The run is archived server-side, so the setup form is reset. Emptying every
             field also makes the auto-save effect drop the stored draft, which keeps the
             next session (or tab) from inheriting this company. */
          setBrandName("");
          setFacebookUrl("");
          setTrustpilotDomain("");
          setManualAnalysis(null);
          setManualAnalysisFileName(null);
          setManualAnalysisWarnings([]);
          setDraftRestoredNotice(false);
          finish();
        } else if (job.status === "failed") {
          setError(job.error || "The analysis failed. Please try again.");
          finish();
        } else {
          timer = setTimeout(poll, JOB_POLL_MS);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, JOB_POLL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId]);

  // Fetch past reports list
  useEffect(() => {
    fetch(`${API_BASE_URL}/scraping/reports`)
      .then((r) => r.json())
      .then((d) => setPastReports(d))
      .catch(() => {});
  }, [loading]);

  async function handleLoadReport(filename: string) {
    if (!filename) return;
    setHistoryOpen(false);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/scraping/reports/${filename}`);
      if (!resp.ok) {
        throw new Error(`Failed to load report: ${resp.status}`);
      }
      const data: ScrapingResponse = await resp.json();
      // The report view reads result.brand_name; leaving the setup form untouched
      // avoids a browsed archive report turning into a saved draft.
      setResult(data);
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not load report."));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteReport(filename: string) {
    setDeletingReport(filename);
    setDeleteError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/scraping/reports/${filename}`, {
        method: "DELETE",
      });
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Failed to delete report: ${resp.status}`);
      }
      // A 404 means it is already gone, so dropping it from the list is still correct.
      setPastReports((reports) => reports.filter((r) => r.filename !== filename));
      setConfirmDelete(null);
    } catch (err: unknown) {
      setDeleteError(errorMessage(err, "Could not delete this report."));
    } finally {
      setDeletingReport(null);
    }
  }

  async function handleUploadManualAnalysis(file: File) {
    setManualAnalysisUploading(true);
    setManualAnalysisError(null);
    setManualAnalysisWarnings([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`${API_BASE_URL}/scraping/manual-analysis/parse`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error ${resp.status}`);
      }
      const data: ManualAnalysisParseResponse = await resp.json();
      setManualAnalysis(data.workbook);
      setManualAnalysisWarnings(data.warnings);
      setManualAnalysisFileName(file.name);
      // Convenience: if no company was chosen yet, pick up the one written in the workbook.
      if (!brandName.trim() && data.workbook.company_name) {
        setBrandName(data.workbook.company_name);
      }
    } catch (err: unknown) {
      setManualAnalysisError(errorMessage(err, "Could not read this workbook."));
      setManualAnalysis(null);
      setManualAnalysisFileName(null);
    } finally {
      setManualAnalysisUploading(false);
    }
  }

  function handleResumeDraft() {
    const draft = recoverableDraft;
    if (!draft) return;
    setBrandName(draft.brandName ?? "");
    setFacebookUrl(draft.facebookUrl ?? "");
    setTrustpilotDomain(draft.trustpilotDomain ?? "");
    setGoogleLocation(draft.googleLocation ?? "");
    setTrustpilotPeriod(draft.trustpilotPeriod ?? "last12months");
    setManualAnalysisMode(draft.manualAnalysisMode ?? "upload");
    setManualAnalysis(draft.manualAnalysis ?? null);
    setDraftRestoredNotice(!!draft.manualAnalysis);
    setRecoverableDraft(null);
  }

  function handleDiscardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setRecoverableDraft(null);
  }

  function handleClearManualAnalysis() {
    setManualAnalysis(null);
    setManualAnalysisFileName(null);
    setManualAnalysisWarnings([]);
    setManualAnalysisError(null);
    setDraftRestoredNotice(false);
  }

  async function handleScrape() {
    if (!brandName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/scraping/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName.trim(),
          facebook_url: facebookUrl.trim() || null,
          trustpilot_domain: trustpilotDomain.trim() || null,
          google_location: googleLocation.trim() || null,
          trustpilot_period: trustpilotPeriod || null,
          manual_analysis: manualAnalysis
            ? cleanWorkbookForSubmit({ ...manualAnalysis, company_name: brandName.trim() })
            : null,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error ${resp.status}`);
      }
      /* The server queues the work and hands back a job id. Recording it before anything
         else means a reload or a closed tab rejoins the run rather than losing it. */
      const job: JobStatus = await resp.json();
      writeActiveJobId(job.job_id);
      setJobProgress(job.progress);
      setActiveJobId(job.job_id); // starts the polling effect
    } catch (err: unknown) {
      setError(errorMessage(err, "An error occurred while scraping."));
      setLoading(false);
    }
  }

  /* Once a report exists the whole view switches to its own page, the same way the
     interview guide hub swaps to its result view. Placed after every hook so the
     Rules of Hooks still hold. */
  if (result && !loading) {
    return (
      <SocialReportView
        result={result}
        onBack={() => setResult(null)}
        onExportExcel={() => exportToExcel(result)}
        onReuseInputs={() => {
          /* Load the saved workbook back into the form so a figure can be corrected and
             the report regenerated, rather than the whole workbook retyped. */
          if (!result.manual_analysis) return;
          setManualAnalysis(result.manual_analysis);
          setManualAnalysisMode("form");
          setBrandName(result.brand_name);
          setManualAnalysisFileName(null);
          setManualAnalysisWarnings([]);
          setDraftRestoredNotice(true);
          setResult(null);
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_40%,#f7f9fb_72%,#ffffff_100%)] text-slate-800">
      {/* Print / Save-as-PDF: isolate the report, drop the app chrome. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #report-print-area, #report-print-area * { visibility: visible !important; }
          #report-print-area {
            position: absolute !important;
            left: 0; top: 0; width: 100% !important;
          }
          #report-print-area .no-print { display: none !important; }
          /* Flatten screen-only chrome so it prints cleanly */
          #report-print-area * {
            box-shadow: none !important;
            backdrop-filter: none !important;
          }
          #report-print-area .rounded-2xl,
          #report-print-area .rounded-3xl,
          #report-print-area .rounded-xl {
            border-color: #e2e8f0 !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #report-print-area h2,
          #report-print-area h3 { break-after: avoid; page-break-after: avoid; }
          #report-print-area section { break-inside: auto; }
          /* Keep background fills (sentiment bars, badges, banner) in the PDF */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="pointer-events-none absolute right-[-10%] top-[-4%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(197,160,79,0.10),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none absolute left-[-12%] top-[40%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(56,88,233,0.07),rgba(255,255,255,0))] blur-3xl" />

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200/70 bg-white/85 px-6 py-4 backdrop-blur-lg">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}ey_logo.svg`} alt="EY" className="h-6 w-auto" />
          <span className="h-4 w-px bg-slate-200" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">Social Listening</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Google Maps · Facebook · Trustpilot
            </p>
          </div>
        </div>

        {/* History dropdown (past scrape reports) */}
        {pastReports.length > 0 && (
          <div className="relative ml-auto">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
            >
              <History className="h-3.5 w-3.5" />
              Past reports
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{pastReports.length}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>

            {historyOpen && (
              <>
                <button
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setHistoryOpen(false)}
                  aria-hidden
                  tabIndex={-1}
                />
                <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-96 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Load a previous scrape
                  </p>
                  <div className="flex flex-col gap-1">
                    {pastReports.map((r) => {
                      const confirming = confirmDelete === r.filename;
                      return (
                        <div
                          key={r.filename}
                          className="group flex items-center gap-2 rounded-xl px-1 transition hover:bg-slate-50"
                        >
                          <button
                            onClick={() => handleLoadReport(r.filename)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">{r.brand_name}</p>
                              <p className="text-[11px] text-slate-400">
                                {new Date(r.scraped_at).toLocaleString()}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                              {r.total_reviews} reviews
                            </span>
                          </button>

                          {/* Deleting a report cannot be undone, so the first click only arms
                              the action and the button restates what it will do. */}
                          {confirming ? (
                            <span className="flex shrink-0 items-center gap-1 pr-1">
                              <button
                                onClick={() => handleDeleteReport(r.filename)}
                                disabled={deletingReport === r.filename}
                                className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                {deletingReport === r.filename ? "Deleting…" : "Delete"}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-900"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(r.filename)}
                              title={`Delete the ${r.brand_name} report`}
                              aria-label={`Delete the ${r.brand_name} report`}
                              className="mr-1 shrink-0 rounded-lg p-2 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {deleteError && (
                    <p className="px-3 pb-1 pt-2 text-[11px] text-rose-600">{deleteError}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-6 py-10 space-y-6">
        {/* ── Unfinished draft recovery (never applied automatically) ── */}
        {recoverableDraft && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C5A04F]/30 bg-[#C5A04F]/[0.06] px-5 py-4">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Unfinished analysis</span>
              {recoverableDraft.brandName?.trim() ? ` — ${recoverableDraft.brandName.trim()}` : ""}
              <span className="text-slate-400"> · saved {draftAgeLabel(recoverableDraft.savedAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleResumeDraft}
                className="rounded-lg bg-[#2E2E38] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1a1a22]"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Company ── */}
        <StepCard step={1} title="Company" description="Select a previously analysed company or enter a new name.">
          <input
            type="text"
            list="known-companies"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Company name"
            className={INPUT_CLS}
          />
          <datalist id="known-companies">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          {companies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Recent</span>
              {companies.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBrandName(c.name)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                    brandName === c.name
                      ? "border-[#C5A04F] bg-[#C5A04F]/10 text-[#8a6d00]"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </StepCard>

        {/* ── Step 2: Automated sources ── */}
        <StepCard
          step={2}
          title="Data sources"
          description="Google Maps is included by default. Provide a link to enable the others."
          right={
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
              {activeSourceCount} of 3 enabled
            </span>
          }
        >
          <div className="divide-y divide-slate-100">
            <SourceRow
              name="Google Maps"
              color="#1A73E8"
              active
              note="Reviews from the company's physical locations."
            >
              <input
                type="text"
                value={googleLocation}
                onChange={(e) => setGoogleLocation(e.target.value)}
                placeholder="Country or city, e.g. Tunisie"
                className={INPUT_CLS}
              />
              {/* Without this the search is worldwide: a query for a common brand name
                  returns same-named businesses in other countries and blends them in. */}
              <p className={`mt-1.5 text-[11px] ${googleLocation.trim() ? "text-slate-400" : "text-amber-600"}`}>
                {googleLocation.trim()
                  ? "Only places in this location are analysed."
                  : "Recommended — without a location, businesses with the same name in other countries may be included."}
              </p>
            </SourceRow>

            <SourceRow
              name="Facebook"
              color="#1877F2"
              active={!!facebookUrl.trim()}
              note="Comments on the page's most recent posts."
            >
              <input
                type="text"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                placeholder="https://www.facebook.com/YourBrand/"
                className={INPUT_CLS}
              />
            </SourceRow>

            <SourceRow
              name="Trustpilot"
              color="#00B67A"
              active={!!trustpilotDomain.trim()}
              note="Reviews, TrustScore and brand response rate."
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <input
                  type="text"
                  value={trustpilotDomain}
                  onChange={(e) => setTrustpilotDomain(e.target.value)}
                  placeholder="orange.fr or full Trustpilot URL"
                  className={INPUT_CLS}
                />
                <select
                  value={trustpilotPeriod}
                  onChange={(e) => setTrustpilotPeriod(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="last30days">Last 30 days</option>
                  <option value="last3months">Last 3 months</option>
                  <option value="last6months">Last 6 months</option>
                  <option value="last12months">Last 12 months</option>
                  <option value="">All time</option>
                </select>
              </div>
            </SourceRow>
          </div>
        </StepCard>

        {/* ── Step 3: Manual channel & website analysis (optional) ── */}
        <StepCard
          step={3}
          title="Manual analysis"
          description="Optional. LinkedIn, Instagram, X and the website, consolidated with the scraped data into a single report."
          right={
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setManualAnalysisMode("upload")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  manualAnalysisMode === "upload" ? "bg-[#111827] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Upload Excel
              </button>
              <button
                type="button"
                onClick={() => setManualAnalysisMode("form")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  manualAnalysisMode === "form" ? "bg-[#111827] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Fill in form
              </button>
            </div>
          }
        >
          {manualAnalysisMode === "upload" ? (
            <div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Download the template, complete it offline, then upload the file.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={`${API_BASE_URL}/scraping/manual-analysis/template`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Download template
                </a>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100">
                  {manualAnalysisUploading ? "Uploading..." : "Upload filled workbook"}
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={manualAnalysisUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadManualAnalysis(file);
                      e.target.value = "";
                    }}
                  />
                </label>

                {manualAnalysis && (
                  <button
                    type="button"
                    onClick={handleClearManualAnalysis}
                    className="text-[11px] font-semibold text-slate-400 underline hover:text-slate-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              {manualAnalysisError && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-100">
                  {manualAnalysisError}
                </p>
              )}

              {manualAnalysis && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold text-emerald-800">
                    Loaded: {manualAnalysisFileName || "restored draft"}
                    {manualAnalysis.company_name ? ` — ${manualAnalysis.company_name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">
                    {manualAnalysis.channels.length} channel{manualAnalysis.channels.length === 1 ? "" : "s"} filled
                    {manualAnalysis.website ? ", website data included" : ""}
                    {manualAnalysis.themes.length > 0 ? `, ${manualAnalysis.themes.length} consolidated theme${manualAnalysis.themes.length === 1 ? "" : "s"}` : ""}.
                  </p>
                  {manualAnalysisWarnings.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-emerald-100 pt-2 text-[11px] text-amber-700">
                      {manualAnalysisWarnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
                <span>{draftRestoredNotice ? "Draft restored." : "Draft saved automatically on this device."}</span>
                {(manualAnalysis || draftRestoredNotice) && (
                  <button
                    type="button"
                    onClick={handleClearManualAnalysis}
                    className="font-semibold text-slate-500 underline hover:text-slate-700"
                  >
                    Clear form
                  </button>
                )}
              </div>
              <ManualAnalysisForm value={manualAnalysis ?? emptyWorkbook()} onChange={setManualAnalysis} />
            </div>
          )}
        </StepCard>

        {/* ── Run ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-100 bg-white/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md sm:px-7">
          <div className="min-w-0">
            {brandName.trim() ? (
              <>
                <p className="text-sm font-semibold text-slate-900">{brandName.trim()}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {activeSourceCount} source{activeSourceCount === 1 ? "" : "s"}
                  {manualAnalysis ? " · manual analysis included" : ""} · approx. 2 minutes
                </p>
              </>
            ) : (
              <p className="text-[12px] text-slate-400">Enter a company name to continue.</p>
            )}
          </div>
          <button
            onClick={handleScrape}
            disabled={loading || !brandName.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#111827] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 sm:w-auto"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analysing…
              </>
            ) : (
              <>
                Run analysis
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {/* ── Error alert ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Loader ── */}
        {loading && <ScrapeLoader progress={jobProgress} />}

      </main>
    </div>
  );
}
