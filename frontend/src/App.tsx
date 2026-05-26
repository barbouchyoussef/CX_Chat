import { useEffect, useState } from "react";
import NavBar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import CoreFeaturesShowcase from "./components/CoreFeaturesShowcase";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";
import AssessmentChatStatic from "./components/ui/assessment-chat-static";
import AdminDashboard from "./components/ui/admin-dashboard";
import AdminAssessmentDetail from "./components/ui/admin-assessment-detail";
import AdminAssessmentReport from "./components/ui/admin-assessment-report";
import CustomizedTimeline from "./components/CustomizedTimeline";

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [adminView, setAdminView] = useState<"dashboard" | "details" | "report">("dashboard");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null);
  const [pathname, setPathname] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const showAdmin = pathname.startsWith("/admin");
  const showTimelinePreview = pathname === "/timeline-preview";

  if (showTimelinePreview) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "40px 16px",
          background: "#f8fafc",
        }}
      >
        <CustomizedTimeline />
      </main>
    );
  }

  if (showAdmin) {
    if (adminView === "details" && selectedAssessmentId) {
      return <AdminAssessmentDetail assessmentId={selectedAssessmentId} onBack={() => setAdminView("dashboard")} />;
    }
    if (adminView === "report" && selectedAssessmentId) {
      return <AdminAssessmentReport assessmentId={selectedAssessmentId} onBack={() => setAdminView("dashboard")} />;
    }
    return (
      <AdminDashboard
        onBack={() => {
          window.history.pushState({}, "", "/");
          setPathname("/");
        }}
        onOpenAssessmentDetails={(assessmentId) => {
          setSelectedAssessmentId(assessmentId);
          setAdminView("details");
        }}
        onOpenAssessmentReport={(assessmentId) => {
          setSelectedAssessmentId(assessmentId);
          setAdminView("report");
        }}
      />
    );
  }

  if (showChat) {
    return <AssessmentChatStatic onBack={() => setShowChat(false)} />;
  }

  return (
    <>
      <NavBar onStartConversation={() => setShowChat(true)} />
      <main style={{ paddingTop: "80px" }}>
        <Hero onStartConversation={() => setShowChat(true)} />
        <HowItWorks />
        <Features />
        <CoreFeaturesShowcase />
        <CTASection onStartConversation={() => setShowChat(true)} />
        <Footer />
      </main>
    </>
  );
}
