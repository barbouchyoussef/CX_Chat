import { useEffect, useState } from "react";
import { ArrowLeft, Printer, FileText, HelpCircle, AlertTriangle } from "lucide-react";
import AssessmentGeneratingPage from "./assessment-generating-page";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type InterviewGuideQuestionItem = {
  question: string;
  rationale: string;
  follow_up: string;
};

type InterviewGuideQuestionGroup = {
  axis: string;
  questions: InterviewGuideQuestionItem[];
};

type InterviewGuide = {
  assessment_id: number;
  company_name: string;
  language: string;
  executive_summary: string;
  unanswered_areas: string[];
  suggested_questions: InterviewGuideQuestionGroup[];
};

type Props = {
  assessmentId: number;
  onBack: () => void;
};

export default function AdminAssessmentInterviewGuide({ assessmentId, onBack }: Props) {
  const [guide, setGuide] = useState<InterviewGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}/assessments/${assessmentId}/interview-guide`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load interview guide");
        }
        return await res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setGuide(data);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load interview guide");
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

  if (error || !guide) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error ?? "Interview guide unavailable."}
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            Back to admin
          </button>
        </div>
      </div>
    );
  }

  const isFrench = (guide.language || "").toLowerCase().startsWith("fr");
  const labels = {
    title: isFrench ? "Guide d'entretien Client" : "Client Interview Guide",
    subtitle: isFrench ? "Questions d'approfondissement sur la culture CX" : "Follow-up questions on CX culture",
    back: isFrench ? "Retour" : "Back",
    print: isFrench ? "Imprimer / PDF" : "Print / PDF",
    summary: isFrench ? "Synthèse de la conversation Orion" : "Orion Conversation Executive Summary",
    gaps: isFrench ? "Zones de flou / Non abordées" : "Unanswered Areas & Information Gaps",
    questions: isFrench ? "Questions d'entretien suggérées par axe" : "Suggested Interview Questions by Axis",
  };

  return (
    <div
      className="min-h-screen p-6 text-slate-100 font-sans print:bg-white print:text-slate-900 print:p-0"
      style={{
        background: "linear-gradient(118deg, #121318 0%, #17315f 34%, #2a29a7 68%, #491fd8 100%)",
      }}
    >
      {/* Print styles injection */}
      <style>{`
        @media print {
          body, html, div {
            background: white !important;
            color: #0f172a !important;
          }
          .no-print {
            display: none !important;
          }
          .print-card {
            border: 1px solid #cbd5e1 !important;
            background: #f8fafc !important;
            color: #0f172a !important;
            border-radius: 8px !important;
            box-shadow: none !important;
            margin-bottom: 16px !important;
            page-break-inside: avoid;
          }
          .print-header {
            color: #0f172a !important;
            margin-bottom: 24px !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-4xl">
        {/* Navigation Bar */}
        <div className="no-print mb-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 hover:border-white/30 transition-all duration-150"
          >
            <ArrowLeft className="h-4 w-4" />
            {labels.back}
          </button>
          
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-yellow-500/10 transition-all duration-150"
          >
            <Printer className="h-4 w-4" />
            {labels.print}
          </button>
        </div>

        {/* Hero Section */}
        <header className="print-header mb-8 border-b border-white/15 pb-6 print:border-slate-300">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-yellow-400 print:text-slate-800" />
            <h1 className="text-3xl font-extrabold tracking-tight">{labels.title}</h1>
          </div>
          <p className="text-white/60 text-sm font-medium tracking-wide uppercase font-mono print:text-slate-600">
            {labels.subtitle} — {guide.company_name} (#{guide.assessment_id})
          </p>
        </header>

        <div className="space-y-6">
          {/* Executive Summary Card */}
          <section className="print-card rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <h2 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2 print:text-slate-800">
              <FileText className="h-5 w-5" />
              {labels.summary}
            </h2>
            <p className="text-slate-200 text-sm leading-relaxed print:text-slate-700">
              {guide.executive_summary}
            </p>
          </section>

          {/* Gaps / Unanswered Areas Card */}
          {guide.unanswered_areas && guide.unanswered_areas.length > 0 && (
            <section className="print-card rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
              <h2 className="text-lg font-bold text-orange-400 mb-3 flex items-center gap-2 print:text-slate-800">
                <AlertTriangle className="h-5 w-5" />
                {labels.gaps}
              </h2>
              <ul className="list-disc list-inside space-y-2 text-slate-200 text-sm print:text-slate-700">
                {guide.unanswered_areas.map((gap, index) => (
                  <li key={index}>{gap}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Suggested Questions Grid */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2 print:text-slate-900 border-b border-white/10 pb-2 print:border-slate-300">
              {labels.questions}
            </h2>
            
            <div className="grid gap-6 sm:grid-cols-2">
              {guide.suggested_questions.map((group, index) => (
                <article
                  key={index}
                  className="print-card rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-md font-bold text-yellow-400 mb-4 border-b border-white/10 pb-2 print:text-slate-800 print:border-slate-300 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      {group.axis}
                    </h3>
                    <ul className="space-y-4">
                      {group.questions.map((qItem, qIdx) => (
                        <li key={qIdx} className="text-sm leading-relaxed flex flex-col gap-1 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex gap-2.5">
                            <span className="font-mono text-yellow-400 print:text-slate-500 font-bold">{qIdx + 1}.</span>
                            <span className="text-slate-100 font-semibold print:text-slate-800">{qItem.question}</span>
                          </div>
                          
                          {qItem.rationale && (
                            <div className="pl-6 mt-1 text-xs text-slate-400 print:text-slate-500 italic">
                              <strong className="not-italic text-slate-500 mr-1">{isFrench ? "Pourquoi poser cette question :" : "Why ask:"}</strong>
                              {qItem.rationale}
                            </div>
                          )}

                          {qItem.follow_up && (
                            <div className="pl-6 mt-1.5 text-xs text-yellow-300/85 print:text-slate-600 bg-white/5 print:bg-slate-100 rounded-lg p-2.5 border border-white/5 print:border-slate-200">
                              <strong className="text-yellow-400 print:text-slate-700 block mb-1 font-mono text-[9px] uppercase tracking-wider">{isFrench ? "Pointeurs de suivi d'évaluation :" : "Assessment Follow-up Pointers:"}</strong>
                              {qItem.follow_up}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
