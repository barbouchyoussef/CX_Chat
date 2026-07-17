import { useEffect, useState, useCallback } from "react";
import { 
  ArrowLeft, Printer, AlertTriangle, Sparkles, BookOpen, Layers, Users, 
  Compass, CheckCircle2, RefreshCw, ChevronRight, Building2, Target, 
  MessageSquareText, Settings2, TrendingUp, Search, Wrench, Flag,
  Trash2, Pencil, Plus, Save, X, Circle, FileSpreadsheet, StickyNote,
  ChevronDown, ChevronUp
} from "lucide-react";
import ExcelJS from "exceljs";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type AssessmentItem = {
  id: number;
  company_name: string;
  sector: string;
  size: string;
  region?: string | null;
  status: string;
  language?: string | null;
  created_at?: string;
  overall_maturity_band?: string | null;
};

type InterviewGuideQuestionItem = {
  id: string;
  question: string;
  rationale: string;
  follow_up: string;
  isAnswered?: boolean;
  answerNote?: string;
};

type InterviewGuide = {
  id?: number;
  assessment_id: number | null;
  company_name: string;
  language: string;
  profile?: string;
  executive_summary: string;
  unanswered_areas: string[];
  introduction_questions: InterviewGuideQuestionItem[];
  manage_questions: InterviewGuideQuestionItem[];
  analyze_questions: InterviewGuideQuestionItem[];
  improve_questions: InterviewGuideQuestionItem[];
  closure_questions: InterviewGuideQuestionItem[];
};

type Props = {
  onBack: () => void;
};

type SectionKey = "introduction" | "manage" | "analyze" | "improve" | "closure";

export default function ClientInterviewHub({ onBack }: Props) {
  const [step, setStep] = useState<"form" | "loading" | "result">("form");
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("scratch");

  // Input states
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [size, setSize] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("fr");
  const [profile, setProfile] = useState("CEO");
  const [customContext, setCustomContext] = useState("");
  const [customProfileName, setCustomProfileName] = useState("");
  const [customProfileDesc, setCustomProfileDesc] = useState("");

  // Guide generation states
  const [guide, setGuide] = useState<InterviewGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Loader status text rotation
  const [loaderTextIndex, setLoaderTextIndex] = useState(0);

  // Edit states for live questions
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editRationaleText, setEditRationaleText] = useState("");
  const [editFollowUpText, setEditFollowUpText] = useState("");

  // Answer notes — expanded state tracking
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const [savedGuides, setSavedGuides] = useState<any[]>([]);

  // Auto-save guide to localStorage and database
  const LOCAL_STORAGE_KEY = "ey_interview_guide_autosave";

  const fetchSavedGuides = useCallback(() => {
    fetch(`${API_BASE_URL}/assessments/interview-guide/list`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data)) {
          setSavedGuides(data);
        }
      })
      .catch((err) => console.error("Failed to load saved guides:", err));
  }, []);

  const saveGuideToDb = useCallback(async (g: InterviewGuide) => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/interview-guide/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: g.id || null,
          assessment_id: g.assessment_id || null,
          company_name: g.company_name,
          profile: g.profile || profile,
          language: g.language,
          payload: g
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id && g.id !== data.id) {
          setGuide((prev) => {
            if (prev && prev.company_name === g.company_name) {
              return { ...prev, id: data.id };
            }
            return prev;
          });
        }
        fetchSavedGuides();
      }
    } catch (err) {
      console.error("Failed to save guide to DB:", err);
    }
  }, [profile, fetchSavedGuides]);

  const saveGuideToStorage = useCallback((g: InterviewGuide) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(g));
    } catch { /* quota exceeded — ignore */ }
  }, []);

  // Persist on every guide change (localStorage + debounced DB)
  useEffect(() => {
    if (guide && step === "result") {
      saveGuideToStorage(guide);
      
      const timer = setTimeout(() => {
        saveGuideToDb(guide);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [guide, step, saveGuideToStorage, saveGuideToDb]);

  const ensureQuestionIds = (data: any): InterviewGuide => {
    if (!data) return data;
    const ensureSection = (list: any[]) => {
      return (list || []).map((q, idx) => ({
        ...q,
        id: q.id || `${Date.now()}-${Math.random()}-${idx}`,
        question: q.question || "",
        rationale: q.rationale || "",
        follow_up: q.follow_up || "",
        isAnswered: q.isAnswered !== undefined ? q.isAnswered : false,
        answerNote: q.answerNote || ""
      }));
    };
    return {
      ...data,
      introduction_questions: ensureSection(data.introduction_questions),
      manage_questions: ensureSection(data.manage_questions),
      analyze_questions: ensureSection(data.analyze_questions),
      improve_questions: ensureSection(data.improve_questions),
      closure_questions: ensureSection(data.closure_questions),
    };
  };

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as InterviewGuide;
        if (parsed && parsed.company_name) {
          setGuide(ensureQuestionIds(parsed));
          setCompanyName(parsed.company_name);
          setLanguage(parsed.language || "fr");
        }
      }
    } catch { /* corrupt data — ignore */ }
  }, []);

  // Load past assessments list and saved guides list on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/assessments?limit=100`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.items)) {
          setAssessments(data.items);
        }
      })
      .catch((err) => console.error("Failed to load assessments:", err));

    fetchSavedGuides();
  }, [fetchSavedGuides]);

  const handleLoadGuideFromDb = async (guideId: number) => {
    setStep("loading");
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/interview-guide/${guideId}`);
      if (!res.ok) throw new Error("Failed to fetch guide");
      const data = (await res.json()) as InterviewGuide;
      
      setGuide(ensureQuestionIds(data));
      setCompanyName(data.company_name);
      setLanguage(data.language || "fr");
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading saved guide.");
      setStep("form");
    }
  };

  // Pre-fill fields when assessment changes
  useEffect(() => {
    if (selectedAssessmentId === "scratch") {
      setCompanyName("");
      setSector("");
      setSize("");
      setRegion("");
    } else {
      const matched = assessments.find((a) => a.id.toString() === selectedAssessmentId);
      if (matched) {
        setCompanyName(matched.company_name);
        setSector(matched.sector);
        setSize(matched.size);
        setRegion(matched.region ?? "");
      }
    }
  }, [selectedAssessmentId, assessments]);

  // Dynamic loader text sequences
  const isFrench = language.toLowerCase().startsWith("fr");
  const loaderTexts = isFrench 
    ? [
        "Analyse de l'historique des conversations avec le bot Orion...",
        "Identification des dimensions CX non abordées dans l'auto-évaluation...",
        "Formulation de questions spécifiques adaptées au profil de l'interlocuteur...",
        "Vérification des doublons et structuration finale du guide d'entretien..."
      ]
    : [
        "Analyzing past conversation history with Orion bot...",
        "Identifying information gaps and uncovered CX capabilities...",
        "Formulating specific questions matched to the stakeholder persona...",
        "Checking for duplicate questions and building final interview flow..."
      ];

  useEffect(() => {
    if (step !== "loading") return;
    const interval = setInterval(() => {
      setLoaderTextIndex((prev) => (prev + 1) % loaderTexts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [step, loaderTexts.length]);

  const handleGenerate = async () => {
    if (!companyName.trim()) {
      setError(isFrench ? "Veuillez saisir le nom de l'entreprise." : "Please enter a company name.");
      return;
    }

    if (profile === "Other") {
      if (!customProfileName.trim()) {
        setError(isFrench ? "Veuillez saisir le nom du profil personnalisé." : "Please enter a custom profile name.");
        return;
      }
      if (!customProfileDesc.trim()) {
        setError(isFrench ? "Veuillez saisir la description du profil personnalisé." : "Please enter custom profile specifications.");
        return;
      }
    }

    setStep("loading");
    setLoaderTextIndex(0);
    setError(null);

    const payload = {
      assessment_id: selectedAssessmentId === "scratch" ? null : parseInt(selectedAssessmentId, 10),
      company_name: companyName,
      sector: sector || null,
      size: size || null,
      region: region || null,
      language: language,
      profile: profile === "Other" ? customProfileName.trim() : profile,
      custom_context: customContext || null,
      custom_profile_description: profile === "Other" ? customProfileDesc.trim() : null,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/assessments/interview-guide/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMsg = isFrench ? "Échec de la génération du guide d'entretien." : "Failed to generate custom interview guide.";
        try {
          const errData = await res.json();
          if (errData && errData.detail) {
            errorMsg = errData.detail;
          }
        } catch { /* ignore */ }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setGuide(ensureQuestionIds(data));

      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error occurred during generation.");
      setStep("form");
    }
  };

  const selectedAssessment = assessments.find((a) => a.id.toString() === selectedAssessmentId);

  // Live actions for questions edit flow
  const updateSectionQuestions = (
    sectionKey: SectionKey,
    updater: (prev: InterviewGuideQuestionItem[]) => InterviewGuideQuestionItem[]
  ) => {
    if (!guide) return;
    const arrayName = `${sectionKey}_questions` as keyof InterviewGuide;
    setGuide({
      ...guide,
      [arrayName]: updater(guide[arrayName] as InterviewGuideQuestionItem[]),
    });
  };

  const handleToggleAnswered = (sectionKey: SectionKey, id: string) => {
    updateSectionQuestions(sectionKey, (prev) =>
      prev.map((q) => (q.id === id ? { ...q, isAnswered: !q.isAnswered } : q))
    );
  };

  const handleUpdateAnswerNote = (sectionKey: SectionKey, id: string, note: string) => {
    updateSectionQuestions(sectionKey, (prev) =>
      prev.map((q) => (q.id === id ? { ...q, answerNote: note } : q))
    );
  };

  const toggleNoteExpanded = (id: string) => {
    setExpandedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Excel Export with ExcelJS (EY Branded & Styled) ──
  const handleExportExcel = async () => {
    if (!guide) return;

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "EY CX Chat";
      wb.created = new Date();

      // ────────────────────────────────────────────────────────
      // SHEET 1: INTERVIEW GUIDE
      // ────────────────────────────────────────────────────────
      const ws = wb.addWorksheet(isFrench ? "Guide d'entretien" : "Interview Guide", {
        views: [{ showGridLines: true }]
      });

      // Title & Subtitle block
      ws.addRow([]); // Row 1: Spacer
      
      const titleRow = ws.addRow(["", "EY | CUSTOMER EXPERIENCE MATURITY ASSESSMENT"]);
      titleRow.height = 30;
      titleRow.getCell(2).font = { name: "Arial", size: 14, bold: true, color: { argb: "1F2937" } };
      
      const subtitleRow = ws.addRow(["", `Company: ${guide.company_name}   |   Language: ${guide.language.toUpperCase()}   |   Profile: ${profile}`]);
      subtitleRow.height = 20;
      subtitleRow.getCell(2).font = { name: "Arial", size: 9.5, italic: true, color: { argb: "4B5563" } };
      
      ws.addRow([]); // Row 4: Spacer

      // Define columns
      const headers = isFrench
        ? ["Axe / Section", "N°", "Question", "Pourquoi cette question ?", "Relances potentielles", "Notes / Réponse du client", "Statut"]
        : ["Section / Axis", "#", "Question", "Rationale", "Potential Follow-ups", "Client Answer / Notes", "Status"];

      const headerRow = ws.addRow(headers);
      headerRow.height = 28;

      // Header styling
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "2E2E38" } // Dark Charcoal
        };
        cell.font = {
          name: "Arial",
          size: 10,
          bold: true,
          color: { argb: "FFFFFF" }
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "4B5563" } },
          bottom: { style: "medium", color: { argb: "111827" } },
          left: { style: "thin", color: { argb: "4B5563" } },
          right: { style: "thin", color: { argb: "4B5563" } }
        };
      });

      const sectionDefs = [
        { 
          label: isFrench ? "Introduction" : "Introduction", 
          key: "introduction_questions" as const,
          bgColor: "F1F5F9", // Slate-100
          textColor: "475569"
        },
        { 
          label: isFrench ? "Piloter (Manage)" : "Manage", 
          key: "manage_questions" as const,
          bgColor: "FEF3C7", // Amber-100
          textColor: "B45309"
        },
        { 
          label: isFrench ? "Analyser (Analyze)" : "Analyze", 
          key: "analyze_questions" as const,
          bgColor: "EFF6FF", // Blue-100
          textColor: "1D4ED8"
        },
        { 
          label: isFrench ? "Améliorer (Improve)" : "Improve", 
          key: "improve_questions" as const,
          bgColor: "ECFDF5", // Emerald-100
          textColor: "047857"
        },
        { 
          label: isFrench ? "Clôture (Closure)" : "Closure", 
          key: "closure_questions" as const,
          bgColor: "FAF5FF", // Purple-100
          textColor: "6D28D9"
        },
      ];

      // Add data rows
      sectionDefs.forEach((sec) => {
        const qs = guide[sec.key] as InterviewGuideQuestionItem[];
        qs.forEach((q, idx) => {
          const statusText = q.isAnswered 
            ? (isFrench ? "Répondu" : "Answered") 
            : (isFrench ? "À poser" : "To Ask");
            
          const dataRow = ws.addRow([
            sec.label,
            idx + 1,
            q.question || "",
            q.rationale || "",
            q.follow_up || "",
            q.answerNote || "",
            statusText
          ]);

          dataRow.height = 68; // Safe height with nice breathing room!

          // Row borders
          const thinBorder = { style: "thin" as const, color: { argb: "E2E8F0" } };
          
          // Style individual cells in the row
          // Column 1 (Section Label)
          const cellSec = dataRow.getCell(1);
          cellSec.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: sec.bgColor }
          };
          cellSec.font = { name: "Arial", size: 9.5, bold: true, color: { argb: sec.textColor } };
          cellSec.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cellSec.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

          // Column 2 (Index)
          const cellIdx = dataRow.getCell(2);
          cellIdx.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "6B7280" } };
          cellIdx.alignment = { vertical: "middle", horizontal: "center" };
          cellIdx.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

          // Columns 3, 4, 5, 6 (Texts)
          for (let col = 3; col <= 6; col++) {
            const cell = dataRow.getCell(col);
            cell.font = { 
              name: "Arial", 
              size: 9.5, 
              color: { argb: col === 6 ? "1E3A8A" : "374151" } // Highlight user notes in soft blue
            };
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
            cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
            
            // Give a very soft tint to the Answer column to make it stand out as writable area
            if (col === 6) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "F8FAFC" } // Slate-50 tint
              };
            }
          }

          // Column 7 (Status Badge)
          const cellStatus = dataRow.getCell(7);
          cellStatus.alignment = { vertical: "middle", horizontal: "center" };
          cellStatus.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
          if (q.isAnswered) {
            cellStatus.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D1FAE5" } }; // Light emerald
            cellStatus.font = { name: "Arial", size: 9, bold: true, color: { argb: "065F46" } };
          } else {
            cellStatus.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF3C7" } }; // Light amber
            cellStatus.font = { name: "Arial", size: 9, bold: true, color: { argb: "92400E" } };
          }
        });
      });

      // Set explicit column widths
      ws.getColumn(1).width = 22; // Section
      ws.getColumn(2).width = 6;  // #
      ws.getColumn(3).width = 50; // Question
      ws.getColumn(4).width = 40; // Rationale
      ws.getColumn(5).width = 40; // Follow-up
      ws.getColumn(6).width = 50; // Notes
      ws.getColumn(7).width = 14; // Status

      // ────────────────────────────────────────────────────────
      // SHEET 2: DIAGNOSTIC SUMMARY
      // ────────────────────────────────────────────────────────
      const wsSum = wb.addWorksheet(isFrench ? "Synthèse" : "Summary", {
        views: [{ showGridLines: true }]
      });

      wsSum.addRow([]); // Spacer
      
      const sumTitleRow = wsSum.addRow(["", "DIAGNOSTIC SUMMARY & MATURITY FINDINGS"]);
      sumTitleRow.height = 30;
      sumTitleRow.getCell(2).font = { name: "Arial", size: 14, bold: true, color: { argb: "1F2937" } };
      
      wsSum.addRow([]); // Spacer

      // Info rows
      const addMetaRow = (key: string, val: string) => {
        const row = wsSum.addRow(["", key, val]);
        row.height = 22;
        row.getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: "4B5563" } };
        row.getCell(2).alignment = { vertical: "middle", horizontal: "right" };
        row.getCell(3).font = { name: "Arial", size: 10, color: { argb: "111827" } };
        row.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
        
        const thinBorder = { style: "thin" as const, color: { argb: "E2E8F0" } };
        row.getCell(2).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        row.getCell(3).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F9FAFB" } };
      };

      addMetaRow(isFrench ? "Entreprise" : "Company", guide.company_name);
      addMetaRow(isFrench ? "Langue" : "Language", guide.language.toUpperCase());
      addMetaRow(isFrench ? "Profil" : "Profile", profile);
      
      wsSum.addRow([]); // Spacer
      wsSum.addRow([]); // Spacer

      // Executive Summary Header
      const execHeader = wsSum.addRow(["", isFrench ? "Synthèse de l'évaluation" : "Assessment Executive Summary"]);
      execHeader.height = 24;
      execHeader.getCell(2).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
      execHeader.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "2E2E38" } };
      execHeader.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      wsSum.mergeCells(`B${execHeader.number}:F${execHeader.number}`);

      // Executive Summary Content
      const execContent = wsSum.addRow(["", guide.executive_summary || ""]);
      execContent.height = 80;
      execContent.getCell(2).font = { name: "Arial", size: 10, color: { argb: "374151" } };
      execContent.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true };
      
      const thinBorder = { style: "thin" as const, color: { argb: "CBD5E1" } };
      // Apply border around the merged text area manually
      wsSum.mergeCells(`B${execContent.number}:F${execContent.number}`);
      execContent.getCell(2).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
      execContent.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FAFAFA" } };

      wsSum.addRow([]); // Spacer
      wsSum.addRow([]); // Spacer

      // Gaps Header
      if (guide.unanswered_areas && guide.unanswered_areas.length > 0) {
        const gapHeader = wsSum.addRow(["", isFrench ? "Zones d'ombre à approfondir" : "Key Gaps / Blind Spots to Explore"]);
        gapHeader.height = 24;
        gapHeader.getCell(2).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
        gapHeader.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "92400E" } }; // Amber-800
        gapHeader.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
        wsSum.mergeCells(`B${gapHeader.number}:F${gapHeader.number}`);

        guide.unanswered_areas.forEach((gap, i) => {
          const gapRow = wsSum.addRow(["", `${i + 1}.`, gap]);
          gapRow.height = 24;
          gapRow.getCell(2).font = { name: "Arial", size: 9.5, bold: true, color: { argb: "B45309" } };
          gapRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
          gapRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBEB" } };
          
          gapRow.getCell(3).font = { name: "Arial", size: 9.5, color: { argb: "374151" } };
          gapRow.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
          
          const thinBorder = { style: "thin" as const, color: { argb: "FDE68A" } };
          gapRow.getCell(2).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
          gapRow.getCell(3).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
          wsSum.mergeCells(`C${gapRow.number}:F${gapRow.number}`);
        });
      }

      // Column widths for sheet 2
      wsSum.getColumn(1).width = 4;
      wsSum.getColumn(2).width = 25;
      wsSum.getColumn(3).width = 20;
      wsSum.getColumn(4).width = 20;
      wsSum.getColumn(5).width = 20;
      wsSum.getColumn(6).width = 20;

      // Write and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Interview_Guide_${guide.company_name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel generation failed:", err);
      setError(isFrench ? "Erreur lors de l'export Excel." : "Error exporting Excel.");
    }
  };

  const handleDeleteQuestion = (sectionKey: SectionKey, id: string) => {
    updateSectionQuestions(sectionKey, (prev) => prev.filter((q) => q.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
  };

  const handleStartEdit = (q: InterviewGuideQuestionItem) => {
    setEditingId(q.id);
    setEditQuestionText(q.question);
    setEditRationaleText(q.rationale);
    setEditFollowUpText(q.follow_up);
  };

  const handleSaveEdit = (sectionKey: SectionKey, id: string) => {
    updateSectionQuestions(sectionKey, (prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              question: editQuestionText,
              rationale: editRationaleText,
              follow_up: editFollowUpText,
            }
          : q
      )
    );
    setEditingId(null);
  };

  const handleCancelEdit = (sectionKey: SectionKey, id: string) => {
    // If it's a newly added empty question, cancel deletes it
    const arrayName = `${sectionKey}_questions` as keyof InterviewGuide;
    const item = (guide?.[arrayName] as InterviewGuideQuestionItem[])?.find((q) => q.id === id);
    if (item && !item.question.trim() && !item.rationale.trim() && !item.follow_up.trim()) {
      handleDeleteQuestion(sectionKey, id);
    }
    setEditingId(null);
  };

  const handleAddQuestion = (sectionKey: SectionKey) => {
    const newId = `new-${Date.now()}-${Math.random()}`;
    const newQuestion: InterviewGuideQuestionItem = {
      id: newId,
      question: "",
      rationale: "",
      follow_up: "",
      isAnswered: false,
    };

    updateSectionQuestions(sectionKey, (prev) => [...prev, newQuestion]);
    setEditingId(newId);
    setEditQuestionText("");
    setEditRationaleText("");
    setEditFollowUpText("");
  };

  const labels = {
    title: "Client Interview Hub",
    subtitle: isFrench ? "Générateur intelligent de guides d'entretiens sémantiques" : "Semantic AI Interview Guide Generator",
    back: isFrench ? "Retour" : "Back",
    print: isFrench ? "Imprimer (PDF)" : "Print (PDF)",
    exportExcel: isFrench ? "Exporter Excel" : "Export Excel",
    answerPlaceholder: isFrench ? "Notes de l'entretien — réponse du client, observations, verbatims..." : "Interview notes — client answer, observations, verbatims...",
    noteLabel: isFrench ? "Notes / Réponse" : "Notes / Answer",
    savedLabel: isFrench ? "Sauvegardé" : "Saved",
    loadSaved: isFrench ? "Charger la dernière session" : "Load last session",
    generate: isFrench ? "Générer le Guide d'Entretien" : "Generate Interview Guide",
    setupTitle: isFrench ? "Paramètres de l'Entretien" : "Interview Configuration",
    sourceLabel: isFrench ? "Source de données" : "Data Source",
    scratchOption: isFrench ? "Démarrer de zéro (Sans historique)" : "Start from Scratch (No history)",
    companyLabel: isFrench ? "Entreprise" : "Company",
    sectorLabel: isFrench ? "Secteur" : "Sector",
    sizeLabel: isFrench ? "Taille" : "Size",
    regionLabel: isFrench ? "Région" : "Region",
    profileLabel: isFrench ? "Profil de l'interlocuteur" : "Target Stakeholder Persona",
    contextLabel: isFrench ? "Remarques & éléments à inclure" : "Remarks & Elements to Include",
    contextPlaceholder: isFrench ? "Ex: Tensions entre IT et Marketing, projet de migration Salesforce T4, résiliations en hausse sur le segment PME..." : "E.g., Active friction between IT and marketing, Q4 Salesforce migration project, rising churn in SMB segment...",
    summary: isFrench ? "Synthèse sémantique" : "Semantic Synthesis",
    gaps: isFrench ? "Gaps identifiés à explorer" : "Identified Gaps to Explore",
    questions: isFrench ? "Guide d'entretien structuré" : "Structured Interview Guide",
    insightTitle: isFrench ? "Diagnostic chargé" : "Loaded Assessment",
    insightStatus: isFrench ? "Statut" : "Status",
    insightMaturity: isFrench ? "Maturité" : "Maturity",
    modifySettings: isFrench ? "Modifier" : "Modify",
  };

  const personas = [
    {
      code: "CEO",
      title: isFrench ? "Directeur Général / CEO" : "Chief Executive Officer",
      desc: isFrench ? "Vision stratégique, arbitrages budgétaires, gouvernance." : "Strategic vision, budget trade-offs, governance.",
      icon: <Target className="h-5 w-5" />,
      accent: "yellow",
    },
    {
      code: "Marketing",
      title: isFrench ? "Directeur Marketing" : "Marketing Director",
      desc: isFrench ? "Promesse de marque, canaux, segmentation." : "Brand promise, channels, segmentation.",
      icon: <TrendingUp className="h-5 w-5" />,
      accent: "blue",
    },
    {
      code: "Call Center",
      title: isFrench ? "Responsable Centre de Contacts" : "Customer Service Manager",
      desc: isFrench ? "Opérations terrain, remontée des irritants." : "Frontline operations, issue escalation.",
      icon: <MessageSquareText className="h-5 w-5" />,
      accent: "emerald",
    },
    {
      code: "IT Lead",
      title: isFrench ? "Directeur Digital / IT / Data" : "Digital / IT / Data Lead",
      desc: isFrench ? "Données, CRM, IA, outils prédictifs." : "Data, CRM, AI, predictive tools.",
      icon: <Settings2 className="h-5 w-5" />,
      accent: "violet",
    },
    {
      code: "Other",
      title: isFrench ? "Autre profil / Personnalisé" : "Other Profile / Custom",
      desc: isFrench ? "Définissez un profil sur mesure et ses spécifications d'audit." : "Define a bespoke profile and its audit specifications.",
      icon: <Users className="h-5 w-5" />,
      accent: "slate",
    }
  ];

  // Shared header component
  const renderHeader = (rightContent?: React.ReactNode) => (
    <header className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-sm bg-white/95 no-print">
      <div className="flex items-center gap-3">
        <button
          onClick={step === "result" ? () => setStep("form") : onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {step === "result" ? labels.modifySettings : labels.back}
        </button>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}ey_logo.svg`} alt="EY" className="h-7 w-auto block" />
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5 leading-none">
              {labels.title}
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 inline-block animate-pulse" />
            </h1>
            <p className="text-[9px] text-slate-400 font-medium tracking-widest uppercase mt-0.5 leading-none">{labels.subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {rightContent}
        <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setLanguage("fr")}
            className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition-all ${
              language === "fr" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"
            }`}
          >FR</button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition-all ${
              language === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"
            }`}
          >EN</button>
        </div>
      </div>
    </header>
  );

  // ============================= FORM VIEW =============================
  if (step === "form") {
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-slate-800 font-sans pb-16">
        {renderHeader()}

        <div className="max-w-5xl mx-auto px-6 mt-8">

          {/* Step Indicators */}
          <div className="flex items-center gap-2 mb-8">
            {[
              { n: "1", label: isFrench ? "Source & Entreprise" : "Source & Company" },
              { n: "2", label: isFrench ? "Profil cible" : "Target Persona" },
              { n: "3", label: isFrench ? "Génération" : "Generate" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
                  <span className="h-5 w-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">{s.n}</span>
                  <span className="text-xs font-semibold text-slate-700">{s.label}</span>
                </div>
                {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              </div>
            ))}
          </div>

          {/* Main Form Layout */}
          <div className="space-y-6">
            
            {/* Section 1: Data Source & Company Details */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  {isFrench ? "Étape 1 — Source de données & informations entreprise" : "Step 1 — Data Source & Company Information"}
                </h3>
              </div>
              <div className="p-6">
                {/* Selector Block */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                  {/* Source Selector */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">{labels.sourceLabel}</label>
                    <select
                      value={selectedAssessmentId}
                      onChange={(e) => setSelectedAssessmentId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none transition-all"
                    >
                      <option value="scratch">{labels.scratchOption}</option>
                      {assessments.map((a) => (
                        <option key={a.id} value={a.id.toString()}>
                          #{a.id} — {a.company_name} ({a.sector})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Resume Session Selector */}
                  {savedGuides.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                        {isFrench ? "Ou reprendre une session sauvegardée (BD)" : "Or Resume a Saved Session (DB)"}
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleLoadGuideFromDb(parseInt(e.target.value, 10));
                          }
                        }}
                        className="w-full rounded-lg border border-blue-200 bg-blue-50/20 px-3.5 py-2.5 text-sm font-semibold text-blue-800 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none transition-all"
                      >
                        <option value="" className="text-slate-500 font-normal">
                          {isFrench ? `-- Choisir une session (${savedGuides.length}) --` : `-- Select a saved session (${savedGuides.length}) --`}
                        </option>
                        {savedGuides.map((g) => {
                          const dateStr = new Date(g.updated_at).toLocaleDateString(
                            isFrench ? "fr-FR" : "en-US",
                            { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                          );
                          return (
                            <option key={g.id} value={g.id} className="text-slate-800 font-normal">
                              {g.company_name} — {g.profile} ({dateStr})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                  {/* Assessment Details Badge */}
                  {selectedAssessment && (
                    <div className="mb-5 rounded-lg bg-emerald-50 border border-emerald-200/60 p-3.5 flex items-center gap-3 max-w-md">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold text-emerald-800">{labels.insightTitle}</p>
                        <p className="text-emerald-600 mt-0.5">
                          {labels.insightStatus}: <span className="font-mono uppercase">{selectedAssessment.status}</span>
                          {selectedAssessment.overall_maturity_band && (
                            <> · {labels.insightMaturity}: <span className="font-bold">{selectedAssessment.overall_maturity_band}</span></>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Company Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: labels.companyLabel + " *", value: companyName, setter: setCompanyName, ph: "Tunisie Telecom" },
                      { label: labels.sectorLabel, value: sector, setter: setSector, ph: "Telecom, Banking..." },
                      { label: labels.sizeLabel, value: size, setter: setSize, ph: "PME, Enterprise..." },
                      { label: labels.regionLabel, value: region, setter: setRegion, ph: "Africa, Europe..." },
                    ].map((f, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-slate-500">{f.label}</label>
                        <input
                          type="text"
                          value={f.value}
                          onChange={(e) => f.setter(e.target.value)}
                          disabled={selectedAssessmentId !== "scratch"}
                          placeholder={f.ph}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none transition-all"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 2: Persona Selection */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    {isFrench ? "Étape 2 — Profil de l'interlocuteur" : "Step 2 — Target Stakeholder Persona"}
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {personas.map((p) => {
                      const isActive = profile === p.code;
                      const accentMap: Record<string, { border: string; bg: string; badge: string; icon: string }> = {
                        yellow:  { border: "border-yellow-400", bg: "bg-yellow-50/60", badge: "bg-yellow-400 text-yellow-900", icon: "text-yellow-600" },
                        blue:    { border: "border-blue-400", bg: "bg-blue-50/60", badge: "bg-blue-500 text-white", icon: "text-blue-600" },
                        emerald: { border: "border-emerald-400", bg: "bg-emerald-50/60", badge: "bg-emerald-500 text-white", icon: "text-emerald-600" },
                        violet:  { border: "border-violet-400", bg: "bg-violet-50/60", badge: "bg-violet-500 text-white", icon: "text-violet-600" },
                        slate:   { border: "border-slate-400", bg: "bg-slate-50/60", badge: "bg-slate-500 text-white", icon: "text-slate-600" },
                      };
                      const colors = accentMap[p.accent] || accentMap.yellow;

                      return (
                        <button
                          key={p.code}
                          type="button"
                          onClick={() => setProfile(p.code)}
                          className={`group text-left rounded-xl border-2 p-4 transition-all duration-200 relative ${
                            isActive
                              ? `${colors.border} ${colors.bg} shadow-sm`
                              : "border-slate-150 bg-white hover:border-slate-300 hover:shadow-sm"
                          }`}
                        >
                          {isActive && (
                            <div className="absolute top-2.5 right-2.5">
                              <CheckCircle2 className={`h-4 w-4 ${colors.icon}`} />
                            </div>
                          )}
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                            isActive ? colors.badge : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                          }`}>
                            {p.icon}
                          </div>
                          <h4 className="text-[13px] font-bold text-slate-900 leading-tight">{p.title}</h4>
                          <p className="text-[11px] text-slate-400 leading-snug mt-1.5 font-medium">{p.desc}</p>
                        </button>
                      );
                    })}
                  </div>

                  {profile === "Other" && (
                    <div className="mt-5 border-t border-slate-100 pt-5 space-y-4 animate-fadeIn">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <Settings2 className="h-4 w-4 text-slate-400" />
                        {isFrench ? "Spécifications du profil personnalisé" : "Custom Profile Specifications"}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5 sm:col-span-1">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            {isFrench ? "Nom du rôle" : "Role Name"}
                          </label>
                          <input
                            type="text"
                            value={customProfileName}
                            onChange={(e) => setCustomProfileName(e.target.value)}
                            placeholder={isFrench ? "Ex: Responsable Filiale..." : "Ex: Subsidiary Manager..."}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            {isFrench ? "Description / Persona et spécifications" : "Description / Persona & specifications"}
                          </label>
                          <textarea
                            value={customProfileDesc}
                            onChange={(e) => setCustomProfileDesc(e.target.value)}
                            placeholder={isFrench 
                              ? "Décrivez le périmètre, les responsabilités et les points d'intérêt à explorer..." 
                              : "Describe the scope, responsibilities, and key topics to explore..."}
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none resize-none transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            {/* Section 3: Custom Remarks & Generate */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Compass className="h-4 w-4 text-slate-400" />
                  {isFrench ? "Étape 3 — Contexte & remarques" : "Step 3 — Context & Remarks"}
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <textarea
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  placeholder={labels.contextPlaceholder}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none resize-none transition-all"
                />

                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 py-4 text-sm font-bold text-white shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20 active:scale-[0.995] transition-all"
                >
                  <Sparkles className="h-4.5 w-4.5 text-yellow-400" />
                  {labels.generate}
                </button>

              </div>
            </div>

          </div>

        </div>
      </div>
    );
  }
  // ============================= LOADING VIEW =============================
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-slate-955 text-white font-sans flex items-center justify-center p-6">
        <div className="max-w-sm w-full flex flex-col items-center gap-10 text-center">
          
          {/* Spinner */}
          <div className="relative h-24 w-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-slate-800" />
            <div className="absolute inset-0 rounded-full border-[3px] border-t-yellow-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-slate-800" />
            <div className="absolute inset-3 rounded-full border-2 border-t-transparent border-r-white/40 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <Sparkles className="h-6 w-6 text-yellow-400" />
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-black tracking-[0.25em] uppercase text-yellow-400 flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {isFrench ? "Génération en cours" : "Generating"}
            </h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed min-h-[44px] px-4 transition-all">
              {loaderTexts[loaderTextIndex]}
            </p>
          </div>

          <div className="flex gap-1.5">
            {loaderTexts.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === loaderTextIndex ? "w-6 bg-yellow-400" : "w-1.5 bg-slate-700"}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================= SECTION CONFIGS =============================
  const sectionConfigs = [
    {
      key: "introduction" as SectionKey,
      title: isFrench ? "Introduction & État Général" : "Warm-up & General State",
      icon: <Users className="h-4 w-4" />,
      accentColor: "slate",
      borderColor: "border-slate-200",
      bgColor: "bg-slate-50",
      iconBg: "bg-slate-100 text-slate-600",
      badgeBg: "bg-slate-800",
      duration: "5 min",
      questions: guide?.introduction_questions || [],
    },
    {
      key: "manage" as SectionKey,
      title: isFrench ? "Pilotage / Manage" : "Governance / Manage",
      icon: <Layers className="h-4 w-4" />,
      accentColor: "yellow",
      borderColor: "border-yellow-200",
      bgColor: "bg-yellow-50/40",
      iconBg: "bg-yellow-100 text-yellow-700",
      badgeBg: "bg-yellow-500",
      duration: "12 min",
      questions: guide?.manage_questions || [],
    },
    {
      key: "analyze" as SectionKey,
      title: isFrench ? "Analyse / Analyze" : "Analysis / Analyze",
      icon: <Search className="h-4 w-4" />,
      accentColor: "blue",
      borderColor: "border-blue-200",
      bgColor: "bg-blue-50/40",
      iconBg: "bg-blue-100 text-blue-700",
      badgeBg: "bg-blue-500",
      duration: "15 min",
      questions: guide?.analyze_questions || [],
    },
    {
      key: "improve" as SectionKey,
      title: isFrench ? "Amélioration / Improve" : "Improvement / Improve",
      icon: <Wrench className="h-4 w-4" />,
      accentColor: "emerald",
      borderColor: "border-emerald-200",
      bgColor: "bg-emerald-50/40",
      iconBg: "bg-emerald-100 text-emerald-700",
      badgeBg: "bg-emerald-500",
      duration: "12 min",
      questions: guide?.improve_questions || [],
    },
    {
      key: "closure" as SectionKey,
      title: isFrench ? "Clôture" : "Closure",
      icon: <Flag className="h-4 w-4" />,
      accentColor: "violet",
      borderColor: "border-violet-200",
      bgColor: "bg-violet-50/40",
      iconBg: "bg-violet-100 text-violet-700",
      badgeBg: "bg-violet-500",
      duration: "5 min",
      questions: guide?.closure_questions || [],
    },
  ];

  // ============================= RESULT VIEW =============================
  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-800 font-sans pb-16 print:bg-white print:text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print, button, .flex-1.h-px, .pt-2.no-print, [title="Modifier"], [title="Supprimer"], .no-print-counter {
            display: none !important;
          }
          body, html, #root, main {
            background: white !important;
            color: black !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          main, .max-w-4xl {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 25px !important;
            border: 1px solid #cbd5e1 !important;
            background: white !important;
            box-shadow: none !important;
            border-radius: 12px !important;
          }
          .print-question-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-grid-stack {
            display: block !important;
          }
          .print-grid-stack > div {
            margin-bottom: 15px !important;
            width: 100% !important;
            display: block !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />
      
      {renderHeader(
        guide ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="no-print flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-sm transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {labels.exportExcel}
            </button>
            <button
              onClick={() => window.print()}
              className="no-print flex items-center gap-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm transition-all"
            >
              <Printer className="h-3.5 w-3.5" />
              {labels.print}
            </button>
          </div>
        ) : undefined
      )}

      <main className="max-w-4xl mx-auto px-6 mt-8 print:p-0 print:mt-0">
        {guide && (
          <div className="space-y-6">

            {/* Report Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm print:border-none print:shadow-none">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">{guide.company_name}</h2>
                  <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-2">
                    <span className="font-mono uppercase tracking-wider">
                      {isFrench ? "Guide d'entretien" : "Interview Guide"}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className="font-semibold text-slate-600">{personas.find(p => p.code === profile)?.title || profile}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="no-print inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[10px] font-mono px-2.5 py-1.5 rounded-md border border-slate-200 font-semibold uppercase tracking-wider">
                    <Sparkles className="h-3 w-3 text-yellow-500" />
                    AI Generated
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono mt-1.5">
                    {new Date().toLocaleDateString(isFrench ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* Synthesis + Gaps layout */}
            <div className="grid gap-5 md:grid-cols-5 print-grid-stack">
              {/* Executive Summary */}
              {guide.executive_summary && (
                <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm print:border print:shadow-none">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-yellow-500 print:text-slate-600" />
                    {labels.summary}
                  </h3>
                  <p className="text-[13px] text-slate-600 leading-[1.8]">
                    {guide.executive_summary}
                  </p>
                </div>
              )}

              {/* Gaps */}
              {guide.unanswered_areas && guide.unanswered_areas.length > 0 && (
                <div className="md:col-span-2 bg-white border border-amber-200/60 rounded-2xl p-6 shadow-sm print:border print:shadow-none">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 print:text-slate-600" />
                    {labels.gaps}
                  </h3>
                  <ul className="space-y-2.5">
                    {guide.unanswered_areas.map((gap, index) => (
                      <li key={index} className="flex items-start gap-2 text-[12px] text-slate-600 leading-relaxed">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Questions Title Bar */}
            <div className="flex items-center justify-between pt-2 no-print">
              <div className="flex items-center gap-3 flex-1 mr-4">
                <h3 className="text-sm font-bold text-slate-900">{labels.questions}</h3>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-white border px-2.5 py-1 rounded-md shadow-sm shrink-0">
                {sectionConfigs.reduce((acc, s) => acc + s.questions.length, 0)} {isFrench ? "questions au total" : "total questions"}
              </span>
            </div>

            {/* Question Sections */}
            {sectionConfigs.map((section) => {
              const qs = section.questions;
              return (
                <section key={section.key} className="print-card bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  
                  {/* Section Header */}
                  <div className={`px-6 py-4 border-b ${section.borderColor} ${section.bgColor} flex items-center justify-between`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shadow-sm ${section.iconBg}`}>
                        {section.icon}
                      </div>
                      <div>
                        <h4 className="text-[13px] font-bold text-slate-800 leading-none">{section.title}</h4>
                        <p className="text-[10px] text-slate-400 font-medium mt-1 leading-none">
                          {isFrench ? "Section estimée à" : "Section estimated duration:"} {section.duration}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button
                        onClick={() => handleAddQuestion(section.key)}
                        className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-50 hover:text-slate-800 transition-all"
                      >
                        <Plus className="h-3.5 w-3.5 text-slate-400" />
                        {isFrench ? "Ajouter" : "Add"}
                      </button>
                    </div>
                  </div>

                  {/* Questions Grid/List */}
                  <div className="divide-y divide-slate-150/80 bg-slate-50/15">
                    {qs.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 italic">
                        {isFrench ? "Aucune question dans cette section. Cliquez sur 'Ajouter' pour en créer une." : "No questions in this section. Click 'Add' to create one."}
                      </div>
                    ) : (
                      qs.map((q, idx) => {
                        const isEditing = editingId === q.id;
                        const isAnswered = q.isAnswered;

                        return (
                          <div 
                            key={q.id} 
                            className={`px-6 py-6 transition-all relative print-question-item ${
                              isAnswered ? "bg-emerald-50/25 border-l-4 border-l-emerald-500" : "bg-white"
                            }`}
                          >
                            {/* Interactive Top Row Controls - Hidden on Print */}
                            <div className="no-print flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                              
                              {/* Answered Toggle Checkbox */}
                              <button
                                onClick={() => handleToggleAnswered(section.key, q.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
                                  isAnswered
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                }`}
                              >
                                {isAnswered ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>{isFrench ? "Répondu" : "Answered"}</span>
                                  </>
                                ) : (
                                  <>
                                    <Circle className="h-3.5 w-3.5 text-slate-400" />
                                    <span>{isFrench ? "À poser" : "To Ask"}</span>
                                  </>
                                )}
                              </button>

                              {/* Edit & Delete Action Buttons */}
                              {!isEditing && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleStartEdit(q)}
                                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-350 shadow-sm transition-all"
                                    title={isFrench ? "Modifier" : "Edit"}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuestion(section.key, q.id)}
                                    className="p-2 rounded-lg border border-rose-200 bg-white text-rose-400 hover:text-rose-650 hover:bg-rose-50/50 shadow-sm transition-all"
                                    title={isFrench ? "Supprimer" : "Delete"}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* QUESTION BLOCK */}
                            {isEditing ? (
                              /* Inline Editing Mode */
                              <div className="space-y-4 bg-slate-50/50 border border-slate-200 rounded-xl p-4 no-print">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isFrench ? "Question principale" : "Main Question"}</label>
                                  <textarea
                                    value={editQuestionText}
                                    onChange={(e) => setEditQuestionText(e.target.value)}
                                    rows={2}
                                    placeholder={isFrench ? "Saisir la question..." : "Enter the question..."}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-yellow-400 focus:outline-none bg-white"
                                  />
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isFrench ? "Pourquoi cette question ?" : "Why this question?"}</label>
                                    <textarea
                                      value={editRationaleText}
                                      onChange={(e) => setEditRationaleText(e.target.value)}
                                      rows={3}
                                      placeholder={isFrench ? "Pourquoi poser cette question..." : "Why ask this question..."}
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-yellow-400 focus:outline-none bg-white"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isFrench ? "Relances potentielles" : "Potential follow-ups"}</label>
                                    <textarea
                                      value={editFollowUpText}
                                      onChange={(e) => setEditFollowUpText(e.target.value)}
                                      rows={3}
                                      placeholder={isFrench ? "Quelles relances utiliser..." : "What follow-ups to use..."}
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-yellow-400 focus:outline-none bg-white"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                  <button
                                    onClick={() => handleCancelEdit(section.key, q.id)}
                                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    {isFrench ? "Annuler" : "Cancel"}
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(section.key, q.id)}
                                    className="flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-all"
                                  >
                                    <Save className="h-3.5 w-3.5 text-yellow-400" />
                                    {isFrench ? "Enregistrer" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Standard Render Mode */
                              <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                  {/* Print only counter */}
                                  <div className="print:flex hidden h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[9px] font-mono font-bold text-white">
                                    Q{idx + 1}
                                  </div>
                                  <p className="text-[14px] font-bold text-slate-900 leading-relaxed print:text-black">
                                    {q.question || <span className="text-slate-300 italic">{isFrench ? "(Question vide)" : "(Empty question)"}</span>}
                                  </p>
                                </div>

                                {/* Expanded Side-by-side Rationale & Follow-up Cards */}
                                <div className="grid gap-4 sm:grid-cols-2 print-grid-stack">
                                  <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-[12px] leading-relaxed text-slate-500 shadow-sm/5 whitespace-pre-line">
                                    <strong className="text-slate-700 block mb-1.5 font-extrabold uppercase tracking-wider font-mono text-[9.5px]">
                                      {isFrench ? "💡 Pourquoi cette question ?" : "💡 Why this question?"}
                                    </strong>
                                    {q.rationale || <span className="text-slate-300 italic">{isFrench ? "Aucun objectif spécifié" : "No objective specified"}</span>}
                                  </div>
                                  
                                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-4 text-[12px] leading-relaxed font-bold text-amber-950 shadow-sm/5 whitespace-pre-line">
                                    <strong className="text-amber-900 block mb-1.5 font-extrabold uppercase tracking-wider font-mono text-[9.5px]">
                                      {isFrench ? "📌 Relances potentielles" : "📌 Potential follow-ups"}
                                    </strong>
                                    {q.follow_up || <span className="text-slate-400 italic font-normal">{isFrench ? "Aucune relance spécifiée" : "No probes specified"}</span>}
                                  </div>
                                </div>

                                {/* ── Answer / Notes Area ── */}
                                <div className="no-print">
                                  <button
                                    onClick={() => toggleNoteExpanded(q.id)}
                                    className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                      q.answerNote
                                        ? "bg-blue-50/60 border-blue-200/60 text-blue-700 hover:bg-blue-100/60"
                                        : "bg-slate-50/50 border-slate-200/50 text-slate-400 hover:text-slate-600 hover:bg-slate-100/50"
                                    }`}
                                  >
                                    <StickyNote className="h-3.5 w-3.5" />
                                    <span>{labels.noteLabel}</span>
                                    {q.answerNote && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold">
                                        {q.answerNote.length > 0 ? "✓" : ""}
                                      </span>
                                    )}
                                    <span className="ml-auto">
                                      {expandedNoteIds.has(q.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </span>
                                  </button>
                                  {(expandedNoteIds.has(q.id) || (q.answerNote && q.answerNote.length > 0)) && (
                                    <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                                      <textarea
                                        value={q.answerNote || ""}
                                        onChange={(e) => handleUpdateAnswerNote(section.key, q.id, e.target.value)}
                                        rows={4}
                                        placeholder={labels.answerPlaceholder}
                                        className="w-full rounded-xl border border-blue-200/60 bg-white px-4 py-3 text-[12.5px] text-slate-700 leading-relaxed placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all resize-y shadow-inner"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Print-only answer area */}
                                {q.answerNote && (
                                  <div className="hidden print:block border border-slate-200 rounded-lg p-3 text-[11px] text-slate-700 leading-relaxed bg-blue-50/20">
                                    <strong className="text-slate-800 block mb-1 font-extrabold uppercase tracking-wider font-mono text-[9px]">
                                      {isFrench ? "📝 Notes" : "📝 Notes"}
                                    </strong>
                                    <span className="whitespace-pre-wrap">{q.answerNote}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}

          </div>
        )}
      </main>
    </div>
  );
}
