import { Sparkles, Wand2, ArrowUpRight, Bot, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FadeUp from "./FadeUp";

const features = [
  {
    step: "1",
    title: "A maturity signal",
    desc: "How your experience is currently managed",
    bullets: []
  },
  {
    step: "2",
    title: "A structural diagnosis",
    desc: "Where data supports (or limits) your decisions",
    bullets: []
  },
  {
    step: "3",
    title: "Clear improvement directions",
    desc: "Which levers can create real impact",
    bullets: []
  }
];

const scoreRows = [
  ["Strategy & governance", "62%", "#C5A04F"],
  ["Customer understanding", "78%", "#2D7A3A"],
  ["Journey design", "51%", "#EAAA08"],
  ["Measurement", "68%", "#3858E9"],
];

export default function CoreFeaturesShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="summary" ref={sectionRef} className="bg-white py-16 sm:py-20 lg:py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          {/* LEFT */}
          <div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-gray-900">
              You don't leave with answers. You leave with clarity.
            </h2>
            <p className="text-lg text-gray-600 mb-8 mt-4">
              At the end of the conversation, ORION synthesizes your inputs into a structured reading of your CX maturity.
            </p>

            <div className="mt-10 space-y-10">
              {features.map(item => (
                <div key={item.step} className="flex gap-5">
                  <div className="shrink-0">
                    <div className="h-11 w-11 rounded-full bg-[#176BFF] text-white flex items-center justify-center font-semibold">
                      {item.step}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-gray-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 max-w-xl">{item.desc}</p>

                    {item.bullets.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-sm text-gray-600 list-disc pl-5">
                        {item.bullets.map(b => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="mt-12 lg:mt-0">
            <FadeUp delay="delay-2">
              <div className="relative min-h-[100px] md:min-h-[430px]">
                <div className="absolute -left-2 -top-10 z-20 hidden lg:block">
                  <div className="relative mx-auto flex h-[12rem] w-[12rem] items-center justify-center md:mx-0">
                    <div className="absolute inset-0 rounded-full border border-[#3858E9]/12" />
                    <div className="absolute inset-4 rounded-full border border-[#E5E7EB] bg-white/35 backdrop-blur-[2px]" />
                    <div className="absolute inset-1 rounded-full border border-[#C5A04F]/18" style={{ animation: "aiOrbit 16s linear infinite" }}>
                      <span className="absolute left-6 top-5 h-2.5 w-2.5 rounded-full bg-[#3858E9]" />
                      <span className="absolute bottom-6 right-5 h-2.5 w-2.5 rounded-full bg-[#C5A04F]" />
                    </div>
                    <div className="absolute inset-7 rounded-full border border-[#3858E9]/10" style={{ animation: "aiOrbit 11s linear infinite reverse" }}>
                      <span className="absolute bottom-5 left-8 h-2.5 w-2.5 rounded-full bg-[#2D7A3A]" />
                    </div>
                    <div className="absolute bottom-5 h-16 w-36 rounded-full bg-[#3858E9]/12 blur-2xl" style={{ animation: "aiPulse 3.2s ease-in-out infinite" }} />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/90 bg-[linear-gradient(180deg,#FFFFFF,#EEF2FF)] shadow-[0_24px_54px_rgba(17,24,39,0.16)]" style={{ animation: "aiFloat 4.8s ease-in-out infinite" }}>
                      <div className="absolute -top-3 flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#C5A04F]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#3858E9]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#2D7A3A]" />
                      </div>
                      <Bot className="h-9 w-9 text-[#3858E9]" aria-hidden="true" />
                      <div className="absolute -right-3 -top-2 rounded-full border border-white/80 bg-white p-2 shadow-[0_8px_20px_rgba(17,24,39,0.10)]">
                        <Sparkles className="h-4 w-4 text-[#C5A04F]" aria-hidden="true" />
                      </div>
                      <div className="absolute -left-3 -bottom-2 rounded-full border border-white/80 bg-white p-2 shadow-[0_8px_20px_rgba(17,24,39,0.10)]">
                        <Cpu className="h-4 w-4 text-[#3858E9]" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute right-3 top-0 hidden w-40 rounded-[1.2rem] border border-white/70 bg-white/82 p-3 shadow-[0_12px_30px_rgba(17,24,39,0.08)] backdrop-blur md:block">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667085]">
                    Results snapshot
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-[#111827]">
                    <div className="rounded-xl bg-[#F0F9F2] px-3 py-2">Strengths</div>
                    <div className="rounded-xl bg-[#FFF4E8] px-3 py-2">Pain points</div>
                    <div className="rounded-xl bg-[#EEF2FF] px-3 py-2">Priorities</div>
                  </div>
                </div>

                <div className="absolute left-0 top-10 h-[320px] w-full rounded-4xl bg-[linear-gradient(135deg,rgba(214,244,237,0.72),rgba(255,240,230,0.72)_55%,rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(17,24,39,0.08)]" />

                <div className="absolute left-3 top-14 w-[calc(100%-2rem)] rounded-3xl border border-[#E5E7EB] bg-white/90 p-5 shadow-[0_18px_42px_rgba(17,24,39,0.10)] backdrop-blur md:left-6 md:w-[74%]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667085]">
                        Guided results
                      </p>
                      <h3 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.03em] text-[#111827]">
                        Built for decision-making
                      </h3>
                    </div>
                    <div className="rounded-full bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white">
                      68% overall
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {scoreRows.map(([label, value, color], index) => (
                      <div key={label}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-[#111827]">{label}</span>
                          <span className="font-semibold text-[#111827]">{value}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-[#ECEFF1]">
                          <div
                            className="h-full rounded-full transition-all duration-700 hover:brightness-105"
                            style={{
                              width: inView ? value : "0%",
                              backgroundColor: color,
                              transitionDelay: `${index * 90}ms`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-3">
                    {[
                      ["Strengths", "#F0F9F2", "#2D7A3A"],
                      ["Pain points", "#FFF1F1", "#B42318"],
                      ["Priorities", "#EEF2FF", "#3858E9"],
                    ].map(([label, background, color]) => (
                      <div
                        key={label}
                        className="rounded-[1rem] px-3 py-3 text-xs font-semibold shadow-[0_8px_18px_rgba(17,24,39,0.05)] transition duration-500 hover:-translate-y-0.5"
                        style={{ backgroundColor: background, color }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[1rem] border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667085]">
                          Benchmark insight
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#111827]">
                          Your strongest capabilities are approaching sector leaders
                        </p>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#3858E9] shadow-[0_6px_18px_rgba(17,24,39,0.06)]">
                        +12 pts
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 shadow-[0_6px_16px_rgba(17,24,39,0.05)]">
                        Peer median
                        <ArrowUpRight className="h-3.5 w-3.5 text-[#3858E9]" />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 shadow-[0_6px_16px_rgba(17,24,39,0.05)]">
                        Best-in-class
                        <Sparkles className="h-3.5 w-3.5 text-[#C5A04F]" />
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 w-44 rounded-[1rem] border border-white/80 bg-white/86 p-3 shadow-[0_12px_30px_rgba(17,24,39,0.08)] backdrop-blur">
                  <div className="flex items-center gap-2 text-[#C5A04F]">
                    <Wand2 className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                      Recommended focus
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[#4B5563]">
                    The results bring the most important priorities into one place,
                    making it easier to align on where action should begin.
                  </p>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </div>
    </section>
  );
}
