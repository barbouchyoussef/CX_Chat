import React from "react";

const logoSrc = `${import.meta.env.BASE_URL}EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png`;

type FooterProps = {
  projectName?: string;
  date?: string;
  language?: string;
};

const TRANSLATIONS = {
  fr: {
    project: "Diagnostic de maturité d'expérience client",
    desc: "Ce rapport synthétise la maturité de votre expérience client, les repères sectoriels comparatifs et les recommandations stratégiques issues du diagnostic.",
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

          <div className="text-sm text-gray-400 md:text-right flex flex-col justify-between">
            <div>
              <p className="font-semibold text-white">{displayProjectName}</p>
              <p className="mt-1 text-xs text-gray-500">{date}</p>
            </div>
            <div className="mt-4 flex gap-3 md:justify-end items-center">
              <a
                href="/test-benchmarks"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", "/test-benchmarks");
                  window.dispatchEvent(new Event("popstate"));
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
              >
                Benchmark Sandbox
              </a>
              <span className="text-gray-700">|</span>
              <a
                href="/admin"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, "", "/admin");
                  window.dispatchEvent(new Event("popstate"));
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
              >
                Admin Panel
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
