import AssessmentResultsPage from "../ui/assessment-results-page";
import type { FinalReport } from "../../types/final-report";
import CapabilitiesAxesSection from "./CapabilitiesAxesSection";
import ReportGoFurtherSection from "./ReportGoFurtherSection";
import ReportHeroSection from "./ReportHeroSection";
import ReportLeadersSection from "./ReportLeadersSection";
import ReportPdfDocument from "./ReportPdfDocument";
import ReportQuickWinsTimeline from "./ReportQuickWinsTimeline";

type Props = {
  report: FinalReport;
  onBack: () => void;
  companyName?: string | null;
};

export default function AssessmentReport({ report, onBack, companyName }: Props) {
  return (
    <>
      <div className="print:hidden">
        <AssessmentResultsPage
          report={report}
          onBack={onBack}
          companyName={companyName}
          heroSlot={<ReportHeroSection report={report} onBack={onBack} companyName={companyName} />}
          sectionsSlot={
            <>
              <CapabilitiesAxesSection hero={report.hero} axes={report.working_missing} />
              <ReportLeadersSection snapshot={report.leaders_snapshot} />
              <ReportQuickWinsTimeline timeline={report.quick_wins_timeline} />
              <ReportGoFurtherSection />
            </>
          }
        />
      </div>
      <ReportPdfDocument report={report} companyName={companyName} />
    </>
  );  
}
