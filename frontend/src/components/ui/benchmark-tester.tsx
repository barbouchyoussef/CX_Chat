import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Sliders,
  BookOpen,
  AlertCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface EvidenceLink {
  label: string;
  url: string;
  source_title?: string | null;
  mapped_capability?: string | null;
  why_relevant?: string | null;
}

interface LeaderItem {
  key: string;
  company_name: string;
  note?: string | null;
  leader_summary?: string | null;
  logo_url?: string | null;
  evidence_links: EvidenceLink[];
}

interface SnapshotMetrics {
  candidates_considered: number;
  candidates_evaluated: number;
  web_search_calls: number;
  rerank_calls: number;
  mistral_calls: number;
  documents_retrieved: number;
  documents_validated: number;
  documents_rejected_indirect: number;
  capability_coverage_count: number;
}

interface BenchmarkSnapshot {
  supported: boolean;
  status: string;
  sector: string;
  respondent_company_name: string;
  message?: string | null;
  reason?: string | null;
  metrics?: SnapshotMetrics | null;
  leaders: LeaderItem[];
}

interface BenchmarkTesterProps {
  onBack: () => void;
}

const SECTORS = [
  { name: "Telecom", value: "Telecom", candidates: ["Verizon", "Vodafone", "Telstra", "Orange", "T-Mobile", "Swisscom"] },
  { name: "Banking & Insurance", value: "Banking & Insurance", candidates: ["JPMorgan Chase", "DBS Bank", "ING", "Ally Financial", "Progressive", "AXA", "GEICO", "Lemonade"] },
  { name: "Retail", value: "Retail", candidates: ["Target", "Best Buy", "Costco", "Uniqlo", "Sephora", "H&M"] },
  { name: "E-commerce", value: "E-commerce", candidates: ["Amazon", "Shopify", "Alibaba", "eBay", "Etsy", "Rakuten"] },
  { name: "Healthcare", value: "Healthcare", candidates: ["UnitedHealth", "Mayo Clinic", "Kaiser Permanente", "Cleveland Clinic", "Teladoc Health", "Humana"] },
  { name: "Hospitality & Travel", value: "Hospitality & Travel", candidates: ["Marriott", "Four Seasons", "Hilton", "Airbnb", "Booking.com", "Expedia", "United Airlines", "Kayak"] },
  { name: "Technology", value: "Technology", candidates: ["Salesforce", "HubSpot", "Slack", "Atlassian", "Datadog", "Stripe"] },
];

const DEFAULT_PAIN_POINTS = [
  {
    capability: "Feedback collection",
    capability_description: "Capturing customer feedback through listening channels, surveys, complaint capture, and regular review routines.",
    action_hints: "Set one recurring feedback pulse and one weekly review routine.",
    rubric_description: "Feedback is collected inconsistently or through a few isolated channels, with weak logging, ownership, and review rhythm.",
    level3_action_hints: "Feedback becomes a normal input into service management, improving continuity between listening, decisions, and action."
  },
  {
    capability: "Measurement and continuous improvement",
    capability_description: "Tracking customer experience through dashboards, review cycles, owner linkage, and action-focused metrics.",
    action_hints: "Pick a small set of CX measures and review them on a fixed cadence.",
    rubric_description: "Measures are limited or disconnected from action, with little evidence of a regular improvement loop.",
    level3_action_hints: "Improvement activity becomes easier to prioritize and govern through connected CX, operational, and business outcomes."
  },
  {
    capability: "Decision-making",
    capability_description: "Using customer evidence in decision forums, prioritization reviews, and action planning.",
    action_hints: "Link customer decisions to named owners, actions, and follow-up checks.",
    rubric_description: "Customer evidence influences some decisions, but the practice is partial, siloed, or inconsistent across teams.",
    level3_action_hints: "Customer evidence has a stronger path into planning, helping teams prioritize resources around the highest-impact experience gaps."
  }
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export default function BenchmarkTester({ onBack }: BenchmarkTesterProps) {
  const [sector, setSector] = useState("Telecom");
  const [companyName, setCompanyName] = useState("My Test Company");
  const [language, setLanguage] = useState("fr");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [painPoints, setPainPoints] = useState(JSON.stringify(DEFAULT_PAIN_POINTS, null, 2));
  
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkSnapshot | null>(null);
  const [selectedLeaderKey, setSelectedLeaderKey] = useState<string | null>(null);

  const selectedSectorObj = useMemo(() => {
    return SECTORS.find((s) => s.value === sector) ?? SECTORS[0];
  }, [sector]);

  // Loading steps animation
  useEffect(() => {
    let interval: any;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < 5 ? prev + 1 : prev));
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedLeaderKey(null);

    let parsedPainPoints = [];
    try {
      if (painPoints.trim()) {
        parsedPainPoints = JSON.parse(painPoints);
      }
    } catch (err) {
      setError("Invalid JSON format in advanced pain points settings.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/assessments/benchmark-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sector,
          company_name: companyName,
          language,
          pain_points: parsedPainPoints,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const data: BenchmarkSnapshot = await response.json();
      setResult(data);
      if (data.leaders && data.leaders.length > 0) {
        setSelectedLeaderKey(data.leaders[0].key);
      }
    } catch (err: any) {
      console.error("Benchmarking test failed:", err);
      setError(err.message || "An unknown error occurred during testing.");
    } finally {
      setLoading(false);
    }
  };

  const selectedLeader = useMemo(() => {
    if (!result?.leaders) return null;
    return result.leaders.find((l) => l.key === selectedLeaderKey) ?? result.leaders[0] ?? null;
  }, [result, selectedLeaderKey]);

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const getAvatarColorClass = (index: number) => {
    const colors = [
      "bg-indigo-100 text-indigo-700 border-indigo-200",
      "bg-teal-100 text-teal-700 border-teal-200",
      "bg-amber-100 text-amber-700 border-amber-200",
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20">
      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Return to Landing Page"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Competitor Benchmark Tester</h1>
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 font-semibold uppercase tracking-wider">Dev Sandbox</span>
            </div>
          </div>
          
          <button
            onClick={onBack}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium"
          >
            Close Sandbox
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left side: Configuration form */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Sliders className="w-4 h-4 text-indigo-500" />
              <h2 className="font-semibold text-slate-800">Test Configuration</h2>
            </div>

            <form onSubmit={handleRunTest} className="space-y-4">
              {/* Sector Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sector</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50"
                >
                  {SECTORS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Respondent Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                  placeholder="e.g. French Telecom Corp"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50"
                />
                
                {/* Dynamic Candidates Warning / Guidance Info */}
                <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-500 space-y-1">
                  <span className="font-semibold text-slate-700 block">Candidate pool for this sector:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedSectorObj.candidates.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-amber-600/90 block mt-1">
                    * If you input one of these names, it will be filtered out to simulate target-competitor exclusion.
                  </span>
                </div>
              </div>

              {/* Language Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Target Output Language</label>
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setLanguage("fr")}
                    disabled={loading}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      language === "fr" ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    French (FR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage("en")}
                    disabled={loading}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      language === "en" ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    English (EN)
                  </button>
                </div>
              </div>

              {/* Advanced Collapsible Section */}
              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 hover:text-slate-800 uppercase tracking-wider"
                >
                  <span>Advanced: Pain Points & Rubrics</span>
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-slate-400">
                      Customize the maturity rubrics passed to the search-evaluation pipeline. Leave as defaults for standard evaluation.
                    </p>
                    <textarea
                      value={painPoints}
                      onChange={(e) => setPainPoints(e.target.value)}
                      disabled={loading}
                      rows={10}
                      className="w-full p-2 border border-slate-200 rounded-lg text-[10px] font-mono bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg py-2.5 px-4 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:bg-indigo-400 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Benchmarks...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Run Benchmark Curation</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick info about sandbox */}
          <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-4 text-xs text-slate-500 space-y-2">
            <span className="font-semibold text-slate-700 block">How Curation Works</span>
            <p className="leading-relaxed">
              This sandbox triggers the competitor benchmarking logic. It fetches web data using <strong>Langsearch</strong> indexing, evaluates content dynamically based on maturity rubrics, ranks documents, and formats final summaries using <strong>Mistral AI</strong>.
            </p>
          </div>
        </section>

        {/* Right side: Loading state, Error state, or Results */}
        <section className="lg:col-span-8">
          {loading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[450px]">
              <div className="relative mb-6">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Search className="w-6 h-6 text-indigo-500" />
                </div>
              </div>
              
              <h3 className="font-semibold text-slate-800 text-lg mb-1">Crawling & Curating Competitors</h3>
              <p className="text-sm text-slate-500 text-center max-w-md mb-8">
                Evaluating benchmark evidence from public domains. This runs live search indexing and LLM curation filters, which may take 5–15 seconds.
              </p>

              {/* Progress Steps Indicator */}
              <div className="w-full max-w-md space-y-3.5 bg-slate-50 border border-slate-100 rounded-xl p-5">
                {[
                  "Initializing crawler and curation pipeline...",
                  "Resolving competitor candidate list & domain configurations...",
                  "Executing Langsearch crawler against target domains...",
                  "Ranking and scoring retrieved articles...",
                  "Synthesizing competitive facts & insights using Mistral Curation...",
                  "Finalizing and assembling response object...",
                ].map((step, idx) => {
                  const isCurrent = loadingStep === idx;
                  const isPassed = loadingStep > idx;
                  return (
                    <div key={idx} className="flex items-start gap-3 transition-opacity duration-300">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin mt-0.5 flex-shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
                      )}
                      <span
                        className={`text-xs ${
                          isPassed
                            ? "text-slate-400 line-through"
                            : isCurrent
                            ? "text-slate-800 font-semibold"
                            : "text-slate-400"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50/80 border border-red-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-start gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <h3 className="font-semibold text-base">Benchmarking Curation Failed</h3>
                  <p className="text-sm mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
              <div className="bg-white border border-red-100 rounded-lg p-4 text-xs font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap max-h-40">
                {`API base url: ${API_BASE_URL}\nSector: ${sector}\nCompany: ${companyName}\nLanguage: ${language}\nPlease verify that the backend server is running and the required keys (LANGSEARCH_API_KEY, RERANK_API_KEY, MISTRAL_API_KEY) are correctly configured in the backend .env file.`}
              </div>
            </div>
          )}

          {!loading && !error && !result && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 shadow-sm flex flex-col items-center justify-center min-h-[450px] text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-700 text-base mb-1">No Test Run Active</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Configure your sector, company name, and language on the left sidebar, and click "Run Benchmark Curation" to query live records.
              </p>
            </div>
          )}

          {!loading && !error && result && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Metrics Header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-4 flex items-center justify-between border-b border-slate-100 pb-3 mb-1">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">Results for {result.respondent_company_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sector: <span className="font-medium text-slate-600">{result.sector}</span> | Language: <span className="font-medium text-slate-600 uppercase">{language}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Executed Successfully</span>
                  </div>
                </div>

                {result.supported === false ? (
                  <div className="md:col-span-4 p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                    <p className="font-semibold mb-1">Not Supported for Curation</p>
                    <p>{result.reason || "This sector or configuration is not supported in semantic leader service."}</p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block tracking-wider">Candidates Evaluated</span>
                      <span className="text-xl font-bold text-slate-800 mt-0.5 block">
                        {result.metrics?.candidates_evaluated ?? 0}
                        <span className="text-xs text-slate-400 font-normal"> / {result.metrics?.candidates_considered ?? 0}</span>
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block tracking-wider">Web Search Calls</span>
                      <span className="text-xl font-bold text-slate-800 mt-0.5 block">
                        {result.metrics?.web_search_calls ?? 0}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block tracking-wider">LLM Curation Calls</span>
                      <span className="text-xl font-bold text-slate-800 mt-0.5 block">
                        {(result.metrics?.mistral_calls ?? 0) + (result.metrics?.rerank_calls ?? 0)}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">({result.metrics?.mistral_calls ?? 0} LLM + {result.metrics?.rerank_calls ?? 0} rerank)</span>
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block tracking-wider">Documents Validated</span>
                      <span className="text-xl font-bold text-slate-800 mt-0.5 block text-emerald-600">
                        {result.metrics?.documents_validated ?? 0}
                        <span className="text-xs text-slate-400 font-normal"> / {result.metrics?.documents_retrieved ?? 0}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Main result block: Competitors List & Details */}
              {result.leaders && result.leaders.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Left Column: Competitor Cards list */}
                  <div className="md:col-span-5 space-y-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2 px-1">Curated Competitors</span>
                    {result.leaders.map((leader, index) => {
                      const isSelected = leader.key === selectedLeaderKey;
                      return (
                        <button
                          key={leader.key}
                          onClick={() => setSelectedLeaderKey(leader.key)}
                          className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer block ${
                            isSelected
                              ? "bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500/10"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {leader.logo_url ? (
                              <img
                                src={leader.logo_url}
                                alt={leader.company_name}
                                className="w-8 h-8 rounded-lg border border-slate-100 bg-white object-contain p-1"
                                onError={(e) => {
                                  // Fallback avatar
                                  e.currentTarget.style.display = "none";
                                  const sibling = e.currentTarget.nextSibling as HTMLDivElement;
                                  if (sibling) sibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              style={{ display: leader.logo_url ? "none" : "flex" }}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold ${getAvatarColorClass(
                                index
                              )}`}
                            >
                              {leader.company_name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-800 text-sm">{leader.company_name}</h4>
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-medium">
                                {leader.key}
                              </span>
                            </div>
                          </div>
                          
                          {leader.leader_summary && (
                            <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
                              {leader.leader_summary}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Column: Curated Evidence Links */}
                  <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    {selectedLeader ? (
                      <>
                        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-slate-800 text-base">{selectedLeader.company_name}</h3>
                            <span className="text-xs text-slate-400 block mt-0.5">Evidence Curation Detail</span>
                          </div>
                          {selectedLeader.logo_url && (
                            <img
                              src={selectedLeader.logo_url}
                              alt={selectedLeader.company_name}
                              className="h-7 object-contain"
                            />
                          )}
                        </div>

                        {selectedLeader.leader_summary && (
                          <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-50 text-xs text-indigo-950/80 leading-relaxed">
                            <span className="font-semibold block text-indigo-900/80 mb-0.5">Curation Note:</span>
                            {selectedLeader.leader_summary}
                          </div>
                        )}

                        <div className="space-y-4 pt-1">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Evidence Records</span>
                          {selectedLeader.evidence_links && selectedLeader.evidence_links.length > 0 ? (
                            selectedLeader.evidence_links.map((link, idx) => (
                              <div
                                key={idx}
                                className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-3 hover:bg-slate-50 transition-colors"
                              >
                                {/* Mapped Capability Badge */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  {link.mapped_capability ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                                      <Layers className="w-2.5 h-2.5" />
                                      {link.mapped_capability}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200/60 px-2 py-0.5 rounded-full">
                                      Capability N/A
                                    </span>
                                  )}
                                  
                                  {/* Link to Source */}
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
                                  >
                                    <span>{getDomainFromUrl(link.url)}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>

                                {/* Light Concise Label (Description before link) */}
                                <p className="text-sm font-semibold text-slate-800 leading-snug">
                                  {link.label}
                                </p>

                                {/* Why Relevant detail */}
                                {link.why_relevant && (
                                  <div className="text-xs text-slate-500 border-l-2 border-slate-200 pl-2.5 py-0.5 leading-relaxed bg-white/60 p-2 rounded-r-lg">
                                    <span className="font-semibold block text-slate-700 text-[10px] uppercase tracking-wider mb-0.5">Why Relevant:</span>
                                    {link.why_relevant}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-xs text-slate-400">
                              No evidence links curated for this competitor.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-xs text-slate-400">
                        Select a competitor to view their benchmark evidence.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
