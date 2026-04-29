import ScrollStack, { ScrollStackItem } from "./ScrollStack/ScrollStack";

// IMPORT DES IMAGES
const manageImg = new URL("../assets/manage.jpg", import.meta.url).href;
const analyzeImg = new URL("../assets/analyze.jpg", import.meta.url).href;
const improveImg = new URL("../assets/improve.jpg", import.meta.url).href;

export default function HowItWorks() {
  const axes = [
    {
      step: "01",
      title: "Manage",
      desc: "How customer experience is governed, owned, and embedded across your organization.",
      bg: "bg-[#101499]",
      fg: "text-white",
      subtle: "text-white/75",
      image: manageImg,
    },
    {
      step: "02",
      title: "Analyze",
      desc: "How customer data is captured, structured, and transformed into actionable insights.",
      bg: "bg-[#4CC2E9]",
      fg: "text-black",
      subtle: "text-black/70",
      image: analyzeImg,
    },
    {
      step: "03",
      title: "Improve",
      desc: "How experience is designed, optimized, and continuously enhanced.",
      bg: "bg-[#9C43FE]",
      fg: "text-white",
      subtle: "text-white/75",
      image: improveImg,
    },
  ];

  return (
    <section id="methodology" className="relative bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] pt-8 pb-14">
      <div className="relative">
        <ScrollStack
          useWindowScroll
          disableBelow={1024}
          itemDistance={72}
          itemScale={0.01}
          baseScale={0.985}
          itemStackDistance={22}
          stackPosition="22%"
          scaleEndPosition="16%"
          rotationAmount={0}
          blurAmount={0}
        >
          {axes.map(axis => (
            <ScrollStackItem
              key={axis.step}
              variant="panel"
              itemClassName={`${axis.bg} ${axis.fg} rounded-[32px] border border-white/10 overflow-hidden`}
              style={{ minHeight: "calc(100vh - 120px)" }}
            >
              <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
                <div className="grid gap-10 md:grid-cols-12 items-start">
                  
                  {/* TEXT */}
                  <div className="md:col-span-5">
                    <div className={`text-sm font-medium tracking-widest ${axis.subtle}`}>
                      AXIS {axis.step}
                    </div>

                    <h3 className="mt-4 text-4xl md:text-6xl font-bold leading-[1.05]">
                      {axis.title}
                    </h3>

                    <p className={`mt-6 text-lg ${axis.subtle}`}>
                      {axis.desc}
                    </p>
                  </div>

                  {/* IMAGE */}
                  <div className="md:col-span-7">
                    <div
                      className={
                        axis.fg === "text-black"
                          ? "h-90 rounded-3xl border border-black/10 bg-white/40 overflow-hidden"
                          : "h-90 rounded-3xl border border-white/15 bg-black/20 overflow-hidden"
                      }
                    >
                      <img
                        src={axis.image} // ✅ IMAGE DYNAMIQUE
                        alt={`${axis.title} preview`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>

                </div>
              </div>
            </ScrollStackItem>
          ))}
        </ScrollStack>
      </div>
    </section>
  );
}
