import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Globe,
  Gauge,
  LayoutGrid,
  Lightbulb,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  FileText,
  Target,
  Zap,
  Award,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FinalReport = {
  assessment_id: number;
  summary: {
    overall_score_percent: number;
    overall_maturity_band: string;
    strongest_axis: string;
    strongest_axis_score_percent: number;
    priority_axis: string;
    priority_axis_score_percent: number;
    strengths_count: number;
    pain_points_count: number;
  };
  axes: { axis: string; score_percent: number; maturity_band: string }[];
  strengths: { axis: string; capability: string; maturity_band: string; rationale: string | null }[];
  pain_points: { axis: string; capability: string; maturity_band: string; rationale: string | null }[];
  capabilities: { axis: string; capability: string; maturity_band: string; rationale: string | null; recommendation: string | null }[];
  benchmarks: { title: string; url: string; site_name: string | null; published_at: string | null; summary: string | null; method_signal: string | null }[];
};

type Props = { report: FinalReport; onBack: () => void; companyName?: string | null };

const SplineScene = lazy(() => import("./splite").then((module) => ({ default: module.SplineScene })));
const REPORT_SPLINE_SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";
const BOOKING_EMAIL = import.meta.env.VITE_CONSULTING_BOOKING_EMAIL ?? "";

type BookingFormState = {
  name: string;
  email: string;
  company: string;
  website: string;
  preferredSlot: string;
  scope: string;
  message: string;
};

const prettyAxis = (axis: string) => {
  if (!axis) return "Unknown";
  return axis[0].toUpperCase() + axis.slice(1).toLowerCase();
};

const maturityConfig = {
  Basic: {
    gradient: "from-rose-500 to-pink-600",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    ring: "ring-rose-500/20",
    barColor: "bg-gradient-to-r from-rose-500 to-pink-600",
    icon: AlertCircle,
  },
  Established: {
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    ring: "ring-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-500 to-orange-600",
    icon: Target,
  },
  Advanced: {
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    ring: "ring-emerald-500/20",
    barColor: "bg-gradient-to-r from-emerald-500 to-teal-600",
    icon: Award,
  },
};

const cleanInsightText = (text: string | null) => {
  if (!text) return null;
  return text
    .replace(/^The answer (shows|indicates|demonstrates)\s*/i, "Observed: ")
    .replace(/\s+/g, " ")
    .trim();
};

const getWebsiteAuditPillars = (priorityAxis: string, strongestAxis: string) => [
  {
    title: "Homepage messaging & first impression",
    icon: Sparkles,
    accent: "from-indigo-500 to-violet-600",
    copy:
      "Review the clarity of the headline, trust cues, value proposition, and primary call-to-action visible in the first viewport.",
    note:
      priorityAxis === "ANALYZE"
        ? "Recommended first because discovery and comprehension appear to need stronger guidance."
        : "Recommended to align the first impression with the maturity story revealed by the assessment.",
  },
  {
    title: "Navigation & menu architecture",
    icon: LayoutGrid,
    accent: "from-sky-500 to-cyan-600",
    copy:
      "Audit information hierarchy, menu labels, wayfinding, and whether the navigation helps users reach high-value journeys quickly.",
    note:
      priorityAxis === "MANAGE"
        ? "Recommended first because governance and ownership often show up as navigation inconsistency on customer-facing channels."
        : "Useful to reduce friction between user intent and your core site journeys.",
  },
  {
    title: "Mobile behavior & conversion paths",
    icon: MonitorSmartphone,
    accent: "from-emerald-500 to-teal-600",
    copy:
      "Test responsive behavior, CTA visibility, form friction, and continuity between homepage sections, menu, and key conversion moments.",
    note:
      strongestAxis === "IMPROVE"
        ? "This is a good leverage point because your team may already be ready to operationalize fast UX improvements."
        : "This helps convert the assessment into practical UX/UI actions with business impact.",
  },
];

const buildBookingBrief = (
  form: BookingFormState,
  report: FinalReport,
  companyName?: string | null,
) => {
  const resolvedCompany = form.company || companyName || "Unknown company";
  return [
    `Company: ${resolvedCompany}`,
    `Contact name: ${form.name || "-"}`,
    `Contact email: ${form.email || "-"}`,
    `Website: ${form.website || "-"}`,
    `Preferred slot: ${form.preferredSlot || "-"}`,
    `Requested scope: ${form.scope || "-"}`,
    "",
    "Context from CX maturity assessment:",
    `- Overall score: ${Math.round(report.summary.overall_score_percent)}%`,
    `- Maturity band: ${report.summary.overall_maturity_band}`,
    `- Strongest axis: ${prettyAxis(report.summary.strongest_axis)}`,
    `- Priority axis: ${prettyAxis(report.summary.priority_axis)}`,
    `- Pain points: ${report.summary.pain_points_count}`,
    `- Strengths: ${report.summary.strengths_count}`,
    "",
    "Additional notes:",
    form.message || "-",
  ].join("\n");
};

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <span className="tabular-nums">
      {Math.round(value)}
      {suffix}
    </span>
  );
}

function SummaryCard({ 
  label, 
  value, 
  detail, 
  icon: Icon, 
  gradient,
  delay = 0
}: { 
  label: string; 
  value: string; 
  detail: string; 
  icon: LucideIcon; 
  gradient?: string;
  delay?: number;
}) {
  return (
    <div 
      className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-500 hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Gradient overlay on hover */}
      <div className={`absolute inset-0 bg-linear-to-br ${gradient || 'from-indigo-500/5 to-violet-500/5'} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500/80">
              {label}
            </p>
            <p className="mt-4 text-4xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600">
              {value}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              {detail}
            </p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient || 'from-indigo-500 to-violet-600'} text-white shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AxisBar({ axis, index }: { axis: { axis: string; score_percent: number; maturity_band: string }; index: number }) {
  const config = maturityConfig[axis.maturity_band as keyof typeof maturityConfig] || maturityConfig.Basic;
  const Icon = config.icon;
  
  return (
    <div 
      className="group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white p-5 transition-all duration-300 hover:shadow-lg hover:border-indigo-300"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${config.gradient} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">{prettyAxis(axis.axis)}</p>
            <p className="text-xs text-slate-500">Strategic dimension</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-slate-900 tabular-nums">
            <AnimatedNumber value={axis.score_percent} suffix="%" />
          </span>
          <div className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${config.border} ${config.bg} ${config.text}`}>
            {axis.maturity_band}
          </div>
        </div>
      </div>
      
      {/* Animated progress bar */}
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
        <div 
          className={`h-full ${config.barColor} transition-all duration-1000 ease-out shadow-sm`}
          style={{ 
            width: `${Math.round(axis.score_percent)}%`,
            animationDelay: `${index * 150}ms`
          }}
        >
          <div className="h-full w-full animate-pulse bg-white/20" />
        </div>
      </div>
    </div>
  );
}

function ReportRobotFallback() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-[28%] top-[22%] h-44 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.94),rgba(224,231,255,0.35),rgba(255,255,255,0))] blur-3xl" />
      <div className="absolute inset-x-[34%] top-[30%] h-28 rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.16),rgba(255,255,255,0))] blur-2xl" />
    </div>
  );
}

export default function AssessmentResultsPage({ report, onBack, companyName }: Props) {
  const [openCapability, setOpenCapability] = useState<string | null>(null);
  const [axisFilter, setAxisFilter] = useState<"ALL" | "MANAGE" | "ANALYZE" | "IMPROVE">("ALL");
  const [bookingForm, setBookingForm] = useState<BookingFormState>({
    name: "",
    email: "",
    company: companyName ?? "",
    website: "",
    preferredSlot: "",
    scope: "Homepage + navigation audit",
    message: "",
  });
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);

  const recentBenchmarksCount = useMemo(() => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    return report.benchmarks.filter((item) => {
      if (!item.published_at) return false;
      const published = new Date(item.published_at);
      return !Number.isNaN(published.getTime()) && published >= twelveMonthsAgo;
    }).length;
  }, [report.benchmarks]);

  const datedBenchmarksPercent =
    report.benchmarks.length > 0 ? Math.round((recentBenchmarksCount / report.benchmarks.length) * 100) : 0;

  const filteredCapabilities = useMemo(() => {
    if (axisFilter === "ALL") return report.capabilities;
    return report.capabilities.filter((item) => item.axis === axisFilter);
  }, [axisFilter, report.capabilities]);

  const executiveNarrative = useMemo(() => {
    const strongest = prettyAxis(report.summary.strongest_axis);
    const priority = prettyAxis(report.summary.priority_axis);
    const points = report.summary.pain_points_count;
    const strengths = report.summary.strengths_count;
    return `${companyName ?? "Your organization"} is currently at ${report.summary.overall_maturity_band} maturity (${Math.round(report.summary.overall_score_percent)}%). ${strongest} is leading today, while ${priority} is the next growth lever. We detected ${points} priority pain point${points === 1 ? "" : "s"} and ${strengths} strength${strengths === 1 ? "" : "s"} to scale.`;
  }, [companyName, report.summary]);

  const overallConfig = maturityConfig[report.summary.overall_maturity_band as keyof typeof maturityConfig] || maturityConfig.Basic;
  const websiteAuditPillars = useMemo(
    () => getWebsiteAuditPillars(report.summary.priority_axis, report.summary.strongest_axis),
    [report.summary.priority_axis, report.summary.strongest_axis],
  );

  const handleBookingFieldChange = (field: keyof BookingFormState, value: string) => {
    setBookingForm((current) => ({ ...current, [field]: value }));
    if (bookingFeedback) setBookingFeedback(null);
  };

  const handleBookingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const brief = buildBookingBrief(bookingForm, report, companyName);
    const subject = `${bookingForm.company || companyName || "Company"} - UX/UI website audit request`;

    if (BOOKING_EMAIL) {
      const mailto = `mailto:${encodeURIComponent(BOOKING_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(brief)}`;
      window.location.href = mailto;
      setBookingFeedback("Your booking request is ready in your email client.");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(brief);
      setBookingFeedback("Booking email is not configured yet. The consultant brief has been copied for you.");
      return;
    }

    setBookingFeedback("Booking email is not configured yet. Please copy the form content manually for your consultant.");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:px-0 print:py-0">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }
        
        .animate-slide-in-right {
          animation: slideInRight 0.6s ease-out forwards;
          opacity: 0;
        }

        @media print {
          @page { margin: 12mm; }
          .print-hide { display: none !important; }
          .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .animate-fade-in-up, .animate-slide-in-right { 
            opacity: 1 !important; 
            animation: none !important; 
          }
        }
      `}</style>

      <div className="mx-auto w-full max-w-7xl space-y-8">
        {/* Header avec effet glassmorphism */}
        <section className="animate-fade-in-up print-avoid-break group relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-3xl">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-purple-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          
          <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
                  <FileText className="h-3.5 w-3.5" />
                  CX Maturity Assessment
                </div>
                <h1 className="bg-gradient-to-r from-slate-900 via-indigo-900 to-violet-900 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
                  {companyName ?? "Executive Report"}
                </h1>
                <p className="text-base font-medium text-slate-600">
                  Comprehensive analysis • {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>

              <div className="print-hide flex flex-wrap gap-3">
                <button
                  onClick={() => window.print()}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:shadow-2xl hover:scale-105"
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Export PDF
                  </span>
                </button>
                <button
                  onClick={onBack}
                  className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md hover:scale-105"
                >
                  Back to chat
                </button>
              </div>
            </div>

            <div className="relative hidden h-[260px] overflow-hidden rounded-[2rem] lg:block print:hidden">
              <div className="pointer-events-none absolute inset-x-[18%] top-[12%] h-28 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),rgba(224,231,255,0.45),rgba(255,255,255,0))] blur-3xl" />
              <div className="pointer-events-none absolute inset-x-[22%] bottom-[16%] h-12 rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.14),rgba(255,255,255,0))] blur-2xl" />
              <div className="pointer-events-none absolute inset-x-[24%] bottom-[10%] h-10 rounded-full bg-[radial-gradient(circle,rgba(15,23,42,0.08),rgba(255,255,255,0))] blur-xl" />

              <div className="relative h-full w-full opacity-95">
                <Suspense fallback={<ReportRobotFallback />}>
                  <SplineScene scene={REPORT_SPLINE_SCENE} className="h-full w-full" />
                </Suspense>
              </div>
            </div>
          </div>
        </section>

        {/* Executive Summary avec gradient animÃ© */}
        <section 
          className="animate-fade-in-up print-avoid-break group relative overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 p-8 shadow-xl transition-all duration-500 hover:shadow-2xl"
          style={{ animationDelay: '100ms' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.1),transparent_50%)]" />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-400/20 to-violet-400/20 blur-3xl transition-transform duration-700 group-hover:scale-150" />
          
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-600" />
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">
                Executive Summary
              </p>
            </div>
            <p className="text-base leading-relaxed text-slate-800 sm:text-lg">
              {executiveNarrative}
            </p>
          </div>
        </section>

        {/* Summary Cards Grid avec animations dÃ©calÃ©es */}
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <SummaryCard 
              label="Overall Score" 
              value={`${Math.round(report.summary.overall_score_percent)}%`}
              detail={`Maturity: ${report.summary.overall_maturity_band}`}
              icon={Gauge}
              gradient={overallConfig.gradient}
              delay={200}
            />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <SummaryCard 
              label="Strongest Axis" 
              value={prettyAxis(report.summary.strongest_axis)}
              detail={`${Math.round(report.summary.strongest_axis_score_percent)}% performance`}
              icon={ArrowUpRight}
              gradient="from-emerald-500 to-teal-600"
              delay={300}
            />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            <SummaryCard 
              label="Priority Axis" 
              value={prettyAxis(report.summary.priority_axis)}
              detail={`${Math.round(report.summary.priority_axis_score_percent)}% needs focus`}
              icon={ArrowDownRight}
              gradient="from-orange-500 to-red-600"
              delay={400}
            />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '500ms' }}>
            <SummaryCard 
              label="Key Signals" 
              value={`${report.summary.strengths_count + report.summary.pain_points_count}`}
              detail={`${report.summary.pain_points_count} gaps â€¢ ${report.summary.strengths_count} wins`}
              icon={TriangleAlert}
              gradient="from-violet-500 to-purple-600"
              delay={500}
            />
          </div>
        </section>

        {/* Axis Maturity avec barres animÃ©es */}
        <section 
          className="animate-fade-in-up print-avoid-break overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl"
          style={{ animationDelay: '600ms' }}
        >
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
              <BarChart3 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Axis Maturity</h2>
              <p className="text-sm font-medium text-slate-600">Performance across strategic dimensions</p>
            </div>
          </div>
          <div className="space-y-4">
            {report.axes.map((axis, index) => (
              <AxisBar key={axis.axis} axis={axis} index={index} />
            ))}
          </div>
        </section>

        {/* Strengths & Pain Points avec cards modernisÃ©es */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Strengths */}
          <div 
            className="animate-slide-in-right print-avoid-break group overflow-hidden rounded-3xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 p-8 shadow-xl transition-all duration-500 hover:shadow-2xl"
            style={{ animationDelay: '700ms' }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Top Strengths</h3>
                <p className="text-xs font-medium text-slate-600">Building blocks for growth</p>
              </div>
            </div>
            <div className="space-y-3">
              {report.strengths.length ? report.strengths.map((item, idx) => (
                <div 
                  key={`${item.axis}-${item.capability}`}
                  className="group/item relative overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-400"
                  style={{ animationDelay: `${700 + idx * 50}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 transition-opacity duration-300 group-hover/item:opacity-100" />
                  <div className="relative z-10">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="flex-1 text-sm font-bold text-slate-900">{item.capability}</p>
                      <div className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                        {item.maturity_band}
                      </div>
                    </div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {prettyAxis(item.axis)} dimension
                    </p>
                    {item.rationale ? (
                      <p className="text-sm leading-relaxed text-slate-700">
                        {cleanInsightText(item.rationale)}
                      </p>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                  <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-500">No clear strengths detected yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Pain Points */}
          <div 
            className="animate-slide-in-right print-avoid-break group overflow-hidden rounded-3xl border border-rose-200/60 bg-gradient-to-br from-rose-50/50 to-pink-50/50 p-8 shadow-xl transition-all duration-500 hover:shadow-2xl"
            style={{ animationDelay: '800ms' }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg">
                <Lightbulb className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Top Pain Points</h3>
                <p className="text-xs font-medium text-slate-600">Priority improvement areas</p>
              </div>
            </div>
            <div className="space-y-3">
              {report.pain_points.length ? report.pain_points.map((item, idx) => (
                <div 
                  key={`${item.axis}-${item.capability}`}
                  className="group/item relative overflow-hidden rounded-2xl border-2 border-rose-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-rose-400"
                  style={{ animationDelay: `${800 + idx * 50}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-pink-500/5 opacity-0 transition-opacity duration-300 group-hover/item:opacity-100" />
                  <div className="relative z-10">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="flex-1 text-sm font-bold text-slate-900">{item.capability}</p>
                      <div className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
                        {item.maturity_band}
                      </div>
                    </div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {prettyAxis(item.axis)} dimension
                    </p>
                    {item.rationale ? (
                      <p className="text-sm leading-relaxed text-slate-700">
                        {cleanInsightText(item.rationale)}
                      </p>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                  <Lightbulb className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-500">No major pain points detected yet.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Capability Details avec accordÃ©on amÃ©liorÃ© */}
        <section 
          className="animate-fade-in-up overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl"
          style={{ animationDelay: '900ms' }}
        >
          <div className="print-hide mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
                <Target className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Capability Details</h2>
                <p className="text-sm font-medium text-slate-600">Expand for evidence & recommendations</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ALL", "MANAGE", "ANALYZE", "IMPROVE"] as const).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  onClick={() => setAxisFilter(axis)}
                  className={`group relative overflow-hidden rounded-xl px-4 py-2 text-xs font-bold transition-all duration-300 ${
                    axisFilter === axis 
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg scale-105" 
                      : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:scale-105"
                  }`}
                >
                  {axisFilter === axis && (
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  )}
                  <span className="relative">{axis === "ALL" ? "All axes" : axis}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="print:hidden space-y-3">
            {filteredCapabilities.map((item, idx) => {
              const key = `${item.axis}-${item.capability}`;
              const open = openCapability === key;
              const config = maturityConfig[item.maturity_band as keyof typeof maturityConfig] || maturityConfig.Basic;
              
              return (
                <div 
                  key={key} 
                  className={`overflow-hidden rounded-2xl border-2 transition-all duration-300 ${
                    open 
                      ? `${config.border} ${config.bg} shadow-lg` 
                      : "border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md"
                  }`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <button
                    onClick={() => setOpenCapability(open ? null : key)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left transition-all duration-300"
                    type="button"
                  >
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <p className="text-base font-bold text-slate-900">{item.capability}</p>
                        <div className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${config.border} ${config.bg} ${config.text}`}>
                          {item.maturity_band}
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-slate-500">
                        {prettyAxis(item.axis)} dimension
                      </p>
                    </div>
                    <div className={`ml-4 flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300 ${
                      open ? `bg-gradient-to-br ${config.gradient} text-white` : "bg-slate-200 text-slate-600"
                    }`}>
                      {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </button>
                  {open ? (
                    <div className="space-y-4 border-t-2 border-slate-200/60 px-6 py-5 text-sm animate-fade-in-up">
                      {item.rationale ? (
                        <div className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                          <div className="mb-2 flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Evidence</p>
                          </div>
                          <p className="leading-relaxed text-slate-700">{cleanInsightText(item.rationale)}</p>
                        </div>
                      ) : null}
                      {item.recommendation ? (
                        <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm">
                          <div className="mb-2 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-indigo-600" />
                            <p className="text-xs font-black uppercase tracking-wider text-indigo-700">Recommended Action</p>
                          </div>
                          <p className="leading-relaxed text-slate-800">{item.recommendation}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Print version */}
          <div className="hidden print:block print:space-y-3">
            {report.capabilities.map((item) => (
              <div key={`${item.axis}-${item.capability}`} className="print-avoid-break rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <p className="font-bold text-slate-900">
                  {item.capability} <span className="font-normal text-slate-500">({prettyAxis(item.axis)} â€¢ {item.maturity_band})</span>
                </p>
                {item.rationale ? <p className="mt-2 text-slate-700"><span className="font-semibold">Evidence:</span> {cleanInsightText(item.rationale)}</p> : null}
                {item.recommendation ? <p className="mt-2 text-slate-700"><span className="font-semibold">Action:</span> {item.recommendation}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section
          className="animate-fade-in-up print-hide overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl"
          style={{ animationDelay: "950ms" }}
        >
          <div className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-indigo-700 text-white shadow-lg">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Consulting next step</p>
                <h2 className="text-2xl font-black text-slate-900">Book a consultant for a full website audit</h2>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Before the UX/UI homepage review below, consultants asked for a lightweight booking step so teams can request
              a deeper audit of the full website, navigation system, and conversion journeys.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 md:p-8">
              <h3 className="text-2xl font-bold text-slate-900">Request your website audit</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Share your website, objectives, and preferred timing. We will use your current assessment as context for the
                audit brief.
              </p>

              <form className="mt-6 space-y-5" onSubmit={handleBookingSubmit}>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Name</span>
                    <input
                      type="text"
                      value={bookingForm.name}
                      onChange={(event) => handleBookingFieldChange("name", event.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Email</span>
                    <input
                      type="email"
                      value={bookingForm.email}
                      onChange={(event) => handleBookingFieldChange("email", event.target.value)}
                      placeholder="name@company.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Company</span>
                    <input
                      type="text"
                      value={bookingForm.company}
                      onChange={(event) => handleBookingFieldChange("company", event.target.value)}
                      placeholder="Company name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Website</span>
                    <input
                      type="url"
                      value={bookingForm.website}
                      onChange={(event) => handleBookingFieldChange("website", event.target.value)}
                      placeholder="https://www.company.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Preferred slot</span>
                    <input
                      type="text"
                      value={bookingForm.preferredSlot}
                      onChange={(event) => handleBookingFieldChange("preferredSlot", event.target.value)}
                      placeholder="Ex: next week, mornings"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Requested scope</span>
                    <input
                      type="text"
                      value={bookingForm.scope}
                      onChange={(event) => handleBookingFieldChange("scope", event.target.value)}
                      placeholder="Homepage, menu, key journeys..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Context</span>
                  <textarea
                    rows={6}
                    value={bookingForm.message}
                    onChange={(event) => handleBookingFieldChange("message", event.target.value)}
                    placeholder="Describe your priorities, site challenges, and what you want the consultant to focus on."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>

                <div className="flex flex-col gap-3 pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl"
                  >
                    <Mail className="h-4 w-4" />
                    {BOOKING_EMAIL ? "Request audit with consultant" : "Prepare consultant brief"}
                  </button>
                  <p className="text-xs leading-5 text-slate-500">
                    {BOOKING_EMAIL
                      ? "The request opens in your email client with the assessment context prefilled."
                      : "No booking inbox is configured yet. We will prepare a ready-to-share consultant brief instead."}
                  </p>
                  {bookingFeedback ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                      {bookingFeedback}
                    </div>
                  ) : null}
                </div>
              </form>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white shadow-xl md:p-8">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/60">Practical info</p>
              <h3 className="mt-3 text-2xl font-bold leading-tight">What consultants will use to accelerate the audit</h3>
              <p className="mt-4 text-sm leading-6 text-white/70">
                Your current CX maturity result already gives the consultant a strong starting point for prioritization.
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold">Priority axis</p>
                  <p className="mt-1 text-sm text-white/70">{prettyAxis(report.summary.priority_axis)} should guide the first audit pass.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold">Current maturity</p>
                  <p className="mt-1 text-sm text-white/70">
                    {report.summary.overall_maturity_band} maturity at {Math.round(report.summary.overall_score_percent)}%.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold">Signals to explore</p>
                  <p className="mt-1 text-sm text-white/70">
                    {report.summary.pain_points_count} pain points and {report.summary.strengths_count} strengths can be translated into site-level UX hypotheses.
                  </p>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-white/75">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  <span>Homepage clarity, trust signals, and first-screen CTA hierarchy.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  <span>Navigation labels, menu grouping, and information scent across key journeys.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  <span>Mobile responsiveness, friction points, and conversion continuity.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section
          className="animate-fade-in-up overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl"
          style={{ animationDelay: "980ms" }}
        >
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">UX/UI extension</p>
                  <h2 className="text-2xl font-black text-slate-900">Homepage & navigation audit focus</h2>
                </div>
              </div>
              <p className="text-sm leading-7 text-slate-600 sm:text-base">
                This section prepares the future website audit capability. Until the automated feature is coded, we use the
                current assessment to recommend where consultants should focus first on the homepage and main menu.
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
              First focus: {prettyAxis(report.summary.priority_axis)}-driven UX review
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {websiteAuditPillars.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 p-6 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg"
                  style={{ animationDelay: `${980 + index * 40}ms` }}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.05]`} />
                  <div className="relative z-10">
                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} text-white shadow-lg`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.copy}</p>
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Consultant note
                      </div>
                      {item.note}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">Suggested consultant deliverables</h3>
              </div>
              <ul className="space-y-3 text-sm leading-6 text-slate-600">
                <li>Annotated homepage review with friction points and quick wins.</li>
                <li>Navigation/menu restructuring recommendations and labeling guidance.</li>
                <li>Priority actions for trust, readability, CTA clarity, and mobile continuity.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-violet-600" />
                <h3 className="text-lg font-bold text-slate-900">Current limitation</h3>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                This is a consultant-guided scope section for now. It does not yet crawl or score the company website
                automatically. When that feature is implemented, this block can evolve into a true site audit with
                screenshots, findings, and prioritized recommendations.
              </p>
            </div>
          </div>
        </section>

        {/* Benchmarks avec cards interactives */}
        <section 
          className="animate-fade-in-up overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl"
          style={{ animationDelay: '1000ms' }}
        >
          <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
                <BarChart3 className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Sector Benchmark Signals</h2>
                <p className="text-sm font-medium text-slate-600">External practices matched to your context</p>
              </div>
            </div>
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700">
              {recentBenchmarksCount}/{report.benchmarks.length} recent sources
            </div>
          </div>

          {/* Freshness indicator */}
          <div className="mb-6">
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              <div 
                className="h-full bg-gradient-to-r from-violet-500 to-purple-600 shadow-sm transition-all duration-1000 ease-out"
                style={{ width: `${datedBenchmarksPercent}%` }}
              >
                <div className="h-full w-full animate-pulse bg-white/20" />
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-600">
              {datedBenchmarksPercent}% freshness coverage â€¢ {recentBenchmarksCount === 0 ? "Most sources lack publication dates" : "Strong time-validity confidence"}
            </p>
          </div>

          {/* Benchmark cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            {report.benchmarks.map((item, idx) => (
              <a 
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-xl hover:-translate-y-1 hover:border-violet-300"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-purple-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                
                <div className="relative z-10">
                  <p className="mb-3 text-sm font-bold leading-snug text-slate-900 line-clamp-2 group-hover:text-violet-700 transition-colors">
                    {item.title}
                  </p>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {item.method_signal ? (
                      <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                        {item.method_signal}
                      </span>
                    ) : null}
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {item.site_name ?? "Source"}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {item.published_at ? new Date(item.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : "Date unavailable"}
                    </span>
                  </div>
                  {item.summary ? (
                    <p className="text-sm leading-relaxed text-slate-700 line-clamp-3">
                      {item.summary}
                    </p>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}


