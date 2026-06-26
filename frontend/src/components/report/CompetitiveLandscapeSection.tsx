import { useState, useEffect } from "react";
import type { FinalReportCompetitiveStage } from "../../types/final-report";

type Props = {
  competitiveLandscape: FinalReportCompetitiveStage[];
};


const MATURITY_CARDS = {
  en: {
    1: {
      title: "Basic",
      desc: "Things happen, but informally, without a defined process or clear ownership.",
      tooltip: "Things happen, but informally, without a defined process or clear ownership."
    },
    2: {
      title: "Established",
      desc: "A defined process exists with some accountability and tooling, but it isn't fully optimized or consistently applied everywhere.",
      tooltip: "A defined process exists with some accountability and tooling, but it isn't fully optimized or consistently applied everywhere."
    },
    3: {
      title: "Advanced",
      desc: "The practice is mature, consistently executed, and continuously improved as part of how the organization works.",
      tooltip: "The practice is mature, consistently executed, and continuously improved as part of how the organization works."
    },
    yourPosition: "Your position"
  },
  fr: {
    1: {
      title: "Basique",
      desc: "Les choses se font, mais de manière informelle, sans processus défini ni responsabilité claire.",
      tooltip: "Les choses se font, mais de manière informelle, sans processus défini ni responsabilité claire."
    },
    2: {
      title: "Intermédiaire",
      desc: "Un processus défini existe avec une certaine responsabilité et des outils, mais il n'est pas pleinement optimisé ni appliqué de manière cohérente partout.",
      tooltip: "Un processus défini existe avec une certaine responsabilité et des outils, mais il n'est pas pleinement optimisé ni appliqué de manière cohérente partout."
    },
    3: {
      title: "Avancé",
      desc: "La pratique est mature, exécutée de manière cohérente et améliorée en continu dans le cadre du fonctionnement de l'organisation.",
      tooltip: "La pratique est mature, exécutée de manière cohérente et améliorée en continu dans le cadre du fonctionnement de l'organisation."
    },
    yourPosition: "Votre position"
  }
};

function CompetitorChip({
  competitor,
  stageLevel,
  isSelected,
  onClick,
}: {
  competitor: {
    key: string;
    company_name: string;
    stage_level: number;
    logo_url?: string | null;
    is_you?: boolean;
  };
  stageLevel: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[110px] w-full rounded-[20px] border px-[18px] py-4 text-left transition-all ${
        isSelected
          ? "border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] transform -translate-y-0.5 shadow-none"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
      } ${
        competitor.is_you
          ? "border-[rgba(255,212,71,0.28)] bg-[linear-gradient(180deg,rgba(255,212,71,0.12),rgba(255,255,255,0.03))]"
          : ""
      } backdrop-blur-[10px]`}
      data-stage-id={stageLevel}
      data-competitor={competitor.key}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[1.12rem] font-bold leading-tight tracking-[-0.02em] text-white">
          {competitor.is_you ? competitor.company_name.toUpperCase() : competitor.company_name}
        </p>
      </div>
      {competitor.is_you && (
        <p className="m-0 mt-2 text-[0.92rem] leading-[1.5] text-white/62">
          Your company is here
        </p>
      )}
    </button>
  );
}

function CompetitorDrawer({
  stageName,
  stageLevel,
  competitors,
  selectedCompetitorKey,
}: {
  stageName: string;
  stageLevel: number;
  competitors: Array<{ key: string; company_name: string; note?: string | null }>;
  selectedCompetitorKey: string;
}) {
  const selectedCompetitor = competitors.find((c) => c.key === selectedCompetitorKey);

  return (
    <div
      className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-[22px] backdrop-blur-[10px]"
      data-drawer={stageLevel}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h4 className="m-0 text-[1.25rem] font-bold tracking-[-0.03em] text-white">
          {selectedCompetitor?.company_name || stageName}
        </h4>
      </div>
      <p className="m-0 mb-3 font-mono text-[0.72rem] uppercase tracking-[0.15em] text-white/54">
        Why they're at this stage
      </p>
      <div className="flex flex-col gap-3">
        {selectedCompetitor?.note ? (
          <div className="relative flex items-start gap-3 text-[0.94rem] leading-[1.55] text-white/82">
            <div
              className="relative mt-0.5 flex-shrink-0"
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "999px",
                background: "rgba(133, 234, 255, 0.12)",
                border: "1px solid rgba(133, 234, 255, 0.26)",
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
              }}
            >
              <div
                style={{
                  content: '""',
                  position: "absolute",
                  width: "8px",
                  height: "4px",
                  borderLeft: "2px solid #85eaff",
                  borderBottom: "2px solid #85eaff",
                  left: "5px",
                  top: "6px",
                  transform: "rotate(-45deg)",
                }}
              />
            </div>
            <p className="m-0">{selectedCompetitor.note}</p>
          </div>
        ) : (
          <p className="m-0 text-white/60 italic">No additional information available.</p>
        )}
      </div>
    </div>
  );
}

export default function CompetitiveLandscapeSection({ competitiveLandscape }: Props) {
  const [currentStageIndex, setCurrentStageIndex] = useState(1); // Default to stage 2 (Established)
  const [selectedCompetitorKey, setSelectedCompetitorKey] = useState<string>("");

  const isFrench = competitiveLandscape.some(s => 
    s.label.toLowerCase().includes("établi") || 
    s.label.toLowerCase().includes("basique") || 
    s.label.toLowerCase().includes("avancé") || 
    s.label.toLowerCase().includes("intermédiaire") ||
    s.competitors.some(c => c.note && (c.note.toLowerCase().includes("est") || c.note.toLowerCase().includes("les") || c.note.toLowerCase().includes("démontre")))
  );
  
  const labels = isFrench ? MATURITY_CARDS.fr : MATURITY_CARDS.en;

  const userStageLevel = competitiveLandscape.find(stage => 
    stage.competitors.some(c => c.is_you)
  )?.level || 1;

  // Initialize with default competitor for the current stage
  useEffect(() => {
    const stage = competitiveLandscape.find((s) => s.level === currentStageIndex);
    if (stage && stage.competitors.length > 0) {
      const defaultCompetitor = stage.competitors.find((c) => c.is_you) || stage.competitors[0];
      setSelectedCompetitorKey(defaultCompetitor.key);
    }
  }, [currentStageIndex, competitiveLandscape]);

  const handleStageClick = (stageLevel: number) => {
    setCurrentStageIndex(stageLevel);
  };

  const handleCompetitorClick = (competitorKey: string) => {
    setSelectedCompetitorKey(competitorKey);
  };

  // Get current stage data
  const currentStage = competitiveLandscape.find((s) => s.level === currentStageIndex);

  if (!currentStage) {
    // Render empty state if no competitive landscape data
    return (
      <section
        className="relative px-6 py-8 text-white sm:px-6 lg:px-10 lg:py-12"
        style={{
          background:
            "radial-gradient(circle at 76% 12%, rgba(239, 202, 222, 0.92), rgba(239, 202, 222, 0.16) 24%, transparent 44%), radial-gradient(circle at 84% 82%, rgba(116, 38, 255, 0.56), transparent 28%), linear-gradient(118deg, #121318 0%, #17315f 34%, #2a29a7 68%, #491fd8 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-[110px] bottom-[140px] h-[320px] w-[320px] rounded-full border border-white/13 opacity-12" />
          <div className="absolute -right-[52px] top-[-52px] h-[300px] w-[300px] rounded-full border border-white/13 opacity-28" />
          <div className="absolute right-[84px] top-[10px] h-[180px] w-[180px] rounded-full border border-white/13 opacity-18" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-9">
          <div className="mb-6 flex items-center gap-4 sm:gap-4">
            <span className="font-mono text-[0.78rem] uppercase tracking-[0.22em] text-white/50">
              02
            </span>
            <h2 className="m-0 text-[clamp(1.5rem,3vw,2.05rem)] font-bold leading-[1.08] tracking-[-0.04em] text-white">
              Where You Stand — Competitive Landscape
            </h2>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-7 shadow-[0_24px_72px_rgba(0,0,0,0.28)] backdrop-blur-[12px]">
            <p className="m-0 text-center text-white/60">
              Competitive landscape data is being prepared. Check back soon.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative px-6 py-8 text-white sm:px-6 lg:px-10 lg:py-12"
      style={{
        background:
          "radial-gradient(circle at 76% 12%, rgba(239, 202, 222, 0.92), rgba(239, 202, 222, 0.16) 24%, transparent 44%), radial-gradient(circle at 84% 82%, rgba(116, 38, 255, 0.56), transparent 28%), linear-gradient(118deg, #121318 0%, #17315f 34%, #2a29a7 68%, #491fd8 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[110px] bottom-[140px] h-[320px] w-[320px] rounded-full border border-white/13 opacity-12" />
        <div className="absolute -right-[52px] top-[-52px] h-[300px] w-[300px] rounded-full border border-white/13 opacity-28" />
        <div className="absolute right-[84px] top-[10px] h-[180px] w-[180px] rounded-full border border-white/13 opacity-18" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-9">
        <div className="mb-6 flex items-center gap-4 sm:gap-4">
          <span className="font-mono text-[0.78rem] uppercase tracking-[0.22em] text-white/50">
            02
          </span>
          <h2 className="m-0 text-[clamp(1.5rem,3vw,2.05rem)] font-bold leading-[1.08] tracking-[-0.04em] text-white">
            Where You Stand — Competitive Landscape
          </h2>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-7 shadow-[0_24px_72px_rgba(0,0,0,0.28)] backdrop-blur-[12px]">
          {/* Maturity Stage Selection Cards */}
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((stage) => {
                const isSelected = currentStageIndex === stage;
                const isUserStage = stage === userStageLevel;
                const stageData = labels[stage as 1 | 2 | 3];
                
                let activeBorderClass = "border-white/6 bg-white/[0.02] hover:bg-white/[0.04]";
                let circleBg = "bg-white/10 text-white/90";
                
                if (isSelected) {
                  if (stage === 1) {
                    activeBorderClass = "border-amber-500/40 bg-amber-500/[0.03] shadow-[0_12px_36px_rgba(245,158,11,0.1)]";
                    circleBg = "bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)]";
                  } else if (stage === 2) {
                    activeBorderClass = "border-emerald-500/40 bg-emerald-500/[0.03] shadow-[0_12px_36px_rgba(16,185,129,0.1)]";
                    circleBg = "bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.3)]";
                  } else {
                    activeBorderClass = "border-violet-500/40 bg-violet-500/[0.03] shadow-[0_12px_36px_rgba(139,92,246,0.1)]";
                    circleBg = "bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]";
                  }
                }
                
                return (
                  <div
                    key={stage}
                    onClick={() => handleStageClick(stage)}
                    className={`relative flex flex-col items-center p-6 rounded-[22px] border backdrop-blur-md cursor-pointer transition-all duration-300 ${activeBorderClass} group`}
                  >
                    {isUserStage && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-slate-950 font-sans text-[0.68rem] font-black uppercase tracking-wider shadow-[0_4px_12px_rgba(245,158,11,0.4)] z-20 select-none">
                        {labels.yourPosition}
                      </div>
                    )}
                    
                    {/* Circle Number */}
                    <div className={`flex h-11 w-11 items-center justify-center rounded-full font-bold text-[1.1rem] transition-all duration-300 ${circleBg}`}>
                      {stage}
                    </div>
                    
                    {/* Title & Info Icon */}
                    <div className="mt-4 flex items-center justify-center">
                      <span className="font-sans text-[1.15rem] font-bold text-white leading-none">
                        {stageData.title}
                      </span>
                      
                      {/* Encircled Info Tooltip */}
                      <span className="relative group/info inline-flex items-center ml-2 print:hidden select-none">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-[14px] w-[14px] text-white/40 hover:text-white/80 transition-colors duration-150 cursor-help"
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
                        
                        <span className="absolute bottom-full left-1/2 z-50 mb-3.5 w-80 -translate-x-1/2 scale-95 rounded-xl border border-white/10 bg-[#0f1117]/95 p-4 shadow-2xl backdrop-blur-md opacity-0 transition-all duration-200 pointer-events-none group-hover/info:opacity-100 group-hover/info:scale-100">
                          <span className="block text-left font-sans text-[0.92rem] leading-relaxed text-slate-200 font-medium normal-case tracking-normal">
                            {stageData.tooltip}
                          </span>
                          <span className="absolute top-full left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[6px] rotate-45 border-r border-b border-white/10 bg-[#0f1117]/95" />
                        </span>
                      </span>
                    </div>
                    
                    {/* Short Description */}
                    <p className="mt-3.5 mb-0 text-center text-[0.92rem] leading-relaxed text-slate-300 font-normal group-hover:text-white transition-colors duration-200">
                      {stageData.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Competitor Chips */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {currentStage.competitors.map((competitor) => (
              <CompetitorChip
                key={competitor.key}
                competitor={competitor}
                stageLevel={currentStageIndex}
                isSelected={selectedCompetitorKey === competitor.key}
                onClick={() => handleCompetitorClick(competitor.key)}
              />
            ))}
          </div>

          {/* Competitor Drawer */}
          {selectedCompetitorKey && (
            <CompetitorDrawer
              stageName={currentStage.label}
              stageLevel={currentStageIndex}
              competitors={currentStage.competitors.map((c) => ({
                key: c.key,
                company_name: c.is_you ? c.company_name.toUpperCase() : c.company_name,
                note: c.note,
              }))}
              selectedCompetitorKey={selectedCompetitorKey}
            />
          )}
        </div>
      </div>
    </section>
  );
}
