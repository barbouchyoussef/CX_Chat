import { useEffect, useState } from "react";
import "./Navbar.css";

type NavbarProps = {
  onStartConversation?: () => void;
  language?: string;
};

const TRANSLATIONS = {
  fr: {
    brandTitle: "Évaluation gratuite",
    howItWorks: "Comment ORION pense",
    analysis: "Analyse",
    synthesis: "Synthèse",
    cta: "Commencer la conversation",
  },
  en: {
    brandTitle: "Free Audit",
    howItWorks: "How ORION thinks",
    analysis: "Analysis",
    synthesis: "Synthesis",
    cta: "Start the conversation",
  },
};

export default function Navbar({ onStartConversation, language = "en" }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;
  const t = TRANSLATIONS[language as "fr" | "en"] || TRANSLATIONS.en;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`nav ${scrolled ? "scrolled" : ""}`} id="nav">
      <div className="nav__inner">
        <div className="nav__brand">
          <img src={logoSrc} alt="EY Studio+" className="nav__logo" />
          <span className="nav__separator">|</span>
          <span className="nav__title">{t.brandTitle}</span>
        </div>

        <div className="nav__links">
          <a href="#methodology" className="nav__link">
            {t.howItWorks}
          </a>
          <a href="#screens" className="nav__link">
            {t.analysis}
          </a>
          <a href="#summary" className="nav__link">
            {t.synthesis}
          </a>
          <button type="button" className="nav__cta" onClick={onStartConversation}>
            {t.cta}
          </button>
        </div>
      </div>
    </nav>
  );
}
