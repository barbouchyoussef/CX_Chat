import { useEffect, useState } from "react";
import "./Navbar.css";

type NavbarProps = {
  onStartConversation?: () => void;
};

export default function Navbar({ onStartConversation }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;

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
          <span className="nav__title">Free CX Audit</span>
        </div>

        <div className="nav__links">
          <a href="#methodology" className="nav__link">
            Methodologie
          </a>
          <a href="#screens" className="nav__link">
            Analyse
          </a>
          <a href="#summary" className="nav__link">
            Synthese
          </a>
          <button type="button" className="nav__cta" onClick={onStartConversation}>
            Start the conversation
          </button>
        </div>
      </div>
    </nav>
  );
}
