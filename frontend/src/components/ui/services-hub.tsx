import { useEffect, useState, type ReactNode } from "react";
import { Gauge, ClipboardList, Radar, ArrowRight, Sparkles, Quote, FileSearch, ChevronRight, Home, ListChecks } from "lucide-react";

import FadeUp from "../FadeUp";
import ProjectPipeline, { type PipelineStepMeta } from "./project-pipeline";
import ProjectSidebar from "./project-sidebar";
import {
  createProject,
  getProject,
  deleteProject as apiDeleteProject,
  listProjects,
  setProjectStep,
  PROJECT_STEP_KEYS,
  type Project,
  type StepKey,
  type StepStatus,
} from "../../lib/projectsApi";

const ACTIVE_PROJECT_KEY = "cx_active_project";

type ServicesHubProps = {
  language?: string;
  onBack: () => void;
  onOpenAssessment: () => void;
  onOpenInterviewHub: () => void;
  onOpenSocialScraping: () => void;
  onOpenDeskResearch: () => void;
};

const TRANSLATIONS = {
  fr: {
    brand: "CX Studio",
    back: "Accueil",
    eyebrow: "Suite CX EY",
    heading: "Votre pipeline CX",
    subtitle: "Suivez le parcours complet du diagnostic à l'analyse, ou choisissez directement l'outil dont vous avez besoin.",
    assessmentTitle: "Diagnostic de maturité",
    assessmentDesc: "Évaluez votre maturité CX sur les axes Piloter, Analyser et Améliorer.",
    assessmentCta: "Lancer le diagnostic",
    axisManage: "Piloter",
    axisAnalyze: "Analyser",
    axisImprove: "Améliorer",
    interviewTitle: "Guide d'entretien",
    interviewDesc: "Générez un guide d'entretien sur mesure selon le profil de votre interlocuteur.",
    interviewCta: "Ouvrir l'Interview Hub",
    sampleQuestion: "Racontez-moi la dernière fois où un retour client a changé une décision.",
    followUpTag: "Relance incluse",
    scrapingTitle: "Écoute sociale",
    scrapingDesc: "Récupérez les avis publics et obtenez sentiment, thèmes et plaintes par IA.",
    scrapingCta: "Ouvrir le Social Scraping",
    positive: "Positif",
    neutral: "Neutre",
    negative: "Négatif",
    deskResearchTitle: "Desk Research",
    deskResearchDesc: "Importez les documents client et obtenez une synthèse structurée par l'IA.",
    deskResearchCta: "Ouvrir le Desk Research",
    issueLogTitle: "Registre des enjeux",
    issueLogDesc: "Consolide les constats de chaque module en un registre d'enjeux priorisé — le fil qui relie tout le parcours.",
    comingSoon: "Bientôt disponible",
    soon: "Bientôt",
    stepLabel: "Étape",
    pipelineNote: "Commencez par l'étape 1 pour un parcours complet, ou sélectionnez n'importe quel outil directement.",
  },
  en: {
    brand: "CX Studio",
    back: "Home",
    eyebrow: "EY CX Suite",
    heading: "Your CX Pipeline",
    subtitle: "Follow the full journey from assessment to analysis, or jump straight to any tool you need.",
    assessmentTitle: "Maturity Assessment",
    assessmentDesc: "Score your CX maturity across Manage, Analyze, and Improve dimensions.",
    assessmentCta: "Start the assessment",
    axisManage: "Manage",
    axisAnalyze: "Analyze",
    axisImprove: "Improve",
    interviewTitle: "Interview Guide",
    interviewDesc: "Generate a tailored interview guide for your next stakeholder conversation.",
    interviewCta: "Open Interview Hub",
    sampleQuestion: "Tell me about the last time customer feedback actually changed a decision.",
    followUpTag: "Follow-up included",
    scrapingTitle: "Social Listening",
    scrapingDesc: "Pull public reviews and get AI-classified sentiment, themes, and complaints.",
    scrapingCta: "Open Social Scraping",
    positive: "Positive",
    neutral: "Neutral",
    negative: "Negative",
    deskResearchTitle: "Desk Research",
    deskResearchDesc: "Upload client documents and get an AI-structured synthesis with citations.",
    deskResearchCta: "Open Desk Research",
    issueLogTitle: "Issue Log",
    issueLogDesc: "Consolidates every module's findings into one prioritized issue log — the thread that connects the whole journey.",
    comingSoon: "Coming soon",
    soon: "Soon",
    stepLabel: "Step",
    pipelineNote: "Start at step 1 for the full lifecycle, or select any tool directly.",
  },
};

/* ---- small arrow connector between pipeline cards ---- */
function PipelineArrow() {
  return (
    <div className="hidden items-center justify-center lg:flex" aria-hidden="true">
      <ChevronRight className="h-5 w-5 text-slate-300" />
    </div>
  );
}

type HubCard = {
  step: number;
  title: string;
  desc: string;
  cta: string;
  onClick?: () => void;
  comingSoon?: boolean;
  iconBg: string;
  iconColor: string;
  ctaColor: string;
  icon: ReactNode;
  preview: ReactNode;
};

function PipelineArrowVertical() {
  return (
    <div className="flex items-center justify-center py-1 lg:hidden" aria-hidden="true">
      <svg width="14" height="24" viewBox="0 0 14 24" fill="none">
        <path d="M7 0v20M2 16l5 6 5-6" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function ServicesHub({
  language = "en",
  onBack,
  onOpenAssessment,
  onOpenInterviewHub,
  onOpenSocialScraping,
  onOpenDeskResearch,
}: ServicesHubProps) {
  const t = TRANSLATIONS[language as "fr" | "en"] || TRANSLATIONS.en;
  const logoSrc = `${import.meta.env.BASE_URL}ey_logo.svg`;

  const CARDS: HubCard[] = [
    {
      step: 1,
      title: t.assessmentTitle,
      desc: t.assessmentDesc,
      cta: t.assessmentCta,
      onClick: onOpenAssessment,
      iconBg: "bg-[#EEF2FF]",
      iconColor: "text-[#3858E9]",
      ctaColor: "text-[#3858E9]",
      icon: <Gauge className="h-6 w-6" aria-hidden="true" />,
      preview: (
        <div className="space-y-2.5">
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
                  className="h-full rounded-full"
                  style={{ width: `${row.value}%`, backgroundColor: row.color }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      step: 2,
      title: t.interviewTitle,
      desc: t.interviewDesc,
      cta: t.interviewCta,
      onClick: onOpenInterviewHub,
      iconBg: "bg-[#FBF3E1]",
      iconColor: "text-[#C5A04F]",
      ctaColor: "text-[#C5A04F]",
      icon: <ClipboardList className="h-6 w-6" aria-hidden="true" />,
      preview: (
        <div>
          <Quote className="h-4 w-4 text-[#C5A04F]" aria-hidden="true" />
          <p className="mt-2 text-[12px] italic leading-relaxed text-slate-600">{t.sampleQuestion}</p>
          <span className="mt-2.5 inline-flex items-center rounded-full bg-[#FBF3E1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8a6d00]">
            {t.followUpTag}
          </span>
        </div>
      ),
    },
    {
      step: 3,
      title: t.scrapingTitle,
      desc: t.scrapingDesc,
      cta: t.scrapingCta,
      onClick: onOpenSocialScraping,
      iconBg: "bg-[#F0F9F2]",
      iconColor: "text-[#2D7A3A]",
      ctaColor: "text-[#2D7A3A]",
      icon: <Radar className="h-6 w-6" aria-hidden="true" />,
      preview: (
        <div className="space-y-2.5">
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
                  className="h-full rounded-full"
                  style={{ width: `${row.value}%`, backgroundColor: row.color }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      step: 4,
      title: t.deskResearchTitle,
      desc: t.deskResearchDesc,
      cta: t.deskResearchCta,
      onClick: onOpenDeskResearch,
      iconBg: "bg-[#F3F0FF]",
      iconColor: "text-[#7C3AED]",
      ctaColor: "text-[#7C3AED]",
      icon: <FileSearch className="h-6 w-6" aria-hidden="true" />,
      preview: (
        <div>
          <div className="flex flex-wrap gap-2">
            {["PDF", "XLSX", "PPTX", "DOCX"].map((ext) => (
              <span
                key={ext}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500"
              >
                {ext}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-slate-400">Upload → Parse → AI Synthesis</p>
        </div>
      ),
    },
    {
      step: 5,
      title: t.issueLogTitle,
      desc: t.issueLogDesc,
      cta: t.comingSoon,
      onClick: undefined,
      comingSoon: true,
      iconBg: "bg-[#F6D200]/20",
      iconColor: "text-[#8a6d00]",
      ctaColor: "text-slate-400",
      icon: <ListChecks className="h-6 w-6" aria-hidden="true" />,
      preview: (
        <div>
          <div className="flex items-center gap-1.5">
            {["#3858E9", "#C5A04F", "#10b981", "#7C3AED"].map((c, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                {idx < 3 && <span className="h-px w-3 bg-slate-300" />}
              </div>
            ))}
            <span className="mx-1 text-slate-300">→</span>
            <ListChecks className="h-4 w-4 text-[#8a6d00]" />
          </div>
          <p className="mt-2.5 text-[11px] text-slate-400">Connect findings → prioritized issues</p>
        </div>
      ),
    },
  ];

  // ── Projects: a tracked pipeline over the (untouched) modules ──────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Map each pipeline step to the module launcher it opens (modules stay untouched).
  const stepAction: Record<StepKey, () => void> = {
    assessment: onOpenAssessment,
    interview: onOpenInterviewHub,
    desk_research: onOpenDeskResearch,
    social: onOpenSocialScraping,
  };

  // Reuse the module cards' visuals for the pipeline steps, in engagement order.
  const cardByAction = new Map(CARDS.map((c) => [c.onClick, c]));
  const realSteps: PipelineStepMeta[] = (
    [
      { key: "assessment" as StepKey, action: onOpenAssessment },
      { key: "interview" as StepKey, action: onOpenInterviewHub },
      { key: "desk_research" as StepKey, action: onOpenDeskResearch },
      { key: "social" as StepKey, action: onOpenSocialScraping },
    ]
  ).map((s, idx) => {
    const c = cardByAction.get(s.action)!;
    return { key: s.key, step: idx + 1, title: c.title, desc: c.desc, icon: c.icon, iconBg: c.iconBg, iconColor: c.iconColor };
  });
  // Append the Issue Log as a greyed "coming soon" final node (not counted in progress).
  const issueCard = CARDS.find((c) => c.comingSoon);
  const pipelineSteps: PipelineStepMeta[] = issueCard
    ? [
        ...realSteps,
        {
          key: "issue_log",
          step: realSteps.length + 1,
          title: issueCard.title,
          desc: issueCard.desc,
          icon: issueCard.icon,
          iconBg: issueCard.iconBg,
          iconColor: issueCard.iconColor,
          comingSoon: true,
        },
      ]
    : realSteps;

  // Load projects, and restore the active project across module launches (localStorage).
  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]));
    const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
    if (savedId) {
      getProject(savedId)
        .then(setActiveProject)
        .catch(() => localStorage.removeItem(ACTIVE_PROJECT_KEY));
    }
  }, []);

  const openProject = (p: Project) => {
    setActiveProject(p);
    localStorage.setItem(ACTIVE_PROJECT_KEY, p.id);
  };
  const exitProject = () => {
    setActiveProject(null);
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    listProjects().then(setProjects).catch(() => {});
  };
  const handleCreateProject = async (name: string, company: string) => {
    const p = await createProject({ name, company_name: company || undefined });
    setProjects((prev) => [p, ...prev]);
    openProject(p);
  };
  const handleSetStatus = async (key: StepKey, status: StepStatus) => {
    if (!activeProject) return;
    // optimistic
    setActiveProject({ ...activeProject, steps: { ...activeProject.steps, [key]: status } });
    try {
      const updated = await setProjectStep(activeProject.id, key, status);
      setActiveProject(updated);
    } catch {
      /* keep optimistic value */
    }
  };
  const handleOpenStep = (key: StepKey) => {
    // Opening a not-started step nudges it to "in progress", then launches the module.
    if (activeProject && (activeProject.steps[key] ?? "todo") === "todo") {
      handleSetStatus(key, "in_progress");
    }
    stepAction[key]?.();
  };
  const handleDeleteProject = async () => {
    if (!activeProject) return;
    await apiDeleteProject(activeProject.id);
    exitProject();
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f6f7fb] text-[#111827]">
      {/* Shared full-width top header (spans the whole width; the rail sits below it) */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/85 px-5 backdrop-blur-lg">
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
          <Home className="h-3.5 w-3.5" aria-hidden="true" />
          {t.back}
        </button>
      </header>

      {/* Hover-expand project rail (PM-style), overlays the page so content never reflows. */}
      <ProjectSidebar
        projects={projects}
        activeId={activeProject?.id ?? null}
        stepKeys={PROJECT_STEP_KEYS}
        isFrench={language === "fr"}
        onSelect={openProject}
        onCreate={handleCreateProject}
        onHome={exitProject}
      />

      <div className="pl-16">
        {activeProject ? (
          <ProjectPipeline
            project={activeProject}
            steps={pipelineSteps}
            isFrench={language === "fr"}
            onOpenStep={handleOpenStep}
            onSetStatus={handleSetStatus}
            onDelete={handleDeleteProject}
          />
        ) : (
          <div className="relative flex min-h-[calc(100vh-4rem)] flex-col">
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-start px-6 py-10 lg:justify-center lg:py-8">
        {/* Heading */}
        <FadeUp>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F6D200]/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a6d00]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t.eyebrow}
            </span>
            <h1 className="mt-4 text-4xl font-medium leading-[1.1] tracking-[-0.03em] text-[#111827] sm:text-5xl">
              {t.heading}
            </h1>
            <p className="mt-3 text-lg font-light leading-8 text-[#4B5563]">{t.subtitle}</p>
          </div>
        </FadeUp>

        {/* Pipeline hint */}
        <FadeUp delay="delay-1">
          <p className="mx-auto mt-5 max-w-lg text-center text-sm text-slate-400">
            {t.pipelineNote}
          </p>
        </FadeUp>


        {/* Pipeline grid with arrows */}
        <div className="mt-8 w-full">
          {/* Large screens: horizontal pipeline, centered */}
          <div className="hidden lg:flex lg:items-stretch lg:justify-center lg:gap-0">
            {CARDS.map((card, i) => (
              <div key={card.step} className="flex items-stretch">
                <FadeUp delay={`delay-${i}` as "delay-1" | "delay-2" | "delay-3"} className="flex">
                  <button
                    type="button"
                    onClick={card.onClick}
                    disabled={card.comingSoon}
                    className={`group flex w-[224px] flex-col rounded-2xl border p-6 text-left transition-all duration-200 ${
                      card.comingSoon
                        ? "cursor-default border-dashed border-slate-300 bg-slate-50/60"
                        : "border-slate-200 bg-white hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg"
                    }`}
                  >
                    {/* Step badge + icon */}
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg} ${card.iconColor}`}>
                        {card.icon}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.stepLabel} {card.step}
                      </span>
                      {card.comingSoon && (
                        <span className="ml-auto rounded-full bg-[#F6D200]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a6d00]">
                          {t.soon}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold tracking-tight text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{card.desc}</p>

                    {/* Preview */}
                    <div className="mt-4 flex-1 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      {card.preview}
                    </div>

                    {/* CTA */}
                    <div className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${card.ctaColor} transition-all duration-200 ${card.comingSoon ? "" : "group-hover:gap-2.5"}`}>
                      {card.cta}
                      {!card.comingSoon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </div>
                  </button>
                </FadeUp>

                {/* Arrow between cards */}
                {i < CARDS.length - 1 && <PipelineArrow />}
              </div>
            ))}
          </div>

          {/* Small / medium screens: vertical pipeline */}
          <div className="flex flex-col items-center gap-0 lg:hidden">
            {CARDS.map((card, i) => (
              <div key={card.step} className="flex w-full max-w-md flex-col items-center">
                <FadeUp delay={`delay-${Math.min(i, 3)}` as "delay-1" | "delay-2" | "delay-3"} className="w-full">
                  <button
                    type="button"
                    onClick={card.onClick}
                    disabled={card.comingSoon}
                    className={`group flex w-full flex-col rounded-2xl border p-6 text-left transition-all duration-200 ${
                      card.comingSoon
                        ? "cursor-default border-dashed border-slate-300 bg-slate-50/60"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg"
                    }`}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg} ${card.iconColor}`}>
                        {card.icon}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.stepLabel} {card.step}
                      </span>
                      {card.comingSoon && (
                        <span className="ml-auto rounded-full bg-[#F6D200]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a6d00]">
                          {t.soon}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold tracking-tight text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{card.desc}</p>

                    <div className="mt-4 flex-1 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      {card.preview}
                    </div>

                    <div className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${card.ctaColor} transition-all duration-200 ${card.comingSoon ? "" : "group-hover:gap-2.5"}`}>
                      {card.cta}
                      {!card.comingSoon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </div>
                  </button>
                </FadeUp>

                {i < CARDS.length - 1 && <PipelineArrowVertical />}
              </div>
            ))}
          </div>
        </div>
      </main>
          </div>
        )}
      </div>
    </div>
  );
}
