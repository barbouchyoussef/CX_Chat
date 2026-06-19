import React from "react";

const logoSrc = `${import.meta.env.BASE_URL}EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png`;

type FooterProps = {
  projectName?: string;
  date?: string;
  language?: string;
};

const TRANSLATIONS = {
  fr: {
    project: "Rapport de maturité de l'expérience client",
    desc: "Ce rapport synthétise l'évaluation de la maturité de l'expérience client, les éléments de comparaison et les actions prioritaires issues de l'entretien réalisé.",
  },
  en: {
    project: "Customer Experience Maturity Report",
    desc: "This report summarizes the customer experience maturity assessment, benchmark evidence, and prioritized actions from the completed interview.",
  },
};

const Footer: React.FC<FooterProps> = ({
  projectName,
  date = "June 2026 - Confidential",
  language = "en",
}) => {
  const t = TRANSLATIONS[language as "fr" | "en"] || TRANSLATIONS.en;
  const displayProjectName = projectName || t.project;

  return (
    <footer className="bg-gray-900 py-12 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-md">
            <img src={logoSrc} alt="EY Studio+" className="mb-4 h-10" />
            <p className="text-sm leading-relaxed text-gray-400">
              {t.desc}
            </p>
          </div>

          <div className="text-sm text-gray-400 md:text-right">
            <p>{displayProjectName}</p>
            <p className="mt-2">{date}</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
