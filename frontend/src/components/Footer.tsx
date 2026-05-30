import React from "react";

const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;

type FooterProps = {
  projectName?: string;
  date?: string;
};

const Footer: React.FC<FooterProps> = ({
  projectName = "CX Maturity Report",
  date = "May 2026 - Confidential",
}) => {
  return (
    <footer className="bg-gray-900 py-12 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-md">
            <img src={logoSrc} alt="EY Studio+" className="mb-4 h-10" />
            <p className="text-sm leading-relaxed text-gray-400">
              This report summarizes the CX maturity assessment, benchmark evidence, and prioritized actions from the completed interview.
            </p>
          </div>

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
