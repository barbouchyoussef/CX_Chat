import { useEffect, useState } from "react";
import "./Navbar.css";

type NavbarProps = {
  onStartConversation?: () => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
};

const TRANSLATIONS = {
  fr: {
    brandTitle: "Diagnostic gratuit",
    howItWorks: "Méthodologie",
    analysis: "Prismes d'analyse",
    synthesis: "Synthèse des résultats",
    cta: "Lancer le diagnostic",
  },
  en: {
    brandTitle: "Free Audit",
    howItWorks: "Methodology",
    analysis: "Analysis",
    synthesis: "Synthesis",
    cta: "Start the conversation",
  },
};

export default function Navbar({ onStartConversation, language = "en", onLanguageChange }: NavbarProps) {
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
          <a
            href="/test-benchmarks"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, "", "/test-benchmarks");
              window.dispatchEvent(new Event("popstate"));
            }}
            className="nav__link font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Sandbox
          </a>
          <button type="button" className="nav__cta" onClick={onStartConversation}>
            {t.cta}
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-0.5 shadow-sm backdrop-blur ml-auto lg:ml-6">
          <button
            type="button"
            onClick={() => onLanguageChange?.("fr")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${language === "fr" ? "bg-[#111827] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
          >
            FR
          </button>
          <button
            type="button"
            onClick={() => onLanguageChange?.("en")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${language === "en" ? "bg-[#111827] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
          >
            EN
          </button>
        </div>
      </div>
    </nav>
  );
}
