import type { FinalReport } from "../../types/final-report";
import FlowArt, { FlowSection } from "../ui/story-scroll";
import CapabilitiesAxesSection from "./CapabilitiesAxesSection";
import ReportGoFurtherSection from "./ReportGoFurtherSection";
import ReportHeroSection from "./ReportHeroSection";
import ReportLeadersSection from "./ReportLeadersSection";
import ReportQuickWinsTimeline from "./ReportQuickWinsTimeline";

type Props = {
  report: FinalReport;
  onBack: () => void;
  companyName?: string | null;
};

const STORY_SCROLL_STYLES = `
  .report-story-scroll {
    position: relative;
    isolation: isolate;
  }
  .report-story-scroll [data-flow-section] {
    background: transparent;
  }
  .report-story-scroll [data-flow-inner] {
    min-height: 100svh;
    padding: 0;
    gap: 0;
    transform-origin: bottom left;
    background: #0e1220;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .report-story-scroll [data-flow-inner]::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01) 30%, rgba(0,0,0,0.12) 100%),
      radial-gradient(circle at 14% 16%, rgba(255,255,255,0.04), transparent 22%),
      radial-gradient(circle at 84% 20%, rgba(133,234,255,0.05), transparent 24%);
    opacity: 0.82;
  }
  .report-story-scroll [data-flow-inner]::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background:
      linear-gradient(180deg, rgba(7,10,18,0.14), rgba(7,10,18,0.04)),
      rgba(10, 13, 22, 0.88);
  }
  .report-story-scroll .flow-tone-hero [data-flow-inner]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,212,71,0.05) 32%, rgba(0,0,0,0.08) 100%),
      radial-gradient(circle at 18% 16%, rgba(255,212,71,0.16), transparent 24%),
      radial-gradient(circle at 82% 14%, rgba(255,255,255,0.05), transparent 24%);
  }
  .report-story-scroll .flow-tone-hero [data-flow-inner] {
    background: #121728;
  }
  .report-story-scroll .flow-tone-hero [data-flow-inner]::after {
    background:
      linear-gradient(180deg, rgba(17,24,39,0.06), rgba(17,24,39,0.01)),
      linear-gradient(132deg, #11141d 0%, #16284b 34%, #1f2f72 68%, #2f2370 100%);
  }
  .report-story-scroll .flow-tone-stand [data-flow-inner]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(133,234,255,0.05) 34%, rgba(0,0,0,0.08) 100%),
      radial-gradient(circle at 22% 18%, rgba(133,234,255,0.12), transparent 24%),
      radial-gradient(circle at 78% 20%, rgba(159,147,255,0.05), transparent 24%);
  }
  .report-story-scroll .flow-tone-stand [data-flow-inner] {
    background: #0e1626;
  }
  .report-story-scroll .flow-tone-stand [data-flow-inner]::after {
    background:
      linear-gradient(180deg, rgba(6,10,20,0.16), rgba(6,10,20,0.05)),
      linear-gradient(135deg, #0d1624 0%, #102338 58%, #18324a 100%);
  }
  .report-story-scroll .flow-tone-leaders [data-flow-inner]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(159,147,255,0.06) 34%, rgba(0,0,0,0.09) 100%),
      radial-gradient(circle at 18% 16%, rgba(159,147,255,0.15), transparent 24%),
      radial-gradient(circle at 84% 18%, rgba(133,234,255,0.05), transparent 24%);
  }
  .report-story-scroll .flow-tone-leaders [data-flow-inner] {
    background: #131425;
  }
  .report-story-scroll .flow-tone-leaders [data-flow-inner]::after {
    background:
      linear-gradient(180deg, rgba(9,12,22,0.18), rgba(9,12,22,0.05)),
      linear-gradient(135deg, #121522 0%, #1a1631 60%, #25184b 100%);
  }
  .report-story-scroll .flow-tone-wins [data-flow-inner]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,212,255,0.06) 34%, rgba(0,0,0,0.09) 100%),
      radial-gradient(circle at 18% 18%, rgba(255,212,71,0.11), transparent 24%),
      radial-gradient(circle at 82% 18%, rgba(0,212,255,0.13), transparent 24%);
  }
  .report-story-scroll .flow-tone-wins [data-flow-inner] {
    background: #0d1627;
  }
  .report-story-scroll .flow-tone-wins [data-flow-inner]::after {
    background:
      linear-gradient(180deg, rgba(6,10,20,0.16), rgba(6,10,20,0.05)),
      linear-gradient(135deg, #0d1724 0%, #11273a 54%, #17394e 100%);
  }
  .report-story-scroll .flow-tone-further [data-flow-inner]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,212,71,0.06) 34%, rgba(0,0,0,0.1) 100%),
      radial-gradient(circle at 20% 18%, rgba(255,212,71,0.16), transparent 24%),
      radial-gradient(circle at 80% 18%, rgba(159,147,255,0.10), transparent 24%);
  }
  .report-story-scroll .flow-tone-further [data-flow-inner] {
    background: #17131f;
  }
  .report-story-scroll .flow-tone-further [data-flow-inner]::after {
    background:
      linear-gradient(180deg, rgba(10,10,18,0.16), rgba(10,10,18,0.05)),
      linear-gradient(135deg, #17131d 0%, #221929 54%, #2d1e36 100%);
  }
  .report-story-scroll .flow-stage {
    position: relative;
    z-index: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .report-story-scroll [data-flow-inner] {
      min-height: auto;
    }
  }
`;

export default function ReportStoryScroll({ report, onBack, companyName }: Props) {
  return (
    <>
      <style>{STORY_SCROLL_STYLES}</style>
      <FlowArt aria-label="Assessment report story scroll" className="report-story-scroll">
        <FlowSection aria-label="Report introduction" className="flow-tone-hero">
          <div className="flow-stage">
            <ReportHeroSection report={report} onBack={onBack} companyName={companyName} />
          </div>
        </FlowSection>

        <FlowSection aria-label="Where you stand" className="flow-tone-stand">
          <div className="flow-stage">
            <CapabilitiesAxesSection hero={report.hero} axes={report.working_missing} />
          </div>
        </FlowSection>

        <FlowSection aria-label="Benchmark leaders" className="flow-tone-leaders">
          <div className="flow-stage">
            <ReportLeadersSection snapshot={report.leaders_snapshot} />
          </div>
        </FlowSection>

        <FlowSection aria-label="Quick wins" className="flow-tone-wins">
          <div className="flow-stage">
            <ReportQuickWinsTimeline timeline={report.quick_wins_timeline} />
          </div>
        </FlowSection>

        <FlowSection aria-label="Go further" className="flow-tone-further">
          <div className="flow-stage">
            <ReportGoFurtherSection assessmentId={report.assessment_id} />
          </div>
        </FlowSection>
      </FlowArt>
    </>
  );
}
