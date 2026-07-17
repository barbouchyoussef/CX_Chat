import { useState, useEffect } from "react";
import ExcelJS from "exceljs";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ReviewClassification {
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  themes: string[];
  complaint_category: string | null;
}

interface ScrapedReview {
  platform: string;
  author: string | null;
  text: string;
  rating: number | null;
  date: string | null;
  url: string | null;
  classification?: ReviewClassification | null;
}

interface PlatformResult {
  platform: string;
  status: "success" | "error" | "empty";
  review_count: number;
  reviews: ScrapedReview[];
  error_message: string | null;
}

interface TopicCount {
  topic: string;
  count: number;
}

interface AnalysisSummary {
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  top_themes: string[];
  top_complaints: TopicCount[];
  summary_text: string | null;
}

interface ScrapingResponse {
  brand_name: string;
  scraped_at: string;
  platforms: PlatformResult[];
  total_reviews: number;
  analysis?: AnalysisSummary | null;
}

interface CompanyOption {
  id: number;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Platform config (No emojis)                                       */
/* ------------------------------------------------------------------ */
const PLATFORM_META: Record<string, { label: string; color: string; accent: string; gradient: string }> = {
  "Google Maps": {
    label: "Google Maps",
    color: "#1A73E8",
    accent: "border-blue-200",
    gradient: "from-blue-50/70 to-white",
  },
  Facebook: {
    label: "Facebook",
    color: "#1877F2",
    accent: "border-indigo-200",
    gradient: "from-indigo-50/70 to-white",
  },
};

/* ------------------------------------------------------------------ */
/*  Star renderer                                                      */
/* ------------------------------------------------------------------ */
function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex gap-0.5 text-amber-500 text-sm">
      {Array.from({ length: full }).map((_, i) => (
        <span key={i}>★</span>
      ))}
      {half && <span>★</span>}
      {Array.from({ length: 5 - full - (half ? 1 : 0) }).map((_, i) => (
        <span key={`e${i}`} className="text-slate-200">
          ★
        </span>
      ))}
      <span className="ml-1.5 text-xs text-slate-500 font-mono font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge (No emojis)                                           */
/* ------------------------------------------------------------------ */
function StatusBadge({ status, count }: { status: string; count: number }) {
  if (status === "success")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-600/10">
        {count} reviews
      </span>
    );
  if (status === "empty")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-600/10">
        No reviews
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-red-600/10">
      Failed
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Pulse animation (No emojis - Uses pure standard CSS spinner)        */
/* ------------------------------------------------------------------ */
function ScrapeLoader() {
  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <div className="relative flex h-16 w-16 items-center justify-center">
        {/* Modern clean dual-ring loading spinner */}
        <div className="absolute h-full w-full rounded-full border-4 border-slate-200" />
        <div className="absolute h-full w-full rounded-full border-4 border-t-amber-500 animate-spin" />
      </div>
      <p className="text-sm font-semibold text-slate-700 animate-pulse">Running social media scraping & CX analysis...</p>
      <p className="text-[11px] text-slate-500 max-w-xs text-center leading-relaxed">
        This query scans public channels and leverages Mistral AI to classify customer reviews. It takes up to 90 seconds.
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
    } catch (e) {}
    return dateStr;
  };

  // Single unified sheet for all platforms
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
  a.download = `${data.brand_name.replace(/\s+/g, "_")}_social_reviews_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function SocialScraping({ onBack }: { onBack: () => void }) {
  const [brandName, setBrandName] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [pastReports, setPastReports] = useState<{ filename: string; brand_name: string; scraped_at: string; total_reviews: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  // Fetch companies list
  useEffect(() => {
    fetch(`${API_BASE_URL}/scraping/companies`)
      .then((r) => r.json())
      .then((d) => setCompanies(d))
      .catch(() => {});
  }, []);

  // Fetch past reports list
  useEffect(() => {
    fetch(`${API_BASE_URL}/scraping/reports`)
      .then((r) => r.json())
      .then((d) => setPastReports(d))
      .catch(() => {});
  }, [loading]);

  async function handleLoadReport(filename: string) {
    if (!filename) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/scraping/reports/${filename}`);
      if (!resp.ok) {
        throw new Error(`Failed to load report: ${resp.status}`);
      }
      const data: ScrapingResponse = await resp.json();
      setResult(data);
      setBrandName(data.brand_name);
      const first = data.platforms.find((p) => p.status === "success");
      if (first) setExpandedPlatform(first.platform);
    } catch (err: any) {
      setError(err.message || "Could not load report.");
    } finally {
      setLoading(false);
    }
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
          facebook_url: facebookUrl.trim() || null
        }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error ${resp.status}`);
      }
      const data: ScrapingResponse = await resp.json();
      setResult(data);
      // Auto-expand the first platform with results
      const first = data.platforms.find((p) => p.status === "success");
      if (first) setExpandedPlatform(first.platform);
    } catch (err: any) {
      setError(err.message || "An error occurred while scraping.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ── Top Bar (No emojis) ── */}
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-white/85 px-6 py-4 backdrop-blur-lg">
        <button
          onClick={onBack}
          className="flex h-9 px-4 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
        >
          Back
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="text-[#A07C3A] font-extrabold">Social Media</span> Scraping
          </h1>
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Google Maps · Facebook</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        {/* ── Optional: Load Past Scrapes ── */}
        {pastReports.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold text-slate-800 uppercase tracking-wide">
              Load Previous Scrape Reports
            </h2>
            <div className="flex flex-col gap-1.5">
              <select
                onChange={(e) => handleLoadReport(e.target.value)}
                defaultValue=""
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-amber-500 focus:bg-white"
              >
                <option value="">-- Select a previous run --</option>
                {pastReports.map((r) => (
                  <option key={r.filename} value={r.filename}>
                    {r.brand_name} ({new Date(r.scraped_at).toLocaleString()} - {r.total_reviews} reviews)
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* ── Step 1: Input & Selector ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-bold text-slate-800 uppercase tracking-wide">
            Select or Enter Company Name
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Pathway A: Select from Database */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Option A: Select from database
              </label>
              <select
                onChange={(e) => setBrandName(e.target.value)}
                value={companies.some((c) => c.name === brandName) ? brandName : ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-amber-500 focus:bg-white"
              >
                <option value="">-- Select a company --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pathway B: Custom manual input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Option B: Type custom name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Type brand/company name..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Pathway C: Facebook Page URL Input */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Option C: Facebook Page URL (Optional)
              </label>
              <input
                type="text"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                placeholder="e.g., https://www.facebook.com/Samsung/"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-amber-500 focus:bg-white"
              />
              <p className="text-[10px] text-slate-400">
                Provide the exact Facebook page URL for the brand to scrape posts using Bright Data (requires active/funded account).
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleScrape}
              disabled={loading || !brandName.trim()}
              className="w-full sm:w-auto rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 text-sm font-semibold shadow-md transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Scraping...
                </div>
              ) : (
                "Start Scraping"
              )}
            </button>
          </div>
        </section>

        {/* ── Error alert ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Loader ── */}
        {loading && <ScrapeLoader />}

        {/* ── Results ── */}
        {result && !loading && (
          <section className="space-y-6">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Results for <span className="text-amber-800 font-extrabold">{result.brand_name}</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Scraped at {new Date(result.scraped_at).toLocaleString()} · {result.total_reviews} total reviews
                </p>
              </div>
              <button
                onClick={() => exportToExcel(result)}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                Download Excel
              </button>
            </div>

            {/* AI Analysis Summary Dashboard */}
            {result.analysis && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Analyse CX par Intelligence Artificielle (Mistral)
                  </h3>
                </div>
                
                {result.analysis.summary_text && (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed border border-slate-100">
                    {result.analysis.summary_text}
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                  {/* Sentiment Distribution */}
                  <div className="rounded-xl border border-slate-100 p-4 space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Répartition du Sentiment</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span>Positif</span>
                          <span>{result.analysis.positive_pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${result.analysis.positive_pct}%` }} />
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span>Neutre</span>
                          <span>{result.analysis.neutral_pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-400 rounded-full" style={{ width: `${result.analysis.neutral_pct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                          <span>Négatif</span>
                          <span>{result.analysis.negative_pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 rounded-full" style={{ width: `${result.analysis.negative_pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key Themes */}
                  <div className="rounded-xl border border-slate-100 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thèmes Récurrents</h4>
                    {result.analysis.top_themes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {result.analysis.top_themes.map((theme, i) => (
                          <span key={i} className="inline-flex items-center rounded bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/10">
                            {theme}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Aucun thème détecté</p>
                    )}
                  </div>

                  {/* Top Complaints */}
                  <div className="rounded-xl border border-slate-100 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Points de Friction (Plaintes)</h4>
                    {result.analysis.top_complaints.length > 0 ? (
                      <div className="space-y-2">
                        {result.analysis.top_complaints.map((item, i) => (
                          <div key={i} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-slate-700">{item.topic}</span>
                            <span className="rounded bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">{item.count} avis</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Aucune plainte récurrente</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Platform cards */}
            <div className="grid gap-5 lg:grid-cols-3">
              {result.platforms.map((p) => {
                const meta = PLATFORM_META[p.platform] || PLATFORM_META["Google Maps"];
                const isExpanded = expandedPlatform === p.platform;
                return (
                  <div
                    key={p.platform}
                    className={`rounded-2xl border bg-gradient-to-b ${meta.gradient} ${meta.accent} p-5 shadow-sm transition-all ${isExpanded ? "lg:col-span-3" : ""}`}
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{meta.label}</h3>
                      </div>
                      <StatusBadge status={p.status} count={p.review_count} />
                    </div>

                    {/* Error message */}
                    {p.status === "error" && p.error_message && (
                      <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-100">{p.error_message}</p>
                    )}

                    {/* Review preview / expand toggle */}
                    {p.status === "success" && p.reviews.length > 0 && (
                      <>
                        <button
                          onClick={() => setExpandedPlatform(isExpanded ? null : p.platform)}
                          className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                        >
                          {isExpanded ? "Collapse reviews" : `Show ${p.reviews.length} reviews`}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto pr-2">
                            {p.reviews.map((r, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm text-sm space-y-2.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800">{r.author || "Anonymous"}</span>
                                  <Stars rating={r.rating} />
                                </div>
                                <p className="leading-relaxed text-slate-600 text-xs sm:text-sm font-medium">{r.text}</p>
                                
                                {/* AI classification details inside review card */}
                                {r.classification && (
                                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
                                    {/* Sentiment badge */}
                                    {r.classification.sentiment === "positive" && (
                                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                                        Positif ({Math.round(r.classification.confidence * 100)}%)
                                      </span>
                                    )}
                                    {r.classification.sentiment === "neutral" && (
                                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-600/10">
                                        Neutre ({Math.round(r.classification.confidence * 100)}%)
                                      </span>
                                    )}
                                    {r.classification.sentiment === "negative" && (
                                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                                        Négatif ({Math.round(r.classification.confidence * 100)}%)
                                      </span>
                                    )}

                                    {/* Themes */}
                                    {r.classification.themes.map((theme, i) => (
                                      <span key={i} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                        {theme}
                                      </span>
                                    ))}

                                    {/* Friction/Complaint category */}
                                    {r.classification.complaint_category && (
                                      <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                                        Plainte: {r.classification.complaint_category}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {r.date && (
                                  <p className="text-[10px] text-slate-400 font-mono">{r.date}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Empty state */}
                    {p.status === "empty" && (
                      <p className="mt-3 text-xs text-slate-400 italic">No reviews found for this brand on {p.platform}.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
