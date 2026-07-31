import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Frown,
  Globe,
  Lightbulb,
  MessageSquare,
  Pencil,
  Reply,
  ShieldCheck,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
} from "lucide-react";
import type {
  ChannelReportSection,
  PlatformResult,
  PlatformSentiment,
  RatingDistribution,
  RatingSentimentCheck,
  ScrapingResponse,
  ThemeFrequency,
  ThemeVerbatim,
  TopicMomentum,
  TrendSeries,
} from "../../types/scraping";
import { sourceLabel } from "../../types/scraping";
import type { ChannelAnalysis, ChannelPost } from "../../types/manual-analysis";
import ModuleChat, { type ModuleChatMessage } from "./module-chat";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

/** Pull a headline count out of a free-text workbook metric ("1 015 052 (+1.8% MoM)"). */
function parseCount(raw?: string | null): number | null {
  if (!raw) return null;
  // Workbook figures use thin / non-breaking spaces as thousand separators ("1 015 052").
  const match = raw.match(/[0-9][0-9\s.,']*/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Pull the period-over-period delta out of the same string ("+1.8%"). */
function parseDelta(raw?: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/[+-]\s*[\d.,]+\s*%/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

/** Render a workbook percentage.
 *
 * Excel stores percent-formatted cells as fractions, so the template's "52%" bounce rate
 * arrives as the string "0.52" and printed raw it reads as half a percent. Values that
 * already carry a % sign are passed through untouched. */
function formatPercent(raw?: string | null): string {
  if (!raw) return "—";
  const trimmed = raw.trim();
  if (trimmed.includes("%")) return trimmed;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n)) return trimmed;
  const pct = n <= 1 ? n * 100 : n;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/** Is this "supporting evidence" a statistic rather than a customer quote?
 *
 * The report prompt lets `supporting_evidence` hold either a verbatim or a stat, and the
 * model routinely puts stats there ("1 occurrence, i.e. 10% of negative reviews", "89
 * opinions on 4G congestion", "5 of [Staff and customer relations]"). Rendered inside
 * quotation marks those read as fabricated customer quotes, and the bracketed taxonomy
 * labels are internal names that must never reach a client. The volume they carry is
 * already shown in the badge, so the line adds nothing and is dropped. */
function looksLikeStat(text: string): boolean {
  if (/\[[^\]]+\]/.test(text)) return true; // internal taxonomy label leaked
  return [
    /\bi\.e\.\b/i,
    /\bof (negative|classified|consolidated) (reviews|mentions)\b/i,
    /\(source:\s*consultant\)/i,
    /^\s*\d+\s+(occurrence|occurrences|opinion|opinions|mention|mentions)\b/i,
    /\bconsolidated mentions\b/i,
  ].some((re) => re.test(text));
}

function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function postTotal(p: ChannelPost): number {
  return [p.likes, p.comments, p.shares].reduce((s: number, v) => s + (v ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/*  Colour system                                                      */
/* ------------------------------------------------------------------ */

/* Colour carries exactly two jobs here, and nothing else:
     - SENTIMENT is a status scale, always emerald / slate / rose, never reused for identity;
     - CHANNEL is the one categorical encoding — a channel keeps its hue in the legend, the
       volume chart, the stacked complaint bars and its sentiment card.
   Topics deliberately get no colour: their label is always written next to them, so a hue
   would carry no information the reader doesn't already have, and eight arbitrary hues
   scattered down the page is just noise.

   Slot order below is the validated categorical order, not a hand-picked one. It clears the
   colourblind-separation and normal-vision gates on the adjacent pairlist (which is what a
   stacked bar needs), and the first three clear the stricter all-pairs gate — which covers
   the usual two-to-three channel report. Three slots sit under 3:1 against white, so every
   chart using them ships a legend and per-segment counts. */
const CHANNEL_HUES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

/* The sentiment marks. Tailwind's rose-500 (#f43f5e) is tuned for small accents; across a
   donut ring or a bar that is 90% one colour it reads as an alarm rather than a measurement.
   These are the fixed status steps — the same information, at a temperature you can look at
   for the length of a report. */
const NEGATIVE_MARK = "#d03b3b";
const NEUTRAL_MARK = "#cbd5e1";
const POSITIVE_MARK = "#10b981";

function buildChannelColors(names: string[]): Record<string, string> {
  const map: Record<string, string> = {
    "Google Maps": "#1A73E8",
    "Facebook": "#1877F2",
    "Instagram": "#E4405F",
    "Trustpilot": "#00B67A",
  };
  Array.from(new Set(names))
    .sort()
    .forEach((name, i) => {
      if (!map[name]) {
        map[name] = CHANNEL_HUES[i % CHANNEL_HUES.length];
      }
    });
  return map;
}

/* ------------------------------------------------------------------ */
/*  Layout primitives                                                  */
/* ------------------------------------------------------------------ */

/** Numbered section heading — gives the single page a report's spine, and the anchor the
    sidebar navigates to. */
function Section({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 border-b border-slate-200 pb-2.5">
        <h2 className="flex items-center gap-2.5 text-[22px] font-bold tracking-tight text-slate-900">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Separates the decision-ready half of the report from the supporting detail, and forces
    a page break when printed. */
function PartDivider({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="page-break flex items-center gap-4 pt-2">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C5A04F]">{label}</p>
        <p className="text-[12px] text-slate-400">{hint}</p>
      </div>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/** Big-number scorecard. The top row must land the story in five seconds. */
function Kpi({
  label,
  value,
  unit,
  sub,
  delta,
  icon,
  strip,
  size = "lg",
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Period-over-period change, e.g. "+1.8%". Green when up, rose when down. */
  delta?: string | null;
  icon?: React.ReactNode;
  /** Small distribution bar under the number — a sparkline stands in for a trend we do not
      have, so this shows the make-up of the figure instead of a history of it. */
  strip?: React.ReactNode;
  size?: "lg" | "sm";
  tone?: "neutral" | "good" | "bad";
}) {
  const valueTone = tone === "good" ? "text-emerald-600" : "text-slate-900";
  const up = delta?.startsWith("+");
  return (
    <div className="pdf-block flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      {/* Reserved height for two lines: a label that wraps must not shove its own number
          out of line with the four cards beside it. */}
      <p className="flex min-h-[2.6em] items-start gap-1.5 text-[11px] font-bold uppercase leading-[1.3] tracking-[0.06em] text-slate-500">
        {icon && <span className="mt-px shrink-0">{icon}</span>}
        {label}
      </p>
      <p
        className={`font-bold leading-none tabular-nums ${valueTone} ${
          size === "lg" ? "text-[2.35rem]" : "text-2xl"
        }`}
        style={tone === "bad" ? { color: NEGATIVE_MARK } : undefined}
      >
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-slate-400">{unit}</span>}
      </p>
      {strip && <div className="mt-4">{strip}</div>}
      {(delta || sub) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {up ? "▲" : "▼"} {delta.replace(/[+-]/, "")}
            </span>
          )}
          {sub && <span className="text-[11px] leading-snug text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/** White panel used for every chart / table block. */
function Panel({
  title,
  hint,
  accent,
  className = "",
  children,
}: {
  title?: string;
  hint?: string;
  accent?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`pdf-block rounded-xl border border-slate-200 bg-white p-6 ${className}`}
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      {title && (
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-700">{title}</h3>
      )}
      {hint && <p className="mb-5 mt-1 text-[11px] text-slate-400">{hint}</p>}
      {!hint && title && <div className="mb-5" />}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

type NavSection = { id: string; label: string };

/** Highlights whichever section the reader is currently in.
 *
 * Measured on scroll rather than with IntersectionObserver: sections here vary hugely in
 * height, and "the last heading I scrolled past" is the behaviour a reader expects, which
 * observer ratios do not give you for a section taller than the viewport. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    if (ids.length === 0) return;
    const measure = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      // At the very bottom the last section may never cross the line; snap to it.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [ids]);

  return active;
}

/** Sticky section index — stays on screen for the whole document and tracks position. */
function TableOfContents({ sections, active }: { sections: NavSection[]; active: string }) {
  return (
    /* Pinned for the whole document: `sticky` with an explicit height, so the list itself
       scrolls internally if it ever outgrows the viewport rather than the reader scrolling
       past it. Requires that no ancestor sets `overflow: hidden` — that would silently turn
       this back into a normal element. */
    <aside className="no-print sticky top-[76px] hidden h-[calc(100vh-76px)] w-56 shrink-0 self-start overflow-y-auto py-8 xl:block">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Contents
      </p>
      <nav>
        <ul className="border-l border-slate-200">
          {sections.map((s) => {
            const on = s.id === active;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "true" : undefined}
                  className={`-ml-px block border-l-2 py-2 pl-4 pr-2 text-[13.5px] leading-snug transition ${
                    on
                      ? "border-[#C5A04F] font-semibold text-slate-900"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Charts                                                             */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, count }: { status: string; count: number }) {
  const cls =
    status === "success"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-600/10"
      : status === "empty"
        ? "bg-amber-50 text-amber-800 ring-amber-600/10"
        : "bg-red-50 text-red-800 ring-red-600/10";
  const text = status === "success" ? `${count} reviews` : status === "empty" ? "No reviews" : "Failed";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      {text}
    </span>
  );
}

/** Stacked positive / neutral / negative bar. */
function SentimentBar({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  return (
    <div className="flex h-2.5 w-full min-w-[90px] gap-[2px] overflow-hidden rounded-full bg-slate-100">
      <div style={{ width: `${pos}%`, background: POSITIVE_MARK }} />
      <div style={{ width: `${neu}%`, background: NEUTRAL_MARK }} />
      <div style={{ width: `${neg}%`, background: NEGATIVE_MARK }} />
    </div>
  );
}

/** Sentiment donut — the chart every social report is built around. */
function Donut({
  pos,
  neu,
  neg,
  size = 104,
  centerValue,
  centerLabel,
}: {
  pos: number;
  neu: number;
  neg: number;
  size?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const stroke = size >= 130 ? 14 : 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segments = [
    { value: pos, color: POSITIVE_MARK },
    { value: neu, color: NEUTRAL_MARK },
    { value: neg, color: NEGATIVE_MARK },
  ];
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const dash = (s.value / 100) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {/* The ring already carries the colour; the figure inside stays in ink so the card
          isn't reading red twice. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-bold leading-none tabular-nums text-slate-900 ${
            size >= 130 ? "text-[1.75rem]" : "text-lg"
          }`}
        >
          {centerValue ?? `${Math.round(neg)}%`}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {centerLabel ?? "negative"}
        </span>
      </div>
    </div>
  );
}

/** Reviews below this cannot support a percentage stated to one decimal. */
const MIN_RELIABLE_SAMPLE = 10;

function SmallSampleNote({ n }: { n: number }) {
  return (
    <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-700">
      Only {n} comment{n === 1 ? "" : "s"} — indicative, not statistically reliable.
    </p>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      {label}
      {value && <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-800">{value}</span>}
    </span>
  );
}

/** Volume of reviews per channel — colours here seed every other channel-coded chart. */
function ChannelVolumeChart({
  rows,
  colors,
}: {
  rows: PlatformSentiment[];
  colors: Record<string, string>;
}) {
  const max = Math.max(...rows.map((r) => r.review_count), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.platform} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-600">
            {r.platform}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{
                width: `${(r.review_count / max) * 100}%`,
                background: colors[r.platform] ?? "#64748b",
              }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700">
            {r.review_count}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Complaint volume, each bar split by the channel it was found on.
 *
 * This is the "where does each category surface" question answered graphically rather than
 * as a footnote: bar length is volume, the segments are the channel mix. */
function ComplaintChart({
  items,
  colors,
}: {
  items: ThemeFrequency[];
  colors: Record<string, string>;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const entries = Object.entries(item.by_platform ?? {});
        const total = entries.reduce((s, [, n]) => s + n, 0) || item.count || 1;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-semibold text-slate-800">{item.label}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
                <span className="font-bold text-slate-800">{item.count}</span> · {item.share_pct}%
              </span>
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded bg-slate-100">
              {/* 2px surface gaps keep adjacent segments legible when two channel hues sit
                  side by side, including for a colourblind reader. */}
              <div className="flex h-full gap-[2px]" style={{ width: `${(item.count / max) * 100}%` }}>
                {entries.length > 0 ? (
                  entries.map(([platform, n]) => (
                    <div
                      key={platform}
                      title={`${platform}: ${n}`}
                      style={{ width: `${(n / total) * 100}%`, background: colors[platform] ?? "#64748b" }}
                    />
                  ))
                ) : (
                  <div className="w-full bg-slate-400" />
                )}
              </div>
            </div>
            {entries.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                {entries.map(([platform, n]) => (
                  <span key={platform} className="tabular-nums">
                    {platform} {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Topic volume with how negative each topic runs — the discussion agenda, not the problems. */
function TopicChart({ items }: { items: ThemeFrequency[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-semibold text-slate-800">{item.label}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
              <span className="font-bold text-slate-800">{item.count}</span> · {item.share_pct}%
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-100">
              {/* Split by sentiment: the negative part of the bar is the part that matters. */}
              <div className="flex h-full gap-[2px]" style={{ width: `${(item.count / max) * 100}%` }}>
                <div style={{ width: `${item.negative_pct}%`, background: NEGATIVE_MARK }} />
                <div style={{ width: `${100 - item.negative_pct}%`, background: NEUTRAL_MARK }} />
              </div>
            </div>
            <span
              className={`w-[4.5rem] shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                item.negative_pct >= 60
                  ? "text-rose-600"
                  : item.negative_pct >= 30
                    ? "text-amber-600"
                    : "text-emerald-600"
              }`}
            >
              {item.negative_pct}% neg.
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Which complaint categories are gaining or losing share of the conversation.
 *
 * A dumbbell per category: the earlier share and the recent share joined by a bar whose
 * colour is the direction of travel. This is the one section that says whether a problem is
 * growing, not just how big it is now — so rising problems (rose) are what the eye should
 * catch first, and the list is already ordered by size of movement. */
function MomentumChart({ momentum }: { momentum: TopicMomentum }) {
  // Diverging by direction: easing extends left (green), rising extends right (red). Direction
  // is encoded by position + icon + text as well as colour, so it never rests on colour alone.
  const maxDelta = Math.max(1, ...momentum.items.map((i) => Math.abs(i.delta)));
  const GRID = "grid grid-cols-[minmax(10rem,1.2fr)_1.6fr_auto] items-center gap-4";
  const color = (d: string) => (d === "rising" ? NEGATIVE_MARK : d === "falling" ? POSITIVE_MARK : "#94a3b8");
  const word = (d: string) => (d === "rising" ? "rising" : d === "falling" ? "easing" : "steady");
  const icon = (d: string) => (d === "rising" ? "▲" : d === "falling" ? "▼" : "→");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">{momentum.earlier_label}</span>
        <span className="tabular-nums text-slate-400">(n={momentum.earlier_total})</span>
        <span className="mx-1 text-slate-300">→</span>
        <span className="font-medium text-slate-600">{momentum.recent_label}</span>
        <span className="tabular-nums text-slate-400">(n={momentum.recent_total})</span>
      </div>

      <div className="space-y-3">
        {momentum.items.map((it) => {
          const c = color(it.direction);
          const w = (Math.abs(it.delta) / maxDelta) * 46; // % of the plot's half-width
          const rising = it.direction === "rising";
          const steady = it.direction !== "rising" && it.direction !== "falling";
          return (
            <div key={it.label} className={GRID}>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-slate-800" title={it.label}>{it.label}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                  {it.earlier_share}% <span className="text-slate-300">→</span>{" "}
                  <span className="font-semibold text-slate-600">{it.recent_share}%</span>
                </div>
              </div>

              <div
                className="relative h-5"
                title={`${it.earlier_share}% → ${it.recent_share}% (${it.delta > 0 ? "+" : ""}${it.delta} pts)`}
              >
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200" />
                {!steady && (
                  <>
                    <div
                      className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
                      style={rising ? { left: "50%", width: `${w}%`, background: c } : { right: "50%", width: `${w}%`, background: c }}
                    />
                    <span
                      className="absolute top-1/2 h-2.5 w-2.5 rounded-full border-2 border-white"
                      style={{ left: `calc(50% ${rising ? "+" : "-"} ${w}%)`, transform: "translate(-50%,-50%)", background: c }}
                    />
                  </>
                )}
              </div>

              <span className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold tabular-nums" style={{ color: c }}>
                {icon(it.direction)} {Math.abs(it.delta)} pts
                <span className="font-normal text-slate-400">{word(it.direction)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className={`mt-2 ${GRID}`}>
        <div />
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide">
          <span style={{ color: POSITIVE_MARK }}>← easing</span>
          <span style={{ color: NEGATIVE_MARK }}>rising →</span>
        </div>
        <div />
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
        Share of all analysed feedback in each half of the collected history (two equal-sized samples).{" "}
        <span style={{ color: NEGATIVE_MARK }} className="font-semibold">Rising</span> categories grow as a
        proportion of what customers raise; <span style={{ color: POSITIVE_MARK }} className="font-semibold">easing</span>{" "}
        ones shrink.
      </p>
    </div>
  );
}

/** Sentiment or rating over time.
 *
 * One measure, one axis — never both at once, which would need two scales and make the
 * crossing point meaningless. Periods whose sample was too small arrive as nulls and are
 * drawn as a break in the line with a hollow marker, so a quiet quarter reads as "not
 * measured" rather than as a value. Sample size is printed under every period, because the
 * whole reason this chart is conditional is that samples here are small. */
function TrendChart({ trend }: { trend: TrendSeries }) {
  const useSentiment = trend.has_sentiment;
  const values = trend.points.map((p) => (useSentiment ? p.negative_pct : p.avg_rating) ?? null);
  const measured = values.filter((v): v is number => v != null);
  if (measured.length < 2) return null;

  const max = useSentiment ? Math.max(100, ...measured) : 5;
  const min = 0;
  const width = 100; // viewBox units; the SVG scales to its container
  const height = 42;
  const stepX = trend.points.length > 1 ? width / (trend.points.length - 1) : width;
  const toXY = (v: number, i: number) => ({
    x: i * stepX,
    y: height - ((v - min) / (max - min)) * height,
  });

  /* One <polyline> per unbroken run, so a gap is a real gap rather than a straight line
     drawn through a period we never measured. */
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push(toXY(v, i));
  });
  if (run.length) runs.push(run);

  const first = measured[0];
  const last = measured[measured.length - 1];
  const delta = last - first;
  const worse = useSentiment ? delta > 0 : delta < 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-bold text-slate-800">
          {useSentiment ? "Negative sentiment" : "Average rating"}
        </span>
        {Math.abs(delta) >= (useSentiment ? 1 : 0.05) && (
          <span
            className="text-[12px] font-semibold tabular-nums"
            style={{ color: worse ? NEGATIVE_MARK : POSITIVE_MARK }}
          >
            {worse ? "▲" : "▼"} {Math.abs(delta).toFixed(useSentiment ? 1 : 2)}
            {useSentiment ? " pts" : ""} since {trend.points[values.findIndex((v) => v != null)]?.label}
          </span>
        )}
      </div>

      <svg
        viewBox={`-2 -4 ${width + 4} ${height + 8}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${useSentiment ? "Negative sentiment" : "Average rating"} by ${trend.granularity}`}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={height * f}
            y2={height * f}
            stroke="#e2e8f0"
            strokeWidth={0.3}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {runs.map((points, i) => (
          <polyline
            key={i}
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={useSentiment ? NEGATIVE_MARK : "#2a78d6"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {values.map((v, i) =>
          v == null ? null : (
            <circle
              key={i}
              cx={toXY(v, i).x}
              cy={toXY(v, i).y}
              r={3}
              fill="#fff"
              stroke={useSentiment ? NEGATIVE_MARK : "#2a78d6"}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>

      <div className="mt-1 flex">
        {trend.points.map((p, i) => (
          <div key={p.period} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[10px] font-semibold text-slate-600">{p.label}</p>
            <p className="truncate text-[10px] tabular-nums text-slate-800">
              {values[i] != null
                ? useSentiment
                  ? `${values[i]}%`
                  : `${values[i]}`
                : <span className="text-slate-300">—</span>}
            </p>
            <p className="truncate text-[9px] tabular-nums text-slate-400">
              n={useSentiment ? p.classified_count : p.reviews}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rating-vs-comment agreement. Reassurance when they align, a flag when they don't. */
function RatingSentimentNote({ check }: { check: RatingSentimentCheck }) {
  const flagged = check.mismatch_pct >= 15;
  const parts: string[] = [];
  if (check.high_rating_negative > 0) {
    parts.push(`${check.high_rating_negative} rated 4–5★ but read negative`);
  }
  if (check.low_rating_positive > 0) {
    parts.push(`${check.low_rating_positive} rated 1–2★ but read positive`);
  }
  return (
    <div
      className={`pdf-block flex items-start gap-2.5 rounded-xl border px-4 py-3 ${
        flagged ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <ShieldCheck
        className={`mt-0.5 h-4 w-4 shrink-0 ${flagged ? "text-amber-600" : "text-slate-400"}`}
      />
      <p className="text-[12px] leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-800">
          Stars and comments agree {(100 - check.mismatch_pct).toFixed(0)}% of the time
        </span>{" "}
        across the {check.both_count} reviews carrying both.
        {parts.length > 0 && (
          <>
            {" "}
            {flagged
              ? "That gap is wide enough to watch — "
              : "The few that diverge: "}
            {parts.join(", ")}
            {flagged ? ", which can signal rating inflation or review-gaming." : "."}
          </>
        )}
      </p>
    </div>
  );
}

function RatingHistogram({ dist }: { dist: RatingDistribution }) {
  const rows: Array<[number, number]> = [
    [5, dist.five],
    [4, dist.four],
    [3, dist.three],
    [2, dist.two],
    [1, dist.one],
  ];
  const max = Math.max(...rows.map(([, n]) => n), 1);
  return (
    <div className="space-y-2">
      {rows.map(([star, n]) => (
        <div key={star} className="flex items-center gap-2.5">
          <span className="w-7 shrink-0 text-[12px] font-semibold tabular-nums text-slate-500">{star}★</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{
                width: `${(n / max) * 100}%`,
                background: star >= 4 ? POSITIVE_MARK : star === 3 ? "#94a3b8" : NEGATIVE_MARK,
              }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-slate-500">{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Rich per-channel card. Used instead of a table when there are few channels, where a
    one-row table reads as broken rather than informative. */
function ChannelSentimentCard({ row, accent }: { row: PlatformSentiment; accent?: string }) {
  return (
    <div
      className="pdf-block rounded-xl border border-slate-200 bg-white p-5"
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[15px] font-bold text-slate-900">{row.platform}</h4>
          {row.summary_stat && <p className="mt-0.5 text-[11px] text-slate-500">{row.summary_stat}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
          {row.classified_count} analysed
        </span>
      </div>

      <div className="flex items-center gap-5">
        <Donut pos={row.positive_pct} neu={row.neutral_pct} neg={row.negative_pct} />
        <dl className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[12px] text-slate-500">Positive</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-emerald-600">{row.positive_pct}%</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[12px] text-slate-500">Neutral</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-slate-500">{row.neutral_pct}%</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5">
            <dt className="text-[12px] text-slate-500">Negative</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-rose-600">{row.negative_pct}%</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[12px] text-slate-500">Avg rating</dt>
            <dd className="text-[13px] font-bold tabular-nums text-slate-800">
              {row.avg_rating != null ? `${row.avg_rating.toFixed(1)}/5` : "—"}
            </dd>
          </div>
          {row.reply_rate_pct != null && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[12px] text-slate-500">Brand replies</dt>
              <dd
                className={`text-[13px] font-bold tabular-nums ${
                  row.reply_rate_pct < 10 ? "text-rose-600" : "text-slate-800"
                }`}
              >
                {row.reply_rate_pct}%
              </dd>
            </div>
          )}
        </dl>
      </div>

      {row.classified_count < MIN_RELIABLE_SAMPLE && <SmallSampleNote n={row.classified_count} />}
    </div>
  );
}

function ScrapedChannelTable({ rows }: { rows: PlatformSentiment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="pb-2 pr-4 font-semibold">Channel</th>
            <th className="w-24 pb-2 pr-4 text-right font-semibold">Analysed</th>
            <th className="w-20 pb-2 pr-6 text-right font-semibold">Avg</th>
            <th className="w-[38%] pb-2 font-semibold">Sentiment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.platform} className="border-b border-slate-50 last:border-0">
              <td className="py-2.5 pr-4">
                <span className="text-[13px] font-semibold text-slate-800">{row.platform}</span>
                {row.summary_stat && <div className="text-[11px] text-slate-400">{row.summary_stat}</div>}
              </td>
              <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-slate-600">
                {row.classified_count}
              </td>
              <td className="py-3 pr-6 text-right text-[13px] font-semibold tabular-nums text-slate-700">
                {row.avg_rating != null ? row.avg_rating.toFixed(1) : "—"}
              </td>
              <td className="py-2.5">
                <SentimentBar pos={row.positive_pct} neu={row.neutral_pct} neg={row.negative_pct} />
                <div className="mt-1 text-[11px] tabular-nums text-slate-400">
                  {row.positive_pct}% pos ·{" "}
                  <span className="font-semibold text-rose-600">{row.negative_pct}% neg</span>
                  {row.classified_count < MIN_RELIABLE_SAMPLE && (
                    <span className="ml-1.5 text-amber-600">· small sample</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The provenance line under a quote. When the original review is linkable it becomes the
    link, so a client can open the source rather than take the quote on trust. */
function VerbatimMeta({ v }: { v: ThemeVerbatim }) {
  const meta = (
    <>
      {v.platform}
      {v.rating != null && ` · ${v.rating}/5`}
      {v.date && ` · ${new Date(v.date).toLocaleDateString()}`}
    </>
  );
  if (!v.url) return <p className="mt-1 text-[11px] text-slate-400">{meta}</p>;
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-[#8a6d2f] hover:underline"
    >
      {meta}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function VerbatimGroups({ verbatims }: { verbatims: ThemeVerbatim[] }) {
  const groups = new Map<string, ThemeVerbatim[]>();
  for (const v of verbatims) {
    const bucket = groups.get(v.label);
    if (bucket) bucket.push(v);
    else groups.set(v.label, [v]);
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from(groups.entries()).map(([label, items]) => (
        <div key={label} className="pdf-block">
          <h4 className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-700">{label}</h4>
          <div className="space-y-2">
            {items.map((v, i) => (
              <blockquote
                key={i}
                className={`rounded-lg border-l-2 bg-slate-50/70 py-2 pl-3 pr-3 ${
                  v.sentiment === "negative"
                    ? "border-rose-300"
                    : v.sentiment === "positive"
                      ? "border-emerald-300"
                      : "border-slate-300"
                }`}
              >
                <p className="text-[13px] italic leading-relaxed text-slate-600">"{v.text}"</p>
                <VerbatimMeta v={v} />
              </blockquote>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Interactive per-channel sentiment & feedbacks component.
 * Allows viewing each channel's sentiment stats, AI summary, strengths, friction points,
 * and direct customer feedbacks via dedicated channel tabs. */
function ChannelSentimentTabbedView({
  rows,
  colors,
  verbatims = [],
  scrapedPlatforms = [],
  channelBreakdown = [],
}: {
  rows: PlatformSentiment[];
  colors: Record<string, string>;
  verbatims?: ThemeVerbatim[];
  scrapedPlatforms?: PlatformResult[];
  channelBreakdown?: ChannelReportSection[];
}) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "negative" | "neutral" | "positive">("all");

  const activeRow = useMemo(
    () => (activeTab === "all" ? null : rows.find((r) => r.platform === activeTab)),
    [activeTab, rows]
  );

  const activeBreakdown = useMemo(
    () =>
      activeTab === "all"
        ? null
        : channelBreakdown.find((b) => b.channel.toLowerCase() === activeTab.toLowerCase()),
    [activeTab, channelBreakdown]
  );

  const channelFeedbacks = useMemo(() => {
    let items: {
      text: string;
      sentiment: "positive" | "neutral" | "negative";
      rating?: number | null;
      date?: string | null;
      platform: string;
      label?: string;
      url?: string | null;
      author?: string | null;
    }[] = [];

    if (activeTab === "all") {
      items = verbatims.map((v) => ({
        text: v.text,
        sentiment: (v.sentiment as "positive" | "neutral" | "negative") || "neutral",
        rating: v.rating,
        date: v.date,
        platform: v.platform,
        label: v.label,
        url: v.url,
      }));
    } else {
      const verbMatches = verbatims.filter(
        (v) => v.platform.toLowerCase() === activeTab.toLowerCase()
      );
      items = verbMatches.map((v) => ({
        text: v.text,
        sentiment: (v.sentiment as "positive" | "neutral" | "negative") || "neutral",
        rating: v.rating,
        date: v.date,
        platform: v.platform,
        label: v.label,
        url: v.url,
      }));

      const pResult = scrapedPlatforms.find(
        (p) => p.platform.toLowerCase() === activeTab.toLowerCase()
      );
      if (pResult?.reviews) {
        for (const r of pResult.reviews) {
          if (!r.text || r.text.trim().length < 10) continue;
          if (items.some((existing) => existing.text.slice(0, 40) === r.text.slice(0, 40))) continue;

          let sent: "positive" | "neutral" | "negative" = "neutral";
          if (r.classification?.sentiment) {
            sent = r.classification.sentiment;
          } else if (r.rating != null) {
            if (r.rating <= 2) sent = "negative";
            else if (r.rating >= 4) sent = "positive";
          }

          items.push({
            text: r.text,
            sentiment: sent,
            rating: r.rating,
            date: r.date,
            platform: r.platform,
            author: r.author,
            url: r.url,
            label: r.classification?.complaint_category || r.classification?.themes?.[0],
          });
        }
      }
    }

    if (sentimentFilter !== "all") {
      items = items.filter((i) => i.sentiment === sentimentFilter);
    }

    return items;
  }, [activeTab, verbatims, scrapedPlatforms, sentimentFilter]);

  return (
    <div className="space-y-6">
      {/* ── Channel Tab Selector ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => {
            setActiveTab("all");
            setSentimentFilter("all");
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "all"
              ? "bg-[#111827] text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>All Channels</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold">
            {rows.length}
          </span>
        </button>

        {rows.map((row) => {
          const isActive = activeTab === row.platform;
          const hue = colors[row.platform] ?? "#64748b";
          return (
            <button
              key={row.platform}
              onClick={() => {
                setActiveTab(row.platform);
                setSentimentFilter("all");
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                isActive
                  ? "bg-[#111827] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hue }} />
              <span>{row.platform}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {row.classified_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content: All Channels Overview ── */}
      {activeTab === "all" && (
        <div className="space-y-6">
          {rows.length <= 3 ? (
            <div className={`grid gap-4 ${rows.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {rows.map((row) => (
                <ChannelSentimentCard key={row.platform} row={row} accent={colors[row.platform]} />
              ))}
            </div>
          ) : (
            <Panel>
              <ScrapedChannelTable rows={rows} />
            </Panel>
          )}

          {verbatims.length > 0 && (
            <Panel
              title="Consolidated Customer Feedbacks Across Channels"
              hint="Top extracts supporting sentiment breakdown"
            >
              <VerbatimGroups verbatims={verbatims} />
            </Panel>
          )}
        </div>
      )}

      {/* ── Tab Content: Specific Channel View ── */}
      {activeTab !== "all" && activeRow && (
        <div className="space-y-6">
          {/* Header Card / Scorecard for the specific channel */}
          <div
            className="pdf-block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            style={{ borderTop: `4px solid ${colors[activeRow.platform] ?? "#2a78d6"}` }}
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: colors[activeRow.platform] ?? "#2a78d6" }}
                  />
                  <h3 className="text-xl font-bold text-slate-900">{activeRow.platform}</h3>
                </div>
                {activeRow.summary_stat && (
                  <p className="mt-1 text-xs text-slate-500">{activeRow.summary_stat}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeRow.classified_count} Analysed Reviews
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeRow.review_count} Total Collected
                </span>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {/* Donut Chart */}
              <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                <Donut
                  pos={activeRow.positive_pct}
                  neu={activeRow.neutral_pct}
                  neg={activeRow.negative_pct}
                />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Sentiment Split
                  </p>
                  <p className="text-xs font-semibold text-emerald-600">
                    {activeRow.positive_pct}% Pos
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {activeRow.neutral_pct}% Neu
                  </p>
                  <p className="text-xs font-semibold text-rose-600">
                    {activeRow.negative_pct}% Neg
                  </p>
                </div>
              </div>

              {/* Avg Rating */}
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Avg Score / Rating
                </p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {activeRow.avg_rating != null ? activeRow.avg_rating.toFixed(1) : "—"}
                  </span>
                  <span className="text-xs text-slate-400">/ 5</span>
                </div>
                <div className="mt-1.5 flex items-center text-amber-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-3.5 w-3.5 ${
                        (activeRow.avg_rating ?? 0) >= star
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Brand Reply Rate */}
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Brand Reply Rate
                </p>
                <p
                  className={`mt-1 text-2xl font-extrabold ${
                    activeRow.reply_rate_pct != null && activeRow.reply_rate_pct < 10
                      ? "text-rose-600"
                      : "text-slate-900"
                  }`}
                >
                  {activeRow.reply_rate_pct != null ? `${activeRow.reply_rate_pct}%` : "N/A"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Public responses to feedback</p>
              </div>

              {/* Negative Share */}
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Negative Share
                </p>
                <p
                  className="mt-1 text-2xl font-extrabold tabular-nums"
                  style={{ color: NEGATIVE_MARK }}
                >
                  {activeRow.negative_pct}%
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Critical complaints ratio</p>
              </div>
            </div>
          </div>

          {/* AI Channel Breakdown (Summary, Strengths, Friction Points) */}
          {activeBreakdown && (
            <Panel
              title={`${activeRow.platform} AI Analysis & Diagnostic`}
              hint="Extracted channel summary and observations"
            >
              <div className="space-y-4">
                {activeBreakdown.summary && (
                  <p className="text-sm leading-relaxed text-slate-700">
                    {activeBreakdown.summary}
                  </p>
                )}

                {activeBreakdown.strengths && activeBreakdown.strengths.length > 0 && (
                  <div>
                    <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Channel Strengths
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {activeBreakdown.strengths.map((str: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200/60"
                        >
                          <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                          {str}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeBreakdown.friction_points && activeBreakdown.friction_points.length > 0 && (
                  <div>
                    <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-700">
                      Channel Friction Points
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {activeBreakdown.friction_points.map((fric: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 border border-rose-200/60"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                          {fric}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Feedbacks / Reviews list for this channel */}
          <Panel
            title={`Customer Feedbacks for ${activeRow.platform}`}
            hint={`${channelFeedbacks.length} items matching active filters`}
          >
            <div className="space-y-4">
              {/* Sentiment Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                <span className="mr-2 text-xs font-semibold text-slate-500">Filter Sentiment:</span>
                {(["all", "negative", "neutral", "positive"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setSentimentFilter(st)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition ${
                      sentimentFilter === st
                        ? st === "negative"
                          ? "bg-rose-600 text-white"
                          : st === "positive"
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {channelFeedbacks.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  No feedback items found for this sentiment filter.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {channelFeedbacks.map((fb, idx) => (
                    <blockquote
                      key={idx}
                      className={`pdf-block flex flex-col justify-between rounded-xl border-l-4 bg-slate-50/70 p-4 transition hover:bg-slate-100/80 ${
                        fb.sentiment === "negative"
                          ? "border-rose-500"
                          : fb.sentiment === "positive"
                            ? "border-emerald-500"
                            : "border-slate-400"
                      }`}
                    >
                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          {fb.label && (
                            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
                              {fb.label}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {fb.rating != null && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200/60">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {fb.rating}/5
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                fb.sentiment === "negative"
                                  ? "bg-rose-100 text-rose-800"
                                  : fb.sentiment === "positive"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {fb.sentiment}
                            </span>
                          </div>
                        </div>

                        <p className="text-[13px] italic leading-relaxed text-slate-700">
                          "{fb.text}"
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-400">
                        <span>
                          {fb.author || fb.platform}
                          {fb.date && ` · ${new Date(fb.date).toLocaleDateString()}`}
                        </span>
                        {fb.url && (
                          <a
                            href={fb.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#8a6d2f] hover:underline"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Owned-channel visuals (from the consultant's workbook)             */
/* ------------------------------------------------------------------ */

function OwnedChannelTable({ channels }: { channels: ChannelAnalysis[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="pb-2.5 pr-4 font-semibold">Channel</th>
            <th className="pb-2.5 pr-4 text-right font-semibold">Audience</th>
            <th className="pb-2.5 pr-4 text-right font-semibold">Growth</th>
            <th className="pb-2.5 pr-6 text-right font-semibold">Engagement</th>
            <th className="pb-2.5 pr-6 font-semibold">Response time</th>
            <th className="pb-2.5 font-semibold">Complaints handling</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => {
            const audience = parseCount(c.followers_growth);
            const delta = parseDelta(c.followers_growth);
            const up = delta?.startsWith("+");
            return (
              <tr key={c.channel} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 pr-4">
                  <span className="text-[13px] font-semibold text-slate-800">{c.channel}</span>
                  {c.account_handle && (
                    <span className="ml-2 text-[11px] text-slate-400">{c.account_handle}</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right text-[15px] font-bold tabular-nums text-slate-800">
                  {compact(audience)}
                </td>
                <td className="py-2.5 pr-4 text-right">
                  {delta ? (
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {up ? "▲" : "▼"} {delta.replace(/[+-]/, "")}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 pr-6 text-right text-[13px] font-semibold tabular-nums text-slate-700">
                  {c.engagement_rate ?? "—"}
                </td>
                <td className="py-3 pr-6 text-[13px] text-slate-600">{c.response_time_to_comments ?? "—"}</td>
                <td className="py-3 text-[13px] text-slate-600">{c.complaints_handling ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopPostsTable({ channels }: { channels: ChannelAnalysis[] }) {
  const posts = channels
    .flatMap((c) => c.posts.map((p) => ({ channel: c.channel, post: p })))
    .filter((x) => postTotal(x.post) > 0)
    .sort((a, b) => postTotal(b.post) - postTotal(a.post))
    .slice(0, 5);

  if (posts.length === 0) return null;
  const max = Math.max(...posts.map((p) => postTotal(p.post)), 1);

  /* A ranked bar list rather than a plain table: with five rows the relative size of the
     best post is the point, and a column of numbers hides it. */
  return (
    <div className="space-y-3">
      {posts.map(({ channel, post }, i) => {
        const total = postTotal(post);
        return (
          <div key={i} className="pdf-block">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] font-medium text-slate-800">
                {post.post || "Untitled"}
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  {channel}
                  {post.date && ` · ${post.date.slice(0, 10)}`}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-800">
                {total.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded bg-slate-700" style={{ width: `${(total / max) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-slate-400">
              {post.likes ?? 0} likes · {post.comments ?? 0} comments · {post.shares ?? 0} shares
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Report page                                                        */
/* ------------------------------------------------------------------ */
type Props = {
  result: ScrapingResponse;
  onBack: () => void;
  onExportExcel: () => void;
  onReuseInputs?: () => void;
};

export default function SocialReportView({ result, onBack, onExportExcel, onReuseInputs }: Props) {
  const report = result.detailed_report;
  const evidence = report?.evidence ?? null;
  const manual = result.manual_analysis ?? null;

  // Report chatbot: answers from this report's computed findings, persisted per report.
  const [chatMessages, setChatMessages] = useState<ModuleChatMessage[]>([]);
  const appendChatMessage = (m: ModuleChatMessage) => setChatMessages((prev) => [...prev, m]);
  const canChat = Boolean(result.report_filename && report);

  // Load the persisted conversation when a report opens (and switch cleanly between reports).
  useEffect(() => {
    const stored = result.chat_messages;
    setChatMessages(
      Array.isArray(stored) && stored.length
        ? stored.map((m) => ({
            id: m.id ?? `${Math.random()}`,
            role: m.role === "assistant" ? "assistant" : "user",
            text: m.text ?? "",
            sources: m.sources,
            ts: m.ts ?? Date.now(),
          }))
        : [],
    );
  }, [result.report_filename, result.chat_messages]);
  /* Memoised because the `?? []` fallback would otherwise mint a new array on every render,
     re-running the section memo and re-subscribing the scroll listener each time. */
  const channels = useMemo(() => manual?.channels ?? [], [manual]);
  const website = manual?.website ?? null;

  // KPI inputs
  /* Both states mean the source contributed nothing to the analysis, and the reader needs
     to know either way: an empty Google Maps that silently drops a national brand to 14
     reviews is as misleading as one that errored. */
  const failedSources = result.platforms.filter(
    (p) => p.status === "error" || p.status === "empty",
  );
  const coveredSources = [
    ...result.platforms.filter((p) => p.status === "success").map((p) => p.platform),
    ...channels.map((c) => c.channel),
    ...(website ? ["Website"] : []),
  ].filter((name, i, all) => all.indexOf(name) === i);
  const audience = channels.reduce((sum, c) => sum + (parseCount(c.followers_growth) ?? 0), 0);
  /* Growth of the largest channel stands in for overall audience momentum: the workbook
     records growth per channel, never a consolidated figure, and averaging percentages
     across channels of wildly different sizes would be misleading. */
  const biggestChannel = channels
    .slice()
    .sort((a, b) => (parseCount(b.followers_growth) ?? 0) - (parseCount(a.followers_growth) ?? 0))[0];
  const topChannelDelta = parseDelta(biggestChannel?.followers_growth);
  const visits = parseCount(website?.traffic?.total_visits);
  const sentiment = report?.overall_sentiment ?? null;
  const ratings = evidence?.rating_distribution ?? null;
  const metricPanelCount =
    (sentiment ? 1 : 0) + (ratings ? 1 : 0) + ((evidence?.platform_sentiment?.length ?? 0) > 1 ? 1 : 0);
  const platformRows = useMemo(() => evidence?.platform_sentiment ?? [], [evidence]);

  /* One hue per channel, reused by the volume chart, the complaint split and the channel
     cards, so a colour in one chart is legible from the legend in another. */
  const channelColors = useMemo(
    () => buildChannelColors(platformRows.map((p) => p.platform)),
    [platformRows],
  );

  /* Verbatims indexed by the label they were collected under, so a friction point can show
     its own proof instead of sending the reader to a section three pages away. */
  const verbatimsByLabel = useMemo(() => {
    const map = new Map<string, ThemeVerbatim[]>();
    for (const v of evidence?.verbatims ?? []) {
      const bucket = map.get(v.label);
      if (bucket) bucket.push(v);
      else map.set(v.label, [v]);
    }
    return map;
  }, [evidence]);

  /* Order follows how the report is read, not how the data was gathered: the numbers, then
     the problems, then what to do about them, and only then the supporting detail. A section
     that has no data drops out of both the page and the index. */
  const visibleSections = useMemo<NavSection[]>(() => {
    const defs: { id: string; label: string; show: boolean }[] = [
      { id: "summary", label: "Executive summary", show: !!report },
      { id: "metrics", label: "Key metrics", show: !!report },
      { id: "friction", label: "Friction points", show: !!report },
      { id: "strengths", label: "What's working", show: !!report && report.top_strengths.length > 0 },
      {
        id: "recommendations",
        label: "Recommendations",
        show: !!report && report.recommendations.length > 0,
      },
      {
        id: "topics",
        label: "Complaint categories",
        show:
          !!report &&
          !!evidence &&
          (evidence.top_complaints.length > 0 || evidence.top_themes.length > 0),
      },
      {
        id: "momentum",
        label: "What's rising & falling",
        // Present only when each half of the history carries a real sample.
        show: !!report && !!evidence?.momentum && evidence.momentum.items.length > 0,
      },
      {
        id: "trend",
        label: "Trend over time",
        // Present only when the collection was dense enough per period to plot honestly.
        show: !!report && !!evidence?.trend,
      },
      {
        id: "sentiment",
        label: "Sentiment by channel",
        show: !!report && platformRows.length > 0,
      },
      { id: "channels", label: "Owned channels", show: !!report && channels.length > 0 },
      {
        id: "posts",
        label: "Top performing posts",
        show: !!report && channels.some((c) => c.posts.length > 0),
      },
      {
        id: "website",
        label: "Website performance",
        show: !!report && !!(website || report.website_assessment),
      },
      {
        id: "verbatims",
        label: "Voice of the customer",
        show: !!report && !!evidence && evidence.verbatims.length > 0,
      },
      { id: "sources", label: "Sources & methodology", show: true },
    ];
    return defs.filter((s) => s.show).map((s) => ({ id: s.id, label: s.label }));
  }, [report, evidence, channels, website, platformRows]);

  const sectionIds = useMemo(() => visibleSections.map((s) => s.id), [visibleSections]);
  const activeSection = useActiveSection(sectionIds);
  const shows = (id: string) => visibleSections.some((s) => s.id === id);
  const hasDetail = ["topics", "sentiment", "channels", "posts", "website", "verbatims"].some(shows);

  return (
    /* No `overflow-hidden` here: it makes this element a scroll container, which silently
       kills the sticky index in the left margin. The decorative wash is clipped by its own
       fixed wrapper instead. */
    <div className="relative min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_40%,#f7f9fb_72%,#ffffff_100%)] text-slate-800">
      <style>{`
        @media print {
          @page { size: A4; margin: 13mm 11mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #report-print-area, #report-print-area * { visibility: visible !important; }
          #report-print-area {
            position: absolute !important; left: 0; top: 0;
            width: 100% !important; max-width: none !important;
            margin: 0 !important; padding: 0 !important;
          }
          #report-print-area .no-print { display: none !important; }
          #report-print-area * { box-shadow: none !important; backdrop-filter: none !important; }
          /* Keep cards and quotes whole; never a whole section, which forces blank pages
             when the section is taller than one page. */
          #report-print-area .pdf-block,
          #report-print-area blockquote,
          #report-print-area li { break-inside: avoid; page-break-inside: avoid; }
          #report-print-area h1, #report-print-area h2,
          #report-print-area h3, #report-print-area h4 { break-after: avoid; page-break-after: avoid; }
          #report-print-area .page-break { break-before: page; page-break-before: always; }
          /* Tailwind's lg/xl breakpoints never fire on an A4 page (~794px), so the KPI row
             and the chart row would print stacked one per line and run to four pages. Pin
             the column counts the layout was designed around. */
          #report-print-area .print-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          #report-print-area .print-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          /* Wide tables must reflow to the page instead of being clipped by the scroller. */
          #report-print-area .overflow-x-auto { overflow: visible !important; }
          #report-print-area table { min-width: 0 !important; width: 100% !important; font-size: 9.5pt; }
          #report-print-area thead { display: table-header-group; }
          #report-print-area tr { break-inside: avoid; page-break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute right-[-10%] top-[-4%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(197,160,79,0.10),rgba(255,255,255,0))] blur-3xl" />
      </div>

      {/* ── Top bar ── */}
      <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-slate-200/70 bg-white/85 px-6 py-4 backdrop-blur-lg">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          New analysis
        </button>
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}ey_logo.svg`} alt="EY" className="h-6 w-auto" />
          <span className="h-4 w-px bg-slate-200" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">{result.brand_name}</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Social &amp; Web CX Report
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {onReuseInputs && result.manual_analysis && (
            <button
              onClick={onReuseInputs}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#C5A04F]/50 hover:text-slate-900"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit inputs &amp; re-run
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <button
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2E2E38] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1a1a22]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
        </div>
      </header>

      {/* The index sits in the left margin and the document keeps the centre of the screen:
          a mirrored spacer on the right balances the sidebar so nothing is pushed off-centre. */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1560px] gap-8 px-6 py-10">
        <TableOfContents sections={visibleSections} active={activeSection} />
        <section id="report-print-area" className="mx-auto w-full min-w-0 max-w-[1000px] space-y-12">
          {/* ── Cover strip ── */}
          <div className="border-b-2 border-[#C5A04F] pb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C5A04F]">
              Customer Experience Analysis
            </p>
            <h1 className="mt-1.5 text-4xl font-bold tracking-tight text-slate-900">
              {result.brand_name}
            </h1>
            <p className="mt-2 text-[13px] text-slate-500">
              {manual?.reporting_period && (
                <>
                  <span className="font-semibold text-slate-700">{manual.reporting_period}</span>
                  {" · "}
                </>
              )}
              Generated {new Date(result.scraped_at).toLocaleDateString()}
            </p>
            {/* Which sources this report actually rests on, stated before any finding —
                the reader should never have to reach the methodology page to learn it. */}
            {coveredSources.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Sources
                </span>
                {coveredSources.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {!report && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              This saved report predates the current format and has no analysis section.
            </p>
          )}

          {/* A thin report should explain itself at the top rather than leave the reader
              wondering why a section looks empty. */}
          {failedSources.length > 0 && (
            <div className="pdf-block flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[12px] leading-relaxed text-amber-800">
                <span className="font-semibold">
                  {failedSources.map((p) => p.platform).join(" and ")} returned no data
                </span>{" "}
                for this run, so the findings below rest on the remaining sources
                {evidence ? ` (${evidence.reviews_collected} reviews)` : ""}. Re-running may
                recover them.
              </p>
            </div>
          )}

          {report && (
            <>
              {/* ── 01 · Executive summary ── */}
              <Section id="summary" title="Executive summary">
                <p className="pdf-block rounded-2xl border border-slate-200 bg-white p-6 text-[15px] leading-[1.75] text-slate-700">
                  {report.executive_summary}
                </p>
              </Section>

              {/* ── 02 · Key metrics: the numbers lead, exactly as an official report does ── */}
              <Section
                id="metrics"
                title="Key metrics"
                icon={<BarChart3 className="h-5 w-5 text-slate-500" />}
                subtitle="Measured, not inferred"
              >
                <div className="space-y-5">
                  {/* Ordered so the headline lands first: a reader who looks for five seconds
                      should leave with the sentiment split, not the sample size. Three across
                      rather than five, so each card has room to breathe. */}
                  <div className="print-cols-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Kpi
                      label="Negative sentiment"
                      icon={<Frown className="h-3.5 w-3.5" />}
                      value={sentiment ? `${sentiment.negative_pct}` : "—"}
                      unit={sentiment ? "%" : undefined}
                      sub={sentiment ? `${sentiment.positive_pct}% positive` : undefined}
                      tone={sentiment && sentiment.negative_pct >= 25 ? "bad" : "good"}
                      strip={
                        sentiment ? (
                          <SentimentBar
                            pos={sentiment.positive_pct}
                            neu={sentiment.neutral_pct}
                            neg={sentiment.negative_pct}
                          />
                        ) : undefined
                      }
                    />
                    <Kpi
                      label="Average rating"
                      icon={<Star className="h-3.5 w-3.5" />}
                      value={ratings?.average != null ? ratings.average.toFixed(2) : "—"}
                      unit={ratings?.average != null ? "/5" : undefined}
                      sub={ratings ? `${ratings.total} rated reviews` : undefined}
                      tone={ratings?.average != null && ratings.average < 3 ? "bad" : "neutral"}
                    />
                    <Kpi
                      label="Reviews analysed"
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                      value={(evidence?.reviews_collected ?? result.total_reviews).toLocaleString()}
                      sub={evidence ? `${evidence.reviews_classified} comments read in depth` : undefined}
                    />
                    {/* Only when a channel actually reports replies; the base is shown so a 0%
                        on a handful of Trustpilot reviews can't read as covering all of them. */}
                    {evidence?.reply_rate_pct != null && (
                      <Kpi
                        label="Reply rate"
                        icon={<Reply className="h-3.5 w-3.5" />}
                        value={`${evidence.reply_rate_pct}`}
                        unit="%"
                        sub={`brand replies · ${evidence.reply_rate_base} reviews checked`}
                        tone={evidence.reply_rate_pct < 20 ? "bad" : "good"}
                      />
                    )}
                    <Kpi
                      label="Social audience"
                      icon={<Users className="h-3.5 w-3.5" />}
                      value={audience > 0 ? compact(audience) : "—"}
                      delta={topChannelDelta}
                      sub={
                        audience > 0
                          ? `${channels.length} owned channel${channels.length === 1 ? "" : "s"}`
                          : "no workbook supplied"
                      }
                    />
                    <Kpi
                      label="Website visits"
                      icon={<Globe className="h-3.5 w-3.5" />}
                      value={compact(visits)}
                      sub={
                        website?.traffic?.bounce_rate
                          ? `bounce ${formatPercent(website.traffic.bounce_rate)}`
                          : undefined
                      }
                    />
                  </div>

                  {/* Between them these state the whole quantitative picture. The column count
                      follows how many actually render, so two panels fill the row instead of
                      leaving a gap where a third would have been. */}
                  <div
                    className={`grid gap-5 ${
                      metricPanelCount >= 3
                        ? "print-cols-3 lg:grid-cols-3"
                        : metricPanelCount === 2
                          ? "print-cols-2 lg:grid-cols-2"
                          : ""
                    }`}
                  >
                    {sentiment && (
                      <Panel title="Overall sentiment" hint={`${sentiment.classified_count} comments classified`}>
                        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 py-2">
                          <Donut
                            pos={sentiment.positive_pct}
                            neu={sentiment.neutral_pct}
                            neg={sentiment.negative_pct}
                            size={140}
                          />
                          <div className="flex w-32 flex-col gap-3">
                            <LegendDot color={POSITIVE_MARK} label="Positive" value={`${sentiment.positive_pct}%`} />
                            <LegendDot color={NEUTRAL_MARK} label="Neutral" value={`${sentiment.neutral_pct}%`} />
                            <LegendDot color={NEGATIVE_MARK} label="Negative" value={`${sentiment.negative_pct}%`} />
                          </div>
                        </div>
                      </Panel>
                    )}
                    {ratings && (
                      <Panel
                        title="Rating spread"
                        hint={`${ratings.total} rated reviews · average ${ratings.average?.toFixed(2) ?? "—"}/5`}
                      >
                        <RatingHistogram dist={ratings} />
                        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">
                          {ratings.one + ratings.two} at 1–2★ · {ratings.four + ratings.five} at 4–5★
                        </p>
                      </Panel>
                    )}
                    {/* Only worth a panel once there is a split to show. With a single
                        channel the bar says nothing the source chips on the cover didn't,
                        and it leaves a half-empty card. */}
                    {platformRows.length > 1 && (
                      <Panel title="Where the evidence comes from" hint="Reviews collected per channel">
                        <ChannelVolumeChart rows={platformRows} colors={channelColors} />
                        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-snug text-slate-500">
                          These colours identify each channel in the charts below.
                        </p>
                      </Panel>
                    )}
                  </div>

                  {/* Rating vs. comment agreement — a quiet data-quality note when the two
                      align, an amber flag when they diverge enough to suggest rating
                      inflation or gaming. Only shown when enough reviews carry both. */}
                  {evidence?.rating_sentiment && (
                    <RatingSentimentNote check={evidence.rating_sentiment} />
                  )}
                </div>
              </Section>

              {/* ── 03 · Friction points ── */}
              <Section
                id="friction"
                title="Friction points"
                icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
                subtitle="Ranked by volume of evidence"
              >
                {report.top_friction_points.length > 0 ? (
                  <div className="space-y-2.5">
                    {report.top_friction_points.map((f, i) => {
                      return (
                        <div
                          key={i}
                          className="pdf-block flex gap-4 rounded-xl border border-slate-200 border-l-4 border-l-rose-500 bg-white p-4"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[15px] font-bold text-white">
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[16px] font-bold text-slate-900">{f.theme}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                {sourceLabel(f.source)}
                              </span>
                              {f.mention_count != null && (
                                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums text-rose-700">
                                  {f.mention_count} {f.source === "consultant" ? "opinions" : "mentions"}
                                  {f.share_pct != null && ` · ${f.share_pct}%`}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{f.description}</p>
                            {/* Proof sits with the claim. A real review carries its channel,
                                rating and date, so it is preferred over the model's own
                                paraphrase whenever one exists for this category. */}
                            {(() => {
                              const quoted = f.related_label ? verbatimsByLabel.get(f.related_label) : undefined;
                              if (quoted && quoted.length > 0) {
                                return (
                                  <div className="mt-3 space-y-2 border-l-2 border-rose-100 pl-3">
                                    {quoted.slice(0, 2).map((v, j) => (
                                      <div key={j}>
                                        <p className="text-[12.5px] italic leading-relaxed text-slate-500">
                                          "{v.text}"
                                        </p>
                                        <VerbatimMeta v={v} />
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              // Keep only genuine quotes; the stat lines are already told
                              // by the badge and would read as fabricated verbatims.
                              const quotes = f.supporting_evidence.filter((e) => !looksLikeStat(e));
                              if (quotes.length === 0) return null;
                              return (
                                <div className="mt-3 space-y-1 border-l-2 border-rose-100 pl-3">
                                  {quotes.map((e, j) => (
                                    <p key={j} className="text-[12.5px] italic leading-relaxed text-slate-500">
                                      "{e}"
                                    </p>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13px] italic text-slate-400">No recurring friction points identified.</p>
                )}
              </Section>

              {/* ── 04 · What's working ── */}
              {report.top_strengths.length > 0 && (
                <Section
                  id="strengths"
                  title="What's working"
                  icon={<ThumbsUp className="h-5 w-5 text-emerald-600" />}
                  subtitle="Worth protecting"
                >
                  <ul className="pdf-block grid gap-3.5 rounded-xl border border-emerald-200 bg-white p-6 sm:grid-cols-2">
                    {report.top_strengths.map((s, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span
                          className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: POSITIVE_MARK }}
                        />
                        <span className="min-w-0">
                          <span className="text-[14px] leading-relaxed text-slate-700">{s.text}</span>
                          {s.mention_count != null && (
                            <span className="ml-2 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums text-emerald-700">
                              {s.mention_count} mentions
                              {s.share_pct != null && ` · ${s.share_pct}%`}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* ── 05 · Recommendations ── */}
              {report.recommendations.length > 0 && (
                <Section
                  id="recommendations"
                  title="Recommendations"
                  icon={<Lightbulb className="h-5 w-5 text-[#C5A04F]" />}
                  subtitle="Prioritised by volume of friction addressed"
                >
                  <ol className="space-y-2.5">
                    {report.recommendations.map((r, i) => (
                      <li
                        key={i}
                        className="pdf-block flex gap-3.5 rounded-xl border border-slate-200 bg-white p-4"
                        style={{ borderLeft: "4px solid #C5A04F" }}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C5A04F]/15 text-[12px] font-bold text-[#8a6d2f]">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] leading-relaxed text-slate-700">{r.text}</p>
                          {/* What this action would actually fix, and for how many people. */}
                          {r.addresses && (
                            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
                              <span className="font-semibold uppercase tracking-wide text-slate-400">
                                Addresses
                              </span>
                              <span className="font-semibold text-slate-700">{r.addresses}</span>
                              {r.mention_count != null && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold tabular-nums text-slate-600">
                                  {r.mention_count} mentions
                                  {r.share_pct != null && ` · ${r.share_pct}%`}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {hasDetail && (
                <PartDivider
                  label="Supporting detail"
                  hint="The evidence behind the findings above"
                />
              )}

              {/* ── Complaint categories ── */}
              {evidence && (evidence.top_complaints.length > 0 || evidence.top_themes.length > 0) && (
                <Section
                  id="topics"
                  title="Complaint categories"
                  subtitle={`${evidence.reviews_classified} comments classified`}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    {evidence.top_complaints.length > 0 && (
                      <Panel
                        title="Complaints by volume"
                        hint="Bar length is volume · segments show which channel it was found on"
                        accent="#e11d48"
                      >
                        {platformRows.length > 1 && (
                          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 pb-2.5">
                            {platformRows.map((p) => (
                              <LegendDot
                                key={p.platform}
                                color={channelColors[p.platform] ?? "#64748b"}
                                label={p.platform}
                              />
                            ))}
                          </div>
                        )}
                        <ComplaintChart items={evidence.top_complaints} colors={channelColors} />
                      </Panel>
                    )}
                    {evidence.top_themes.length > 0 && (
                      <Panel
                        title="Topics by volume"
                        hint="What customers bring up · red share is how negative the topic runs"
                        accent="#475569"
                      >
                        <TopicChart items={evidence.top_themes} />
                      </Panel>
                    )}
                  </div>
                </Section>
              )}

              {/* ── What's rising & falling (only when each half has a real sample) ── */}
              {evidence?.momentum && evidence.momentum.items.length > 0 && (
                <Section
                  id="momentum"
                  title="What's rising &amp; falling"
                  icon={<Activity className="h-5 w-5 text-slate-500" />}
                  subtitle="Complaint categories gaining or losing share of the conversation"
                >
                  <Panel>
                    <MomentumChart momentum={evidence.momentum} />
                  </Panel>
                </Section>
              )}

              {/* ── Trend over time (only when the data supports one) ── */}
              {evidence?.trend && (
                <Section
                  id="trend"
                  title="Trend over time"
                  icon={<TrendingUp className="h-5 w-5 text-slate-500" />}
                  subtitle={`By ${evidence.trend.granularity} · periods with fewer than ${evidence.trend.min_sample} reviews are left unplotted`}
                >
                  <Panel>
                    <TrendChart trend={evidence.trend} />
                    <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                      Built from review dates.{" "}
                      {evidence.trend.granularity === "quarter"
                        ? "Grouped by quarter because monthly volume was too low to state a percentage."
                        : "Monthly volume was high enough to plot each month separately."}{" "}
                      Reviews are collected newest-first, so earlier periods reflect a smaller
                      sample and the line is not a complete history of the brand.
                    </p>
                  </Panel>
                </Section>
              )}

              {/* ── Sentiment by channel ── */}
              {platformRows.length > 0 && (
                <Section
                  id="sentiment"
                  title="Sentiment by channel"
                  subtitle="Public reviews & customer feedbacks per channel"
                >
                  <ChannelSentimentTabbedView
                    rows={platformRows}
                    colors={channelColors}
                    verbatims={evidence?.verbatims ?? []}
                    scrapedPlatforms={result.platforms}
                    channelBreakdown={report?.channel_breakdown ?? []}
                  />
                </Section>
              )}

              {/* ── Owned channels (workbook) ── */}
              {channels.length > 0 && (
                <Section
                  id="channels"
                  title="Owned channels"
                  subtitle="From the consultant's workbook"
                >
                  <Panel>
                    <OwnedChannelTable channels={channels} />
                  </Panel>
                </Section>
              )}

              {/* ── Top posts (workbook) ── */}
              {channels.some((c) => c.posts.length > 0) && (
                <Section
                  id="posts"
                  title="Top performing posts"
                  subtitle="Ranked by total engagement"
                >
                  <Panel>
                    <TopPostsTable channels={channels} />
                  </Panel>
                </Section>
              )}

              {/* ── Website ── */}
              {(website || report.website_assessment) && (
                <Section
                  id="website"
                  title="Website performance"
                  icon={<Globe className="h-5 w-5 text-slate-500" />}
                >
                  <div className="space-y-4">
                    {website?.traffic && (
                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        <Kpi label="Visits" value={compact(parseCount(website.traffic.total_visits))} size="sm" />
                        <Kpi label="Bounce rate" value={formatPercent(website.traffic.bounce_rate)} size="sm" />
                        <Kpi label="Pages / visit" value={website.traffic.pages_per_visit ?? "—"} size="sm" />
                        <Kpi label="Avg. duration" value={website.traffic.avg_visit_duration ?? "—"} size="sm" />
                        <Kpi
                          label="Mobile share"
                          value={formatPercent(website.traffic.mobile_share)}
                          size="sm"
                          sub={
                            website.traffic.desktop_share
                              ? `desktop ${formatPercent(website.traffic.desktop_share)}`
                              : undefined
                          }
                        />
                      </div>
                    )}
                    {report.website_assessment && (
                      <p className="pdf-block rounded-2xl border border-slate-200 bg-white p-6 text-[14px] leading-relaxed text-slate-700">
                        {report.website_assessment}
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Voice of the customer ── */}
              {evidence && evidence.verbatims.length > 0 && (
                <Section
                  id="verbatims"
                  title="Voice of the customer"
                  subtitle="Unedited review extracts"
                >
                  <Panel>
                    <VerbatimGroups verbatims={evidence.verbatims} />
                  </Panel>
                </Section>
              )}
            </>
          )}

          {/* ── Sources & methodology ── */}
          <Section id="sources" title="Sources &amp; methodology">
            <Panel>
              <div className="space-y-2">
                {result.platforms.map((p) => (
                  <div
                    key={p.platform}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="w-24 shrink-0 text-[13px] font-semibold text-slate-800">{p.platform}</span>
                    <StatusBadge status={p.status} count={p.review_count} />
                    {p.summary_stat && <span className="text-[12px] text-slate-500">{p.summary_stat}</span>}
                    {p.status === "error" && p.error_message && (
                      <span className="text-[12px] text-rose-600">{p.error_message}</span>
                    )}
                    {p.matched_places && p.matched_places.length > 0 && (
                      <span className="w-full text-[12px] text-slate-400">
                        Places: {p.matched_places.join(" · ")}
                      </span>
                    )}
                    {p.excluded_places && p.excluded_places.length > 0 && (
                      <span className="w-full text-[12px] text-amber-600">
                        Excluded as out of location: {p.excluded_places.join(" · ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {report?.methodology_note && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-[12px] italic leading-relaxed text-slate-500">
                  {report.methodology_note}
                </p>
              )}
            </Panel>
          </Section>
        </section>
        {/* Mirrors the sidebar so the document stays optically centred on screen. */}
        <div className="no-print hidden w-56 shrink-0 xl:block" aria-hidden />
      </main>

      {/* Floating report assistant — answers from this report's computed findings. */}
      <div className="no-print">
        <ModuleChat
          endpoint={`${API_BASE_URL}/scraping/reports/${result.report_filename}/chat`}
          messages={chatMessages}
          onAppendMessage={appendChatMessage}
          title="Report Assistant"
          subtitle={result.brand_name}
          emptyTitle="Ask about this report"
          emptyHint="Sentiment, complaints, channels, trends, recommendations — I answer from the report."
          placeholder="Ask about the findings..."
          disabled={!canChat}
          disabledHint="Chat is available once the report is saved."
        />
      </div>
    </div>
  );
}
