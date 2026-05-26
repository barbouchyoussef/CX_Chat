import { useEffect, useMemo, useState } from "react";
import type { FinalReportLeadersSnapshot } from "../../types/final-report";

type Props = {
  snapshot?: FinalReportLeadersSnapshot | null;
};

const LEADER_EMOJIS = ["🧭", "🌍", "🎟️"];

const SECTION_STYLES = `
  .report-leaders-shell .section {
    position: relative;
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 34px 36px 28px;
    isolation: isolate;
  }
  .report-leaders-shell .orbital-ring,
  .report-leaders-shell .orbital-ring-small,
  .report-leaders-shell .orbital-ring-left {
    position: absolute;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    pointer-events: none;
  }
  .report-leaders-shell .orbital-ring {
    top: -52px;
    right: 22px;
    width: 300px;
    height: 300px;
    opacity: 0.28;
  }
  .report-leaders-shell .orbital-ring-small {
    top: 10px;
    right: 84px;
    width: 180px;
    height: 180px;
    opacity: 0.18;
  }
  .report-leaders-shell .orbital-ring-left {
    left: -110px;
    bottom: 140px;
    width: 320px;
    height: 320px;
    opacity: 0.12;
  }
  .report-leaders-shell .section-head {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  .report-leaders-shell .section-number {
    font-family: "Geist Mono", monospace;
    font-size: 0.78rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }
  .report-leaders-shell .section-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2.05rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: #fff;
  }
  .report-leaders-shell .panel {
    position: relative;
    z-index: 2;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03)), rgba(7, 10, 20, 0.12);
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    overflow: hidden;
  }
  .report-leaders-shell .panel-inner {
    padding: 28px 28px 24px;
  }
  .report-leaders-shell .content-shell {
    position: relative;
    min-height: 440px;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015)), rgba(9, 12, 23, 0.12);
    overflow: hidden;
  }
  .report-leaders-shell .content-stage {
    padding: 28px 28px 26px;
    animation: reportLeadersFadeIn 260ms ease;
  }
  .report-leaders-shell .stage-meta {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr);
    gap: 24px;
    align-items: start;
    margin-bottom: 22px;
  }
  .report-leaders-shell .stage-summary {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .report-leaders-shell .stage-heading {
    margin: 0;
    font-size: clamp(1.6rem, 2.8vw, 2.15rem);
    line-height: 1.02;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: #fff;
  }
  .report-leaders-shell .chip-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 22px;
  }
  .report-leaders-shell .comp-chip {
    width: 100%;
    min-height: 110px;
    padding: 18px 18px 16px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)), rgba(8, 11, 20, 0.14);
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
    backdrop-filter: blur(10px);
  }
  .report-leaders-shell .comp-chip:hover,
  .report-leaders-shell .comp-chip.active {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.18);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03)), rgba(8, 11, 20, 0.18);
  }
  .report-leaders-shell .chip-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .report-leaders-shell .chip-emoji {
    font-size: 1.35rem;
    line-height: 1;
  }
  .report-leaders-shell .chip-name {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #fff;
  }
  .report-leaders-shell .chip-note {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.62);
    font-size: 0.92rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .report-leaders-shell .drawer {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)), rgba(8, 11, 20, 0.16);
    padding: 20px 22px 22px;
    min-height: 176px;
    backdrop-filter: blur(10px);
  }
  .report-leaders-shell .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .report-leaders-shell .drawer-name {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #fff;
  }
  .report-leaders-shell .drawer-title {
    margin: 0 0 12px;
    color: rgba(255, 255, 255, 0.54);
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .report-leaders-shell .practice-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .report-leaders-shell .practice {
    position: relative;
    display: block;
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.94rem;
    line-height: 1.55;
    padding-left: 28px;
  }
  .report-leaders-shell .practice-copy {
    display: block;
  }
  .report-leaders-shell .practice-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: #85eaff;
    font-size: 0.82rem;
    line-height: 1.4;
    text-decoration: none;
    border-bottom: 1px solid rgba(133, 234, 255, 0.28);
  }
  .report-leaders-shell .practice-link:hover {
    color: #ffffff;
    border-bottom-color: rgba(255, 255, 255, 0.55);
  }
  .report-leaders-shell .practice::before {
    content: "";
    position: absolute;
    left: 0;
    top: 1px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: rgba(133, 234, 255, 0.12);
    border: 1px solid rgba(133, 234, 255, 0.26);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .report-leaders-shell .practice::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 4px;
    border-left: 2px solid #85eaff;
    border-bottom: 2px solid #85eaff;
    left: 5px;
    top: 6px;
    transform: rotate(-45deg);
  }
  .report-leaders-shell .empty-state {
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.96rem;
    line-height: 1.6;
  }
  @keyframes reportLeadersFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (max-width: 1080px) {
    .report-leaders-shell .chip-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .report-leaders-shell .section {
      padding: 24px 16px 20px;
    }
    .report-leaders-shell .section-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }
    .report-leaders-shell .panel-inner {
      padding: 20px 18px 18px;
    }
    .report-leaders-shell .content-stage {
      padding: 22px 18px 20px;
    }
    .report-leaders-shell .chip-grid {
      grid-template-columns: 1fr;
    }
    .report-leaders-shell .drawer-head {
      flex-direction: column;
      align-items: flex-start;
    }
  }
  @media print {
    .report-leaders-shell .orbital-ring,
    .report-leaders-shell .orbital-ring-small,
    .report-leaders-shell .orbital-ring-left,
    .report-leaders-shell .content-shell {
      display: none !important;
    }
    .report-leaders-shell .section {
      width: 100%;
      padding: 18px 0 8px;
    }
    .report-leaders-shell .section-number {
      color: rgba(0, 0, 0, 0.55);
    }
    .report-leaders-shell .section-title,
    .report-leaders-shell .drawer-name,
    .report-leaders-shell .stage-heading,
    .report-leaders-shell .chip-name {
      color: #111318;
    }
    .report-leaders-shell .panel,
    .report-leaders-shell .drawer,
    .report-leaders-shell .comp-chip,
    .report-leaders-shell .print-leader-card {
      background: #fff !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      color: #111318;
    }
    .report-leaders-shell .panel-inner {
      padding: 0;
    }
    .report-leaders-shell .print-leaders-list {
      display: flex !important;
      flex-direction: column;
      gap: 16px;
    }
    .report-leaders-shell .print-leader-card {
      break-inside: avoid;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      padding: 18px;
    }
    .report-leaders-shell .practice-copy,
    .report-leaders-shell .chip-note,
    .report-leaders-shell .empty-state {
      color: rgba(17, 19, 24, 0.78) !important;
    }
    .report-leaders-shell .practice-link {
      color: #17315f;
      border-bottom-color: rgba(23, 49, 95, 0.28);
    }
  }
`;

export default function ReportLeadersSection({ snapshot }: Props) {
  const leaders = snapshot?.leaders ?? [];
  const [selectedKey, setSelectedKey] = useState<string>(leaders[0]?.key ?? "");

  useEffect(() => {
    setSelectedKey(leaders[0]?.key ?? "");
  }, [leaders]);

  const selectedLeader = useMemo(
    () => leaders.find((leader) => leader.key === selectedKey) ?? leaders[0] ?? null,
    [leaders, selectedKey],
  );

  if (!snapshot) {
    return null;
  }

  const isPending = snapshot.status === "pending" || snapshot.status === "running";
  const emptyMessage =
    snapshot.message ??
    (isPending
      ? "Leader benchmark content is being prepared in the background."
      : "Leader benchmark content is not available for this report yet.");

  return (
    <div className="report-leaders-shell">
      <style>{SECTION_STYLES}</style>
      <section className="section">
        <div className="orbital-ring" aria-hidden="true"></div>
        <div className="orbital-ring-small" aria-hidden="true"></div>
        <div className="orbital-ring-left" aria-hidden="true"></div>

        <div className="section-head">
          <span className="section-number">04</span>
          <h1 className="section-title">What Leaders Are Doing</h1>
        </div>

        <div className="panel">
          <div className="panel-inner">
            <div className="content-shell print:hidden">
              <div className="content-stage active" data-stage="leaders">
                <div className="stage-meta">
                  <div className="stage-summary">
                    <h3 className="stage-heading">These leaders run CX as a coordinated growth system, not a collection of good intentions.</h3>
                  </div>
                </div>

                {leaders.length ? (
                  <>
                    <div className="chip-grid">
                      {leaders.map((leader, index) => (
                        <button
                          key={leader.key}
                          className={`comp-chip ${leader.key === (selectedLeader?.key ?? "") ? "active" : ""}`}
                          type="button"
                          data-competitor={leader.key}
                          onClick={() => setSelectedKey(leader.key)}
                        >
                          <div className="chip-head">
                            <span className="chip-emoji">{LEADER_EMOJIS[index] ?? "✦"}</span>
                          </div>
                          <p className="chip-name">{leader.company_name}</p>
                          <p className="chip-note">
                            {leader.leader_summary ?? leader.note ?? "Public benchmark evidence was selected for this leader."}
                          </p>
                        </button>
                      ))}
                    </div>

                    <div className="drawer" data-drawer="leaders">
                      <div className="drawer-head">
                        <h4 className="drawer-name">{selectedLeader?.company_name ?? ""}</h4>
                      </div>
                      <p className="drawer-title">What leaders are doing</p>
                      <div className="practice-list">
                        {(selectedLeader?.evidence_links ?? []).map((link, index) => (
                          <div key={`${selectedLeader?.key ?? "leader"}-${index}`} className="practice">
                            <span className="practice-copy">{link.label}</span>
                            <a
                              className="practice-link"
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {link.source_title ? `Open source: ${link.source_title}` : "Open source"}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="drawer" data-drawer="leaders">
                    <p className="empty-state">{emptyMessage}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="print-leaders-list hidden">
              {leaders.length ? (
                leaders.map((leader, index) => (
                  <section key={`print-${leader.key}`} className="print-leader-card">
                    <div className="chip-head">
                      <span className="chip-emoji">{LEADER_EMOJIS[index] ?? "·"}</span>
                    </div>
                    <h4 className="drawer-name">{leader.company_name}</h4>
                    <p className="chip-note">
                      {leader.leader_summary ?? leader.note ?? "Public benchmark evidence was selected for this leader."}
                    </p>
                    <div className="practice-list">
                      {(leader.evidence_links ?? []).map((link, linkIndex) => (
                        <div key={`${leader.key}-print-${linkIndex}`} className="practice">
                          <span className="practice-copy">{link.label}</span>
                          <a className="practice-link" href={link.url} target="_blank" rel="noreferrer">
                            {link.source_title ? `Open source: ${link.source_title}` : "Open source"}
                          </a>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="drawer">
                  <p className="empty-state">{emptyMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
