import { useEffect, useState, lazy, Suspense } from "react";
import NavBar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import CoreFeaturesShowcase from "./components/CoreFeaturesShowcase";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";

// Lazy-loaded sub-pages to optimize initial landing bundle size
const AssessmentChatStatic = lazy(() => import("./components/ui/assessment-chat-static"));
const AdminDashboard = lazy(() => import("./components/ui/admin-dashboard"));
const AdminAssessmentDetail = lazy(() => import("./components/ui/admin-assessment-detail"));
const AdminAssessmentReport = lazy(() => import("./components/ui/admin-assessment-report"));
const ClientInterviewHub = lazy(() => import("./components/ui/client-interview-hub"));
const CustomizedTimeline = lazy(() => import("./components/CustomizedTimeline"));
const SocialScraping = lazy(() => import("./components/ui/social-scraping"));

function RouteLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0F1015]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative h-12 w-12">
          {/* Outer elegant spinning gradient ring */}
          <div className="absolute inset-0 rounded-full border-2 border-t-[#C5A04F] border-r-transparent border-b-[#3858E9] border-l-transparent animate-spin" />
          {/* Inner pulse */}
          <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(197,160,79,0.9),rgba(56,88,233,0.4))] animate-pulse" />
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#A0AEC0]/60 animate-pulse">
          Loading
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [language, setLanguage] = useState<string>("en");
  const [adminView, setAdminView] = useState<"dashboard" | "details" | "report" | "interview-guide">("dashboard");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null);
  const [pathname, setPathname] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const showAdmin = pathname.startsWith("/admin");
  const showTimelinePreview = pathname === "/timeline-preview";
  const showInterviewHub = pathname.startsWith("/client-interview-hub") || pathname.startsWith("/interview-hub");
  const showSocialScraping = pathname.startsWith("/social-scraping");

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
        <Suspense fallback={<RouteLoader />}>
          <CustomizedTimeline />
        </Suspense>
      </main>
    );
  }

  if (showInterviewHub) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <ClientInterviewHub
          onBack={() => {
            window.history.pushState({}, "", "/");
            setPathname("/");
          }}
        />
      </Suspense>
    );
  }

  if (showSocialScraping) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <SocialScraping
          onBack={() => {
            window.history.pushState({}, "", "/");
            setPathname("/");
          }}
        />
      </Suspense>
    );
  }

  if (showAdmin) {
    return (
      <Suspense fallback={<RouteLoader />}>
        {adminView === "details" && selectedAssessmentId ? (
          <AdminAssessmentDetail assessmentId={selectedAssessmentId} onBack={() => setAdminView("dashboard")} />
        ) : adminView === "report" && selectedAssessmentId ? (
          <AdminAssessmentReport assessmentId={selectedAssessmentId} onBack={() => setAdminView("dashboard")} />
        ) : (
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
        )}
      </Suspense>
    );
  }

  if (showChat) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AssessmentChatStatic onBack={() => setShowChat(false)} language={language} />
      </Suspense>
    );
  }

  return (
    <>
      <NavBar onStartConversation={() => setShowChat(true)} language={language} onLanguageChange={setLanguage} />
      <main style={{ paddingTop: "80px" }}>
        <Hero onStartConversation={() => setShowChat(true)} language={language} />
        <HowItWorks language={language} />
        <Features language={language} />
        <CoreFeaturesShowcase language={language} />
        <CTASection onStartConversation={() => setShowChat(true)} language={language} />
        <Footer language={language} />
      </main>
    </>
  );
}
