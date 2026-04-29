import { ArrowDownRight, ArrowUpRight, Gauge, TriangleAlert, ShieldCheck, Lightbulb, BarChart3 } from "lucide-react";

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
    recommendation: string | null;
    priority: string | null;
  }[];
  pain_points: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
    recommendation: string | null;
    priority: string | null;
  }[];
  capabilities: {
    axis: string;
    capability: string;
    maturity_band: string;
    confidence: number | null;
    rationale: string | null;
    recommendation: string | null;
    priority: string | null;
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

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
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

function ThemeCard({
  title,
  icon,
  items,
  emptyMessage,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: FinalReport["strengths"];
  emptyMessage: string;
  tone: "strength" | "pain";
}) {
  const boxClass =
    tone === "strength"
      ? "border-emerald-200 bg-emerald-50"
      : "border-rose-200 bg-rose-50";

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={`${item.axis}-${item.capability}`} className={`rounded-2xl border p-4 ${boxClass}`}>
              <p className="text-sm font-semibold text-slate-900">{item.capability}</p>
              <p className="text-xs text-slate-600">{prettyAxis(item.axis)} • {item.maturity_band}</p>
              {item.rationale ? <p className="mt-2 text-sm text-slate-700">{item.rationale}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        )}
      </div>
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Assessment Report</h1>
            <p className="text-sm text-slate-500">Assessment #{report.assessment_id}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Back to chat
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Overall score"
            value={`${Math.round(report.summary.overall_score_percent)}%`}
            detail={`Maturity: ${report.summary.overall_maturity_band}`}
            icon={<Gauge className="h-5 w-5" />}
          />
          <SummaryCard
            label="Strongest axis"
            value={prettyAxis(report.summary.strongest_axis)}
            detail={`${Math.round(report.summary.strongest_axis_score_percent)}%`}
            icon={<ArrowUpRight className="h-5 w-5" />}
          />
          <SummaryCard
            label="Priority axis"
            value={prettyAxis(report.summary.priority_axis)}
            detail={`${Math.round(report.summary.priority_axis_score_percent)}%`}
            icon={<ArrowDownRight className="h-5 w-5" />}
          />
          <SummaryCard
            label="Key signals"
            value={`${report.summary.strengths_count + report.summary.pain_points_count}`}
            detail={`${report.summary.pain_points_count} pain points • ${report.summary.strengths_count} strengths`}
            icon={<TriangleAlert className="h-5 w-5" />}
          />
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
          <ThemeCard
            title="Top strengths"
            icon={<ShieldCheck className="h-5 w-5" />}
            items={report.strengths}
            emptyMessage="No clear strengths detected yet."
            tone="strength"
          />
          <ThemeCard
            title="Top pain points"
            icon={<Lightbulb className="h-5 w-5" />}
            items={report.pain_points}
            emptyMessage="No major pain points detected yet."
            tone="pain"
          />
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Capability details</h2>
          <p className="mt-1 text-sm text-slate-500">Detailed capability view with rationale and recommendation.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {report.capabilities.map((capability) => (
              <div key={`${capability.axis}-${capability.capability}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{capability.capability}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{capability.maturity_band}</span>
                </div>
                <p className="text-xs text-slate-500">{prettyAxis(capability.axis)}</p>
                {capability.rationale ? <p className="mt-2 text-sm text-slate-700">{capability.rationale}</p> : null}
                {capability.recommendation ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    {capability.recommendation}
                  </div>
                ) : null}
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
          <p className="mt-1 text-sm text-slate-500">
            Contextual external practices detected from recent web research for your sector and maturity gaps.
          </p>
          <div className="mt-4 space-y-3">
            {report.benchmarks.length ? (
              report.benchmarks.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    {item.method_signal ? (
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{item.method_signal}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {(item.site_name ?? "Source")} {item.published_at ? `• ${item.published_at.slice(0, 10)}` : ""}
                  </p>
                  {item.summary ? <p className="mt-2 text-sm text-slate-700">{item.summary}</p> : null}
                </a>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No benchmark items yet. Add `LANGSEARCH_API_KEY` on backend and regenerate this report.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
