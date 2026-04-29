import Orb from "./Orb";
import FadeUp from "./FadeUp";

type HeroProps = {
  onStartConversation?: () => void;
};

export default function Hero({ onStartConversation }: HeroProps) {
  return (
    <section id="start" className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="relative w-full min-h-140 flex items-center justify-center overflow-hidden rounded-3xl max-w-7xl mx-auto">
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <div className="pointer-events-auto h-105 w-105 max-w-[92vw] max-h-[62vh]">
            <Orb
              hue={90}
              hoverIntensity={0.5}
              rotateOnHover={true}
              backgroundColor="white"
            />
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl">
          <FadeUp>
            <h1 className="text-5xl md:text-8xl font-medium tracking-tighter leading-[0.92] mb-6">
              Understand your customer experience!
            </h1>
          </FadeUp>

          <FadeUp delay="delay-1">
            <p className="text-lg md:text-2xl text-gray-600 max-w-2xl font-light">
              ORION is an intelligent CX agent that analyzes how your customer experience is managed, measured, and
              optimized through a dynamic conversation adapted to your organization maturity.
            </p>
          </FadeUp>

          <FadeUp delay="delay-2">
            <button
              type="button"
              onClick={onStartConversation}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-[#111827] px-8 py-3 text-sm font-semibold text-white shadow-(--shadow-subtle-lg) transition hover:-translate-y-0.5 hover:bg-[#1f2937]"
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
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
