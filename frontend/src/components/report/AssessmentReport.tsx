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
  language?: string | null;
};

export default function AssessmentReport({ report, onBack, companyName, language }: Props) {
  const resolvedLanguage = language || report.quick_wins_timeline?.language;

  return (
    <>
      <div className="print:hidden">
        <AssessmentResultsPage
          report={report}
          onBack={onBack}
          companyName={companyName}
          heroSlot={<ReportHeroSection report={report} onBack={onBack} companyName={companyName} language={resolvedLanguage} />}
          sectionsSlot={
            <>
              <CapabilitiesAxesSection hero={report.hero} axes={report.working_missing} language={resolvedLanguage} />
              <ReportLeadersSection snapshot={report.leaders_snapshot} language={resolvedLanguage} />
              <ReportQuickWinsTimeline timeline={report.quick_wins_timeline} language={resolvedLanguage} />
              <ReportGoFurtherSection assessmentId={report.assessment_id} language={resolvedLanguage} />
            </>
          }
        />
      </div>
      <ReportPdfDocument report={report} companyName={companyName} language={resolvedLanguage} />
    </>
  );  
}
