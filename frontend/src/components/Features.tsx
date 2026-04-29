import {
  Zap,
  FileSearch,
  Users,
  Clock,
  Shield,
  BarChart3,
} from "lucide-react";
import FadeUp from "./FadeUp";

export default function AuditFeatures() {
  const features = [
    {
      icon: <Zap className="h-6 w-6 text-blue-600" />,
      title: "Adaptive intelligence",
      desc: "Upload documents and get instant compliance scoring with highlighted gaps",
    },
    {
      icon: <FileSearch className="h-6 w-6 text-blue-600" />,
      title: "Smart Evidence Matching",
      desc: "AI automatically maps evidence to requirements across standards",
    },
    {
      icon: <Users className="h-6 w-6 text-blue-600" />,
      title: "Real-Time Collaboration",
      desc: "Work seamlessly with team members, share findings, assign tasks",
    },
    {
      icon: <Clock className="h-6 w-6 text-blue-600" />,
      title: "Mobile Evidence Capture",
      desc: "Capture photos, notes, and documents on-site with mobile apps",
    },
    {
      icon: <Shield className="h-6 w-6 text-blue-600" />,
      title: "Compliance Checklists",
      desc: "Pre-built templates for ISO, IATF, SOC 2, and custom standards",
    },
    {
      icon: <BarChart3 className="h-6 w-6 text-blue-600" />,
      title: "Professional Reports",
      desc: "Generate polished audit reports with charts, findings, and recommendations",
    },
  ];

  return (
    <section id="screens" className="bg-gray-50 py-20 md:py-24">
      <div className="max-w-7xl mx-auto px-6">

        {/* HEADER */}
        <div className="text-center mb-12">
          <FadeUp>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Built to understand how your experience really works.
            </h2>
          </FadeUp>
        </div>

        {/* GRID */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((item, i) => (
            <FadeUp key={i} delay={i % 3 === 0 ? "" : i % 3 === 1 ? "delay-1" : "delay-2"}>
              <div
                className="bg-white rounded-lg p-6 border border-gray-200 shadow-(--shadow-subtle-sm) hover:shadow-[var(--shadow-subtle-md)] transition"
              >
                
                {/* ICON */}
                <div className="h-12 w-12 rounded-sm bg-blue-100 flex items-center justify-center mb-4">
                  {item.icon}
                </div>

                {/* TEXT */}
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {item.title}
                </h3>

                <p className="text-sm text-gray-600">
                  {item.desc}
                </p>

              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
