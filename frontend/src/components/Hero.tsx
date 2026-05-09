import { lazy, Suspense } from "react";
import FadeUp from "./FadeUp";
import { Spotlight } from "./ui/spotlight";

type HeroProps = {
  onStartConversation?: () => void;
};

const SplineScene = lazy(() => import("./ui/splite").then((module) => ({ default: module.SplineScene })));
const HERO_SPLINE_SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

function HeroRobotFallback() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-[28%] top-[20%] h-64 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.85),rgba(255,255,255,0))] blur-3xl" />
    </div>
  );
}

export default function Hero({ onStartConversation }: HeroProps) {
  return (
    <section
      id="start"
      className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfd_40%,#f7f9fb_72%,#ffffff_100%)] py-16 text-[#111827] sm:py-20 lg:py-24"
    >
      <div className="pointer-events-none absolute right-[-8%] top-[6%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(226,232,240,0.4),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none absolute left-[-10%] bottom-[8%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(248,250,252,0.88),rgba(255,255,255,0))] blur-3xl" />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(480px,0.98fr)] lg:px-12">
        <div className="relative z-10 flex max-w-2xl flex-col items-center text-center lg:items-start lg:text-left">
          <FadeUp>
            <h1 className="mb-6 max-w-[11ch] text-5xl font-medium leading-[0.92] tracking-[-0.06em] text-[#111827] md:text-8xl">
              Understand your customer experience!
            </h1>
          </FadeUp>

          <FadeUp delay="delay-1">
            <p className="max-w-xl text-lg font-light leading-8 text-[#374151] md:text-2xl md:leading-10">
              ORION is an intelligent CX agent that analyzes how your customer experience is managed, measured, and
              optimized through a dynamic conversation adapted to your organization maturity.
            </p>
          </FadeUp>

          <FadeUp delay="delay-2">
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <button
                type="button"
                onClick={onStartConversation}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111827] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1f2937]"
              >
                Start the conversation
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </FadeUp>
        </div>

        <div className="relative z-10 hidden h-[600px] w-full animate-[heroRobotIn_720ms_ease-out] lg:block">
          <div className="absolute inset-x-[24%] top-[16%] h-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.82),rgba(255,255,255,0))] blur-3xl" />
          <div className="absolute inset-x-[26%] bottom-[19%] h-12 rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.12),rgba(255,255,255,0))] blur-2xl" />
          <div className="relative h-full w-full">
            <Spotlight className="z-0 opacity-35" size={220} />
            <Suspense fallback={<HeroRobotFallback />}>
              <SplineScene
                scene={HERO_SPLINE_SCENE}
                className="relative z-10 h-full w-full opacity-100"
              />
            </Suspense>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes heroRobotIn {
          0% {
            opacity: 0;
            transform: translateX(18px) translateY(10px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateX(0) translateY(0) scale(1);
          }
        }
      `}</style>
    </section>
  );
}
