import { useState, useEffect } from "react";
import type { FinalReportCompetitiveStage } from "../../types/final-report";

type Props = {
  competitiveLandscape: FinalReportCompetitiveStage[];
};

const STAGE_TONE_MAP: Record<number, { color: string; gradient: string }> = {
  1: {
    color: "gold",
    gradient: "linear-gradient(135deg, #ffd447 0%, #c8973f 100%)",
  },
  2: {
    color: "cyan",
    gradient: "linear-gradient(135deg, #85eaff 0%, #00d4ff 100%)",
  },
  3: {
    color: "violet",
    gradient: "linear-gradient(135deg, #9f93ff 0%, #4d22df 100%)",
  },
};

const STAGE_LABEL_MAP: Record<number, string> = {
  1: "Basic",
  2: "Established",
  3: "Advanced",
};

function StepButton({
  step,
  label,
  isActive,
  tone,
  onClick,
}: {
  step: number;
  label: string;
  isActive: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 flex flex-col items-center gap-3 px-1 pb-5 pt-0 ${
        isActive ? "pointer-events-none" : ""
      }`}
      data-step={step}
      data-tone={tone}
      aria-disabled={true}
      tabIndex={-1}
    >
      <span
        className={`grid h-12 w-12 place-items-center rounded-full border font-bold text-white transition-all ${
          isActive
            ? `border-transparent text-[#111318] shadow-[0_12px_26px_rgba(0,0,0,0.28)]`
            : "border-white/12 bg-white/6 text-white/90"
        }`}
        style={{
          background: isActive ? STAGE_TONE_MAP[step]?.gradient : "rgba(255, 255, 255, 0.06)",
          boxShadow: isActive
            ? tone === "gold"
              ? "0 12px 26px rgba(200, 151, 63, 0.28)"
              : tone === "cyan"
                ? "0 12px 26px rgba(0, 212, 255, 0.24)"
                : "0 12px 26px rgba(77, 34, 223, 0.26)"
            : "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        {step}
      </span>
      <div className="text-center">
        <p className="m-0 text-[1rem] font-semibold leading-[1.1] text-white/92">{label}</p>
      </div>
    </button>
  );
}

function Connector({ index, activatedUpTo }: { index: number; activatedUpTo: number }) {
  const isCompleted = activatedUpTo > index + 1;

  return (
    <div
      className="relative top-0 h-0.5 w-full self-start rounded-full"
      style={{
        background: "linear-gradient(90deg, rgba(255, 212, 71, 0.28), rgba(133, 234, 255, 0.22))",
        marginTop: "23px",
        overflow: "hidden",
      }}
    >
      <div
        className="absolute inset-0 rounded-full transition-all"
        style={{
          width: isCompleted ? "100%" : "0%",
          background:
            activatedUpTo === 1
              ? "linear-gradient(90deg, #ffd447, #c8973f)"
              : activatedUpTo === 2
                ? "linear-gradient(90deg, #85eaff, #00d4ff)"
                : "linear-gradient(90deg, #9f93ff, #4d22df)",
          transitionDuration: "320ms",
          transitionTimingFunction: "ease",
        }}
      />
    </div>
  );
}

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
          {competitor.company_name}
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
          {/* Stepper */}
          <div className="mb-6">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(56px,1fr)_minmax(0,1fr)_minmax(56px,1fr)_minmax(0,1fr)] gap-0 rounded-[24px] border border-white/6 bg-white/[0.025] px-[22px] pb-0 pt-[22px]">
              {[1, 2, 3].map((stage) => (
                <div key={stage}>
                  {stage > 1 && (
                    <Connector
                      index={stage - 2}
                      activatedUpTo={currentStageIndex}
                    />
                  )}
                  <div className="flex justify-center">
                    <StepButton
                      step={stage}
                      label={STAGE_LABEL_MAP[stage]}
                      isActive={currentStageIndex === stage}
                      tone={STAGE_TONE_MAP[stage]?.color || "gold"}
                      onClick={() => handleStageClick(stage)}
                    />
                  </div>
                </div>
              ))}
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
                company_name: c.company_name,
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
