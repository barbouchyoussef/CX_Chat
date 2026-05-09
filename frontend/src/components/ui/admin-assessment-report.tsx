import { useEffect, useState } from "react";
import AssessmentResultsPage from "./assessment-results-page";
import AssessmentGeneratingPage from "./assessment-generating-page";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type FinalReport = Parameters<typeof AssessmentResultsPage>[0]["report"];
type AssessmentMeta = { company?: { name?: string } };

type Props = {
  assessmentId: number;
  onBack: () => void;
};

export default function AdminAssessmentReport({ assessmentId, onBack }: Props) {
  const [report, setReport] = useState<FinalReport | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API_BASE_URL}/assessments/${assessmentId}/final-report`),
      fetch(`${API_BASE_URL}/assessments/${assessmentId}`),
    ])
      .then(async ([reportRes, metaRes]) => {
        if (!reportRes.ok) throw new Error("Failed to load final report");
        const reportPayload = await reportRes.json();
        let metaPayload: AssessmentMeta = {};
        if (metaRes.ok) metaPayload = await metaRes.json();
        if (!mounted) return;
        setReport(reportPayload);
        setCompanyName(metaPayload.company?.name ?? null);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load report");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [assessmentId]);

  if (loading) return <AssessmentGeneratingPage mode="admin" onBack={onBack} />;

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error ?? "Report unavailable."}
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            Back to admin
          </button>
        </div>
      </div>
    );
  }

  return <AssessmentResultsPage report={report} companyName={companyName} onBack={onBack} />;
}
