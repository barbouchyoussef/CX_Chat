import ScrollStack, { ScrollStackItem } from "./ScrollStack";

const steps = [
  {
    title: "Start with AI Chatbot",
    desc: "Answer a few smart questions. The AI understands your company context instantly.",
  },
  {
    title: "Smart Data Collection",
    desc: "We gather structured inputs about your processes, size, and sector.",
  },
  {
    title: "AI Analysis Engine",
    desc: "Our AI analyzes your answers against industry standards and frameworks.",
  },
  {
    title: "Evidence Matching",
    desc: "Automatically map your inputs to compliance requirements.",
  },
  {
    title: "Scoring & Insights",
    desc: "Get real-time scoring with identified gaps and strengths.",
  },
  {
    title: "Final Report",
    desc: "Download a professional audit report with recommendations.",
  },
];

export default function AssessmentFlow() {
  return (
    <section className="h-screen bg-gray-50">
      <ScrollStack
        useWindowScroll
        itemDistance={120}
        itemScale={0.04}
        baseScale={0.9}
        rotationAmount={0}
        blurAmount={2}
      >
        {steps.map((step, index) => (
          <ScrollStackItem
            key={index}
            itemClassName="bg-white border border-gray-200"
          >
            <div className="h-full flex flex-col justify-center">
              <h2 className="text-3xl font-bold mb-4">
                {step.title}
              </h2>
              <p className="text-gray-600 text-lg max-w-xl">
                {step.desc}
              </p>
            </div>
          </ScrollStackItem>
        ))}
      </ScrollStack>
    </section>
  );
}