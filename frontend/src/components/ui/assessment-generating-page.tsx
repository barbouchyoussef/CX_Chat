import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const resultsLoadingSteps = [
  "Consolidating evidence across your CX capabilities",
  "Scoring maturity by axis and surfacing key strengths",
  "Preparing your business-prioritized action plan",
];

type Props = {
  onDone?: () => void;
  mode?: "client" | "admin";
  onBack?: () => void;
};

export default function AssessmentGeneratingPage({ onDone, mode = "client", onBack }: Props) {
  const [progress, setProgress] = useState(20);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 3, 96));
    }, 130);

    const stepTimer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, resultsLoadingSteps.length - 1));
    }, 780);

    const doneTimer = onDone
      ? window.setTimeout(() => {
          setProgress(100);
          onDone();
        }, 2600)
      : null;

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(stepTimer);
      if (doneTimer !== null) window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F8FA] px-6 py-12 text-[#111827]">
      <style>{`
        @keyframes resultOrbPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes orbitSpin { to { transform: rotate(360deg); } }
        @keyframes softFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe-orbit, .motion-safe-pulse, .motion-safe-float { animation: none !important; }
        }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(56,88,233,0.15),transparent_34%),linear-gradient(135deg,rgba(214,244,237,0.65),rgba(255,240,230,0.72)_55%,rgba(255,255,255,0.95))]" />
      <div className="absolute left-[-10%] top-[10%] h-72 w-72 rounded-full bg-[#BFE4C6]/35 blur-3xl" />
      <div className="absolute bottom-[-12%] right-[-8%] h-96 w-96 rounded-full bg-[#F0DFAC]/50 blur-3xl" />

      <section className="relative z-10 mx-auto w-full max-w-5xl px-2 text-center">
        {mode === "admin" && onBack ? (
          <div className="mb-6 flex justify-start">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to history
            </button>
          </div>
        ) : null}

        <div className="relative mx-auto mb-8 h-44 w-44 motion-safe-float" style={{ animation: "softFloat 4s ease-in-out infinite" }}>
          <div className="absolute inset-0 rounded-full border border-[#3858E9]/15" />
          <div className="absolute inset-5 rounded-full border border-[#3858E9]/20 motion-safe-orbit" style={{ animation: "orbitSpin 6s linear infinite" }}>
            <span className="absolute right-2 top-5 h-3 w-3 rounded-full bg-[#3858E9]" />
            <span className="absolute bottom-6 left-3 h-2 w-2 rounded-full bg-[#C5A04F]" />
          </div>
          <div className="absolute inset-12 rounded-full bg-white shadow-[0_24px_60px_rgba(17,24,39,0.18)]" />
          <div className="absolute inset-[4.65rem] rounded-full bg-[radial-gradient(circle,#6C45FF_0%,#5135D8_60%,#3858E9_100%)] shadow-[0_0_44px_rgba(81,53,216,0.42)] motion-safe-pulse" style={{ animation: "resultOrbPulse 2.2s ease-in-out infinite" }} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#C5A04F]">
          {mode === "admin" ? "Client report preview in progress" : "Maturity synthesis in progress"}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-[#111827] md:text-6xl">
          {mode === "admin" ? "Preparing client executive report..." : "Generating your CX maturity results..."}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#667085]">
          {mode === "admin"
            ? "We are assembling scored insights, benchmark signals, and recommendation priorities for consultant review."
            : "We are turning your responses into a leadership-ready report with axis maturity, top strengths, pain points, and prioritized actions."}
        </p>

        <div className="mx-auto mt-10 max-w-2xl text-left">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-[#667085]">
            <span>{mode === "admin" ? "Client report preparation" : "Executive report preparation"}</span>
            <span className="text-[#3858E9]">{progress}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#3858E9,#6C45FF,#C5A04F)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 text-sm text-[#667085] sm:grid-cols-3">
            {resultsLoadingSteps.map((step, index) => (
              <div
                key={step}
                className={`rounded-2xl border px-4 py-3 ${
                  index <= stepIndex
                    ? "border-[#C5A04F]/50 bg-white text-[#111827] shadow-[0_12px_28px_rgba(17,24,39,0.06)]"
                    : "border-white/70 bg-white/45"
                }`}
              >
                <span className="mr-2 text-[#C5A04F]">•</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
