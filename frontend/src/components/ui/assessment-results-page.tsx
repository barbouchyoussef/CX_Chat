import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, ChevronUp, Gauge, Lightbulb, ShieldCheck, TriangleAlert } from "lucide-react";

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

type Props = { report: FinalReport; onBack: () => void };

const prettyAxis = (axis: string) => axis[0] + axis.slice(1).toLowerCase();
const toneByBand: Record<string, string> = {
  Basic: "bg-rose-50 text-rose-700 border-rose-200",
  Established: "bg-amber-50 text-amber-700 border-amber-200",
  Advanced: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function SummaryCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</span>
      </div>
      <p className="mt-5 text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

export default function AssessmentResultsPage({ report, onBack }: Props) {
  const [openCapability, setOpenCapability] = useState<string | null>(null);

  const recentBenchmarksCount = useMemo(() => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    return report.benchmarks.filter((item) => {
      if (!item.published_at) return false;
      const published = new Date(item.published_at);
      return !Number.isNaN(published.getTime()) && published >= twelveMonthsAgo;
    }).length;
  }, [report.benchmarks]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_38%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Executive Assessment Report</h1>
              <p className="text-sm text-slate-500">Assessment #{report.assessment_id}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => window.print()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Export PDF</button>
              <button onClick={onBack} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Back to chat</button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Overall score" value={`${Math.round(report.summary.overall_score_percent)}%`} detail={`Maturity: ${report.summary.overall_maturity_band}`} icon={<Gauge className="h-5 w-5" />} />
          <SummaryCard label="Strongest axis" value={prettyAxis(report.summary.strongest_axis)} detail={`${Math.round(report.summary.strongest_axis_score_percent)}%`} icon={<ArrowUpRight className="h-5 w-5" />} />
          <SummaryCard label="Priority axis" value={prettyAxis(report.summary.priority_axis)} detail={`${Math.round(report.summary.priority_axis_score_percent)}%`} icon={<ArrowDownRight className="h-5 w-5" />} />
          <SummaryCard label="Key signals" value={`${report.summary.strengths_count + report.summary.pain_points_count}`} detail={`${report.summary.pain_points_count} pain points • ${report.summary.strengths_count} strengths`} icon={<TriangleAlert className="h-5 w-5" />} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><BarChart3 className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Axis maturity</h2>
              <p className="text-sm text-slate-500">Performance across the three strategic dimensions.</p>
            </div>
          </div>
          <div className="space-y-4">
            {report.axes.map((axis) => (
              <div key={axis.axis}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{prettyAxis(axis.axis)}</p>
                  <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${toneByBand[axis.maturity_band] ?? "bg-slate-50 border-slate-200 text-slate-700"}`}>{axis.maturity_band}</div>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full bg-slate-900 transition-all" style={{ width: `${Math.round(axis.score_percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-600" />Top strengths</h3>
            <div className="space-y-3">
              {report.strengths.length ? report.strengths.map((item) => (
                <div key={`${item.axis}-${item.capability}`} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
                  <p className="text-xs text-slate-600">{prettyAxis(item.axis)} • {item.maturity_band}</p>
                  {item.rationale ? <p className="mt-1 text-sm text-slate-700">{item.rationale}</p> : null}
                </div>
              )) : <p className="text-sm text-slate-500">No clear strengths detected yet.</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900"><Lightbulb className="h-5 w-5 text-rose-600" />Top pain points</h3>
            <div className="space-y-3">
              {report.pain_points.length ? report.pain_points.map((item) => (
                <div key={`${item.axis}-${item.capability}`} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
                  <p className="text-xs text-slate-600">{prettyAxis(item.axis)} • {item.maturity_band}</p>
                  {item.rationale ? <p className="mt-1 text-sm text-slate-700">{item.rationale}</p> : null}
                </div>
              )) : <p className="text-sm text-slate-500">No major pain points detected yet.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Capability details</h2>
          <p className="mt-1 text-sm text-slate-500">Expand each capability for rationale and recommendation.</p>
          <div className="mt-4 space-y-3">
            {report.capabilities.map((item) => {
              const key = `${item.axis}-${item.capability}`;
              const open = openCapability === key;
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    onClick={() => setOpenCapability(open ? null : key)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    type="button"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
                      <p className="text-xs text-slate-500">{prettyAxis(item.axis)} • {item.maturity_band}</p>
                    </div>
                    {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {open ? (
                    <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
                      {item.rationale ? <p>{item.rationale}</p> : null}
                      {item.recommendation ? <div className="rounded-xl border border-slate-200 bg-white p-3">{item.recommendation}</div> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Sector benchmark signals</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              Benchmarks updated from last 12 months: {recentBenchmarksCount}/{report.benchmarks.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Contextual external practices detected from recent web research for your sector and maturity gaps.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {report.benchmarks.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {item.method_signal ? <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{item.method_signal}</span> : null}
                  <span className="text-xs text-slate-500">{item.site_name ?? "Source"} {item.published_at ? `• ${item.published_at.slice(0, 10)}` : ""}</span>
                </div>
                {item.summary ? <p className="mt-2 text-sm text-slate-700">{item.summary}</p> : null}
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

