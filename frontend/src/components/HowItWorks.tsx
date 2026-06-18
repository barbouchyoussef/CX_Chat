import { useState } from "react";

const manageImg = new URL("../assets/manage.jpg", import.meta.url).href;
const analyzeImg = new URL("../assets/analyze.jpg", import.meta.url).href;
const improveImg = new URL("../assets/improve.jpg", import.meta.url).href;

type HowItWorksProps = {
  language?: string;
};

const TRANSLATIONS = {
  fr: {
    category: "COMMENT ORION PENSE",
    heading: "Trois prismes. Une vérité",
    subtitle: "La plupart des organisations ont des zones d'ombre. ORION analyse votre organisation sous trois angles pour dresser un portrait complet et honnête de votre situation.",
    axisLabel: "AXE",
    axes: [
      {
        step: "01",
        title: "Gérer",
        tagline: "Qui est responsable de l'expérience dans votre organisation ?",
        desc: "Avant de pouvoir s'améliorer, quelqu'un doit être responsable. Cette dimension mesure la façon dont l'expérience client est gouvernée, intégrée à votre structure et soutenue à tous les niveaux, de la direction générale au personnel de terrain.",
      },
      {
        step: "02",
        title: "Analyser",
        tagline: "Écoutez-vous les bons signaux ?",
        desc: "Des données sans orientation ne sont que du bruit. Cette dimension évalue la façon dont votre organisation capte les signaux des clients, leur donne du sens et transforme les retours bruts en décisions concrètes.",
      },
      {
        step: "03",
        title: "Améliorer",
        tagline: "Vos analyses se traduisent-elles en actions ?",
        desc: "La plupart des organisations collectent des données. Rares sont celles qui agissent de manière cohérente. Cette dimension mesure l'aptitude de votre organisation à concevoir, tester et perfectionner continuellement l'expérience, fermant ainsi la boucle entre le ressenti client et vos actions.",
      },
    ],
  },
  en: {
    category: "HOW ORION THINKS",
    heading: "Three lenses. One truth",
    subtitle: "Most organizations have blind spots. ORION looks at your organization from three angles to build a complete, honest picture of where you stand.",
    axisLabel: "AXIS",
    axes: [
      {
        step: "01",
        title: "Manage",
        tagline: "Who owns the experience in your organization?",
        desc: "Before anything can improve, someone has to be responsible. This dimension measures how well customer experience is governed, embedded in your structure, and championed at every level, from the C-suite to the frontline.",
      },
      {
        step: "02",
        title: "Analyze",
        tagline: "Are you listening to the right signals?",
        desc: "Data without direction is just noise. This dimension evaluates how your organization captures customer signals, makes sense of them, and turns raw feedback into decisions that actually move the needle.",
      },
      {
        step: "03",
        title: "Improve",
        tagline: "Do your insights ever become action?",
        desc: "Most organizations collect data. Few act on it consistently. This dimension measures how well your organization designs, tests, and continuously refines the experience, closing the loop between what customers feel and what you do about it.",
      },
    ],
  },
};

export default function HowItWorks({ language = "en" }: HowItWorksProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const t = TRANSLATIONS[language as "fr" | "en"] || TRANSLATIONS.en;

  const axes = t.axes.map((ax, index) => {
    const staticData = [
      {
        bg: "bg-[#101499]",
        fg: "text-white",
        subtle: "text-white/75",
        image: manageImg,
      },
      {
        bg: "bg-[#4CC2E9]",
        fg: "text-black",
        subtle: "text-black/70",
        image: analyzeImg,
      },
      {
        bg: "bg-[#9C43FE]",
        fg: "text-white",
        subtle: "text-white/75",
        image: improveImg,
      },
    ];
    return {
      ...ax,
      ...staticData[index],
    };
  });

  const activeAxis = axes[activeIdx];

  const getBadgeStyles = (step: string) => {
    if (step === "01") return "bg-indigo-50 text-indigo-700 border border-indigo-100";
    if (step === "02") return "bg-sky-50 text-sky-700 border border-sky-100";
    return "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100";
  };

  const getBottomLineGradient = (step: string) => {
    if (step === "01") return "bg-gradient-to-r from-indigo-500 to-indigo-600";
    if (step === "02") return "bg-gradient-to-r from-sky-400 to-sky-500";
    return "bg-gradient-to-r from-fuchsia-500 to-fuchsia-600";
  };

  return (
    <section id="methodology" className="relative overflow-hidden bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] pt-16 pb-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          {/* LEFT: Header and Vertical Selector */}
          <div className="flex flex-col gap-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{t.category}</p>
              <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-slate-900 md:text-5xl">
                {t.heading}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                {t.subtitle}
              </p>
            </div>

            <div className="flex flex-col gap-3.5">
              {axes.map((axis, index) => {
                const isActive = index === activeIdx;
                let activeBorderClass = "border-indigo-600 bg-indigo-50/30";
                let activeTextClass = "text-indigo-600";

                if (axis.step === "02") {
                  activeBorderClass = "border-sky-500 bg-sky-50/30";
                  activeTextClass = "text-sky-600";
                } else if (axis.step === "03") {
                  activeBorderClass = "border-fuchsia-600 bg-fuchsia-50/30";
                  activeTextClass = "text-fuchsia-600";
                }

                return (
                  <button
                    key={axis.step}
                    onClick={() => setActiveIdx(index)}
                    onMouseEnter={() => setActiveIdx(index)}
                    className={`flex items-start gap-4 rounded-2xl border p-4.5 text-left transition-all duration-300 cursor-pointer ${
                      isActive
                        ? `${activeBorderClass} shadow-[0_10px_30px_rgba(0,0,0,0.02)]`
                        : "border-slate-100 bg-white/40 hover:border-slate-200 hover:bg-white/70"
                    }`}
                  >
                    <span className={`text-sm font-bold tracking-wider ${isActive ? activeTextClass : "text-slate-400"}`}>
                      {axis.step}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-950 leading-none">{axis.title}</h4>
                      <p className="mt-2.5 text-xs text-slate-500 font-medium line-clamp-1">{axis.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Dynamic Showcase Display */}
          <div className="relative">
            <div className="relative overflow-hidden rounded-[32px] border border-slate-100 bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300">
              {/* Image with key-triggered scale-in effect */}
              <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-slate-50 border border-slate-100">
                <img
                  key={activeAxis.step}
                  src={activeAxis.image}
                  alt={activeAxis.title}
                  style={{ animation: "fadeInScale 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
              </div>

              {/* Tag and Content with entrance animations */}
              <div key={`content-${activeIdx}`} style={{ animation: "fadeInUpShort 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards" }} className="mt-6">
                <div className="mb-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold tracking-wider uppercase ${getBadgeStyles(activeAxis.step)}`}>
                    {t.axisLabel} {activeAxis.step}
                  </span>
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                  {activeAxis.title}
                </h3>
                <h4 className="mt-2 text-sm font-semibold leading-snug text-slate-800">
                  {activeAxis.tagline}
                </h4>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-500 font-normal">
                  {activeAxis.desc}
                </p>
              </div>

              {/* Glowing Indicator bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 transition-all duration-300 ${getBottomLineGradient(activeAxis.step)}`} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0.6;
            transform: scale(1.025);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fadeInUpShort {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
