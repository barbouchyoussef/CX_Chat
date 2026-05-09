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
    <section id="methodology" className="relative overflow-hidden bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] pt-8 pb-18">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">Methodology</p>
          <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-slate-900 md:text-6xl">
            Three dimensions, one smooth story.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            Explore how Orion audits customer experience across governance, insight, and continuous improvement.
          </p>
        </div>

        <div className="relative">
          {axes.map((axis, index) => (
            <article
              key={axis.step}
              className={`relative mb-6 overflow-hidden rounded-[32px] border border-white/10 ${axis.bg} ${axis.fg} shadow-[0_30px_80px_rgba(15,23,42,0.12)] lg:sticky`}
              style={{
                top: `${88 + index * 28}px`,
                zIndex: index + 1,
                minHeight: "76vh",
              }}
            >
              <div className="mx-auto max-w-5xl px-6 py-10 md:py-14">
                <div className="grid items-start gap-8 md:grid-cols-12 lg:gap-10">
                  <div className="md:col-span-5 lg:pr-4">
                    <div className={`text-sm font-medium tracking-widest ${axis.subtle}`}>
                      AXIS {axis.step}
                    </div>

                    <h3 className="mt-4 text-4xl font-bold leading-[1.05] md:text-5xl lg:text-6xl">
                      {axis.title}
                    </h3>

                    <p className={`mt-5 max-w-md text-base leading-7 md:text-lg ${axis.subtle}`}>
                      {axis.desc}
                    </p>
                  </div>

                  <div className="md:col-span-7">
                    <div
                      className={
                        axis.fg === "text-black"
                          ? "h-72 overflow-hidden rounded-3xl border border-black/10 bg-white/40 md:h-80 lg:h-[22rem]"
                          : "h-72 overflow-hidden rounded-3xl border border-white/15 bg-black/20 md:h-80 lg:h-[22rem]"
                      }
                    >
                      <img
                        src={axis.image}
                        alt={`${axis.title} preview`}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
