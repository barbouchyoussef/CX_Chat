import React from "react";

const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;

type FooterProps = {
  projectName?: string;
  date?: string;
};

const Footer: React.FC<FooterProps> = ({
  projectName = "Audit UX/UI — Sedad Bank by BMI",
  date = "Avril 2026 — Confidentiel",
}) => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row justify-between gap-8">
          
          {/* LEFT: BRAND */}
          <div className="max-w-md">
            <img
              src={logoSrc}
              alt="EY Studio+"
              className="h-10 mb-4"
            />

            <p className="text-sm text-gray-400 leading-relaxed">
              Ce rapport a été généré dans le cadre du framework EY UX Optimizer.
              Les évaluations sont basées sur une analyse experte des captures
              d'écran fournies et les recommandations WCAG 2.1.
            </p>
          </div>

          {/* RIGHT: META */}
          <div className="text-sm text-gray-400 md:text-right">
            <p>{projectName}</p>
            <p className="mt-2">{date}</p>
          </div>

        </div>

      </div>
    </footer>
  );
};

export default Footer;