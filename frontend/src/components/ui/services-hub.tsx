import { Gauge, ClipboardList, Radar, ArrowRight, ArrowLeft, Sparkles, Quote } from "lucide-react";
import FadeUp from "../FadeUp";

type ServicesHubProps = {
  language?: string;
  onBack: () => void;
  onOpenAssessment: () => void;
  onOpenInterviewHub: () => void;
  onOpenSocialScraping: () => void;
};

const TRANSLATIONS = {
  fr: {
    brand: "CX Studio",
    back: "Retour",
    eyebrow: "Suite CX EY",
    heading: "Choisissez votre outil",
    subtitle: "Trois outils pensés pour comprendre et améliorer votre expérience client.",
    assessmentTitle: "Diagnostic de maturité",
    assessmentDesc: "Une conversation guidée par IA qui évalue votre maturité CX sur les axes Piloter, Analyser et Améliorer, puis vous compare aux leaders du secteur.",
    assessmentCta: "Lancer le diagnostic",
    axisManage: "Piloter",
    axisAnalyze: "Analyser",
    axisImprove: "Améliorer",
    interviewTitle: "Guide d'entretien",
    interviewDesc: "Générez un guide d'entretien sur mesure selon le profil de votre interlocuteur, prêt à modifier, mener et exporter.",
    interviewCta: "Ouvrir l'Interview Hub",
    sampleQuestion: "Racontez-moi la dernière fois où un retour client a changé une décision.",
    followUpTag: "Relance incluse",
    scrapingTitle: "Écoute sociale",
    scrapingDesc: "Récupérez les avis Google Maps et commentaires Facebook publics, avec une classification IA du sentiment, des thèmes et des plaintes.",
    scrapingCta: "Ouvrir le Social Scraping",
    positive: "Positif",
    neutral: "Neutre",
    negative: "Négatif",
  },
  en: {
    brand: "CX Studio",
    back: "Back",
    eyebrow: "EY CX Suite",
    heading: "Choose the tool you need",
    subtitle: "Three tools built to help you understand and improve your customer experience.",
    assessmentTitle: "Maturity Assessment",
    assessmentDesc: "A guided AI conversation that scores your CX maturity across Manage, Analyze, and Improve, then benchmarks you against sector leaders.",
    assessmentCta: "Start the assessment",
    axisManage: "Manage",
    axisAnalyze: "Analyze",
    axisImprove: "Improve",
    interviewTitle: "Interview Guide",
    interviewDesc: "Generate a tailored, role-specific interview guide for your next stakeholder conversation, ready to edit, run, and export.",
    interviewCta: "Open Interview Hub",
    sampleQuestion: "Tell me about the last time customer feedback actually changed a decision.",
    followUpTag: "Follow-up included",
    scrapingTitle: "Social Listening",
    scrapingDesc: "Pull public Google Maps reviews and Facebook comments, and get AI-classified sentiment, themes, and complaints in one export.",
    scrapingCta: "Open Social Scraping",
    positive: "Positive",
    neutral: "Neutral",
    negative: "Negative",
  },
};

export default function ServicesHub({
  language = "en",
  onBack,
  onOpenAssessment,
  onOpenInterviewHub,
  onOpenSocialScraping,
}: ServicesHubProps) {
  const t = TRANSLATIONS[language as "fr" | "en"] || TRANSLATIONS.en;
  const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_40%,#f7f9fb_72%,#ffffff_100%)] text-[#111827]">
      <div className="pointer-events-none absolute right-[-10%] top-[-4%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(56,88,233,0.10),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none absolute left-[-12%] top-[36%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(246,210,0,0.14),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[10%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(45,122,58,0.10),rgba(255,255,255,0))] blur-3xl" />

      <header className="relative z-10 sticky top-0 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="EY" className="h-7 w-auto" />
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-sm font-medium text-slate-500">{t.brand}</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t.back}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
        <FadeUp>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F6D200]/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a6d00]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t.eyebrow}
            </span>
            <h1 className="mt-5 text-4xl font-medium leading-[1.1] tracking-[-0.03em] text-[#111827] sm:text-5xl">
              {t.heading}
            </h1>
            <p className="mt-4 text-lg font-light leading-8 text-[#4B5563]">{t.subtitle}</p>
          </div>
        </FadeUp>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {/* Maturity Assessment */}
          <FadeUp className="h-full">
            <button
              type="button"
              onClick={onOpenAssessment}
              className="group flex h-full w-full flex-col rounded-3xl border border-slate-100 bg-white/80 p-8 text-left shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#3858E9]">
                <Gauge className="h-7 w-7" aria-hidden="true" />
              </div>

              <h3 className="text-xl font-bold tracking-tight text-slate-900">{t.assessmentTitle}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">{t.assessmentDesc}</p>

              {/* Preview: mini axis score bars */}
              <div className="mt-6 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                {[
                  { label: t.axisManage, value: 62, color: "#C5A04F" },
                  { label: t.axisAnalyze, value: 78, color: "#3858E9" },
                  { label: t.axisImprove, value: 54, color: "#2D7A3A" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>{row.label}</span>
                      <span>{row.value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className="h-full rounded-full transition-all duration-700 group-hover:brightness-110"
                        style={{ width: `${row.value}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3858E9] transition-all duration-200 group-hover:gap-2.5">
                {t.assessmentCta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </button>
          </FadeUp>

          {/* Interview Guide */}
          <FadeUp delay="delay-1" className="h-full">
            <button
              type="button"
              onClick={onOpenInterviewHub}
              className="group flex h-full w-full flex-col rounded-3xl border border-slate-100 bg-white/80 p-8 text-left shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBF3E1] text-[#C5A04F]">
                <ClipboardList className="h-7 w-7" aria-hidden="true" />
              </div>

              <h3 className="text-xl font-bold tracking-tight text-slate-900">{t.interviewTitle}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">{t.interviewDesc}</p>

              {/* Preview: mini sample interview question */}
              <div className="mt-6 flex-1 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <Quote className="h-4 w-4 text-[#C5A04F]" aria-hidden="true" />
                <p className="mt-2 text-[12.5px] italic leading-relaxed text-slate-600">{t.sampleQuestion}</p>
                <span className="mt-3 inline-flex items-center rounded-full bg-[#FBF3E1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8a6d00]">
                  {t.followUpTag}
                </span>
              </div>

              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#C5A04F] transition-all duration-200 group-hover:gap-2.5">
                {t.interviewCta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </button>
          </FadeUp>

          {/* Social Listening */}
          <FadeUp delay="delay-2" className="h-full">
            <button
              type="button"
              onClick={onOpenSocialScraping}
              className="group flex h-full w-full flex-col rounded-3xl border border-slate-100 bg-white/80 p-8 text-left shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F9F2] text-[#2D7A3A]">
                <Radar className="h-7 w-7" aria-hidden="true" />
              </div>

              <h3 className="text-xl font-bold tracking-tight text-slate-900">{t.scrapingTitle}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">{t.scrapingDesc}</p>

              {/* Preview: mini sentiment split bar */}
              <div className="mt-6 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                {[
                  { label: t.positive, value: 64, color: "#10b981" },
                  { label: t.neutral, value: 21, color: "#94a3b8" },
                  { label: t.negative, value: 15, color: "#f43f5e" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>{row.label}</span>
                      <span>{row.value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className="h-full rounded-full transition-all duration-700 group-hover:brightness-110"
                        style={{ width: `${row.value}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2D7A3A] transition-all duration-200 group-hover:gap-2.5">
                {t.scrapingCta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </button>
          </FadeUp>
        </div>
      </main>
    </div>
  );
}
