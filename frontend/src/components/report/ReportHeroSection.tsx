import { ArrowLeft, Download } from "lucide-react";

import type { FinalReport } from "../../types/final-report";

type Props = {
  report: FinalReport;
  companyName?: string | null;
  onBack?: () => void;
};

const ORBIT_IMAGE_SRC = "/1b428a9545ed4c55816d6fd0bd7115df485a185c.png";

const axisLabel = (value?: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "Unknown";

const DEFINITIONS = {
  en: {
    basic: "This designates initial, ad-hoc practices with limited structure or consistency.",
    established: "This designates defined practices with partial adoption and growing consistency.",
    advanced: "This designates systematic, embedded practices with clear ownership and continuous improvement.",
    listen: "This axis designates the deployment of voice of customer programs, feedback channels, data collection, and metric tracking.",
    manage: "This axis defines the organizational mechanisms that make customer experience accountable: leadership attention, ownership, governance routines, decision rights, culture, and day-to-day reinforcement.",
    analyze: "This axis designates how the organization listens to customers and turns feedback into usable understanding: feedback capture, journey visibility, cross-channel consistency, pattern recognition, and issue prioritization.",
    improve: "This axis defines how the organization acts on customer pain points and measures improvement over time: execution discipline, action ownership, metric review, validation of fixes, and continuous improvement loops."
  },
  fr: {
    basic: "Ceci désigne des pratiques initiales et ad-hoc avec une structure ou une cohérence limitée.",
    established: "Ceci désigne des pratiques définies avec une adoption partielle et une cohérence croissante.",
    advanced: "Ceci désigne des pratiques systématiques et intégrées avec une responsabilité claire et une amélioration continue.",
    listen: "Cet axe désigne le déploiement des canaux d'écoute client, la collecte continue des feedbacks et le suivi des indicateurs de performance clés.",
    manage: "Cet axe définit les mécanismes organisationnels qui responsabilisent la gestion de l'expérience client : attention de la direction, gouvernance, processus de décision, culture et valorisation de l'impact client au quotidien.",
    analyze: "Cet axe désigne la manière dont l'organisation écoute ses clients et transforme les retours en compréhension exploitable : collecte des feedbacks, vision des parcours, cohérence multicanale, analyse des causes racines et priorisation.",
    improve: "Cet axe définit la manière dont l'organisation traite les points de friction client et mesure le progrès dans le temps : rigueur d'exécution, responsabilité des actions, suivi des indicateurs, validation des correctifs et amélioration continue."
  }
};

function InfoTooltip({ explanation }: { explanation: string }) {
  if (!explanation) return null;
  return (
    <span className="relative group/info inline-flex items-center ml-2.5 print:hidden select-none">
      <svg
        viewBox="0 0 24 24"
        className="h-[15px] w-[15px] text-white/35 hover:text-white/80 transition-colors duration-150 cursor-help"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      
      {/* Tooltip Card */}
      <span className="absolute bottom-full left-1/2 z-50 mb-3 w-60 -translate-x-1/2 scale-95 rounded-xl border border-white/10 bg-[#0f1117]/95 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-md opacity-0 transition-all duration-200 pointer-events-none group-hover/info:opacity-100 group-hover/info:scale-100">
        <span className="block text-left font-sans text-[0.78rem] leading-relaxed text-slate-200 font-medium normal-case tracking-normal">
          {explanation}
        </span>
        {/* Arrow */}
        <span className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r border-b border-white/10 bg-[#0f1117]/95" />
      </span>
    </span>
  );
}

function StageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <path d="m12 14 4-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StrongestIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <path d="M7 7h10v10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17 17 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PriorityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 8v8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ReportHeroSection({ report, companyName, onBack }: Props) {
  const hero = report.hero;
  const summary = report.summary;
  const resolvedCompany = companyName || hero.company_name || "Executive Report";
  const overview =
    hero.hero_message?.trim() ||
    summary.executive_summary_text?.trim() ||
    `${resolvedCompany} is currently at ${hero.overall_maturity_band} maturity. ${axisLabel(hero.strongest_axis)} is the strongest area today, while ${axisLabel(hero.priority_axis)} needs the most attention next.`;

  const isFrench = overview.toLowerCase().includes("démontre") || overview.toLowerCase().includes("est") || overview.toLowerCase().includes("les");

  // Explanations for the tooltips
  const bandKey = (hero.overall_maturity_band || "").toLowerCase().trim();
  const maturityExplanation = 
    bandKey.includes("basic") || bandKey.includes("initial") || bandKey.includes("basique")
      ? (isFrench ? DEFINITIONS.fr.basic : DEFINITIONS.en.basic)
      : bandKey.includes("advanced") || bandKey.includes("avancé")
      ? (isFrench ? DEFINITIONS.fr.advanced : DEFINITIONS.en.advanced)
      : (isFrench ? DEFINITIONS.fr.established : DEFINITIONS.en.established);

  const getAxisExplanation = (axisName?: string | null) => {
    if (!axisName) return "";
    const key = axisName.toLowerCase().trim();
    if (key.includes("listen") || key.includes("écouter")) {
      return isFrench ? DEFINITIONS.fr.listen : DEFINITIONS.en.listen;
    }
    if (key.includes("analyze") || key.includes("analyser")) {
      return isFrench ? DEFINITIONS.fr.analyze : DEFINITIONS.en.analyze;
    }
    if (key.includes("manage") || key.includes("gérer")) {
      return isFrench ? DEFINITIONS.fr.manage : DEFINITIONS.en.manage;
    }
    if (key.includes("improve") || key.includes("améliorer")) {
      return isFrench ? DEFINITIONS.fr.improve : DEFINITIONS.en.improve;
    }
    return "";
  };

  const strongestExplanation = getAxisExplanation(hero.strongest_axis);
  const priorityExplanation = getAxisExplanation(hero.priority_axis);

  const overallLevelNum = hero.overall_level || 2;
  const overallMaturityBandLower = (hero.overall_maturity_band || "Established").toLowerCase();
  
  const stageLabelText = isFrench
    ? `Sur l'échelle de 3 niveaux de maturité, vous êtes au niveau ${overallLevelNum} ${overallMaturityBandLower}`
    : `On the 3-level maturity scale, you are at level ${overallLevelNum} ${overallMaturityBandLower}`;

  const strongestLabelText = isFrench
    ? "C'est l'axe le plus fort selon vos réponses"
    : "This is the strongest axis according to your answers";

  const priorityLabelText = isFrench
    ? "C'est l'axe le plus prioritaire à traiter selon vos réponses"
    : "This is the highest priority axis to address according to your answers";

  return (
    <section className="relative overflow-hidden px-3 py-4 text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8 print:px-0 print:py-0 print:text-black">
      <div className="pointer-events-none absolute inset-0 opacity-60 print:hidden">
        <div className="absolute left-[18%] top-[28%] h-24 w-24 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute left-[36%] top-[82%] h-20 w-20 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute -right-[18px] top-[-82px] h-[420px] w-[420px] rounded-full border border-white/15 opacity-35 print:hidden" />
      <div className="pointer-events-none absolute right-[86px] top-7 h-[250px] w-[250px] rounded-full border border-white/15 opacity-20 print:hidden" />
      <div className="pointer-events-none absolute bottom-[92px] left-[-178px] h-[460px] w-[460px] rounded-full border border-white/15 opacity-20 print:hidden" />

      <div className="relative z-10 mx-auto grid min-h-[760px] w-full max-w-[1320px] gap-7 px-4 pb-5 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)] lg:gap-7 lg:px-11 lg:pb-6 lg:pt-12 print:min-h-0 print:px-0 print:pt-0">
        <div className="min-w-0 pt-16 lg:pt-2">
          <div className="absolute right-0 top-0 z-20 flex flex-wrap items-center justify-end gap-3 print:hidden">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4 py-3 text-sm font-semibold text-white/92 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/12"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffd447,rgba(255,255,255,0.94))] px-[18px] py-[13px] text-sm font-bold text-[#111318] shadow-[0_16px_28px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>

          <div className="mb-7 inline-flex w-fit items-center rounded-full border border-white/12 bg-white/6 px-[16px] py-[8px] font-sans text-xs normal-case tracking-wide text-white/88 backdrop-blur-xl print:border-black/15 print:bg-transparent print:text-black/70">
            <span>
              {isFrench
                ? "Ce rapport est généré sur la base des réponses de la conversation et des informations fournies"
                : "This report is generated based on the conversation replies and information provided"}
            </span>
          </div>

          <h1 className="max-w-[10ch] text-[clamp(3.8rem,7vw,6rem)] font-extrabold leading-[0.92] tracking-[-0.075em] text-white print:text-black">
            {resolvedCompany}
          </h1>

          <p className="mt-4 text-base tracking-[0.01em] text-white/60 print:text-black/60">
            <span>{hero.sector_name || "Customer Experience"}</span>
            {(hero.sector_name || hero.region) ? <span aria-hidden="true"> · </span> : null}
            <span>{hero.region || "Global"}</span>
          </p>

          {(() => {
            const sentences = overview
              .split(/[.!?]\s+/)
              .map(s => s.trim())
              .filter(s => s.length > 3)
              .map(s => s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.');

            const formatSentence = (s: string) => {
              const words = s.split(/\s+/);
              const boldCount = Math.min(4, words.length);
              const boldPart = words.slice(0, boldCount).join(" ");
              const restPart = words.slice(boldCount).join(" ");
              return { boldPart, restPart };
            };

            return (
              <>
                {/* Web View: Structured Ticks without Cards */}
                <div className="mt-7 max-w-[58ch] space-y-4 print:hidden">
                  {sentences.map((sentence, idx) => {
                    const { boldPart, restPart } = formatSentence(sentence);
                    return (
                      <div key={idx} className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 mt-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 transition-all duration-200 group-hover:scale-110 group-hover:bg-emerald-500/25 group-hover:border-emerald-500/40">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-2.5 w-2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <p className="text-[1.02rem] leading-[1.68] text-slate-200 transition-colors duration-200 group-hover:text-white">
                          <strong className="font-bold text-white transition-colors duration-200">{boldPart}</strong>{" "}
                          {restPart}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Print View: Standard Paragraphs */}
                <div className="hidden print:block mt-6 max-w-[58ch]">
                  {sentences.map((sentence, idx) => (
                    <p key={idx} className="text-[1.02rem] leading-[1.72] text-black/80 mb-2">
                      {sentence}
                    </p>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        <div className="relative min-h-[440px] lg:min-h-[560px] print:hidden">
          <img
            className="pointer-events-none absolute right-[-12px] top-[-100px] z-10 w-full max-w-[560px] rotate-[-2deg] select-none drop-shadow-[0_28px_48px_rgba(0,0,0,0.28)] drop-shadow-[0_0_34px_rgba(255,255,255,0.08)]"
            src={ORBIT_IMAGE_SRC}
            alt=""
          />
        </div>

        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-3 print:break-inside-avoid">
          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#ffd447_0%,#c8973f_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <StageIcon />
              </div>
              <p className="font-sans text-[0.92rem] font-extrabold uppercase tracking-[0.08em] text-white/90 print:text-black/85">Actual Stage</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white print:text-black flex items-center">
                <span>{hero.overall_maturity_band}</span>
                <InfoTooltip explanation={maturityExplanation} />
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-white/70 print:text-black/60">{stageLabelText}</p>
            </div>
          </article>

          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#85eaff_0%,#00d4ff_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <StrongestIcon />
              </div>
              <p className="font-sans text-[0.92rem] font-extrabold uppercase tracking-[0.08em] text-white/90 print:text-black/85">Strongest Axis</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white print:text-black flex items-center">
                <span>{axisLabel(hero.strongest_axis)}</span>
                <InfoTooltip explanation={strongestExplanation} />
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-white/70 print:text-black/60">{strongestLabelText}</p>
            </div>
          </article>

          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#7c5cff_0%,#4d22df_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <PriorityIcon />
              </div>
              <p className="font-sans text-[0.92rem] font-extrabold uppercase tracking-[0.08em] text-white/90 print:text-black/85">Priority Axis</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-[#ffe4eb] print:text-black flex items-center">
                <span>{axisLabel(hero.priority_axis)}</span>
                <InfoTooltip explanation={priorityExplanation} />
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-white/70 print:text-black/60">{priorityLabelText}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
