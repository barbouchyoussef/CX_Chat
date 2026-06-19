"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Circle, FileText, Loader2, Send, Sparkles, X } from "lucide-react";
import { Avatar } from "./avatar-1";
import AssessmentGeneratingPage from "./assessment-generating-page";
import AssessmentReport from "../report/AssessmentReport";
import MultiChoiceOptions from "./multi-choice-input";
import type { FinalReport } from "../../types/final-report";

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
type Props = { onBack?: () => void; language?: string };
type OnboardingStage = "await_company_name" | "await_sector_choice" | "await_size_choice" | "assessment_active" | "completed";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const AXIS_ORDER = ["MANAGE", "ANALYZE", "IMPROVE"];
const normalizeAxis = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();

const getInitialGreeting = (lang: string) =>
  lang === "fr"
    ? "Bonjour, je suis ORION. Si vous êtes ici, cela signifie que votre organisation est prête à porter un regard honnête sur l'expérience qu'elle propose. C'est là que j'interviens."
    : "Hello, I’m ORION. If you’re here, it means your organization is ready to take an honest look at the experience it delivers. That’s where I come in.";

const getAssessmentStartIntro = (lang: string) =>
  lang === "fr"
    ? "Maintenant que j'ai le contexte de votre entreprise, commençons l'évaluation."
    : "Now that I have your company context, let's begin the assessment.";

const getAxisDisplayName = (axis: string, lang: string) => {
  if (axis === "MANAGE") return lang === "fr" ? "GÉRER" : "MANAGE";
  if (axis === "ANALYZE") return lang === "fr" ? "ANALYSER" : "ANALYZE";
  if (axis === "IMPROVE") return lang === "fr" ? "AMÉLIORER" : "IMPROVE";
  return axis;
};

const getAxisProgressSubtitle = (axis: string, lang: string) => {
  if (axis === "MANAGE") {
    return lang === "fr"
      ? "Comment votre organisation s'approprie l'expérience"
      : "How your organization owns the experience";
  }
  if (axis === "ANALYZE") {
    return lang === "fr"
      ? "Comment vous transformez les signaux clients en décisions"
      : "How you turn customer signals into decisions";
  }
  if (axis === "IMPROVE") {
    return lang === "fr"
      ? "Comment vous agissez, vous adaptez et avancez"
      : "How you act, adapt, and move forward";
  }
  return "";
};

const splitAssistantQuestion = (text: string) => {
  const trimmedEnd = text.trimEnd();
  const questionEnd = trimmedEnd.lastIndexOf("?");
  if (questionEnd < 0) {
    return { prefix: text, question: "", suffix: "" };
  }

  let questionStart = 0;
  for (let index = questionEnd - 1; index >= 0; index -= 1) {
    if ([".", "?", "!", "\n"].includes(trimmedEnd[index])) {
      questionStart = index + 1;
      break;
    }
  }

  while (questionStart < trimmedEnd.length && /\s/.test(trimmedEnd[questionStart])) {
    questionStart += 1;
  }

  return {
    prefix: text.slice(0, questionStart),
    question: text.slice(questionStart, questionEnd + 1),
    suffix: text.slice(questionEnd + 1),
  };
};

const AssistantMessageText = ({ text }: { text: string }) => {
  const { prefix, question, suffix } = splitAssistantQuestion(text);

  if (!question) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return (
    <span className="whitespace-pre-wrap">
      {prefix}
      <strong className="font-bold text-slate-950">{question}</strong>
      {suffix}
    </span>
  );
};

export default function AssessmentChatStatic({ onBack, language = "fr" }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: crypto.randomUUID(),
      text: getInitialGreeting(language),
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
  const [questionOptions, setQuestionOptions] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const activeQuestionRef = useRef<HTMLDivElement>(null);

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

  const fetchNextQuestion = async (
    assessmentId: number
  ): Promise<{ status: string; question: string | null; options: string[] }> => {
    const response = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/next-question`);
    if (!response.ok) throw new Error("Failed to fetch next question");
    const payload = await response.json();
    return {
      status: payload.status ?? "active",
      question: payload.question ?? payload.message ?? null,
      options: payload.options ?? [],
    };
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
      body: JSON.stringify({ ...payload, language }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const snapshot = await fetchAssessmentSnapshot(Number(data.assessment_id));
    setAssessment(snapshot);
    setStage(snapshot.status === "completed" ? "completed" : "assessment_active");
    const result = await fetchNextQuestion(snapshot.id);
    if (result.question) {
      setMessages((prev) => {
        const combined = `${getInitialGreeting(language)}\n\n${getAssessmentStartIntro(language)} ${result.question}`.trim();
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && !lastMessage.isUser) {
          return [...prev.slice(0, -1), { ...lastMessage, text: combined }];
        }
        return [...prev, { id: crypto.randomUUID(), text: combined, isUser: false }];
      });
      setQuestionOptions(result.options);
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

  const startReportGeneration = async (assessmentId: number) => {
    setIsTyping(false);
    setQuestionOptions([]);
    setIsReportFetching(true);
    setIsGeneratingMinDelayDone(false);
    setShowGeneratingPage(true);
    try {
      await fetchFinalReport(assessmentId);
    } finally {
      setIsReportFetching(false);
    }
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
        setQuestionOptions([]);
        return;
      }

      const result = await fetchNextQuestion(assessment.id);
      if (result.status === "completed") {
        const completedSnapshot = await fetchAssessmentSnapshot(assessment.id);
        setAssessment(completedSnapshot);
        setStage("completed");
        setQuestionOptions([]);
        return;
      }

      if (result.question) {
        appendAssistant(result.question);
        setQuestionOptions(result.options);
      }
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
        text: getInitialGreeting(language),
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
    if (stage === "assessment_active" && activeQuestionRef.current) {
      activeQuestionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, stage]);

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
    await startReportGeneration(assessment.id);
  };

  if (showRecommendations && assessment) {
    if (!finalReport) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              {language === "fr"
                ? "Le rapport final n'est pas encore disponible. Veuillez retourner au chat et réessayer."
                : "Final report is not available yet. Please return to chat and try again."}
            </p>
            <button
              type="button"
              onClick={() => setShowRecommendations(false)}
              className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {language === "fr" ? "Retour au chat" : "Back to chat"}
            </button>
          </div>
        </div>
      );
    }
    return <AssessmentReport report={finalReport} companyName={companyName} language={language} onBack={() => setShowRecommendations(false)} />;
  }

  if (showGeneratingPage) {
    return (
      <AssessmentGeneratingPage
        language={language}
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
              {language === "fr" ? "Évaluation ORION" : "Orion Assessment"}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {language === "fr" ? "Bonjour, je suis ORION." : "Hello, I’m ORION."}
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600 whitespace-pre-line">
              {language === "fr"
                ? "Si vous êtes ici, cela signifie que votre organisation est prête à porter un regard honnête sur l'expérience qu'elle propose.\n\nC'est là que j'interviens.\n\nParlez-moi un peu de votre organisation pour commencer."
                : "If you’re here, it means your organization is ready to take an honest look at the experience it delivers.\n\nThat’s where I come in.\n\nTell me a little about your organization to get us started."}
            </p>
            <div className="mt-7 grid gap-3 text-sm text-slate-700">
              <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <Building2 className="mt-0.5 h-5 w-5 text-violet-600" />
                <span>
                  {language === "fr"
                    ? "Le secteur et la taille de l'entreprise sont utilisés comme contexte structuré, et non devinés à partir du nom."
                    : "Sector and company size are used as structured context, not guessed from the company name."}
                </span>
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
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                {language === "fr" ? "Profil de l'entreprise" : "Company profile"}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {language === "fr" ? "Définir le contexte" : "Set the assessment context"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {language === "fr"
                  ? "Veuillez remplir les champs ci-dessous. L'évaluation commencera immédiatement après validation."
                  : "Please complete the fields below. The assessment will start immediately after submission."}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleProfileSubmit}>
              <div className="space-y-2">
                <label htmlFor="companyName" className="text-sm font-semibold text-slate-800">
                  {language === "fr" ? "Nom de l'entreprise" : "Company name"}
                </label>
                <input
                  id="companyName"
                  value={companyProfile.companyName}
                  onChange={(event) => updateCompanyProfile("companyName", event.target.value)}
                  placeholder={language === "fr" ? "Exemple : Four Seasons" : "Example: Four Seasons"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="sector" className="text-sm font-semibold text-slate-800">
                    {language === "fr" ? "Secteur d'activité" : "Sector"}
                  </label>
                  <select
                    id="sector"
                    value={companyProfile.sector}
                    onChange={(event) => updateCompanyProfile("sector", event.target.value)}
                    disabled={isReferenceLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    <option value="">
                      {isReferenceLoading
                        ? (language === "fr" ? "Chargement des secteurs..." : "Loading sectors...")
                        : (language === "fr" ? "Sélectionner un secteur" : "Select sector")}
                    </option>
                    {sectorOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="companySize" className="text-sm font-semibold text-slate-800">
                    {language === "fr" ? "Taille de l'entreprise" : "Company size"}
                  </label>
                  <select
                    id="companySize"
                    value={companyProfile.companySize}
                    onChange={(event) => updateCompanyProfile("companySize", event.target.value)}
                    disabled={isReferenceLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    <option value="">
                      {isReferenceLoading
                        ? (language === "fr" ? "Chargement des tailles..." : "Loading sizes...")
                        : (language === "fr" ? "Sélectionner la taille" : "Select size")}
                    </option>
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
                  {language === "fr" ? "Région" : "Region"}
                </label>
                <select
                  id="region"
                  value={companyProfile.region}
                  onChange={(event) => updateCompanyProfile("region", event.target.value)}
                  disabled={isReferenceLoading}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">
                    {isReferenceLoading
                      ? (language === "fr" ? "Chargement des régions..." : "Loading regions...")
                      : (language === "fr" ? "Sélectionner la région" : "Select region")}
                  </option>
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
                    {language === "fr" ? "Retour" : "Back"}
                  </button>
                ) : <span />}
                <button
                  type="submit"
                  disabled={isTyping || isReferenceLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isTyping
                    ? (language === "fr" ? "Démarrage de l'évaluation..." : "Starting assessment...")
                    : (language === "fr" ? "Démarrer l'évaluation" : "Start assessment")}
                  {!isTyping ? <ArrowRight className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                </button>
              </div>
            </form>
          </motion.section>
        </div>
      </div>
    );
  }

  const lastAssistantMsgIndex = messages.map((m) => m.isUser).lastIndexOf(false);

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
                <h2 className="text-sm font-semibold text-slate-900">
                  {language === "fr" ? "Parcours d'évaluation" : "Assessment Journey"}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === "fr" ? "Entretien guidé" : "Guided interview"}
                </p>
              </div>
            </div>
            {assessment ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {language === "fr" ? "Progression" : "Progress"}
                </p>
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
                      <div key={axis} className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {completed ? (
                            <CheckCircle2 className={`h-4 w-4 ${markerClass}`} />
                          ) : (
                            <Circle className={`h-4 w-4 ${markerClass}`} />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold uppercase tracking-wider ${textClass}`}>{getAxisDisplayName(axis, language)}</span>
                          <span className="text-[11px] text-slate-500 font-normal mt-0.5 leading-normal">
                            {getAxisProgressSubtitle(axis, language)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  {language === "fr"
                    ? "Restez concentré sur des exemples concrets. Nous nous occupons de l'analyse."
                    : "Stay focused on practical examples. We handle the analysis."}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {language === "fr"
                  ? "Nous allons dresser le profil de votre entreprise puis lancer un entretien de maturité intelligent."
                  : "We will profile your company context then run a smart maturity interview."}
              </p>
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
                <h2 className="text-sm font-semibold text-slate-900">
                  {language === "fr" ? "Discuter avec Orion" : "Chat with Orion"}
                </h2>
                <p className="text-xs text-slate-500">
                  {assessment
                    ? (language === "fr" ? `Évaluation #${assessment.id} - ${assessment.status}` : `Assessment #${assessment.id} - ${assessment.status}`)
                    : (language === "fr" ? "Profilage en cours" : "Profiling in chat")}
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
                  <div className="space-y-4 pb-[50vh]">
                    {messages.map((msg, idx) => {
                      const isLatestAssistant = !msg.isUser && idx === lastAssistantMsgIndex;
                      return (
                      <div 
                        key={msg.id} 
                        ref={isLatestAssistant ? activeQuestionRef : null}
                        className={`flex ${msg.isUser ? "justify-end" : "justify-start"} scroll-mt-6`}
                      >
                        {!msg.isUser ? (
                          <div className="mr-2 mt-1 shrink-0">
                            <Avatar chatbot size={30} alt="Orion Assistant avatar" />
                          </div>
                        ) : null}

                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`max-w-[95%] rounded-2xl px-5 py-4 text-[17px] leading-relaxed sm:max-w-[90%] shadow-sm ${
                            msg.isUser
                              ? "rounded-tr-none bg-slate-900 text-white font-normal"
                              : "rounded-tl-none border border-slate-200 bg-slate-50 text-slate-800 font-normal"
                          }`}
                        >
                          {msg.isUser ? msg.text : <AssistantMessageText text={msg.text} />}
                        </motion.div>
                      </div>
                      );
                    })}

                    {isTyping ? (
                      <div className="flex justify-start">
                        <div className="mr-2 mt-1 shrink-0">
                          <Avatar chatbot size={30} alt="Orion Assistant avatar" />
                        </div>
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="max-w-[88%] rounded-2xl rounded-tl-none border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 sm:max-w-[78%]"
                        >
                          <div className="flex items-center gap-2 text-slate-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{language === "fr" ? "L'assistant réfléchit..." : "Assistant is thinking..."}</span>
                          </div>
                        </motion.div>
                      </div>
                    ) : null}
                    <div ref={endRef} />
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
                  <form
                    onSubmit={handleSubmit}
                    className={`relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 ${
                      isFocused
                        ? "border-violet-400 bg-white shadow-md shadow-violet-100 ring-4 ring-violet-50"
                        : "border-slate-200 bg-white shadow-sm hover:border-slate-300"
                    }`}
                  >
                    {stage === "assessment_active" && !isTyping && questionOptions.length > 0 ? (
                      <div className="border-b border-slate-100 bg-slate-50/50">
                        <MultiChoiceOptions
                          options={questionOptions}
                          disabled={isTyping}
                          onSelect={async (text) => {
                            setQuestionOptions([]);
                            appendUser(text);
                            await handleAssessmentMessage(text);
                          }}
                        />
                      </div>
                    ) : null}

                    <div className="relative flex items-center bg-white min-h-[64px] transition-colors duration-150 hover:bg-violet-50/30">
                      {stage === "assessment_active" && !isTyping && questionOptions.length > 0 ? (
                        <div className="pl-6 pr-4">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold transition-all duration-150 ${
                              isFocused
                                ? "bg-violet-500 text-white shadow-md shadow-violet-200"
                                : "bg-violet-50 text-violet-500"
                            }`}
                          >
                            {questionOptions.length + 1}
                          </span>
                        </div>
                      ) : null}
                      <input
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder={
                          stage === "await_company_name"
                            ? (language === "fr" ? "Saisissez le nom de votre entreprise..." : "Type your company name...")
                            : stage === "await_sector_choice"
                              ? (language === "fr" ? "Saisissez le numéro ou le nom du secteur..." : "Type sector number or name...")
                              : stage === "await_size_choice"
                                ? (language === "fr" ? "Saisissez le numéro ou le nom de la taille..." : "Type size number or name...")
                                : (language === "fr" ? "Saisissez votre réponse ou choisissez une option..." : "Type your own answer or pick an option above...")
                        }
                        className={`w-full bg-transparent py-4 pr-14 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                          stage === "assessment_active" && !isTyping && questionOptions.length > 0 ? "pl-0" : "pl-5"
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className={`absolute right-2 rounded-xl p-2 transition-all duration-200 ${
                          input.trim() && !isTyping
                            ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:shadow"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                        aria-label="Send"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                  <div className="mt-2.5 px-1">
                    <p className="text-[13px] font-medium text-slate-400">
                      {language === "fr"
                        ? "Appuyez sur Entrée pour envoyer ou choisissez une option ci-dessus."
                        : "Press Enter to send or pick an option above."}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="w-full max-w-2xl rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 to-indigo-50 p-7 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
                    <FileText className="h-7 w-7" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">
                    {language === "fr"
                      ? "Merci — nous avons maintenant assez d'éléments pour concevoir votre rapport de maturité de l'expérience client."
                      : "Thank you — we now have enough evidence to build your customer experience maturity report."}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {language === "fr"
                      ? "Votre rapport comprendra vos points forts, vos axes d'amélioration, la maturité par axe et des recommandations ciblées."
                      : "Your report will include strengths, pain points, maturity by axis, and targeted recommendations."}
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
                    {language === "fr" ? "Retour au chat" : "Back to chat"}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateReportClick}
                    disabled={isReportFetching}
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReportFetching
                      ? (language === "fr" ? "Préparation du rapport..." : "Preparing report...")
                      : (language === "fr" ? "Obtenir le rapport" : "Get report")}
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


