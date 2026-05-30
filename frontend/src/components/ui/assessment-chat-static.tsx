"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Circle, FileText, Loader2, Send, Sparkles, X } from "lucide-react";
import { Avatar } from "./avatar-1";
import AssessmentResultsPage from "./assessment-results-page";
import AssessmentGeneratingPage from "./assessment-generating-page";

type ChatMessage = { id: string; text: string; isUser: boolean };
type AxisProgress = { axis: string; covered: number; total: number };
type AssessmentState = { id: number; status: string; axis: string | null; version: number; progress: AxisProgress[] };
type Option = { code: string; label: string };
type CompanyProfileForm = {
  companyName: string;
  sector: string;
  companySize: string;
  region: string;
};
type FinalReport = {
  assessment_id: number;
  hero: {
    report_title: string;
    report_date_label?: string | null;
    company_name?: string | null;
    sector_name?: string | null;
    region?: string | null;
    overall_level?: number | null;
    overall_level_label?: string | null;
    overall_maturity_band: string;
    hero_message?: string | null;
    strongest_axis?: string | null;
    strongest_axis_level?: number | null;
    strongest_axis_level_label?: string | null;
    priority_axis?: string | null;
    priority_axis_level?: number | null;
    priority_axis_level_label?: string | null;
  };
  summary: {
    overall_score_percent: number;
    overall_maturity_band: string;
    strongest_axis: string;
    strongest_axis_score_percent: number;
    priority_axis: string;
    priority_axis_score_percent: number;
    strengths_count: number;
    pain_points_count: number;
  };
  axes: { axis: string; score_percent: number; maturity_band: string }[];
  strengths: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
    recommendation: string | null;
    priority: string | null;
  }[];
  pain_points: {
    axis: string;
    capability: string;
    maturity_band: string;
    rationale: string | null;
    recommendation: string | null;
    priority: string | null;
  }[];
  capabilities: {
    axis: string;
    capability: string;
    maturity_band: string;
    confidence: number | null;
    rationale: string | null;
    recommendation: string | null;
    priority: string | null;
  }[];
  benchmarks: {
    title: string;
    url: string;
    site_name: string | null;
    published_at: string | null;
    summary: string | null;
    method_signal: string | null;
  }[];
};

type Props = { onBack?: () => void };
type OnboardingStage = "await_company_name" | "await_sector_choice" | "await_size_choice" | "assessment_active" | "completed";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const AXIS_ORDER = ["MANAGE", "ANALYZE", "IMPROVE"];
const normalizeAxis = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

export default function AssessmentChatStatic({ onBack }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      text: "Welcome. I am Orion, EY's CX maturity assessment assistant. Please complete the company profile so I can tailor the assessment context.",
      isUser: false,
    },
  ]);
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentState | null>(null);
  const [stage, setStage] = useState<OnboardingStage>("await_company_name");
  const [companyName, setCompanyName] = useState("");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileForm>({
    companyName: "",
    sector: "",
    companySize: "",
    region: "",
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [selectedSector, setSelectedSector] = useState<Option | null>(null);
  const [sectorOptions, setSectorOptions] = useState<Option[]>([]);
  const [sizeOptions, setSizeOptions] = useState<Option[]>([]);
  const [regionOptions, setRegionOptions] = useState<Option[]>([]);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showGeneratingPage, setShowGeneratingPage] = useState(false);
  const [isReportFetching, setIsReportFetching] = useState(false);
  const [isGeneratingMinDelayDone, setIsGeneratingMinDelayDone] = useState(false);
  const [submittedAnswersCount, setSubmittedAnswersCount] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const progressStats = useMemo(() => {
    const rows = assessment?.progress ?? [];
    const currentAxis = normalizeAxis(assessment?.axis);
    const totalCovered = rows.reduce((sum, row) => sum + Math.max(0, row.covered ?? 0), 0);
    const totalQuestions = rows.reduce((sum, row) => sum + Math.max(0, row.total ?? 0), 0);
    const realPercent = totalQuestions > 0 ? Math.round((totalCovered / totalQuestions) * 100) : 0;
    const conversationalTarget = Math.max(totalQuestions + 6, 12);
    const turnPercent = Math.round((submittedAnswersCount / conversationalTarget) * 100);
    const percent =
      assessment?.status === "completed"
        ? 100
        : Math.min(95, Math.max(realPercent, Math.max(0, turnPercent)));
    const currentAxisIndex = Math.max(0, AXIS_ORDER.indexOf(currentAxis || AXIS_ORDER[0]));
    const barClass =
      currentAxis === "MANAGE"
        ? "bg-blue-500"
        : currentAxis === "ANALYZE"
          ? "bg-amber-500"
          : currentAxis === "IMPROVE"
            ? "bg-emerald-500"
            : "bg-violet-500";
    return {
      totalCovered,
      totalQuestions,
      percent,
      realPercent,
      currentAxisIndex,
      barClass,
    };
  }, [assessment, submittedAnswersCount]);
  const axisDone = useMemo(() => {
    const currentAxis = normalizeAxis(assessment?.axis);
    const currentIndex = Math.max(0, AXIS_ORDER.indexOf(currentAxis || AXIS_ORDER[0]));
    return new Map(
      AXIS_ORDER.map((axis, index) => {
        const done = assessment?.status === "completed" ? true : index < currentIndex;
        return [axis, done];
      })
    );
  }, [assessment]);

  const appendAssistant = (text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text, isUser: false }]);
  };
  const appendUser = (text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text, isUser: true }]);
  };

  const fetchAssessmentSnapshot = async (assessmentId: number): Promise<AssessmentState> => {
    const response = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`);
    if (!response.ok) throw new Error("Failed to fetch assessment");
    const payload = await response.json();
    return {
      id: payload.id,
      status: payload.status,
      axis: payload.current_axis,
      version: payload.state_version,
      progress: payload.progress ?? [],
    };
  };

  const fetchNextQuestion = async (assessmentId: number): Promise<string | null> => {
    const response = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/next-question`);
    if (!response.ok) throw new Error("Failed to fetch next question");
    const payload = await response.json();
    return payload.question ?? payload.message ?? null;
  };

  const fetchReferenceOptions = async () => {
    const response = await fetch(`${API_BASE_URL}/reference/options`);
    if (!response.ok) throw new Error("Failed to fetch options");
    const payload = await response.json();
    setSectorOptions(payload.sectors ?? []);
    setSizeOptions(payload.company_sizes ?? []);
    setRegionOptions(payload.regions ?? []);
    return payload as { sectors: Option[]; company_sizes: Option[]; regions: Option[] };
  };

  const startAssessment = async (payload: {
    company_name: string;
    sector?: string;
    size?: string;
    region?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const snapshot = await fetchAssessmentSnapshot(Number(data.assessment_id));
    setAssessment(snapshot);
    setStage(snapshot.status === "completed" ? "completed" : "assessment_active");
    const question = await fetchNextQuestion(snapshot.id);
    if (question) {
      setMessages([
        {
          id: crypto.randomUUID(),
          text: `Thank you. I now have your company context. Let's begin the assessment. ${question}`,
          isUser: false,
        },
      ]);
    }
  };

  const updateCompanyProfile = (field: keyof CompanyProfileForm, value: string) => {
    setCompanyProfile((current) => ({ ...current, [field]: value }));
    if (profileError) setProfileError(null);
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const profile = {
      companyName: companyProfile.companyName.trim(),
      sector: companyProfile.sector.trim(),
      companySize: companyProfile.companySize.trim(),
      region: companyProfile.region.trim(),
    };

    if (!profile.companyName || !profile.sector || !profile.companySize || !profile.region) {
      setProfileError("Please complete company name, sector, company size, and region before starting.");
      return;
    }

    setIsTyping(true);
    try {
      setCompanyName(profile.companyName);
      await startAssessment({
        company_name: profile.companyName,
        sector: profile.sector,
        size: profile.companySize,
        region: profile.region,
      });
    } catch {
      setProfileError("I could not start the assessment yet. Please check the selected profile and try again.");
    } finally {
      setIsTyping(false);
    }
  };

  const fetchFinalReport = async (assessmentId: number): Promise<FinalReport | null> => {
    const response = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/final-report`);
    if (!response.ok) return null;
    const payload = await response.json();
    setFinalReport(payload);
    return payload;
  };

  const parseChoice = (text: string, options: Option[]): Option | null => {
    const value = text.trim().toLowerCase();
    const byCode = options.find((opt) => opt.code.toLowerCase() === value);
    if (byCode) return byCode;
    const byLabel = options.find((opt) => opt.label.toLowerCase() === value);
    if (byLabel) return byLabel;
    const index = Number(value);
    if (!Number.isNaN(index) && index >= 1 && index <= options.length) return options[index - 1];
    return null;
  };

  const handleOnboardingMessage = async (userText: string) => {
    if (stage === "await_company_name") {
      setCompanyName(userText);
      setIsTyping(true);
      try {
        await startAssessment({ company_name: userText });
      } catch {
        const opts = await fetchReferenceOptions();
        setStage("await_sector_choice");
        const sectorList = opts.sectors.slice(0, 10).map((opt, idx) => `${idx + 1}. ${opt.label}`).join(" | ");
        appendAssistant(
          `Thanks. I could not confidently infer your sector from the name alone. Please choose your sector: ${sectorList}`
        );
      } finally {
        setIsTyping(false);
      }
      return;
    }

    if (stage === "await_sector_choice") {
      const option = parseChoice(userText, sectorOptions);
      if (!option) {
        appendAssistant("I did not catch that sector choice. Please reply with a number or exact sector label.");
        return;
      }
      setSelectedSector(option);
      setStage("await_size_choice");
      const sizeList = sizeOptions.slice(0, 10).map((opt, idx) => `${idx + 1}. ${opt.label}`).join(" | ");
      appendAssistant(`Great. Now choose your company size: ${sizeList}`);
      return;
    }

    if (stage === "await_size_choice") {
      const option = parseChoice(userText, sizeOptions);
      if (!option) {
        appendAssistant("I did not catch that size choice. Please reply with a number or exact size label.");
        return;
      }
      setIsTyping(true);
      try {
        await startAssessment({
          company_name: companyName,
          sector: selectedSector?.code,
          size: option.code,
        });
      } catch {
        appendAssistant("I could not start the assessment yet. Please try again.");
      } finally {
        setIsTyping(false);
      }
      return;
    }
  };

  const handleAssessmentMessage = async (userText: string) => {
    if (!assessment) return;
    setIsTyping(true);
    try {
      const response = await fetch(`${API_BASE_URL}/assessments/${assessment.id}/answers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          answer: userText,
          expected_axis: assessment.axis,
          expected_version: assessment.version,
        }),
      });

      if (response.status === 409) {
        const snapshot = await fetchAssessmentSnapshot(assessment.id);
        setAssessment(snapshot);
        appendAssistant("We got out of sync. I refreshed the state. Please continue with the latest question.");
        return;
      }

      if (!response.ok) {
        appendAssistant("I could not process that answer. Please try once more.");
        return;
      }

      const snapshot = await fetchAssessmentSnapshot(assessment.id);
      setAssessment(snapshot);
      setSubmittedAnswersCount((prev) => prev + 1);
      if (snapshot.status === "completed") {
        setStage("completed");
        appendAssistant("Thank you â€” we now have enough evidence to build your CX maturity report.");
        return;
      }

      const question = await fetchNextQuestion(assessment.id);
      if (question) appendAssistant(question);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    appendUser(text);
    setInput("");
    if (stage === "assessment_active") {
      await handleAssessmentMessage(text);
      return;
    }
    if (stage === "completed") return;
    await handleOnboardingMessage(text);
  };

  const clearChat = () => {
    setInput("");
    setAssessment(null);
    setCompanyName("");
    setCompanyProfile({
      companyName: "",
      sector: "",
      companySize: "",
      region: "",
    });
    setProfileError(null);
    setSelectedSector(null);
    setSectorOptions([]);
    setSizeOptions([]);
    setFinalReport(null);
    setShowRecommendations(false);
    setShowGeneratingPage(false);
    setIsReportFetching(false);
    setIsGeneratingMinDelayDone(false);
    setSubmittedAnswersCount(0);
    setStage("await_company_name");
    setMessages([
      {
        id: crypto.randomUUID(),
        text: "Welcome. I am Orion, EY's CX maturity assessment assistant. Please complete the company profile so I can tailor the assessment context.",
        isUser: false,
      },
    ]);
  };

  useEffect(() => {
    if (stage !== "await_company_name") return;
    if (sectorOptions.length > 0 && sizeOptions.length > 0) return;

    let cancelled = false;
    setIsReferenceLoading(true);
    fetchReferenceOptions()
      .catch(() => {
        if (!cancelled) {
          setProfileError("I could not load the sector and company size options. Please refresh and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsReferenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!showGeneratingPage) return;
    if (!isGeneratingMinDelayDone) return;
    if (isReportFetching) return;
    if (!finalReport) return;
    setShowGeneratingPage(false);
    setShowRecommendations(true);
    setIsGeneratingMinDelayDone(false);
  }, [showGeneratingPage, isGeneratingMinDelayDone, isReportFetching, finalReport]);

  const handleGenerateReportClick = async () => {
    if (!assessment) return;
    setIsReportFetching(true);
    setIsGeneratingMinDelayDone(false);
    setShowGeneratingPage(true);
    try {
      await fetchFinalReport(assessment.id);
    } finally {
      setIsReportFetching(false);
    }
  };

  if (showRecommendations && assessment) {
    if (!finalReport) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Final report is not available yet. Please return to chat and try again.</p>
            <button
              type="button"
              onClick={() => setShowRecommendations(false)}
              className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back to chat
            </button>
          </div>
        </div>
      );
    }
    return <AssessmentResultsPage report={finalReport} companyName={companyName} onBack={() => setShowRecommendations(false)} />;
  }

  if (showGeneratingPage) {
    return (
      <AssessmentGeneratingPage
        onDone={() => {
          setIsGeneratingMinDelayDone(true);
        }}
      />
    );
  }

  if (!assessment && stage === "await_company_name") {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_42%),linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-8">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-3xl border border-violet-100 bg-white/85 p-7 shadow-xl backdrop-blur"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
              <Sparkles className="h-4 w-4" />
              Orion CX Assessment
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Welcome. I am Orion, your EY CX maturity assessment assistant.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Before we begin the interview, I need a short company profile. This helps me adapt the questions and benchmark examples to your business context.
            </p>
            <div className="mt-7 grid gap-3 text-sm text-slate-700">
              <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <Building2 className="mt-0.5 h-5 w-5 text-violet-600" />
                <span>Sector and company size are used as structured context, not guessed from the company name.</span>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 }}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
          >
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Company profile</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Set the assessment context</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Please complete the fields below. The assessment will start immediately after submission.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleProfileSubmit}>
              <div className="space-y-2">
                <label htmlFor="companyName" className="text-sm font-semibold text-slate-800">
                  Company name
                </label>
                <input
                  id="companyName"
                  value={companyProfile.companyName}
                  onChange={(event) => updateCompanyProfile("companyName", event.target.value)}
                  placeholder="Example: Four Seasons"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="sector" className="text-sm font-semibold text-slate-800">
                    Sector
                  </label>
                  <select
                    id="sector"
                    value={companyProfile.sector}
                    onChange={(event) => updateCompanyProfile("sector", event.target.value)}
                    disabled={isReferenceLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    <option value="">{isReferenceLoading ? "Loading sectors..." : "Select sector"}</option>
                    {sectorOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="companySize" className="text-sm font-semibold text-slate-800">
                    Company size
                  </label>
                  <select
                    id="companySize"
                    value={companyProfile.companySize}
                    onChange={(event) => updateCompanyProfile("companySize", event.target.value)}
                    disabled={isReferenceLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    <option value="">{isReferenceLoading ? "Loading sizes..." : "Select size"}</option>
                    {sizeOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="region" className="text-sm font-semibold text-slate-800">
                  Region
                </label>
                <select
                  id="region"
                  value={companyProfile.region}
                  onChange={(event) => updateCompanyProfile("region", event.target.value)}
                  disabled={isReferenceLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">{isReferenceLoading ? "Loading regions..." : "Select region"}</option>
                  {regionOptions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>

              {profileError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {profileError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                {onBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                ) : <span />}
                <button
                  type="submit"
                  disabled={isTyping || isReferenceLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTyping ? "Starting assessment..." : "Start assessment"}
                  {!isTyping ? <ArrowRight className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                </button>
              </div>
            </form>
          </motion.section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.12),transparent_45%),linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto w-full max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl sm:h-[calc(100vh-2rem)]"
        >
          <div className="hidden w-72 border-r border-slate-100 bg-slate-50/70 p-5 lg:block">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">CX Journey</h2>
                <p className="text-xs text-slate-500">Guided interview</p>
              </div>
            </div>
            {assessment ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Progress</p>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full transition-all duration-500 ${progressStats.barClass}`} style={{ width: `${progressStats.percent}%` }} />
                </div>
                <div className="space-y-3">
                  {AXIS_ORDER.map((axis) => {
                    const completed = Boolean(axisDone.get(axis));
                    const current = normalizeAxis(assessment.axis) === axis;
                    const markerClass = completed ? "text-emerald-500" : current ? "text-violet-500" : "text-slate-300";
                    const textClass = completed ? "text-emerald-700" : current ? "text-violet-700" : "text-slate-500";
                    return (
                      <div key={axis} className="flex items-center gap-3">
                        {completed ? (
                          <CheckCircle2 className={`h-4 w-4 ${markerClass}`} />
                        ) : (
                          <Circle className={`h-4 w-4 ${markerClass}`} />
                        )}
                        <span className={`text-sm font-medium ${textClass}`}>{axis}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">Stay focused on practical examples. We handle the analysis.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">We will profile your company context then run a smart maturity interview.</p>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Back to landing"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <Sparkles className="h-5 w-5 text-violet-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">CX Maturity Assessment Assistant</h2>
                <p className="text-xs text-slate-500">
                  {assessment ? `Assessment #${assessment.id} - ${assessment.status}` : "Profiling in chat"}
                </p>
              </div>
              </div>
              <button
                onClick={clearChat}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {assessment ? (
              <div className="border-b border-slate-100 px-4 py-3 sm:px-5 lg:hidden">
                <div className="mb-2 h-2 w-full rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full transition-all duration-500 ${progressStats.barClass}`} style={{ width: `${progressStats.percent}%` }} />
                </div>
                <div className="flex items-center gap-2">
                  {AXIS_ORDER.map((axis) => {
                    const completed = Boolean(axisDone.get(axis));
                    const current = normalizeAxis(assessment.axis) === axis;
                    const cls = completed ? "text-emerald-500" : current ? "text-violet-500" : "text-slate-300";
                    return completed ? (
                      <CheckCircle2 key={axis} className={`h-4 w-4 ${cls}`} />
                    ) : (
                      <Circle key={axis} className={`h-4 w-4 ${cls}`} />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {stage !== "completed" ? (
              <>
                <div className="flex-1 overflow-y-auto bg-white px-4 py-4 sm:px-5">
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.isUser ? "justify-end" : "justify-start"}`}>
                        {!msg.isUser ? (
                          <div className="mr-2 mt-1 shrink-0">
                            <Avatar chatbot size={30} alt="CX Assistant avatar" />
                          </div>
                        ) : null}
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm sm:max-w-[78%] ${
                            msg.isUser
                              ? "rounded-tr-none bg-slate-900 text-white"
                              : "rounded-tl-none border border-slate-200 bg-slate-50 text-slate-800"
                          }`}
                        >
                          {msg.text}
                        </motion.div>
                      </div>
                    ))}

                    {isTyping ? (
                      <div className="flex justify-start">
                        <div className="mr-2 mt-1 shrink-0">
                          <Avatar chatbot size={30} alt="CX Assistant avatar" />
                        </div>
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="max-w-[88%] rounded-2xl rounded-tl-none border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 sm:max-w-[78%]"
                        >
                          <div className="flex items-center gap-2 text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Assistant is thinking...</span>
                          </div>
                        </motion.div>
                      </div>
                    ) : null}
                    <div ref={endRef} />
                  </div>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className={`border-t px-4 py-4 transition sm:px-5 ${
                    isFocused ? "border-violet-300 bg-violet-50/30" : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="relative">
                    <input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      placeholder={
                        stage === "await_company_name"
                          ? "Type your company name..."
                          : stage === "await_sector_choice"
                            ? "Type sector number or name..."
                            : stage === "await_size_choice"
                              ? "Type size number or name..."
                              : "Describe your answer here..."
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isTyping}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl p-2.5 transition ${
                        input.trim() && !isTyping
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-500">Press Enter to send.</p>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="w-full max-w-2xl rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 to-indigo-50 p-7 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
                    <FileText className="h-7 w-7" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">Thank you — we now have enough evidence to build your CX maturity report.</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Your report will include strengths, pain points, maturity by axis, and targeted recommendations.
                  </p>
                </div>
              </div>
            )}
            {stage === "completed" ? (
              <div className="border-t border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-5 sm:px-5">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to chat
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateReportClick}
                    disabled={isReportFetching}
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReportFetching ? "Preparing report..." : "Generate Executive Report"}
                    {!isReportFetching ? <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /> : null}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
}


