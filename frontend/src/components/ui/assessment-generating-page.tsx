import { useEffect, useState } from "react";

const resultsLoadingSteps = [
  "Consolidating evidence across your CX capabilities",
  "Scoring maturity by axis and surfacing key strengths",
  "Preparing your business-prioritized action plan",
];

type Props = {
  onDone: () => void;
};

export default function AssessmentGeneratingPage({ onDone }: Props) {
  const [progress, setProgress] = useState(22);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 3, 97));
    }, 120);

    const stepTimer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, resultsLoadingSteps.length - 1));
    }, 680);

    const redirectTimer = window.setTimeout(() => {
      setProgress(100);
      onDone();
    }, 2300);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(stepTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [onDone]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F8FA] px-6 py-12 text-[#111827]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(56,88,233,0.15),transparent_34%),linear-gradient(135deg,rgba(214,244,237,0.65),rgba(255,240,230,0.72)_55%,rgba(255,255,255,0.95))]" />
      <section className="relative z-10 mx-auto w-full max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#C5A04F]">Finalizing your executive CX report</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-[#111827] md:text-6xl">
          Your CX diagnostic is being prepared...
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#667085]">
          We are turning your answers into a clear leadership view: maturity by axis, priority risks, and high-impact next actions.
        </p>

        <div className="mx-auto mt-12 max-w-xl text-left">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-[#667085]">
            <span>Executive summary preparation</span>
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
                <span className="mr-2 text-[#C5A04F]">-</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
