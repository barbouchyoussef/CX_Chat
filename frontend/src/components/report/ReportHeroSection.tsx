import { ArrowLeft, Download } from "lucide-react";

import type { FinalReport } from "../../types/final-report";

type Props = {
  report: FinalReport;
  companyName?: string | null;
  onBack?: () => void;
};

const ORBIT_IMAGE_SRC = "/1b428a9545ed4c55816d6fd0bd7115df485a185c.png";

const axisLabel = (value?: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "Unknown";

function StageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <path d="m12 14 4-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StrongestIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <path d="M7 7h10v10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17 17 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PriorityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 8v8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ReportHeroSection({ report, companyName, onBack }: Props) {
  const hero = report.hero;
  const summary = report.summary;
  const resolvedCompany = companyName || hero.company_name || "Executive Report";
  const overview =
    hero.hero_message?.trim() ||
    summary.executive_summary_text?.trim() ||
    `${resolvedCompany} is currently at ${hero.overall_maturity_band} maturity. ${axisLabel(hero.strongest_axis)} is the strongest area today, while ${axisLabel(hero.priority_axis)} needs the most attention next.`;

  return (
    <section className="relative overflow-hidden px-3 py-4 text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8 print:px-0 print:py-0 print:text-black">
      <div className="pointer-events-none absolute inset-0 opacity-60 print:hidden">
        <div className="absolute left-[18%] top-[28%] h-24 w-24 rounded-full bg-white/6 blur-3xl" />
        <div className="absolute left-[36%] top-[82%] h-20 w-20 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute -right-[18px] top-[-82px] h-[420px] w-[420px] rounded-full border border-white/15 opacity-35 print:hidden" />
      <div className="pointer-events-none absolute right-[86px] top-7 h-[250px] w-[250px] rounded-full border border-white/15 opacity-20 print:hidden" />
      <div className="pointer-events-none absolute bottom-[92px] left-[-178px] h-[460px] w-[460px] rounded-full border border-white/15 opacity-20 print:hidden" />

      <div className="relative z-10 mx-auto grid min-h-[760px] w-full max-w-[1320px] gap-7 px-4 pb-5 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)] lg:gap-7 lg:px-11 lg:pb-6 lg:pt-12 print:min-h-0 print:px-0 print:pt-0">
        <div className="min-w-0 pt-16 lg:pt-2">
          <div className="absolute right-0 top-0 z-20 flex flex-wrap items-center justify-end gap-3 print:hidden">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4 py-3 text-sm font-semibold text-white/92 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/12"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffd447,rgba(255,255,255,0.94))] px-[18px] py-[13px] text-sm font-bold text-[#111318] shadow-[0_16px_28px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>

          <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/6 px-[14px] py-[7px] font-mono text-[11px] uppercase tracking-[0.16em] text-white/88 backdrop-blur-xl print:border-black/15 print:bg-transparent print:text-black/70">
            <span>{hero.report_title}</span>
            <span>{hero.report_date_label || "Report"}</span>
          </div>

          <h1 className="max-w-[10ch] text-[clamp(3.8rem,7vw,6rem)] font-extrabold leading-[0.92] tracking-[-0.075em] text-white print:text-black">
            {resolvedCompany}
          </h1>

          <p className="mt-4 text-base tracking-[0.01em] text-white/60 print:text-black/60">
            <span>{hero.sector_name || "Customer Experience"}</span>
            {(hero.sector_name || hero.region) ? <span aria-hidden="true"> · </span> : null}
            <span>{hero.region || "Global"}</span>
          </p>

          <p className="mt-7 max-w-[58ch] text-[1.02rem] leading-[1.72] text-white/84 print:text-black/80">
            {overview}
          </p>
        </div>

        <div className="relative min-h-[440px] lg:min-h-[560px] print:hidden">
          <img
            className="pointer-events-none absolute right-[-12px] top-[-100px] z-10 w-full max-w-[560px] rotate-[-2deg] select-none drop-shadow-[0_28px_48px_rgba(0,0,0,0.28)] drop-shadow-[0_0_34px_rgba(255,255,255,0.08)]"
            src={ORBIT_IMAGE_SRC}
            alt=""
          />
        </div>

        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-3 print:break-inside-avoid">
          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#ffd447_0%,#c8973f_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <StageIcon />
              </div>
              <p className="font-mono text-[0.74rem] uppercase tracking-[0.18em] text-white/50 print:text-black/50">Stage</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white print:text-black">
                {hero.overall_maturity_band}
              </p>
              <p className="mt-2 text-[1.02rem] text-white/68 print:text-black/65">{hero.overall_level_label || "-- / --"}</p>
            </div>
          </article>

          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#85eaff_0%,#00d4ff_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <StrongestIcon />
              </div>
              <p className="font-mono text-[0.74rem] uppercase tracking-[0.18em] text-white/50 print:text-black/50">Strongest</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white print:text-black">
                {axisLabel(hero.strongest_axis)}
              </p>
              <p className="mt-2 text-[1.02rem] text-white/68 print:text-black/65">{hero.strongest_axis_level_label || "-- / --"}</p>
            </div>
          </article>

          <article className="flex min-h-[176px] flex-col justify-between gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-[10px] print:border-black/10 print:bg-white print:text-black">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#7c5cff_0%,#4d22df_100%)] text-white shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <PriorityIcon />
              </div>
              <p className="font-mono text-[0.74rem] uppercase tracking-[0.18em] text-white/50 print:text-black/50">Priority</p>
            </div>
            <div className="min-h-[84px]">
              <p className="text-[clamp(1.45rem,2.4vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-[#ffe4eb] print:text-black">
                {axisLabel(hero.priority_axis)}
              </p>
              <p className="mt-2 text-[1.02rem] text-white/68 print:text-black/65">{hero.priority_axis_level_label || "-- / --"}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
