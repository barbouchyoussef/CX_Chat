import { useEffect, useMemo, useState } from "react";
import type { FinalReportHero, FinalReportWorkingMissingAxis, FinalReportWorkingMissingItem } from "../../types/final-report";
import { capabilityLinks } from "../../config/capabilityLinks";

type Props = {
  hero: FinalReportHero;
  axes: FinalReportWorkingMissingAxis[];
  language?: string | null;
};

type ModalState = {
  item: FinalReportWorkingMissingItem;
  status: "working" | "missing";
  axisLabel: string;
} | null;

const MATURITY_CARDS = {
  en: {
    1: {
      title: "Basic",
      desc: "Things happen, but informally, without a defined process or clear ownership.",
      tooltip: ""
    },
    2: {
      title: "Established",
      desc: "A defined process exists with some accountability and tooling, but it isn't fully optimized or consistently applied everywhere.",
      tooltip: ""
    },
    3: {
      title: "Advanced",
      desc: "The practice is mature, consistently executed, and continuously improved as part of how the organization works.",
      tooltip: ""
    },
    yourPosition: "Your position"
  },
  fr: {
    1: {
      title: "Basique",
      desc: "Les choses se font, mais de manière informelle, sans processus défini ni responsabilité claire.",
      tooltip: ""
    },
    2: {
      title: "Intermédiaire",
      desc: "Un processus défini existe avec une certaine responsabilité et des outils, mais il n'est pas pleinement optimisé ni appliqué de manière cohérente partout.",
      tooltip: ""
    },
    3: {
      title: "Avancé",
      desc: "La pratique est mature, exécutée de manière cohérente et améliorée en continu dans le cadre du fonctionnement de l'organisation.",
      tooltip: ""
    },
    yourPosition: "Votre position"
  }
};

const getMaturityBandDisplayName = (band?: string | null, isFr?: boolean) => {
  if (!band) return "";
  if (!isFr) return band;
  const key = band.toLowerCase().trim();
  if (key === "basic") return "Basique";
  if (key === "established") return "Établi";
  if (key === "advanced") return "Avancé";
  return band;
};

const SECTION_STYLES = `
  .report-orbit-shell {
    position: relative;
    isolation: isolate;
  }
  .report-orbit-shell .hero-glow-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.6;
  }
  .report-orbit-shell .hero-glow-a,
  .report-orbit-shell .hero-glow-b {
    position: absolute;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    filter: blur(48px);
  }
  .report-orbit-shell .hero-glow-a {
    left: 18%;
    top: 28%;
    width: 96px;
    height: 96px;
  }
  .report-orbit-shell .hero-glow-b {
    left: 36%;
    top: 82%;
    width: 80px;
    height: 80px;
    background: rgba(255, 255, 255, 0.05);
  }
  .report-orbit-shell .section {
    position: relative;
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 34px 36px 28px;
    isolation: isolate;
  }
  .report-orbit-shell .orbital-ring,
  .report-orbit-shell .orbital-ring-small,
  .report-orbit-shell .orbital-ring-left {
    position: absolute;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    pointer-events: none;
  }
  .report-orbit-shell .orbital-ring {
    top: -52px;
    right: 22px;
    width: 300px;
    height: 300px;
    opacity: 0.28;
  }
  .report-orbit-shell .orbital-ring-small {
    top: 10px;
    right: 84px;
    width: 180px;
    height: 180px;
    opacity: 0.18;
  }
  .report-orbit-shell .orbital-ring-left {
    left: -110px;
    bottom: 140px;
    width: 320px;
    height: 320px;
    opacity: 0.12;
  }
  .report-orbit-shell .section-head {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  .report-orbit-shell .section-number {
    font-family: "Geist Mono", monospace;
    font-size: 0.78rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }
  .report-orbit-shell .section-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2.05rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: #fff;
  }
  .report-orbit-shell .panel-inner {
    position: relative;
    z-index: 2;
    padding: 0;
  }
  .report-orbit-shell .panel {
    position: relative;
    z-index: 2;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025));
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    overflow: hidden;
  }
  .report-orbit-shell .panel .panel-inner {
    padding: 28px 28px 24px;
  }
  .report-orbit-shell .stepper-shell {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .report-orbit-shell .stepper-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(56px, 1fr) minmax(0, 1fr) minmax(56px, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 0;
    padding: 22px 22px 0;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.06);
    width: 100%;
    margin: 0;
  }
  .report-orbit-shell .step-wrap {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-width: 0;
    max-width: none;
  }
  .report-orbit-shell .step-button {
    position: relative;
    z-index: 2;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: default;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 132px;
    min-width: 0;
    padding: 0 4px 20px;
    font: inherit;
    pointer-events: none;
  }
  .report-orbit-shell .step-badge {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    transition: transform 220ms ease, box-shadow 220ms ease, background 220ms ease;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .report-orbit-shell .step-button.active .step-badge {
    transform: translateY(-2px);
  }
  .report-orbit-shell .step-button[data-tone="gold"].active .step-badge {
    background: linear-gradient(135deg, #ffd447 0%, #c8973f 100%);
    color: #fff;
    box-shadow: 0 12px 26px rgba(200, 151, 63, 0.28);
  }
  .report-orbit-shell .step-button[data-tone="cyan"].active .step-badge {
    background: linear-gradient(135deg, #85eaff 0%, #00d4ff 100%);
    color: #fff;
    box-shadow: 0 12px 26px rgba(0, 212, 255, 0.24);
  }
  .report-orbit-shell .step-button[data-tone="violet"].active .step-badge {
    background: linear-gradient(135deg, #9f93ff 0%, #4d22df 100%);
    color: #fff;
    box-shadow: 0 12px 26px rgba(77, 34, 223, 0.26);
  }
  .report-orbit-shell .step-labels {
    text-align: center;
    min-width: 0;
  }
  .report-orbit-shell .step-name {
    margin: 4px 0 0;
    font-size: 1rem;
    line-height: 1.1;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
  }
  .report-orbit-shell .connector {
    position: relative;
    align-self: start;
    margin-top: 23px;
    height: 2px;
    width: 100%;
    background: linear-gradient(90deg, rgba(255, 212, 71, 0.28), rgba(133, 234, 255, 0.22));
    border-radius: 999px;
    overflow: hidden;
  }
  .report-orbit-shell .connector-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0;
    border-radius: inherit;
    opacity: 0.95;
    transition: width 320ms ease, background 320ms ease;
  }
  .report-orbit-shell .axis-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 22px;
  }
  .report-orbit-shell .axis-tab {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 22px;
    padding: 18px 18px 16px;
    text-align: left;
    color: #fff;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.035);
    transition: transform 220ms ease, border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
  }
  .report-orbit-shell .axis-tab:hover,
  .report-orbit-shell .axis-tab.active {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
  }
  .report-orbit-shell .axis-tab[data-axis="manage"].active {
    background: linear-gradient(135deg, rgba(255, 212, 71, 0.2), rgba(200, 151, 63, 0.14));
  }
  .report-orbit-shell .axis-tab[data-axis="analyze"].active {
    background: linear-gradient(135deg, rgba(133, 234, 255, 0.2), rgba(0, 212, 255, 0.14));
  }
  .report-orbit-shell .axis-tab[data-axis="improve"].active {
    background: linear-gradient(135deg, rgba(159, 147, 255, 0.22), rgba(77, 34, 223, 0.16));
  }
  .report-orbit-shell .axis-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.54);
  }
  .report-orbit-shell .axis-name {
    margin: 0;
    font-size: 1.06rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .report-orbit-shell .axis-mini {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.66);
    font-size: 0.92rem;
    line-height: 1.45;
  }
  .report-orbit-shell .axis-score-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
    gap: 16px;
  }
  .report-orbit-shell .axis-score {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
  .report-orbit-shell .axis-band {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.08);
  }
  .report-orbit-shell .axis-panel {
    display: none;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
    overflow: hidden;
  }
  .report-orbit-shell .axis-panel.active {
    display: block;
  }
  .report-orbit-shell .axis-panel-head {
    display: block;
    padding: 24px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .report-orbit-shell .axis-panel-title {
    margin: 0 0 10px;
    font-size: clamp(1.4rem, 3vw, 1.9rem);
    line-height: 1.05;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: #fff;
  }
  .report-orbit-shell .axis-panel-copy {
    margin: 0;
    color: rgba(255, 255, 255, 0.84);
    line-height: 1.7;
    max-width: 60ch;
  }
  .report-orbit-shell .axis-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    padding: 22px 24px 24px;
  }
  .report-orbit-shell .cap-col {
    border-radius: 24px;
    padding: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    min-height: 100%;
  }
  .report-orbit-shell .cap-col.working {
    background: linear-gradient(180deg, rgba(97, 242, 186, 0.1), rgba(12, 166, 120, 0.05));
  }
  .report-orbit-shell .cap-col.missing {
    background: linear-gradient(180deg, rgba(255, 139, 167, 0.1), rgba(217, 72, 113, 0.05));
  }
  .report-orbit-shell .cap-col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .report-orbit-shell .cap-col-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: #fff;
  }
  .report-orbit-shell .cap-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .report-orbit-shell .status-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.92rem;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .report-orbit-shell .status-icon.working {
    background: rgba(97, 242, 186, 0.16);
    color: #baf7df;
    border: 1px solid rgba(97, 242, 186, 0.26);
  }
  .report-orbit-shell .status-icon.missing {
    background: rgba(255, 139, 167, 0.16);
    color: #ffc0d0;
    border: 1px solid rgba(255, 139, 167, 0.26);
  }
  .report-orbit-shell .cap-col-sub {
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.93rem;
    line-height: 1.55;
  }
  .report-orbit-shell .cap-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 34px;
    padding: 0 10px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.86rem;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .report-orbit-shell .cap-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .report-orbit-shell .cap-pill {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 24px;
    padding: 24px 22px 22px;
    text-align: left;
    color: inherit;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.045);
    transition: transform 220ms ease, border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
  }
  .report-orbit-shell .cap-pill:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.07);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.2);
  }
  .report-orbit-shell .cap-pill-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }
  .report-orbit-shell .cap-pill-name {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.4;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .report-orbit-shell .cap-tag {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.08);
  }
  .report-orbit-shell .cap-tag.positive { color: #baf7df; }
  .report-orbit-shell .cap-tag.negative { color: #ffc0d0; }
  .report-orbit-shell .cap-pill-summary {
    margin: 14px 0 0;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.98rem;
    line-height: 1.65;
  }
  .report-orbit-shell .modal {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(5, 8, 17, 0.72);
    -webkit-backdrop-filter: blur(28px) saturate(0.85);
    backdrop-filter: blur(28px) saturate(0.85);
  }
  .report-orbit-shell .modal.open {
    display: flex;
  }
  .report-orbit-shell .modal-card {
    width: min(600px, 100%);
    max-height: min(70vh, 600px);
    overflow: auto;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
      rgba(9, 12, 22, 0.98);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.42);
  }
  .report-orbit-shell .modal-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 24px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .report-orbit-shell .modal-overline {
    font-family: "Geist Mono", monospace;
    font-size: 0.74rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.48);
  }
  .report-orbit-shell #modal-title,
  .report-orbit-shell .modal-title {
    margin: 12px 0 0;
    font-size: clamp(1.4rem, 4vw, 1.7rem);
    line-height: 1.25;
    letter-spacing: -0.04em;
    color: #fff !important;
  }
  .report-orbit-shell .modal-close {
    border: 0;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.82);
    font-weight: 700;
    cursor: pointer;
  }
  .report-orbit-shell .modal-body {
    padding: 20px 24px 24px;
  }
  .report-orbit-shell .modal-evidence-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .report-orbit-shell .evidence-item {
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.035);
    padding: 24px;
  }
  .report-orbit-shell .evidence-quote {
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.65;
    font-size: 1.05rem;
  }
  @media (max-width: 980px) {
    .report-orbit-shell .axis-grid,
    .report-orbit-shell .axis-tabs {
      grid-template-columns: 1fr;
    }
    .report-orbit-shell .stepper-head {
      grid-template-columns: 1fr;
      gap: 18px;
      padding-bottom: 22px;
    }
    .report-orbit-shell .connector {
      display: none;
    }
  }
  @media print {
    .report-orbit-shell .hero-glow-layer,
    .report-orbit-shell .orbital-ring,
    .report-orbit-shell .orbital-ring-small,
    .report-orbit-shell .orbital-ring-left,
    .report-orbit-shell .modal,
    .report-orbit-shell .stepper-head,
    .report-orbit-shell .axis-tabs,
    .report-orbit-shell #axis-panels {
      display: none !important;
    }
    .report-orbit-shell .section {
      width: 100%;
      padding: 18px 0 8px;
    }
    .report-orbit-shell .section-number,
    .report-orbit-shell .axis-kicker,
    .report-orbit-shell .modal-overline {
      color: rgba(0, 0, 0, 0.55);
    }
    .report-orbit-shell .section-title,
    .report-orbit-shell .axis-panel-title,
    .report-orbit-shell .cap-col-title,
    .report-orbit-shell .cap-pill-name,
    .report-orbit-shell .axis-name {
      color: #111318;
    }
    .report-orbit-shell .panel,
    .report-orbit-shell .axis-panel,
    .report-orbit-shell .cap-col,
    .report-orbit-shell .cap-pill,
    .report-orbit-shell .stepper-shell {
      background: #fff !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      color: #111318;
    }
    .report-orbit-shell .panel .panel-inner {
      padding: 0;
    }
    .report-orbit-shell .print-axis-list {
      display: flex !important;
      flex-direction: column;
      gap: 16px;
    }
    .report-orbit-shell .print-axis-card {
      break-inside: avoid;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      padding: 18px;
      background: #fff;
    }
    .report-orbit-shell .print-axis-copy,
    .report-orbit-shell .cap-col-sub,
    .report-orbit-shell .cap-pill-summary,
    .report-orbit-shell .axis-mini,
    .report-orbit-shell .axis-panel-copy {
      color: rgba(17, 19, 24, 0.78) !important;
    }
    .report-orbit-shell .print-axis-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
  }
`;

function levelToStep(level?: number | null) {
  if (level === 3) return 3;
  if (level === 2) return 2;
  return 1;
}

export default function CapabilitiesAxesSection({ hero, axes, language }: Props) {
  const isFrench = (language ?? "").toLowerCase().startsWith("fr") ||
                   (hero.overall_maturity_band || "").toLowerCase().includes("établi") || 
                   (hero.overall_maturity_band || "").toLowerCase().includes("basique") || 
                   (hero.overall_maturity_band || "").toLowerCase().includes("avancé") || 
                   (hero.overall_maturity_band || "").toLowerCase().includes("intermédiaire") ||
                   (hero.report_title || "").toLowerCase().includes("rapport") ||
                   (hero.report_title || "").toLowerCase().includes("maturité");

  const labels = isFrench ? MATURITY_CARDS.fr : MATURITY_CARDS.en;

  const normalizedAxes = useMemo(() => {
    const order = ["manage", "analyze", "improve"];
    const lookup = new Map(axes.map((axis) => [axis.axis.toLowerCase(), axis]));
    return order.map((key) => lookup.get(key)).filter(Boolean) as FinalReportWorkingMissingAxis[];
  }, [axes]);

  const [activeAxis, setActiveAxis] = useState<string>(normalizedAxes[0]?.axis ?? "manage");
  const [modalState, setModalState] = useState<ModalState>(null);

  useEffect(() => {
    setActiveAxis(normalizedAxes[0]?.axis ?? "manage");
  }, [normalizedAxes]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalState(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (modalState) {
      document.documentElement.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [modalState]);

  const currentStep = levelToStep(hero.overall_level);
  const activePanel = normalizedAxes.find((axis) => axis.axis === activeAxis) ?? normalizedAxes[0];
  /*
  const modal = (
    <div
      className={`modal ${modalState ? "open" : ""}`}
      id="evidence-modal"
      aria-hidden={modalState ? "false" : "true"}
      onClick={() => setModalState(null)}
    >
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-overline" id="modal-overline">
              {modalState ? `${modalState.axisLabel} axis | ${modalState.status === "working" ? "Working" : "Missing"}` : ""}
            </div>
            <h2 className="modal-title" id="modal-title">
              {modalState?.item.capability ?? ""}
            </h2>
          </div>
          <button className="modal-close" id="close-modal" type="button" onClick={() => setModalState(null)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-evidence-list" id="modal-evidence-list">
            <div className="evidence-item">
              <p className="evidence-quote">
                {modalState?.item.evidence_snippet || modalState?.item.summary || ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  */

  return (
    <div className="report-orbit-shell">
      <style>{SECTION_STYLES}</style>
      <div className="hero-glow-layer" aria-hidden="true">
        <div className="hero-glow-a"></div>
        <div className="hero-glow-b"></div>
      </div>

      <section className="section">
        <div className="orbital-ring" aria-hidden="true"></div>
        <div className="orbital-ring-small" aria-hidden="true"></div>
        <div className="orbital-ring-left" aria-hidden="true"></div>

        <div className="section-head">
          <span className="section-number">02</span>
          <h2 className="section-title">
            {isFrench ? "Votre position — Paysage concurrentiel" : "Where You Stand — Competitive Landscape"}
          </h2>
        </div>

        <div className="panel-inner print:hidden">
          <div className="relative flex items-end gap-3 pt-20 pb-4 px-2 md:px-4">
            {/* Maturity Axis (Vertical Arrow) */}
            <div className="absolute left-1 top-4 bottom-4 flex flex-col items-center select-none w-14">
              <span className="font-sans text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white/70 mb-3.5 text-center whitespace-nowrap">
                {isFrench ? "Maturité" : "Maturity"}
              </span>
              <div className="flex-1 w-[2px] bg-white/30 relative rounded-full">
                {/* Arrowhead */}
                <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 border-t-2 border-l-2 border-white/60 rotate-45" />
                {/* Base tick line */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3.5 h-[2px] bg-white/30" />
              </div>
            </div>

            {/* The Ascending Steps Grid */}
            <div className="flex-1 grid grid-cols-3 gap-4 items-end pl-14 md:pl-16">
              {[1, 2, 3].map((stage) => {
                const isSelected = currentStep === stage;
                const stageData = labels[stage as 1 | 2 | 3];
                
                // Staircase heights
                const heightClass = stage === 1 ? "min-h-[160px]" : stage === 2 ? "min-h-[215px]" : "min-h-[270px]";
                
                // Color configuration matching EY theme gradients
                let topBarGradient = "bg-white/10";
                let tagBgGradient = "bg-white/20";
                let tagTextColor = "text-white";
                let arrowColor = "#ffffff";
                let activeBorderClass = "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))] hover:border-white/20 hover:bg-white/[0.03]";
                let titleColor = "text-white/80 group-hover:text-white font-medium";
                let subtitleColor = "text-white/40 group-hover:text-white/60";
                let descColor = "text-white/45 group-hover:text-white/60";
                
                if (stage === 1) {
                  topBarGradient = "bg-[linear-gradient(90deg,#ffd447,#c8973f)]";
                  tagBgGradient = "bg-[linear-gradient(135deg,#ffd447_0%,#c8973f_100%)]";
                  tagTextColor = "text-[#111318]";
                  arrowColor = "#ffd447";
                  if (isSelected) {
                    activeBorderClass = "border-amber-400/40 bg-[linear-gradient(180deg,rgba(255,212,71,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(255,212,71,0.12),0_0_24px_rgba(255,212,71,0.06)]";
                    titleColor = "text-white font-bold drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]";
                    subtitleColor = "text-amber-400 font-bold drop-shadow-[0_2px_4px_rgba(251,191,36,0.2)]";
                    descColor = "text-white/85 font-normal";
                  }
                } else if (stage === 2) {
                  topBarGradient = "bg-[linear-gradient(90deg,#85eaff,#00d4ff)]";
                  tagBgGradient = "bg-[linear-gradient(135deg,#85eaff_0%,#00d4ff_100%)]";
                  tagTextColor = "text-[#111318]";
                  arrowColor = "#00d4ff";
                  if (isSelected) {
                    activeBorderClass = "border-cyan-400/40 bg-[linear-gradient(180deg,rgba(0,212,255,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(0,212,255,0.12),0_0_24px_rgba(0,212,255,0.06)]";
                    titleColor = "text-white font-bold drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]";
                    subtitleColor = "text-cyan-400 font-bold drop-shadow-[0_2px_4px_rgba(34,211,238,0.2)]";
                    descColor = "text-white/85 font-normal";
                  }
                } else {
                  topBarGradient = "bg-[linear-gradient(90deg,#9f93ff,#4d22df)]";
                  tagBgGradient = "bg-[linear-gradient(135deg,#9f93ff_0%,#4d22df_100%)]";
                  tagTextColor = "text-white";
                  arrowColor = "#9f93ff";
                  if (isSelected) {
                    activeBorderClass = "border-violet-400/40 bg-[linear-gradient(180deg,rgba(124,92,255,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(124,92,255,0.12),0_0_24px_rgba(124,92,255,0.06)]";
                    titleColor = "text-white font-bold drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)]";
                    subtitleColor = "text-violet-400 font-bold drop-shadow-[0_2px_4px_rgba(167,139,250,0.2)]";
                    descColor = "text-white/85 font-normal";
                  }
                }
                
                return (
                  <div
                    key={stage}
                    className={`relative flex flex-col w-full transition-all duration-200 ${
                      isSelected ? "z-20 hover:z-40" : "z-10 hover:z-40"
                    }`}
                  >
                    {/* Step Block Box */}
                    <div
                      className={`w-full ${heightClass} relative flex flex-col justify-center items-center rounded-[22px] border backdrop-blur-[10px] transition-all duration-300 ${activeBorderClass} group`}
                    >
                      {/* Your Position Tag */}
                      {isSelected && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3.5 z-10 flex flex-col items-center select-none pointer-events-none">
                          <div className={`px-4 py-1.5 rounded-full ${tagBgGradient} ${tagTextColor} font-sans text-[0.72rem] font-extrabold uppercase tracking-[0.1em] shadow-[0_8px_20px_rgba(0,0,0,0.3)]`}>
                            {labels.yourPosition}
                          </div>
                          {/* Little pointing arrow */}
                          <div 
                            className="w-2.5 h-2.5 rotate-45 -mt-1 shadow-[0_4px_10px_rgba(0,0,0,0.3)]"
                            style={{ backgroundColor: arrowColor }}
                          />
                        </div>
                      )}

                      {/* Top Color Accent Line */}
                      <div className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-[20px] ${topBarGradient}`} />
                      
                      {/* Box Typography */}
                      <div className="text-center px-4 flex flex-col items-center">
                        <h3 className={`font-sans text-[1.2rem] tracking-wide m-0 transition-colors duration-200 ${titleColor}`}>
                          {stageData.title}
                        </h3>
                        <p className={`font-mono text-[0.78rem] m-0 mt-1.5 uppercase tracking-[0.15em] transition-colors duration-200 ${subtitleColor}`}>
                          {isFrench ? `Niveau ${stage}` : `Level ${stage}`}
                        </p>
                        <p className={`font-sans text-[0.78rem] leading-relaxed m-0 mt-3.5 transition-colors duration-200 ${descColor} max-w-[190px]`}>
                          {stageData.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="orbital-ring" aria-hidden="true"></div>
        <div className="orbital-ring-small" aria-hidden="true"></div>
        <div className="orbital-ring-left" aria-hidden="true"></div>

        <div className="section-head">
          <span className="section-number">03</span>
          <h2 className="section-title">
            {isFrench ? "Ce qui fonctionne et ce qui manque" : "What's Working & What's Missing"}
          </h2>
        </div>

        <div className="panel">
          <div className="panel-inner">
            <div className="axis-tabs" id="axis-tabs">
              {normalizedAxes.map((axis, index) => (
                <button
                  key={axis.axis}
                  className={`axis-tab ${axis.axis === activeAxis ? "active" : ""}`}
                  data-axis={axis.axis}
                  type="button"
                  onClick={() => setActiveAxis(axis.axis)}
                >
                  <div className="axis-kicker">
                    {isFrench ? "Axe " : "Axis "}{String(index + 1).padStart(2, "0")}
                  </div>
                  <h2 className="axis-name">{axis.label}</h2>
                  <p className="axis-mini">{axis.subtitle}</p>
                  <div className="axis-score-row">
                    <div className="axis-score">{levelToStep(axis.axis_level)}/3</div>
                    <div className="axis-band">{getMaturityBandDisplayName(axis.maturity_band, isFrench)}</div>
                  </div>
                </button>
              ))}
            </div>

            <div id="axis-panels" className="print:hidden">
              {normalizedAxes.map((axis) => (
                <section
                  key={axis.axis}
                  className={`axis-panel ${axis.axis === activeAxis ? "active" : ""}`}
                  data-panel={axis.axis}
                >
                  <div className="axis-panel-head">
                    <div>
                      <h3 className="axis-panel-title">
                        {axis.label}{isFrench ? " : la réalité aujourd'hui" : ": what's real today"}
                      </h3>
                      <p className="axis-panel-copy">{axis.intro}</p>
                    </div>
                  </div>

                  <div className="axis-grid">
                    <div className="cap-col working">
                      <div className="cap-col-head">
                        <div>
                          <div className="cap-title-row">
                            <span className="status-icon working" aria-hidden="true">&#10003;</span>
                            <h4 className="cap-col-title">{isFrench ? "Ce qui fonctionne" : "Working"}</h4>
                          </div>
                          <p className="cap-col-sub">
                            {isFrench
                              ? "Capacités démontrant déjà des preuves opérationnelles crédibles."
                              : "Capabilities already showing credible operating evidence."}
                          </p>
                        </div>
                        <div className="cap-count">{axis.working.length}</div>
                      </div>
                      <div className="cap-list">
                        {axis.working.map((item) => (
                          <CapabilityButton
                            key={`${axis.axis}-working-${item.capability}`}
                            item={item}
                            status="working"
                            axisLabel={axis.label}
                            onOpen={setModalState}
                            isFrench={isFrench}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="cap-col missing">
                      <div className="cap-col-head">
                        <div>
                          <div className="cap-title-row">
                            <span className="status-icon missing" aria-hidden="true">!</span>
                            <h4 className="cap-col-title">{isFrench ? "Ce qui manque" : "Missing"}</h4>
                          </div>
                          <p className="cap-col-sub">
                            {isFrench
                              ? "Capacités qui manquent encore de preuves pour être considérées comme systématiques."
                              : "Capabilities that still lack enough evidence to feel systematic."}
                          </p>
                        </div>
                        <div className="cap-count">{axis.missing.length}</div>
                      </div>
                      <div className="cap-list">
                        {axis.missing.map((item) => (
                          <CapabilityButton
                            key={`${axis.axis}-missing-${item.capability}`}
                            item={item}
                            status="missing"
                            axisLabel={axis.label}
                            onOpen={setModalState}
                            isFrench={isFrench}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <div className="print-axis-list hidden">
              {normalizedAxes.map((axis) => (
                <section key={`print-${axis.axis}`} className="print-axis-card">
                  <div className="axis-kicker">{isFrench ? "Axe" : "Axis"}</div>
                  <h3 className="axis-panel-title">{axis.label}</h3>
                  <p className="print-axis-copy">{axis.intro}</p>
                  <div className="print-axis-grid">
                    <div className="cap-col working">
                      <div className="cap-col-head">
                        <div>
                          <div className="cap-title-row">
                            <span className="status-icon working" aria-hidden="true">&#10003;</span>
                            <h4 className="cap-col-title">{isFrench ? "Ce qui fonctionne" : "Working"}</h4>
                          </div>
                          <p className="cap-col-sub">
                            {isFrench
                              ? "Capacités démontrant déjà des preuves opérationnelles crédibles."
                              : "Capabilities already showing credible operating evidence."}
                          </p>
                        </div>
                      </div>
                      <div className="cap-list">
                        {axis.working.map((item) => (
                          <div key={`print-${axis.axis}-working-${item.capability}`} className="cap-pill">
                            <div className="cap-pill-top">
                              <p className="cap-pill-name">{item.capability}</p>
                              <span className="cap-tag positive">{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
                            </div>
                            <p className="cap-pill-summary">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="cap-col missing">
                      <div className="cap-col-head">
                        <div>
                          <div className="cap-title-row">
                            <span className="status-icon missing" aria-hidden="true">!</span>
                            <h4 className="cap-col-title">{isFrench ? "Ce qui manque" : "Missing"}</h4>
                          </div>
                          <p className="cap-col-sub">
                            {isFrench
                              ? "Capacités qui manquent encore de preuves pour être considérées comme systématiques."
                              : "Capabilities that still lack enough evidence to feel systematic."}
                          </p>
                        </div>
                      </div>
                      <div className="cap-list">
                        {axis.missing.map((item) => (
                          <div key={`print-${axis.axis}-missing-${item.capability}`} className="cap-pill">
                            <div className="cap-pill-top">
                              <p className="cap-pill-name">{item.capability}</p>
                              <span className="cap-tag negative">{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
                            </div>
                            <p className="cap-pill-summary">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div
        className={`modal ${modalState ? "open" : ""}`}
        id="evidence-modal"
        aria-hidden={modalState ? "false" : "true"}
        onClick={() => setModalState(null)}
      >
        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="modal-overline" id="modal-overline">
                {modalState
                  ? isFrench
                    ? `Axe ${modalState.axisLabel} | ${modalState.status === "working" ? "Ce qui fonctionne" : "Ce qui manque"}`
                    : `${modalState.axisLabel} axis | ${modalState.status === "working" ? "Working" : "Missing"}`
                  : ""}
              </div>
              <h2 className="modal-title" id="modal-title">
                {modalState?.item.capability ?? ""}
              </h2>
            </div>
            <button className="modal-close" id="close-modal" type="button" onClick={() => setModalState(null)}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-evidence-list" id="modal-evidence-list">
              <div className="evidence-item">
                <p className="evidence-quote">
                  {modalState?.item.evidence_snippet || modalState?.item.summary || ""}
                </p>
                {modalState?.item.capability && capabilityLinks[modalState.item.capability] ? (
                  <div className="mt-5">
                    <a 
                      href={capabilityLinks[modalState.item.capability]} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      {isFrench ? "Voir le guide de référence" : "View Reference Guide"}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!activePanel && null}
    </div>
  );
}

function CapabilityButton({
  item,
  status,
  axisLabel,
  onOpen,
  isFrench,
}: {
  item: FinalReportWorkingMissingItem;
  status: "working" | "missing";
  axisLabel: string;
  onOpen: (state: ModalState) => void;
  isFrench?: boolean;
}) {
  return (
    <div 
      className="cap-pill group relative cursor-pointer" 
      onClick={() => onOpen({ item, status, axisLabel })}
      role="button"
      tabIndex={0}
    >
      <div className="cap-pill-top">
        <p className="cap-pill-name">{item.capability}</p>
        <span className={`cap-tag ${status === "working" ? "positive" : "negative"}`}>{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
      </div>
      <p className="cap-pill-summary">{item.summary}</p>
      
      {capabilityLinks[item.capability] ? (
        <div className="mt-3">
          <a
            href={capabilityLinks[item.capability]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-400 transition hover:text-violet-300"
          >
            {isFrench ? "Guide de référence" : "Reference Guide"}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      ) : null}
    </div>
  );
}
