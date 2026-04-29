import React from "react";

type CTASectionProps = {
  title?: string;
  subtitle?: string;
  onStartConversation?: () => void;
};

const CTASection: React.FC<CTASectionProps> = ({
  title = "Ready to Transform Your Audit Process?",
  subtitle = "Join thousands of auditors who save hours on every audit with AIAuditor",
  onStartConversation,
}) => {
  return (
    <section id="cta" className="py-16 sm:py-20 md:py-24 bg-gradient-to-r from-blue-600 to-purple-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="text-center">
          
          {/* TITLE */}
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 text-white">
            {title}
          </h2>

          {/* SUBTITLE */}
          <p className="text-base sm:text-lg md:text-xl mb-8 sm:mb-10 max-w-3xl mx-auto text-blue-100">
            {subtitle}
          </p>

          <div className="flex justify-center items-center">
            <button
              type="button"
              onClick={onStartConversation}
              className="inline-flex items-center justify-center gap-2 px-8 h-12 rounded-lg text-sm sm:text-base font-medium bg-white text-blue-600 hover:bg-gray-100 shadow-lg hover:shadow-xl transition"
            >
              Start the conversation
              
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

        </div>

      </div>
    </section>
  );
};

export default CTASection;
