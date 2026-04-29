import { useState } from "react";
import NavBar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import CoreFeaturesShowcase from "./components/CoreFeaturesShowcase";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";
import AssessmentChatStatic from "./components/ui/assessment-chat-static";

export default function App() {
  const [showChat, setShowChat] = useState(false);

  if (showChat) {
    return <AssessmentChatStatic onBack={() => setShowChat(false)} />;
  }

  return (
    <>
      <NavBar />
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
