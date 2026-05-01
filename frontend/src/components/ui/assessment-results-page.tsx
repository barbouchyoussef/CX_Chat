import { ArrowDownRight, ArrowUpRight, BarChart3, Gauge, Lightbulb, ShieldCheck, TriangleAlert } from "lucide-react";

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
  strengths: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
  }[];
  pain_points: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
  }[];
  capabilities: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
    recommendation: string | null;
  }[];
  benchmarks: {
    title: string;
    url: string;
    site_name: string | null;
    published_at: string | null;
    summary: string | null;
    method_signal: string | null;
  }[];
};

type Props = {
  report: FinalReport;
  onBack: () => void;
};

const prettyAxis = (axis: string) => axis[0] + axis.slice(1).toLowerCase();

function SummaryCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
      </div>
      <p className="mt-6 text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

export default function AssessmentResultsPage({ report, onBack }: Props) {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const recentBenchmarksCount = report.benchmarks.filter((item) => {
    if (!item.published_at) return false;
    const published = new Date(item.published_at);
    return !Number.isNaN(published.getTime()) && published >= twelveMonthsAgo;
  }).length;

  const exportPdf = () => window.print();
  const exportPptBrief = () => {
    const lines = [
      `Assessment Report #${report.assessment_id}`,
      `Overall score: ${Math.round(report.summary.overall_score_percent)}% (${report.summary.overall_maturity_band})`,
      `Strongest axis: ${prettyAxis(report.summary.strongest_axis)} (${Math.round(report.summary.strongest_axis_score_percent)}%)`,
      `Priority axis: ${prettyAxis(report.summary.priority_axis)} (${Math.round(report.summary.priority_axis_score_percent)}%)`,
      "",
      "Top strengths:",
      ...report.strengths.map((s) => `- ${s.capability}: ${s.rationale ?? "n/a"}`),
      "",
      "Top pain points:",
      ...report.pain_points.map((p) => `- ${p.capability}: ${p.rationale ?? "n/a"}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `assessment-${report.assessment_id}-executive-brief.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_40%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Assessment Report</h1>
              <p className="text-sm text-slate-500">Assessment #{report.assessment_id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={exportPdf} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Export PDF
              </button>
              <button type="button" onClick={exportPptBrief} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Export PPT Brief
              </button>
              <button type="button" onClick={onBack} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Back to chat
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Overall score" value={`${Math.round(report.summary.overall_score_percent)}%`} detail={`Maturity: ${report.summary.overall_maturity_band}`} icon={<Gauge className="h-5 w-5" />} />
          <SummaryCard label="Strongest axis" value={prettyAxis(report.summary.strongest_axis)} detail={`${Math.round(report.summary.strongest_axis_score_percent)}%`} icon={<ArrowUpRight className="h-5 w-5" />} />
          <SummaryCard label="Priority axis" value={prettyAxis(report.summary.priority_axis)} detail={`${Math.round(report.summary.priority_axis_score_percent)}%`} icon={<ArrowDownRight className="h-5 w-5" />} />
          <SummaryCard label="Key signals" value={`${report.summary.strengths_count + report.summary.pain_points_count}`} detail={`${report.summary.pain_points_count} pain points • ${report.summary.strengths_count} strengths`} icon={<TriangleAlert className="h-5 w-5" />} />
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Axis maturity</h2>
              <p className="text-sm text-slate-500">Level and score by axis.</p>
            </div>
          </div>
          <div className="space-y-4">
            {report.axes.map((axis) => (
              <div key={axis.axis}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-slate-900">{prettyAxis(axis.axis)}</span>
                  <span className="text-slate-600">{Math.round(axis.score_percent)}% • {axis.maturity_band}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-slate-900" style={{ width: `${Math.round(axis.score_percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-semibold text-slate-900">Top strengths</h3></div>
            <div className="space-y-3">
              {report.strengths.length ? report.strengths.map((item) => (
                <div key={`${item.axis}-${item.capability}`} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
                  <p className="text-xs text-slate-600">{prettyAxis(item.axis)} • {item.maturity_band}</p>
                  {item.rationale ? <p className="mt-2 text-sm text-slate-700">{item.rationale}</p> : null}
                </div>
              )) : <p className="text-sm text-slate-500">No clear strengths detected yet.</p>}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><Lightbulb className="h-5 w-5 text-rose-600" /><h3 className="text-lg font-semibold text-slate-900">Top pain points</h3></div>
            <div className="space-y-3">
              {report.pain_points.length ? report.pain_points.map((item) => (
                <div key={`${item.axis}-${item.capability}`} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
                  <p className="text-xs text-slate-600">{prettyAxis(item.axis)} • {item.maturity_band}</p>
                  {item.rationale ? <p className="mt-2 text-sm text-slate-700">{item.rationale}</p> : null}
                </div>
              )) : <p className="text-sm text-slate-500">No major pain points detected yet.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Capability details</h2>
          <p className="mt-1 text-sm text-slate-500">Detailed capability view with rationale and recommendation.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {report.capabilities.map((capability) => (
              <div key={`${capability.axis}-${capability.capability}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{capability.capability}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{capability.maturity_band}</span>
                </div>
                <p className="text-xs text-slate-500">{prettyAxis(capability.axis)}</p>
                {capability.rationale ? <p className="mt-2 text-sm text-slate-700">{capability.rationale}</p> : null}
                {capability.recommendation ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{capability.recommendation}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Sector benchmark signals</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              Benchmarks updated from last 12 months: {recentBenchmarksCount}/{report.benchmarks.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Contextual external practices detected from recent web research for your sector and maturity gaps.</p>
          <div className="mt-4 space-y-3">
            {report.benchmarks.length ? report.benchmarks.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  {item.method_signal ? <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{item.method_signal}</span> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{(item.site_name ?? "Source")} {item.published_at ? `• ${item.published_at.slice(0, 10)}` : ""}</p>
                {item.summary ? <p className="mt-2 text-sm text-slate-700">{item.summary}</p> : null}
              </a>
            )) : <p className="text-sm text-slate-500">No benchmark items yet. Add `LANGSEARCH_API_KEY` on backend and regenerate this report.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

