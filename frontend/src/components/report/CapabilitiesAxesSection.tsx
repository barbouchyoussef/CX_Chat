import { useEffect, useMemo, useState } from "react";
import type { FinalReportHero, FinalReportWorkingMissingAxis, FinalReportWorkingMissingItem, FinalReportCapabilityItem } from "../../types/final-report";
import { capabilityLinks } from "../../config/capabilityLinks";

type Props = {
  hero: FinalReportHero;
  axes: FinalReportWorkingMissingAxis[];
  language?: string | null;
  summaryText?: string | null;
  capabilities?: FinalReportCapabilityItem[];
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

const getBandClass = (band?: string | null) => {
  if (!band) return "cap-tag-established";
  const key = band.toLowerCase().trim();
  if (key.includes("basic") || key.includes("basique") || key.includes("initial")) return "cap-tag-basic";
  if (key.includes("advanced") || key.includes("avancé")) return "cap-tag-advanced";
  return "cap-tag-established";
};

const SECTION_STYLES = `
  .report-orbit-shell {
    position: relative;
    isolation: isolate;
    overflow: hidden;
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
    gap: 16px;
    margin-bottom: 24px;
  }
  .report-orbit-shell .axis-tab {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 24px;
    padding: 22px 22px 20px;
    text-align: left;
    color: #fff;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.015);
    backdrop-filter: blur(12px);
    transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), border-color 300ms ease, background-color 300ms ease, box-shadow 300ms ease;
  }
  .report-orbit-shell .axis-tab:hover {
    transform: translateY(-4px);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.035);
  }
  .report-orbit-shell .axis-tab[data-axis="manage"].active {
    background: linear-gradient(135deg, rgba(255, 212, 71, 0.08), rgba(255, 255, 255, 0.01));
    border-color: rgba(255, 212, 71, 0.35);
    box-shadow: 0 16px 36px rgba(255, 212, 71, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .report-orbit-shell .axis-tab[data-axis="analyze"].active {
    background: linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(255, 255, 255, 0.01));
    border-color: rgba(0, 212, 255, 0.35);
    box-shadow: 0 16px 36px rgba(0, 212, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .report-orbit-shell .axis-tab[data-axis="improve"].active {
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.08), rgba(255, 255, 255, 0.01));
    border-color: rgba(124, 92, 255, 0.35);
    box-shadow: 0 16px 36px rgba(124, 92, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .report-orbit-shell .axis-tab[data-axis="manage"].active .axis-kicker { color: #ffd447; }
  .report-orbit-shell .axis-tab[data-axis="manage"].active .axis-score { color: #ffd447; }
  .report-orbit-shell .axis-tab[data-axis="analyze"].active .axis-kicker { color: #00d4ff; }
  .report-orbit-shell .axis-tab[data-axis="analyze"].active .axis-score { color: #00d4ff; }
  .report-orbit-shell .axis-tab[data-axis="improve"].active .axis-kicker { color: #9f93ff; }
  .report-orbit-shell .axis-tab[data-axis="improve"].active .axis-score { color: #9f93ff; }
  .report-orbit-shell .axis-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.45);
    transition: color 300ms ease;
  }
  .report-orbit-shell .axis-name {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .report-orbit-shell .axis-mini {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.88rem;
    line-height: 1.45;
  }
  .report-orbit-shell .axis-score-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 18px;
    gap: 16px;
  }
  .report-orbit-shell .axis-score {
    font-size: 1.85rem;
    font-weight: 900;
    letter-spacing: -0.05em;
    transition: color 300ms ease;
  }
  .report-orbit-shell .axis-band {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .report-orbit-shell .axis-panel {
    display: none;
    border-radius: 24px;
    background: transparent;
    overflow: hidden;
  }
  .report-orbit-shell .axis-panel.active {
    display: block;
  }
  .report-orbit-shell .axis-panel-head {
    display: block;
    padding: 16px 16px 20px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .report-orbit-shell .axis-panel-title {
    margin: 0 0 10px;
    font-size: clamp(1.4rem, 3vw, 1.85rem);
    line-height: 1.1;
    letter-spacing: -0.04em;
    font-weight: 800;
    color: #fff;
  }
  .report-orbit-shell .axis-panel-copy {
    margin: 0;
    color: rgba(255, 255, 255, 0.74);
    line-height: 1.65;
    max-width: 68ch;
    font-size: 0.98rem;
  }
  .report-orbit-shell .axis-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding: 24px 16px 16px 16px;
  }
  .report-orbit-shell .cap-col {
    border-radius: 24px;
    padding: 22px;
    min-height: 100%;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }
  .report-orbit-shell .cap-col.working {
    background: linear-gradient(180deg, rgba(97, 242, 186, 0.02), rgba(97, 242, 186, 0.005));
    border: 1px solid rgba(97, 242, 186, 0.12);
  }
  .report-orbit-shell .cap-col.missing {
    background: linear-gradient(180deg, rgba(255, 139, 167, 0.02), rgba(255, 139, 167, 0.005));
    border: 1px solid rgba(255, 139, 167, 0.12);
  }
  .report-orbit-shell .cap-col-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }
  .report-orbit-shell .cap-col-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .report-orbit-shell .cap-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .report-orbit-shell .status-icon {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .report-orbit-shell .status-icon.working {
    background: rgba(97, 242, 186, 0.12);
    color: #baf7df;
    border: 1px solid rgba(97, 242, 186, 0.24);
  }
  .report-orbit-shell .status-icon.missing {
    background: rgba(255, 139, 167, 0.12);
    color: #ffc0d0;
    border: 1px solid rgba(255, 139, 167, 0.24);
  }
  .report-orbit-shell .cap-col-sub {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .report-orbit-shell .cap-col.working .cap-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.8rem;
    background: rgba(97, 242, 186, 0.08);
    border: 1px solid rgba(97, 242, 186, 0.2);
    color: #baf7df;
  }
  .report-orbit-shell .cap-col.missing .cap-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.8rem;
    background: rgba(255, 139, 167, 0.08);
    border: 1px solid rgba(255, 139, 167, 0.2);
    color: #ffc0d0;
  }
  .report-orbit-shell .cap-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .report-orbit-shell .cap-pill {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 22px;
    padding: 22px 20px 20px;
    text-align: left;
    color: inherit;
    cursor: pointer;
    background: rgba(9, 12, 22, 0.45);
    backdrop-filter: blur(6px);
    transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), border-color 300ms ease, background-color 300ms ease, box-shadow 300ms ease;
  }
  .report-orbit-shell .cap-pill:hover {
    transform: translateY(-4px) scale(1.015);
    background: rgba(14, 18, 30, 0.6);
  }
  .report-orbit-shell .cap-col.working .cap-pill:hover {
    border-color: rgba(97, 242, 186, 0.3);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3), 0 0 20px rgba(97, 242, 186, 0.06);
  }
  .report-orbit-shell .cap-col.missing .cap-pill:hover {
    border-color: rgba(255, 139, 167, 0.3);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 139, 167, 0.06);
  }
  .report-orbit-shell .cap-pill-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .report-orbit-shell .cap-pill-name {
    margin: 0;
    font-size: 1.08rem;
    line-height: 1.35;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .report-orbit-shell .cap-tag {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .report-orbit-shell .cap-tag-basic {
    color: #ffd447;
    background: rgba(255, 212, 71, 0.09);
    border: 1px solid rgba(255, 212, 71, 0.2);
  }
  .report-orbit-shell .cap-tag-established {
    color: #00d4ff;
    background: rgba(0, 212, 255, 0.09);
    border: 1px solid rgba(0, 212, 255, 0.2);
  }
  .report-orbit-shell .cap-tag-advanced {
    color: #9f93ff;
    background: rgba(159, 147, 255, 0.09);
    border: 1px solid rgba(159, 147, 255, 0.2);
  }
  .report-orbit-shell .cap-pill-summary {
    margin: 12px 0 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.94rem;
    line-height: 1.6;
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

const axisLabel = (value?: string | null, isFr?: boolean) => {
  if (!value) return "Unknown";
  const key = value.toLowerCase().trim();
  if (key.includes("manage") || key.includes("gérer")) return isFr ? "Gérer" : "Manage";
  if (key.includes("analyze") || key.includes("analyser")) return isFr ? "Analyser" : "Analyze";
  if (key.includes("improve") || key.includes("améliorer")) return isFr ? "Améliorer" : "Improve";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const STATIC_CAPABILITIES = [
  { key: "cx culture", axis: "manage", en: "CX culture", fr: "Culture CX" },
  { key: "ownership and governance", axis: "manage", en: "Ownership & governance", fr: "Ownership & gouvernance" },
  { key: "decision-making", axis: "manage", en: "Decision-making", fr: "Prise de décision" },
  { key: "feedback collection", axis: "analyze", en: "Feedback collection", fr: "Collecte des retours" },
  { key: "use of insights", axis: "analyze", en: "Use of insights", fr: "Exploitation des insights" },
  { key: "channel consistency", axis: "analyze", en: "Channel consistency", fr: "Cohérence des canaux" },
  { key: "journey visibility", axis: "analyze", en: "Journey visibility", fr: "Visibilité des parcours" },
  { key: "measurement and continuous improvement", axis: "improve", en: "Measurement & improvement", fr: "Mesure & amélioration" },
  { key: "acting on pain points", axis: "improve", en: "Acting on pain points", fr: "Traitement des irritants" }
] as const;

function getCanonicalCapabilityKey(name: string): string {
  const norm = name.toLowerCase().trim();
  if (norm.includes("culture")) return "cx culture";
  if (norm.includes("decision") || norm.includes("décision")) return "decision-making";
  if (norm.includes("governance") || norm.includes("gouvernance") || norm.includes("ownership")) return "ownership and governance";
  if (norm.includes("feedback") || norm.includes("collecte des retours") || norm.includes("collection")) return "feedback collection";
  if (norm.includes("insights") || norm.includes("exploitation")) return "use of insights";
  if (norm.includes("channel") || norm.includes("canal") || norm.includes("canaux") || norm.includes("cohérence")) return "channel consistency";
  if (norm.includes("journey") || norm.includes("parcours") || norm.includes("visibilité")) return "journey visibility";
  if (norm.includes("measurement") || norm.includes("mesure") || norm.includes("continuous") || norm.includes("amélioration continue")) return "measurement and continuous improvement";
  if (norm.includes("acting on") || norm.includes("irritant") || norm.includes("pain point")) return "acting on pain points";
  return norm;
}

function getMaturityScore(maturityBand: string, maturityLevelNumber?: number | null): number {
  if (maturityLevelNumber) return maturityLevelNumber;
  const bandNorm = maturityBand.toLowerCase();
  if (bandNorm.includes("advanced") || bandNorm.includes("avancé")) return 3;
  if (bandNorm.includes("basic") || bandNorm.includes("basique")) return 1;
  return 2;
}

function getAngle(index: number, numAxes: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / numAxes;
}

function getCoords(centerX: number, centerY: number, distance: number, angle: number) {
  return {
    x: centerX + distance * Math.cos(angle),
    y: centerY + distance * Math.sin(angle),
  };
}

function MaturityRadarChart({
  axes,
  capabilities = [],
  isFrench,
}: {
  axes: FinalReportWorkingMissingAxis[];
  capabilities?: FinalReportCapabilityItem[];
  isFrench: boolean;
}) {
  const allCapabilities = useMemo(() => {
    const scoreMap = new Map<string, number>();
    
    if (capabilities && capabilities.length > 0) {
      capabilities.forEach((cap) => {
        const canonical = getCanonicalCapabilityKey(cap.capability);
        const score = getMaturityScore(cap.maturity_band, cap.maturity_level_number);
        scoreMap.set(canonical, score);
      });
    } else {
      axes.forEach((axisItem) => {
        axisItem.working.forEach((item) => {
          const canonical = getCanonicalCapabilityKey(item.capability);
          const score = getMaturityScore(item.maturity_band);
          scoreMap.set(canonical, score);
        });
        axisItem.missing.forEach((item) => {
          const canonical = getCanonicalCapabilityKey(item.capability);
          const score = getMaturityScore(item.maturity_band);
          scoreMap.set(canonical, score);
        });
      });
    }

    return STATIC_CAPABILITIES.map((staticItem) => {
      const score = scoreMap.get(staticItem.key) || 1;
      return {
        name: isFrench ? staticItem.fr : staticItem.en,
        axis: staticItem.axis,
        score,
        key: staticItem.key
      };
    });
  }, [capabilities, axes, isFrench]);

  const numAxes = allCapabilities.length;
  if (numAxes === 0) return null;

  const width = 480;
  const height = 320;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = 92;

  const level1Points = allCapabilities.map((_, i) => getCoords(centerX, centerY, maxRadius * 0.33, getAngle(i, numAxes)));
  const level2Points = allCapabilities.map((_, i) => getCoords(centerX, centerY, maxRadius * 0.66, getAngle(i, numAxes)));
  const level3Points = allCapabilities.map((_, i) => getCoords(centerX, centerY, maxRadius, getAngle(i, numAxes)));
  const scorePoints = allCapabilities.map((cap, i) => getCoords(centerX, centerY, maxRadius * (cap.score / 3), getAngle(i, numAxes)));

  const level1String = level1Points.map((p) => `${p.x},${p.y}`).join(" ");
  const level2String = level2Points.map((p) => `${p.x},${p.y}`).join(" ");
  const level3String = level3Points.map((p) => `${p.x},${p.y}`).join(" ");
  const scoreString = scorePoints.map((p) => `${p.x},${p.y}`).join(" ");

  const renderLabelText = (
    label: string,
    x: number,
    y: number,
    textAnchor: "inherit" | "start" | "end" | "middle",
    dx: number,
    dy: number,
    color: string
  ) => {
    const words = label.split(" ");
    
    if (words.length >= 2 && label.length > 12) {
      const midpoint = Math.ceil(words.length / 2);
      const line1 = words.slice(0, midpoint).join(" ");
      const line2 = words.slice(midpoint).join(" ");
      return (
        <text x={x + dx} y={y + dy} textAnchor={textAnchor} fill="#fff" fontSize="11" fontWeight="800" className="font-sans tracking-wide">
          <tspan x={x + dx} dy="-4">{line1.toUpperCase()}</tspan>
          <tspan x={x + dx} dy="12" fill={color}>{line2.toUpperCase()}</tspan>
        </text>
      );
    }
    return (
      <text x={x + dx} y={y + dy} textAnchor={textAnchor} fill="#fff" fontSize="11" fontWeight="800" className="font-sans tracking-wide">
        {label.toUpperCase()}
      </text>
    );
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="radarGlow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <linearGradient id="goldFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd447" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#c8973f" stopOpacity="0.08" />
        </linearGradient>

        <linearGradient id="goldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd447" stopOpacity="1" />
          <stop offset="100%" stopColor="#c8973f" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <polygon points={level3String} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <polygon points={level2String} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <polygon points={level1String} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2,2" />

      {level3Points.map((p, i) => (
        <line key={i} x1={centerX} y1={centerY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3,3" />
      ))}

      <text x={centerX + 6} y={centerY - maxRadius * 0.33 + 4} fill="rgba(255,255,255,0.28)" fontSize="8.5" fontFamily="monospace" fontWeight="500">1</text>
      <text x={centerX + 6} y={centerY - maxRadius * 0.66 + 4} fill="rgba(255,255,255,0.28)" fontSize="8.5" fontFamily="monospace" fontWeight="500">2</text>
      <text x={centerX + 6} y={centerY - maxRadius + 4} fill="rgba(255,255,255,0.28)" fontSize="8.5" fontFamily="monospace" fontWeight="500">3</text>

      <polygon
        points={scoreString}
        fill="url(#goldFill)"
        stroke="url(#goldStroke)"
        strokeWidth="2.5"
        filter="url(#radarGlow)"
      />

      <circle cx={centerX} cy={centerY} r="3" fill="rgba(255,255,255,0.3)" />

      {scorePoints.map((p, idx) => {
        const cap = allCapabilities[idx];
        let nodeColor = "#ffd447";
        if (cap.axis.toLowerCase() === "analyze" || cap.axis.toLowerCase() === "analyser") nodeColor = "#00d4ff";
        if (cap.axis.toLowerCase() === "improve" || cap.axis.toLowerCase() === "améliorer") nodeColor = "#9f93ff";
        
        return (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="7" fill={nodeColor} fillOpacity="0.15" />
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={nodeColor}
              stroke="#0f121d"
              strokeWidth="2"
            />
          </g>
        );
      })}

      {allCapabilities.map((cap, i) => {
        const angle = getAngle(i, numAxes);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const labelRadius = maxRadius + 14;
        const coords = getCoords(centerX, centerY, labelRadius, angle);
        
        let textAnchor: "inherit" | "start" | "end" | "middle" = "middle";
        let dx = 0;
        let dy = 0;
        
        if (Math.abs(cos) < 0.15) {
          textAnchor = "middle";
          dy = sin < 0 ? -4 : 12;
        } else if (cos > 0) {
          textAnchor = "start";
          dx = 4;
          dy = 3;
        } else {
          textAnchor = "end";
          dx = -4;
          dy = 3;
        }

        let axisColor = "#ffd447";
        if (cap.axis.toLowerCase() === "analyze" || cap.axis.toLowerCase() === "analyser") axisColor = "#00d4ff";
        if (cap.axis.toLowerCase() === "improve" || cap.axis.toLowerCase() === "améliorer") axisColor = "#9f93ff";

        return (
          <g key={i}>
            {renderLabelText(cap.name, coords.x, coords.y, textAnchor, dx, dy, axisColor)}
          </g>
        );
      })}
    </svg>
  );
}

function levelToStep(level?: number | null) {
  if (level === 3) return 3;
  if (level === 2) return 2;
  return 1;
}

export default function CapabilitiesAxesSection({ hero, axes, language, summaryText, capabilities }: Props) {
  const isFrench = language
    ? language.toLowerCase().startsWith("fr")
    : ((hero.overall_maturity_band || "").toLowerCase().includes("établi") || 
       (hero.overall_maturity_band || "").toLowerCase().includes("basique") || 
       (hero.overall_maturity_band || "").toLowerCase().includes("avancé") || 
       (hero.overall_maturity_band || "").toLowerCase().includes("intermédiaire") ||
       (hero.report_title || "").toLowerCase().includes("rapport") ||
       (hero.report_title || "").toLowerCase().includes("maturité"));

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
  
  const overview = useMemo(() => {
    const resolvedCompany = (hero.company_name || "Executive Report").toUpperCase();
    const fallbackOverview = isFrench
      ? `${resolvedCompany} est actuellement au niveau de maturité ${getMaturityBandDisplayName(hero.overall_maturity_band, true)}. L'axe ${axisLabel(hero.strongest_axis, true)} est la zone la plus forte aujourd'hui, tandis que l'axe ${axisLabel(hero.priority_axis, true)} nécessite le plus d'attention ensuite.`
      : `${resolvedCompany} is currently at ${getMaturityBandDisplayName(hero.overall_maturity_band, false)} maturity. ${axisLabel(hero.strongest_axis, false)} is the strongest area today, while ${axisLabel(hero.priority_axis, false)} needs the most attention next.`;

    return (
      hero.hero_message?.trim() ||
      summaryText?.trim() ||
      fallbackOverview
    );
  }, [hero, summaryText, isFrench]);

  const sentences = useMemo(() => {
    if (!overview) return [];
    return overview
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
      .map((s) => (s.endsWith(".") || s.endsWith("!") || s.endsWith("?") ? s : s + "."));
  }, [overview]);

  const formatSentence = (s: string) => {
    const words = s.split(/\s+/);
    const boldCount = Math.min(4, words.length);
    const boldPart = words.slice(0, boldCount).join(" ");
    const restPart = words.slice(boldCount).join(" ");
    return { boldPart, restPart };
  };

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

      {/* 3D Logos peeking in from left and right edges */}
      <div className="pointer-events-none absolute left-[-180px] top-[15%] z-0 h-[360px] w-[360px] select-none opacity-[0.38] blur-[1px] print:hidden">
        <img
          src="/d87248c323a11fe6364ab034b73bea1e1c1e77f7.png"
          alt=""
          className="h-full w-full object-contain animate-[aiOrbit_90s_linear_infinite]"
        />
      </div>
      <div className="pointer-events-none absolute right-[-180px] top-[50%] z-0 h-[360px] w-[360px] select-none opacity-[0.38] blur-[1px] print:hidden">
        <img
          src="/d87248c323a11fe6364ab034b73bea1e1c1e77f7.png"
          alt=""
          className="h-full w-full object-contain"
        />
      </div>

      <section className="section">
        <div className="orbital-ring" aria-hidden="true"></div>
        <div className="orbital-ring-small" aria-hidden="true"></div>
        <div className="orbital-ring-left" aria-hidden="true"></div>

        <div className="section-head">
          <span className="section-number">02</span>
          <h2 className="section-title">
            {isFrench ? "Votre position" : "Where You Stand"}
          </h2>
        </div>

        <div className="panel-inner print:hidden">
          <div className="relative flex items-start gap-3 pt-20 pb-4 px-2 md:px-4">
            
            {/* Connected horizontal track line behind the nodes */}
            <div className="absolute left-[calc(16.6%+3.5rem)] right-[calc(16.6%)] top-[46px] h-[3px] bg-white/10 select-none pointer-events-none rounded-full print:hidden">
              {/* Active progress line fill */}
              <div 
                className="h-full bg-gradient-to-r from-[#ffd447] via-[#00d4ff] to-[#7c5cff] rounded-full transition-all duration-1000 ease-out" 
                style={{
                  width: currentStep === 1 ? "0%" : currentStep === 2 ? "50%" : "100%"
                }}
              />
            </div>

            {/* The Connected Maturity Flow Grid */}
            <div className="flex-1 grid grid-cols-3 gap-6 items-start pl-14 md:pl-16 relative z-10">
              {[1, 2, 3].map((stage) => {
                const isSelected = currentStep === stage;
                const isPassed = currentStep >= stage;
                const stageData = labels[stage as 1 | 2 | 3];
                
                // Color configuration matching stage
                let accentColor = "rgba(255, 255, 255, 0.4)";
                let gradientText = "from-white to-white/70";
                let borderClass = "border-white/10 bg-white/[0.01]";
                let badgeBg = "bg-white/20";
                let badgeTextColor = "text-white";
                
                if (stage === 1) {
                  accentColor = "#ffd447";
                  gradientText = "from-[#ffd447] to-[#c8973f]";
                  badgeBg = "bg-[linear-gradient(135deg,#ffd447_0%,#c8973f_100%)]";
                  badgeTextColor = "text-[#111318]";
                  if (isSelected) {
                    borderClass = "border-[#ffd447]/45 bg-[linear-gradient(180deg,rgba(255,212,71,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(255,212,71,0.12)] print:border-black/15";
                  }
                } else if (stage === 2) {
                  accentColor = "#00d4ff";
                  gradientText = "from-[#85eaff] to-[#00d4ff]";
                  badgeBg = "bg-[linear-gradient(135deg,#85eaff_0%,#00d4ff_100%)]";
                  badgeTextColor = "text-[#111318]";
                  if (isSelected) {
                    borderClass = "border-[#00d4ff]/45 bg-[linear-gradient(180deg,rgba(0,212,255,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(0,212,255,0.12)] print:border-black/15";
                  }
                } else {
                  accentColor = "#7c5cff";
                  gradientText = "from-[#9f93ff] to-[#7c5cff]";
                  badgeBg = "bg-[linear-gradient(135deg,#9f93ff_0%,#7c5cff_100%)]";
                  badgeTextColor = "text-white";
                  if (isSelected) {
                    borderClass = "border-[#7c5cff]/45 bg-[linear-gradient(180deg,rgba(124,92,255,0.06),rgba(255,255,255,0.01))] shadow-[0_16px_36px_rgba(124,92,255,0.12)] print:border-black/15";
                  }
                }

                return (
                  <div key={stage} className="flex flex-col items-center group relative print:text-black">
                    
                    {/* Interactive Step Node on the Line */}
                    <div className="relative flex items-center justify-center h-[54px] w-full mb-6 print:hidden">
                      <div 
                        className={`h-11 w-11 rounded-full border-2 flex items-center justify-center font-bold font-mono text-sm transition-all duration-500 ${
                          isSelected 
                            ? "bg-[#111318] scale-110" 
                            : isPassed 
                            ? "bg-white/5 text-white/90" 
                            : "bg-[#111318] text-white/30 border-white/10"
                        }`}
                        style={{ 
                          borderColor: isPassed ? accentColor : "rgba(255,255,255,0.1)",
                          color: isPassed ? accentColor : undefined,
                          boxShadow: isSelected ? `0 0 20px ${accentColor}44` : undefined
                        }}
                      >
                        {stage}
                      </div>

                      {/* Your Position floating label above the active node */}
                      {isSelected && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3.5 z-10 flex flex-col items-center select-none pointer-events-none animate-bounce">
                          <div className={`px-3.5 py-1.5 rounded-full ${badgeBg} ${badgeTextColor} font-sans text-[0.68rem] font-bold uppercase tracking-[0.15em] shadow-[0_8px_20px_rgba(0,0,0,0.3)]`}>
                            {labels.yourPosition}
                          </div>
                          <div className="w-1.5 h-1.5 rotate-45 -mt-0.5" style={{ backgroundColor: accentColor }} />
                        </div>
                      )}
                    </div>

                    {/* Card describing the level */}
                    <div className={`w-full rounded-2xl border p-5.5 backdrop-blur-[10px] min-h-[195px] transition-all duration-300 ${borderClass} hover:border-white/20 hover:bg-white/[0.02] flex flex-col items-center text-center print:bg-white print:border-black/10 print:text-black print:min-h-0`}>
                      <h3 className={`font-sans text-[1.25rem] font-extrabold tracking-tight m-0 bg-clip-text text-transparent bg-gradient-to-r ${gradientText} print:text-black print:bg-none print:bg-clip-border`}>
                        {stageData.title}
                      </h3>
                      <p className="font-mono text-[0.72rem] m-0 mt-1 uppercase tracking-[0.15em] text-white/50 print:text-black/50">
                        {isFrench ? `Niveau ${stage}` : `Level ${stage}`}
                      </p>
                      <p className="font-sans text-[0.92rem] leading-relaxed m-0 mt-3 text-white/78 group-hover:text-white transition-colors duration-200 max-w-[210px] print:text-black/80">
                        {stageData.desc}
                      </p>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Executive summary and Radar Chart dashboard */}
        {sentences.length > 0 && (
          <div className="mt-12 md:mt-16 relative z-10 mx-auto max-w-[1140px] print:text-black">
            {/* Unified Glassmorphic Card */}
            <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] border border-white/6 rounded-[32px] p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-md print:bg-white print:border-black/10 print:shadow-none print:backdrop-blur-none print:p-0">
              <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-16 items-center">
                
                {/* Left Column: Key Findings */}
                <div>
                  {/* Header/Subtitle */}
                  <div className="flex items-center gap-3 mb-6 px-1 print:hidden">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ffd447] animate-pulse" />
                    <span className="font-mono text-[0.74rem] uppercase tracking-[0.2em] text-white/50">
                      {isFrench ? "Diagnostic & constats clés" : "Key diagnostic findings"}
                    </span>
                  </div>

                  <div className="space-y-6 print:space-y-4">
                    {sentences.map((sentence, idx) => {
                      const { boldPart, restPart } = formatSentence(sentence);
                      return (
                        <div key={idx} className="flex items-start gap-4 group print:text-black">
                          <div className="flex-shrink-0 mt-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)] transition-all duration-300 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/35 group-hover:text-emerald-300 print:bg-emerald-50 print:border-emerald-200 print:text-emerald-600 print:shadow-none print:h-5 print:w-5 print:mt-1">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-2.5 w-2.5 print:h-2 print:w-2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                          <p className="text-[1.02rem] leading-relaxed text-white/70 transition-colors duration-200 group-hover:text-white/90 m-0 print:text-black/85">
                            <strong className="font-bold text-white transition-colors duration-200 print:text-black">{boldPart}</strong>{" "}
                            {restPart}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Radar Chart */}
                <div className="flex flex-col items-center justify-center print:hidden">
                  {/* Header/Subtitle */}
                  <div className="flex items-center gap-3 mb-6 px-1 w-full justify-center lg:justify-start">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#ffd447] animate-pulse" />
                    <span className="font-mono text-[0.74rem] uppercase tracking-[0.2em] text-white/50">
                      {isFrench ? "Profil de maturité" : "Maturity profile"}
                    </span>
                  </div>

                  {/* Radar Container - border-less and background-less inside the parent card */}
                  <div className="flex items-center justify-center w-full max-w-[500px] aspect-[480/320]">
                    <MaturityRadarChart axes={axes} capabilities={capabilities} isFrench={isFrench} />
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
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
                            <div className="status-icon working" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
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
                            <div className="status-icon missing" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                            </div>
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
                            <div className="status-icon working" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
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
                              <span className={`cap-tag ${getBandClass(item.maturity_band)}`}>{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
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
                            <div className="status-icon missing" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                            </div>
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
                              <span className={`cap-tag ${getBandClass(item.maturity_band)}`}>{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
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
  const linkColor = status === "working" ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300";

  return (
    <div 
      className="cap-pill group relative cursor-pointer" 
      onClick={() => onOpen({ item, status, axisLabel })}
      role="button"
      tabIndex={0}
    >
      <div className="cap-pill-top">
        <p className="cap-pill-name">{item.capability}</p>
        <span className={`cap-tag ${getBandClass(item.maturity_band)}`}>{getMaturityBandDisplayName(item.maturity_band, isFrench)}</span>
      </div>
      <p className="cap-pill-summary">{item.summary}</p>
      
      {capabilityLinks[item.capability] ? (
        <div className="mt-3">
          <a
            href={capabilityLinks[item.capability]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1.5 text-[13px] font-semibold transition ${linkColor}`}
          >
            {isFrench ? "Guide de référence" : "Reference Guide"}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-0.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      ) : null}
    </div>
  );
}
