import type {
  FinalReport,
  FinalReportCapabilityItem,
  FinalReportLeaderEvidenceLink,
  FinalReportLeaderItem,
  FinalReportQuickWinItem,
  FinalReportWorkingMissingAxis,
} from "../../types/final-report";

type Props = {
  report: FinalReport;
  companyName?: string | null;
};

const LOGO_SRC = "/EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png";

const PDF_STYLES = `
  @page {
    size: A4;
    margin: 0;
  }
  html,
  body {
    background: #10265a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report-pdf-shell {
    min-height: 100vh;
    color: #f8fbff;
    background:
      radial-gradient(circle at top right, rgba(107, 92, 255, 0.34), transparent 30%),
      radial-gradient(circle at 20% 12%, rgba(56, 214, 255, 0.16), transparent 24%),
      linear-gradient(155deg, #0f2152 0%, #153572 46%, #1a2f88 100%);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report-pdf-shell .pdf-page {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 34px 32px 28px;
    box-sizing: border-box;
  }
  .report-pdf-shell .pdf-topbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 26px;
  }
  .report-pdf-shell .pdf-logo {
    width: 164px;
    height: auto;
    flex: 0 0 auto;
  }
  .report-pdf-shell .pdf-meta {
    text-align: right;
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(248, 251, 255, 0.66);
  }
  .report-pdf-shell .pdf-cover {
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
    box-shadow: 0 22px 52px rgba(4, 10, 36, 0.24);
    padding: 28px 28px 24px;
    margin-bottom: 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-pdf-shell .pdf-kicker {
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.62);
    margin-bottom: 12px;
  }
  .report-pdf-shell .pdf-cover-grid {
    display: block;
  }
  .report-pdf-shell .pdf-company {
    margin: 0;
    font-size: 44px;
    line-height: 0.96;
    letter-spacing: -0.06em;
    font-weight: 800;
  }
  .report-pdf-shell .pdf-subline {
    margin-top: 8px;
    color: rgba(248, 251, 255, 0.7);
    font-size: 15px;
    line-height: 1.55;
  }
  .report-pdf-shell .pdf-summary,
  .report-pdf-shell .pdf-copy,
  .report-pdf-shell .pdf-capability-reco,
  .report-pdf-shell .pdf-link-reason {
    color: rgba(248, 251, 255, 0.88);
    font-size: 14px;
    line-height: 1.7;
  }
  .report-pdf-shell .pdf-summary {
    margin-top: 18px;
  }
  .report-pdf-shell .pdf-cover-lower {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .report-pdf-shell .pdf-maturity-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .report-pdf-shell .pdf-maturity-card {
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04));
    padding: 18px;
    min-height: 148px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .report-pdf-shell .pdf-maturity-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .report-pdf-shell .pdf-maturity-icon {
    width: 52px;
    height: 52px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 800;
    color: #fff;
    flex: 0 0 auto;
  }
  .report-pdf-shell .pdf-maturity-icon.stage {
    background: linear-gradient(135deg, #ffcf47, #e7a923);
  }
  .report-pdf-shell .pdf-maturity-icon.strongest {
    background: linear-gradient(135deg, #69f0ff, #26b6e8);
  }
  .report-pdf-shell .pdf-maturity-icon.priority {
    background: linear-gradient(135deg, #8857ff, #5b34e7);
  }
  .report-pdf-shell .pdf-maturity-label {
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(248, 251, 255, 0.62);
  }
  .report-pdf-shell .pdf-maturity-value {
    margin: 0;
    font-size: 28px;
    line-height: 1.05;
    letter-spacing: -0.04em;
    font-weight: 800;
  }
  .report-pdf-shell .pdf-maturity-sub {
    margin-top: 6px;
    color: rgba(248, 251, 255, 0.72);
    font-size: 13px;
    line-height: 1.45;
  }
  .report-pdf-shell .pdf-landscape {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.035));
    padding: 18px 20px 20px;
  }
  .report-pdf-shell .pdf-landscape-title {
    margin: 0;
    font-size: 26px;
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 800;
  }
  .report-pdf-shell .pdf-stage-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    align-items: center;
    margin-top: 10px;
  }
  .report-pdf-shell .pdf-stage-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }
  .report-pdf-shell .pdf-stage-item::after {
    content: "";
    position: absolute;
    top: 26px;
    left: calc(50% + 36px);
    width: calc(100% - 72px);
    height: 1px;
    background: linear-gradient(90deg, rgba(255, 207, 71, 0.45), rgba(132, 235, 255, 0.2));
  }
  .report-pdf-shell .pdf-stage-item:last-child::after {
    display: none;
  }
  .report-pdf-shell .pdf-stage-dot {
    position: relative;
    z-index: 1;
    width: 52px;
    height: 52px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 23px;
    font-weight: 800;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(248, 251, 255, 0.86);
  }
  .report-pdf-shell .pdf-stage-item.active .pdf-stage-dot {
    background: linear-gradient(135deg, #ffcf47, #e7a923);
    color: #fff;
    border-color: rgba(255, 207, 71, 0.65);
    box-shadow: 0 0 0 8px rgba(255, 207, 71, 0.08);
  }
  .report-pdf-shell .pdf-stage-name {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .report-pdf-shell .pdf-stage-detail {
    font-size: 12px;
    line-height: 1.45;
    color: rgba(248, 251, 255, 0.66);
    max-width: 190px;
  }
  .report-pdf-shell .pdf-grid-two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .report-pdf-shell .pdf-grid-three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .report-pdf-shell .pdf-section {
    margin-top: 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-pdf-shell .pdf-section-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 12px;
  }
  .report-pdf-shell .pdf-section-number {
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(248, 251, 255, 0.6);
  }
  .report-pdf-shell .pdf-section-title {
    margin: 0;
    font-size: 25px;
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 700;
  }
  .report-pdf-shell .pdf-card,
  .report-pdf-shell .pdf-axis-card,
  .report-pdf-shell .pdf-leader-card,
  .report-pdf-shell .pdf-quick-win-card,
  .report-pdf-shell .pdf-capability-card {
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    background: rgba(255, 255, 255, 0.055);
    padding: 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-pdf-shell .pdf-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .report-pdf-shell .pdf-card-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.12;
    letter-spacing: -0.03em;
    font-weight: 700;
  }
  .report-pdf-shell .pdf-card-subtitle {
    margin-top: 6px;
    color: rgba(248, 251, 255, 0.72);
    font-size: 14px;
    line-height: 1.55;
  }
  .report-pdf-shell .pdf-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    flex-shrink: 0;
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.09);
    color: rgba(248, 251, 255, 0.84);
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .report-pdf-shell .pdf-head-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 10px;
  }
  .report-pdf-shell .pdf-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .report-pdf-shell .pdf-body-group {
    margin-top: 12px;
  }
  .report-pdf-shell .pdf-body-group + .pdf-body-group {
    margin-top: 14px;
  }
  .report-pdf-shell .pdf-label {
    margin: 0 0 6px;
    color: rgba(248, 251, 255, 0.62);
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .report-pdf-shell .pdf-mini-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .report-pdf-shell .pdf-mini-item {
    padding-left: 14px;
    position: relative;
  }
  .report-pdf-shell .pdf-mini-item::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #84ebff;
  }
  .report-pdf-shell .pdf-mini-name {
    color: #fff;
    font-weight: 700;
    font-size: 14px;
  }
  .report-pdf-shell .pdf-mini-copy {
    margin-top: 4px;
    color: rgba(248, 251, 255, 0.78);
    font-size: 13px;
    line-height: 1.6;
  }
  .report-pdf-shell .pdf-capability-grid,
  .report-pdf-shell .pdf-axis-grid,
  .report-pdf-shell .pdf-quick-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .report-pdf-shell .pdf-link-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .report-pdf-shell .pdf-link-title {
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
  }
  .report-pdf-shell .pdf-link-source {
    color: rgba(248, 251, 255, 0.62);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 3px;
  }
  .report-pdf-shell .pdf-footer {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    text-align: center;
    color: rgba(248, 251, 255, 0.56);
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  @media print {
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: #10265a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-pdf-shell {
      display: block !important;
      min-height: auto;
      background:
        radial-gradient(circle at top right, rgba(107, 92, 255, 0.34), transparent 30%),
        radial-gradient(circle at 20% 12%, rgba(56, 214, 255, 0.16), transparent 24%),
        linear-gradient(155deg, #0f2152 0%, #153572 46%, #1a2f88 100%) !important;
    }
    .report-pdf-shell .pdf-page {
      width: 100%;
      max-width: none;
      margin: 0;
      min-height: 100vh;
      padding: 18px 18px 14px;
      box-sizing: border-box;
    }
  }
`;

function clean(value?: string | null) {
  return (value || "").trim();
}

function chipText(value?: string | null) {
  return clean(value) || "Not specified";
}

function axisLabel(axis: string) {
  return axis.charAt(0).toUpperCase() + axis.slice(1);
}

function maturityBandToLevel(label?: string | null) {
  const normalized = clean(label).toLowerCase();
  if (normalized === "basic") return 1;
  if (normalized === "established") return 2;
  if (normalized === "advanced") return 3;
  return null;
}

function renderWorkingMissing(axis: FinalReportWorkingMissingAxis) {
  return (
    <div className="pdf-axis-grid">
      <div className="pdf-card">
        <p className="pdf-label">What is working</p>
        <div className="pdf-mini-list">
          {axis.working.map((item) => (
            <div key={`${axis.axis}-working-${item.capability}`} className="pdf-mini-item">
              <div className="pdf-mini-name">{item.capability}</div>
              <div className="pdf-mini-copy">{item.summary || item.evidence_snippet || "Credible evidence is present."}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pdf-card">
        <p className="pdf-label">What is missing</p>
        <div className="pdf-mini-list">
          {axis.missing.map((item) => (
            <div key={`${axis.axis}-missing-${item.capability}`} className="pdf-mini-item">
              <div className="pdf-mini-name">{item.capability}</div>
              <div className="pdf-mini-copy">{item.summary || item.evidence_snippet || "More evidence is still needed."}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderLeaderEvidence(link: FinalReportLeaderEvidenceLink, index: number) {
  return (
    <div key={`${link.url}-${index}`} className="pdf-mini-item">
      <div className="pdf-link-title">{link.label}</div>
      {link.source_title ? <div className="pdf-link-source">{link.source_title}</div> : null}
      {link.why_relevant ? <div className="pdf-link-reason">{link.why_relevant}</div> : null}
    </div>
  );
}

function renderLeader(leader: FinalReportLeaderItem) {
  return (
    <article key={leader.key} className="pdf-leader-card">
      <div className="pdf-head-row">
        <div>
          <h3 className="pdf-card-title">{leader.company_name}</h3>
          <div className="pdf-card-subtitle">{leader.leader_summary || leader.note || "Public benchmark evidence selected for this leader."}</div>
        </div>
      </div>
      <div className="pdf-body-group">
        <p className="pdf-label">Evidence used</p>
        <div className="pdf-link-list">
          {leader.evidence_links.map(renderLeaderEvidence)}
        </div>
      </div>
    </article>
  );
}

function renderQuickWin(item: FinalReportQuickWinItem) {
  return (
    <article key={`quick-win-${item.step}`} className="pdf-quick-win-card">
      <div className="pdf-head-row">
        <div>
          <h3 className="pdf-card-title">{item.title}</h3>
          <div className="pdf-card-subtitle">Owner | {chipText(item.owner)}</div>
        </div>
        <span className="pdf-chip">{chipText(item.timeline_label)}</span>
      </div>
      <div className="pdf-quick-grid">
        <div className="pdf-card">
          <p className="pdf-label">Current state</p>
          <div className="pdf-copy">{item.today_text}</div>
        </div>
        <div className="pdf-card">
          <p className="pdf-label">Expected outcome</p>
          <div className="pdf-copy">{item.after_text}</div>
        </div>
      </div>
    </article>
  );
}

function renderCapability(item: FinalReportCapabilityItem) {
  return (
    <article key={`${item.axis}-${item.capability}-${item.capability_id}`} className="pdf-capability-card">
      <div className="pdf-head-row">
        <div>
          <h3 className="pdf-card-title">{item.capability}</h3>
          <div className="pdf-card-subtitle">
            {item.axis} | {item.maturity_band} | {item.assessment_status}
          </div>
        </div>
        <span className="pdf-chip">{item.maturity_level_number} / 3</span>
      </div>
      <div className="pdf-body-group">
        <p className="pdf-label">Observed signal</p>
        <div className="pdf-copy">{item.rationale}</div>
      </div>
      <div className="pdf-body-group">
        <p className="pdf-label">Recommended action</p>
        <div className="pdf-capability-reco">{item.recommendation}</div>
      </div>
    </article>
  );
}

export default function ReportPdfDocument({ report, companyName }: Props) {
  const hero = report.hero;
  const summary = report.summary;
  const resolvedCompany = companyName || hero.company_name || "Assessment";
  const leaders = report.leaders_snapshot?.leaders ?? [];
  const quickWins = report.quick_wins_timeline?.items ?? [];
  const capabilities = report.capabilities ?? [];
  const assessedCapabilitiesCount = summary.assessed_capabilities_count ?? capabilities.filter(
    (item) => (item.assessment_status || "").toLowerCase() === "assessed",
  ).length;
  const shouldShowCapabilityDetail = assessedCapabilitiesCount >= 9;
  const overallLevelNumber = hero.overall_level ?? maturityBandToLevel(summary.overall_maturity_band) ?? 1;
  const overallLevelLabel = hero.overall_level_label || `${overallLevelNumber} / 3`;
  const strongestAxisLabel = chipText(summary.strongest_axis);
  const strongestAxisLevelLabel =
    hero.strongest_axis_level_label ||
    chipText(
      report.axes.find((axis) => clean(axis.axis).toLowerCase() === strongestAxisLabel.toLowerCase())?.axis_level_label,
    );
  const priorityAxisLabel = chipText(summary.priority_axis);
  const priorityAxisLevelLabel =
    hero.priority_axis_level_label ||
    chipText(
      report.axes.find((axis) => clean(axis.axis).toLowerCase() === priorityAxisLabel.toLowerCase())?.axis_level_label,
    );
  const stageLabels = ["Basic", "Established", "Advanced"];

  return (
    <div className="report-pdf-shell hidden print:block">
      <style>{PDF_STYLES}</style>
      <div className="pdf-page">
        <header className="pdf-topbar">
          <img className="pdf-logo" src={LOGO_SRC} alt="EY Studio+ logo" />
          <div className="pdf-meta">
            <div>{chipText(hero.report_title)}</div>
            <div>{chipText(hero.report_date_label)}</div>
          </div>
        </header>

        <section className="pdf-cover">
          <div className="pdf-kicker">Customer Experience Assessment</div>
          <div className="pdf-cover-grid">
            <div>
              <h1 className="pdf-company">{resolvedCompany}</h1>
              <div className="pdf-subline">
                {chipText(hero.sector_name)} | {chipText(hero.region)} | Overall maturity: {chipText(summary.overall_maturity_band)}
              </div>
              <div className="pdf-summary">
                {hero.hero_message || summary.executive_summary_text || "Assessment summary unavailable."}
              </div>
              <div className="pdf-cover-lower">
                <div className="pdf-maturity-grid">
                  <article className="pdf-maturity-card">
                    <div className="pdf-maturity-top">
                      <span className="pdf-maturity-icon stage">○</span>
                      <div className="pdf-maturity-label">Stage</div>
                    </div>
                    <div>
                      <h3 className="pdf-maturity-value">{chipText(summary.overall_maturity_band)}</h3>
                      <div className="pdf-maturity-sub">{overallLevelLabel}</div>
                    </div>
                  </article>
                  <article className="pdf-maturity-card">
                    <div className="pdf-maturity-top">
                      <span className="pdf-maturity-icon strongest">↗</span>
                      <div className="pdf-maturity-label">Strongest</div>
                    </div>
                    <div>
                      <h3 className="pdf-maturity-value">{strongestAxisLabel}</h3>
                      <div className="pdf-maturity-sub">{strongestAxisLevelLabel}</div>
                    </div>
                  </article>
                  <article className="pdf-maturity-card">
                    <div className="pdf-maturity-top">
                      <span className="pdf-maturity-icon priority">⊕</span>
                      <div className="pdf-maturity-label">Priority</div>
                    </div>
                    <div>
                      <h3 className="pdf-maturity-value">{priorityAxisLabel}</h3>
                      <div className="pdf-maturity-sub">{priorityAxisLevelLabel}</div>
                    </div>
                  </article>
                </div>
                <section className="pdf-landscape">
                  <div className="pdf-section-head">
                    <span className="pdf-section-number">02</span>
                    <h2 className="pdf-landscape-title">Where You Stand — Maturity Landscape</h2>
                  </div>
                  <div className="pdf-stage-row">
                    {stageLabels.map((label, index) => {
                      const stageNumber = index + 1;
                      const isActive = stageNumber === overallLevelNumber;
                      return (
                        <div key={label} className={`pdf-stage-item${isActive ? " active" : ""}`}>
                          <div className="pdf-stage-dot">{stageNumber}</div>
                          <div className="pdf-stage-name">{label}</div>
                          <div className="pdf-stage-detail">
                            {label === "Basic"
                              ? "Reactive routines still dominate and customer evidence is not yet consistently translated into action."
                              : label === "Established"
                                ? "Foundations are visible and repeatable, but execution and governance remain uneven."
                                : "Customer insight is embedded into decision-making, ownership, and sustained improvement."}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        {report.working_missing.length ? (
          <section className="pdf-section">
            <div className="pdf-section-head">
              <span className="pdf-section-number">02</span>
              <h2 className="pdf-section-title">Axis Review</h2>
            </div>
            <div className="pdf-list">
              {report.working_missing.map((axis) => (
                <article key={axis.axis} className="pdf-axis-card">
                  <div className="pdf-head-row">
                    <div>
                      <h3 className="pdf-card-title">{axis.label}</h3>
                      <div className="pdf-card-subtitle">{axis.subtitle || axis.intro || "Assessment detail for this axis."}</div>
                    </div>
                    <span className="pdf-chip">{axis.axis_level_label || axis.maturity_band || axisLabel(axis.axis)}</span>
                  </div>
                  {renderWorkingMissing(axis)}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {leaders.length ? (
          <section className="pdf-section">
            <div className="pdf-section-head">
              <span className="pdf-section-number">03</span>
              <h2 className="pdf-section-title">Benchmark Leaders</h2>
            </div>
            <div className="pdf-list">{leaders.map(renderLeader)}</div>
          </section>
        ) : null}

        {quickWins.length ? (
          <section className="pdf-section">
            <div className="pdf-section-head">
              <span className="pdf-section-number">04</span>
              <h2 className="pdf-section-title">{report.quick_wins_timeline?.section_title || "Quick Wins"}</h2>
            </div>
            <div className="pdf-list">{quickWins.map(renderQuickWin)}</div>
          </section>
        ) : null}

        {shouldShowCapabilityDetail && capabilities.length ? (
          <section className="pdf-section">
            <div className="pdf-section-head">
              <span className="pdf-section-number">05</span>
              <h2 className="pdf-section-title">Capability Detail</h2>
            </div>
            <div className="pdf-list">{capabilities.map(renderCapability)}</div>
          </section>
        ) : null}

        <footer className="pdf-footer">EY Studio+ Customer Experience Assessment Report</footer>
      </div>
    </div>
  );
}
