import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  ClipboardList,
  Building2,
  Users,
  Layers3,
  Target,
  BookOpenText,
  Lightbulb,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const PAGE_SIZE = 10;

type ViewKey = "analytics" | "history" | "sectors" | "sizes" | "levels" | "capabilities" | "rubrics" | "recommendations";
type SortDir = "asc" | "desc";
type SortKey = string;

type Sector = { id: number; code: string; name: string };
type CompanySize = { id: number; code: string; name: string };
type Axis = { id: number; code: string; name: string; sort_order: number };
type MaturityLevel = { id: number; level_number: number; label: string; description: string | null };
type Capability = {
  id: number;
  axis_id: number;
  code: string;
  name: string;
  description: string | null;
  question_guidelines: string | null;
  sort_order: number;
};
type Rubric = { id: number; capability_id: number; maturity_level_id: number; description: string };
type Recommendation = {
  id: number;
  capability_id: number;
  maturity_level_id: number;
  recommendation_guideline: string;
  priority_hint: string | null;
  consultant_note?: string | null;
  business_impact?: string | null;
  tone_hint?: string | null;
};
type AssessmentItem = {
  id: number;
  status: string;
  company_name: string;
  sector: string;
  size: string;
  created_at: string;
};
type MetabaseEmbedPayload = { enabled: boolean; url?: string | null; token?: string | null; instance_url?: string | null };
type UiFieldMetadata = {
  label: string;
  description?: string | null;
  button_label?: string | null;
  modal_title?: string | null;
  placeholder?: string | null;
  options?: { value: string; label: string; description?: string | null }[] | null;
};
type UiSectionMetadata = {
  title: string;
  help_text?: string | null;
  fields: Record<string, UiFieldMetadata>;
};
type AdminUiMetadata = {
  capabilities: UiSectionMetadata;
  recommendations: UiSectionMetadata;
};

function mergeAdminUiMetadata(source?: Partial<AdminUiMetadata> | null): AdminUiMetadata {
  return {
    capabilities: {
      ...DEFAULT_ADMIN_UI_METADATA.capabilities,
      ...(source?.capabilities ?? {}),
      fields: {
        ...DEFAULT_ADMIN_UI_METADATA.capabilities.fields,
        ...(source?.capabilities?.fields ?? {}),
      },
    },
    recommendations: {
      ...DEFAULT_ADMIN_UI_METADATA.recommendations,
      ...(source?.recommendations ?? {}),
      fields: {
        ...DEFAULT_ADMIN_UI_METADATA.recommendations.fields,
        ...(source?.recommendations?.fields ?? {}),
      },
    },
  };
}

const DEFAULT_ADMIN_UI_METADATA: AdminUiMetadata = {
  capabilities: {
    title: "Capabilities",
    help_text:
      "Question guidance shapes how the LLM asks the next question. Use it to describe the discovery goal, useful examples, and maturity signals to test.",
    fields: {
      question_guidelines: {
        label: "Question guidance for the LLM",
        description:
          "Internal business guidance used to generate better questions. This is not a fixed client-facing script.",
        button_label: "Edit guidance",
        modal_title: "Edit question guidance for the LLM",
        placeholder: "Write the internal guidance used by the LLM...",
      },
    },
  },
  recommendations: {
    title: "Capability recommendations",
    help_text:
      "The report prompt gives most weight to recommended action direction, priority level, expected business impact, and writing tone. Optional framing notes help with nuance but do not replace the core recommendation.",
    fields: {
      recommendation_guideline: {
        label: "Recommended action direction",
        description: "Primary action logic injected into the report prompt.",
        button_label: "Edit logic",
        modal_title: "Edit recommended action direction",
        placeholder: "Write the core action direction used by the report...",
      },
      priority_hint: {
        label: "Priority level",
        options: [
          {
            value: "urgent_foundation",
            label: "Urgent foundation",
            description: "Use when the recommendation builds a missing base capability or fixes a structural gap.",
          },
          {
            value: "build_consistency",
            label: "Build consistency",
            description: "Use when the organization already has a base and now needs more discipline, scale, or repeatability.",
          },
          {
            value: "scale_advantage",
            label: "Scale advantage",
            description: "Use when the capability is mature and the recommendation is about optimization, differentiation, or value acceleration.",
          },
        ],
      },
      business_impact: {
        label: "Expected business impact",
        description: "Business or customer outcome expected if the recommendation is implemented well.",
        button_label: "Edit impact",
        modal_title: "Edit expected business impact",
        placeholder: "Describe the customer or business outcome expected from this recommendation...",
      },
      tone_hint: {
        label: "Writing tone",
        options: [
          {
            value: "direct",
            label: "Direct",
            description: "Short, practical, and action-focused wording.",
          },
          {
            value: "balanced",
            label: "Balanced",
            description: "Clear and professional wording with a mix of action and context.",
          },
          {
            value: "executive",
            label: "Executive",
            description: "Leadership-oriented wording with stronger strategic framing and business impact language.",
          },
        ],
      },
      consultant_note: {
        label: "Optional framing note",
        description: "Optional nuance or framing support for the final recommendation wording.",
        button_label: "Edit note",
        modal_title: "Edit optional framing note",
        placeholder: "Add optional nuance or framing for the final report wording...",
      },
    },
  },
};

const NAV_ITEMS: { key: ViewKey; label: string }[] = [
  { key: "analytics", label: "Analytics" },
  { key: "history", label: "Assessments history" },
  { key: "sectors", label: "Sectors" },
  { key: "sizes", label: "Company sizes" },
  { key: "levels", label: "Maturity levels" },
  { key: "capabilities", label: "Capabilities" },
  { key: "rubrics", label: "Maturity rubrics" },
  { key: "recommendations", label: "Capability recommendations" },
];

const NAV_ICONS: Record<ViewKey, ReactNode> = {
  analytics: <BarChart3 className="h-4 w-4" />,
  history: <ClipboardList className="h-4 w-4" />,
  sectors: <Building2 className="h-4 w-4" />,
  sizes: <Users className="h-4 w-4" />,
  levels: <Layers3 className="h-4 w-4" />,
  capabilities: <Target className="h-4 w-4" />,
  rubrics: <BookOpenText className="h-4 w-4" />,
  recommendations: <Lightbulb className="h-4 w-4" />,
};

type Props = {
  onBack: () => void;
  onOpenAssessmentDetails: (assessmentId: number) => void;
  onOpenAssessmentReport: (assessmentId: number) => void;
};

export default function AdminDashboard({ onBack, onOpenAssessmentDetails, onOpenAssessmentReport }: Props) {
  const [view, setView] = useState<ViewKey>("analytics");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState("2026-12-31");
  const [sectorCode, setSectorCode] = useState("");
  const [sizeCode, setSizeCode] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sizes, setSizes] = useState<CompanySize[]>([]);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [levels, setLevels] = useState<MaturityLevel[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [uiMetadata, setUiMetadata] = useState<AdminUiMetadata>(DEFAULT_ADMIN_UI_METADATA);
  const [metabaseEmbedEnabled, setMetabaseEmbedEnabled] = useState(false);
  const [metabaseEmbedUrl, setMetabaseEmbedUrl] = useState<string | null>(null);

  const [newSectorCode, setNewSectorCode] = useState("");
  const [newSectorName, setNewSectorName] = useState("");
  const [newSizeCode, setNewSizeCode] = useState("");
  const [newSizeName, setNewSizeName] = useState("");
  const [newLevelNumber, setNewLevelNumber] = useState("1");
  const [newLevelLabel, setNewLevelLabel] = useState("");
  const [newLevelDescription, setNewLevelDescription] = useState("");
  const [createModal, setCreateModal] = useState<null | "sector" | "size" | "level">(null);
  const [textEditModal, setTextEditModal] = useState<null | {
    kind:
      | "capability_guideline"
      | "level_description"
      | "rubric_description"
      | "recommendation_guideline"
      | "recommendation_business_impact"
      | "recommendation_consultant_note";
    id: number;
    title: string;
    subtitle?: string;
    helperText?: string;
    placeholder?: string;
    value: string;
  }>(null);
  const [textEditDraft, setTextEditDraft] = useState("");

  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [openAxes, setOpenAxes] = useState<Record<number, boolean>>({});

  const analyticsQuery = useMemo(() => {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (sectorCode) params.set("sector_code", sectorCode);
    if (sizeCode) params.set("company_size_code", sizeCode);
    return params.toString();
  }, [fromDate, toDate, sectorCode, sizeCode]);

  const filteredHistory = useMemo(() => {
    const rows = assessments.filter((item) => {
      const byCompany = companyFilter ? item.company_name.toLowerCase().includes(companyFilter.toLowerCase()) : true;
      const bySector = sectorCode ? item.sector.toLowerCase().includes(sectorCode.replace("_", " ").toLowerCase()) : true;
      const bySize = sizeCode ? item.size.toLowerCase().includes(sizeCode.toLowerCase()) : true;
      const byStatus = statusFilter ? item.status.toLowerCase() === statusFilter.toLowerCase() : true;
      return byCompany && bySector && bySize && byStatus;
    });
    return sortRows(rows, sortKey, sortDir);
  }, [assessments, companyFilter, sectorCode, sizeCode, statusFilter, sortKey, sortDir]);

  const levelRows = useMemo(() => sortRows(levels, sortKey, sortDir), [levels, sortKey, sortDir]);
  const capabilityRows = useMemo(() => sortRows(capabilities, sortKey, sortDir), [capabilities, sortKey, sortDir]);
  const rubricRows = useMemo(() => sortRows(rubrics, sortKey, sortDir), [rubrics, sortKey, sortDir]);
  const recommendationRows = useMemo(() => sortRows(recommendations, sortKey, sortDir), [recommendations, sortKey, sortDir]);

  const pagedHistory = paginate(filteredHistory, page);
  const pagedLevels = paginate(levelRows, page);

  const capabilityNameById = useMemo(() => {
    const map = new Map<number, string>();
    capabilities.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [capabilities]);
  const levelLabelById = useMemo(() => {
    const map = new Map<number, string>();
    levels.forEach((l) => map.set(l.id, l.label));
    return map;
  }, [levels]);
  const priorityOptions = uiMetadata.recommendations.fields.priority_hint?.options ?? [];
  const toneOptions = uiMetadata.recommendations.fields.tone_hint?.options ?? [];

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceOptions = async () => {
    const response = await fetch(`${API_BASE_URL}/reference/options`);
    if (!response.ok) throw new Error("Failed to load reference options");
    const payload = await response.json();
    setSectors((payload.sectors ?? []).map((row: { code: string; label: string }, index: number) => ({ id: index + 1, code: row.code, name: row.label })));
    setSizes((payload.company_sizes ?? []).map((row: { code: string; label: string }, index: number) => ({ id: index + 1, code: row.code, name: row.label })));
  };

  const loadAnalytics = async () => {
    const metabaseRes = await fetch(`${API_BASE_URL}/admin/analytics/metabase-embed?${analyticsQuery}`);
    if (!metabaseRes.ok) throw new Error("Failed to load analytics");
    const metabasePayload = (await metabaseRes.json()) as MetabaseEmbedPayload;
    setMetabaseEmbedEnabled(Boolean(metabasePayload.enabled));
    setMetabaseEmbedUrl(metabasePayload.url ?? null);
  };

  const loadHistory = async () => {
    const response = await fetch(`${API_BASE_URL}/assessments?limit=200&offset=0`);
    if (!response.ok) throw new Error("Failed to load assessments");
    const payload = await response.json();
    setAssessments(payload.items ?? []);
  };

  const loadCrud = async () => {
    const [secRes, sizeRes, axisRes, levelRes, capRes, rubRes, recRes, uiMetaRes] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/reference/sectors?limit=500`),
      fetch(`${API_BASE_URL}/admin/reference/company-sizes?limit=500`),
      fetch(`${API_BASE_URL}/admin/reference/axes?limit=200`),
      fetch(`${API_BASE_URL}/admin/reference/maturity-levels?limit=500`),
      fetch(`${API_BASE_URL}/admin/capabilities?limit=1000`),
      fetch(`${API_BASE_URL}/admin/capability-maturity-rubrics?limit=2000`),
      fetch(`${API_BASE_URL}/admin/capability-recommendations?limit=2000`),
      fetch(`${API_BASE_URL}/admin/reference/ui-metadata`),
    ]);
    if (!secRes.ok || !sizeRes.ok || !axisRes.ok || !levelRes.ok || !capRes.ok || !rubRes.ok || !recRes.ok) throw new Error("Failed to load CRUD data");
    setSectors(await secRes.json());
    setSizes(await sizeRes.json());
    const axisRows = await axisRes.json();
    setAxes(axisRows);
    setLevels(await levelRes.json());
    setCapabilities(await capRes.json());
    setRubrics(await rubRes.json());
    setRecommendations(await recRes.json());
    if (uiMetaRes.ok) {
      const payload = (await uiMetaRes.json()) as Partial<AdminUiMetadata>;
      setUiMetadata(mergeAdminUiMetadata(payload));
    } else {
      setUiMetadata(DEFAULT_ADMIN_UI_METADATA);
    }
    setOpenAxes((prev) => {
      const next = { ...prev };
      axisRows.forEach((axis: Axis) => {
        if (next[axis.id] === undefined) next[axis.id] = true;
      });
      return next;
    });
  };

  useEffect(() => {
    run(loadReferenceOptions);
  }, []);

  useEffect(() => {
    setPage(1);
    if (view === "analytics") run(loadAnalytics);
    if (view === "history") run(loadHistory);
    if (view !== "analytics" && view !== "history") run(loadCrud);
  }, [view, analyticsQuery]);

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} failed`);
  };
  const patch = async (path: string, body: unknown) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`PATCH ${path} failed`);
  };
  const remove = async (path: string) => {
    const response = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`DELETE ${path} failed`);
  };

  const setSort = (key: string) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const startEdit = (id: number, draft: Record<string, string>) => {
    setEditId(id);
    setEditDraft(draft);
  };
  const stopEdit = () => {
    setEditId(null);
    setEditDraft({});
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#1A1A1A] lg:flex">
      <aside className="w-full border-r border-[#E5E7EB] bg-white lg:w-72">
        <div className="border-b border-[#E5E7EB] px-6 py-5">
          <div className="text-lg font-semibold">Admin</div>
          <div className="mt-1 text-sm text-[#6B7280]">Internal consultants</div>
        </div>
        <nav className="p-4">
          <div className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  view === item.key ? "bg-[#FFF8CC] text-[#1A1A1A]" : "text-[#4B5563] hover:bg-[#F9FAFB]"
                }`}
              >
                <span className={view === item.key ? "text-[#1A1A1A]" : "text-[#6B7280]"}>{NAV_ICONS[item.key]}</span>
                {item.label}
              </button>
            ))}
          </div>
          <button onClick={onBack} className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50">
            Back to app
          </button>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="border-b border-[#E5E7EB] bg-[#FAFAFA] px-6 py-6 md:px-8">
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{NAV_ITEMS.find((item) => item.key === view)?.label}</h1>
          <p className="mt-2 text-sm text-[#6B7280]">Manage the business guidance the LLM uses for questions, scoring context, and final recommendations.</p>
        </header>
        <main className="space-y-4 px-6 py-8 md:px-8">
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {loading ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading...</div> : null}

          {view === "history" && (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={sectorCode} onChange={(e) => setSectorCode(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">All sectors</option>
                {sectors.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
              <select value={sizeCode} onChange={(e) => setSizeCode(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">All sizes</option>
                {sizes.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
              <button onClick={() => run(loadHistory)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Refresh</button>
            </div>
          )}

          {view === "analytics" && (
            <>
              {metabaseEmbedEnabled ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {metabaseEmbedUrl ? (
                      <iframe
                        title="Metabase analytics dashboard"
                        src={metabaseEmbedUrl}
                        className="w-full bg-white"
                        style={{ height: "calc(100vh - 210px)", minHeight: "760px" }}
                      />
                    ) : (
                      <div className="px-4 py-8 text-sm text-slate-500">Loading Metabase charts...</div>
                    )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Metabase is not enabled yet. Add `METABASE_SITE_URL`, `METABASE_EMBED_SECRET`, and `METABASE_DASHBOARD_ID` in `backend/.env`, then restart backend.
                </div>
              )}
            </>
          )}

          {view === "history" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} placeholder="Filter by company name..." className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">All statuses</option>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                </select>
              </div>
              <Card title="Assessments">
                <SimpleTable
                  headers={sortable(["Assessment", "Company", "Sector", "Size", "Status", "Created", "Actions"], sortKey, sortDir)}
                  onSort={(index) => setSort(["id", "company_name", "sector", "size", "status", "created_at", ""][index] || "created_at")}
                  rows={pagedHistory.items.map((item) => [
                    `#${item.id}`,
                    item.company_name,
                    item.sector,
                    item.size,
                    item.status,
                    item.created_at?.slice(0, 19).replace("T", " "),
                    <div key={item.id} className="flex gap-2">
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => onOpenAssessmentDetails(item.id)}>Details</button>
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" onClick={() => onOpenAssessmentReport(item.id)}>Final report</button>
                    </div>,
                  ])}
                />
                <Pager page={page} totalPages={pagedHistory.totalPages} onPage={setPage} />
              </Card>
            </>
          )}

          {view === "sectors" && <CrudSimple title="Sectors" rows={sectors} onAdd={() => setCreateModal("sector")} onDelete={(id) => run(async () => { await remove(`/admin/reference/sectors/${id}`); await loadCrud(); })} />}

          {view === "sizes" && <CrudSimple title="Company sizes" rows={sizes} onAdd={() => setCreateModal("size")} onDelete={(id) => run(async () => { await remove(`/admin/reference/company-sizes/${id}`); await loadCrud(); })} />}

          {view === "levels" && (
            <Card title="Maturity levels">
              <div className="mb-4">
                <button onClick={() => setCreateModal("level")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Add maturity level</button>
              </div>
              <SimpleTable
                headers={sortable(["Level", "Label", "Description", "Actions"], sortKey, sortDir)}
                onSort={(idx) => setSort(["level_number", "label", "description", ""][idx] || "level_number")}
                rows={pagedLevels.items.map((row) =>
                  editId === row.id
                    ? [
                        <input key="n" value={editDraft.level_number ?? String(row.level_number)} onChange={(e) => setEditDraft((d) => ({ ...d, level_number: e.target.value }))} className="w-20 rounded border px-2 py-1 text-xs" />,
                        <input key="l" value={editDraft.label ?? row.label} onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))} className="rounded border px-2 py-1 text-xs" />,
                        <span key="d" className="line-clamp-2 text-xs text-slate-600">{row.description ?? ""}</span>,
                        <div key="a" className="flex gap-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => run(async () => { await patch(`/admin/reference/maturity-levels/${row.id}`, { level_number: Number(editDraft.level_number), label: editDraft.label, description: row.description || null }); stopEdit(); await loadCrud(); })}>Save</button><button className="rounded border px-2 py-1 text-xs" onClick={stopEdit}>Cancel</button></div>,
                      ]
                    : [
                        String(row.level_number),
                        row.label,
                        <span className="line-clamp-2" title={row.description ?? ""}>{row.description ?? ""}</span>,
                        <div key={row.id} className="flex gap-2">
                          <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(row.id, { level_number: String(row.level_number), label: row.label })}>Edit</button>
                          <button
                            className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
                            onClick={() => {
                              setTextEditModal({ kind: "level_description", id: row.id, title: "Edit maturity level description", subtitle: row.label, value: row.description ?? "" });
                              setTextEditDraft(row.description ?? "");
                            }}
                          >
                            Edit text
                          </button>
                        </div>,
                      ]
                )}
              />
              <Pager page={page} totalPages={pagedLevels.totalPages} onPage={setPage} />
            </Card>
          )}

          {view === "capabilities" && (
            <Card title={uiMetadata.capabilities.title}>
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">How this field is used</p>
                <p className="mt-1">{uiMetadata.capabilities.help_text}</p>
              </div>
              {axes
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((axis) => {
                  const axisRows = capabilityRows.filter((c) => c.axis_id === axis.id);
                  if (!axisRows.length) return null;
                  const isOpen = openAxes[axis.id] ?? true;
                  return (
                    <div key={axis.id} className="mb-3 rounded-lg border border-slate-200">
                      <button
                        className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-sm font-semibold"
                        onClick={() => setOpenAxes((prev) => ({ ...prev, [axis.id]: !isOpen }))}
                      >
                        <span>{axis.name}</span>
                        <span>{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen ? (
                        <div className="p-2">
                          <SimpleTable
                            headers={sortable(["Capability", "Sort", uiMetadata.capabilities.fields.question_guidelines?.label ?? "Question guidance", "Actions"], sortKey, sortDir)}
                            onSort={(idx) => setSort(["name", "sort_order", "question_guidelines", ""][idx] || "name")}
                            rows={axisRows.map((row) =>
                              editId === row.id
                                ? [
                                    <div key="n" className="space-y-1">
                                      <input value={editDraft.name ?? row.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs" />
                                      <input value={editDraft.code ?? row.code} onChange={(e) => setEditDraft((d) => ({ ...d, code: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs text-slate-500" />
                                    </div>,
                                    <input key="s" value={editDraft.sort_order ?? String(row.sort_order)} onChange={(e) => setEditDraft((d) => ({ ...d, sort_order: e.target.value }))} className="w-16 rounded border px-2 py-1 text-xs" />,
                                    <span key="q" className="line-clamp-2 text-xs text-slate-600" title={row.question_guidelines ?? ""}>{row.question_guidelines ?? ""}</span>,
                                    <div key="x" className="flex gap-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => run(async () => { await patch(`/admin/capabilities/${row.id}`, { code: editDraft.code, name: editDraft.name, axis_id: row.axis_id, sort_order: Number(editDraft.sort_order), question_guidelines: row.question_guidelines || null }); stopEdit(); await loadCrud(); })}>Save</button><button className="rounded border px-2 py-1 text-xs" onClick={stopEdit}>Cancel</button></div>,
                                  ]
                                : [
                                    <div key={`${row.id}-name`} className="min-w-0">
                                      <p className="truncate font-medium text-slate-900" title={row.name}>{row.name}</p>
                                      <p className="truncate text-xs text-slate-500" title={row.code}>{row.code}</p>
                                    </div>,
                                    String(row.sort_order),
                                    <span className="line-clamp-2" title={row.question_guidelines ?? ""}>{row.question_guidelines ?? ""}</span>,
                                    <div key={row.id} className="flex gap-2">
                                      <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(row.id, { code: row.code, name: row.name, sort_order: String(row.sort_order) })}>Edit</button>
                                      <button
                                        className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
                                        onClick={() => {
                                        setTextEditModal({
                                          kind: "capability_guideline",
                                          id: row.id,
                                          title: uiMetadata.capabilities.fields.question_guidelines?.modal_title ?? "Edit question guidance",
                                          subtitle: row.name,
                                          helperText: uiMetadata.capabilities.fields.question_guidelines?.description ?? undefined,
                                          value: row.question_guidelines ?? "",
                                        });
                                        setTextEditDraft(row.question_guidelines ?? "");
                                      }}
                                    >
                                        {uiMetadata.capabilities.fields.question_guidelines?.button_label ?? "Edit guidance"}
                                      </button>
                                    </div>,
                                  ]
                            )}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </Card>
          )}

          {view === "rubrics" && (
            <Card title="Maturity rubrics">
              {Array.from(
                new Set(rubricRows.map((r) => r.capability_id))
              ).map((capabilityId) => {
                const capName = capabilityNameById.get(capabilityId) ?? `Capability ${capabilityId}`;
                const capabilityRubrics = rubricRows.filter((r) => r.capability_id === capabilityId);
                const isOpen = openAxes[capabilityId] ?? true;
                return (
                  <div key={`rubric-cap-${capabilityId}`} className="mb-3 rounded-lg border border-slate-200">
                    <button
                      className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-sm font-semibold"
                      onClick={() => setOpenAxes((prev) => ({ ...prev, [capabilityId]: !isOpen }))}
                    >
                      <span>{capName}</span>
                      <span>{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <div className="p-2">
                        <SimpleTable
                          headers={sortable(["Maturity level", "Description", "Actions"], sortKey, sortDir)}
                          onSort={(idx) => setSort(["maturity_level_id", "description", ""][idx] || "maturity_level_id")}
                          rows={capabilityRubrics.map((row) =>
                            editId === row.id
                              ? [
                                  <select key="m" value={editDraft.maturity_level_id ?? String(row.maturity_level_id)} onChange={(e) => setEditDraft((d) => ({ ...d, maturity_level_id: e.target.value }))} className="rounded border px-2 py-1 text-xs">{levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>,
                                  <span key="d" className="line-clamp-2 text-xs text-slate-600">{row.description}</span>,
                                  <div key="a" className="flex gap-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => run(async () => { await patch(`/admin/capability-maturity-rubrics/${row.id}`, { capability_id: row.capability_id, maturity_level_id: Number(editDraft.maturity_level_id), description: row.description }); stopEdit(); await loadCrud(); })}>Save</button><button className="rounded border px-2 py-1 text-xs" onClick={stopEdit}>Cancel</button></div>,
                                ]
                              : [
                                  levelLabelById.get(row.maturity_level_id) ?? `Level ${row.maturity_level_id}`,
                                  <span className="line-clamp-2" title={row.description}>{row.description}</span>,
                                  <div key={row.id} className="flex gap-2">
                                    <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(row.id, { maturity_level_id: String(row.maturity_level_id) })}>Edit</button>
                                    <button
                                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
                                      onClick={() => {
                                        setTextEditModal({ kind: "rubric_description", id: row.id, title: "Edit rubric description", subtitle: capName, value: row.description });
                                        setTextEditDraft(row.description);
                                      }}
                                    >
                                      Edit text
                                    </button>
                                  </div>,
                                ]
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          )}

          {view === "recommendations" && (
            <Card title={uiMetadata.recommendations.title}>
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">How these fields are used</p>
                <p className="mt-1">{uiMetadata.recommendations.help_text}</p>
              </div>
              {Array.from(new Set(recommendationRows.map((r) => r.capability_id))).map((capabilityId) => {
                const capName = capabilityNameById.get(capabilityId) ?? `Capability ${capabilityId}`;
                const capRecs = recommendationRows.filter((r) => r.capability_id === capabilityId);
                const isOpen = openAxes[100000 + capabilityId] ?? true;
                return (
                  <div key={`rec-cap-${capabilityId}`} className="mb-3 rounded-lg border border-slate-200">
                    <button
                      className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-sm font-semibold"
                      onClick={() => setOpenAxes((prev) => ({ ...prev, [100000 + capabilityId]: !isOpen }))}
                    >
                      <span>{capName}</span>
                      <span>{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen ? (
                        <div className="p-2">
                        <SimpleTable
                          headers={sortable([
                            "Maturity level",
                            uiMetadata.recommendations.fields.priority_hint?.label ?? "Priority level",
                            uiMetadata.recommendations.fields.recommendation_guideline?.label ?? "Recommended action direction",
                            uiMetadata.recommendations.fields.business_impact?.label ?? "Business impact",
                            uiMetadata.recommendations.fields.tone_hint?.label ?? "Writing tone",
                            "Actions",
                          ], sortKey, sortDir)}
                          onSort={(idx) => setSort(["maturity_level_id", "priority_hint", "recommendation_guideline", "business_impact", "tone_hint", ""][idx] || "maturity_level_id")}
                            rows={capRecs.map((row) =>
                              editId === row.id
                                ? [
                                  <select key="m" value={editDraft.maturity_level_id ?? String(row.maturity_level_id)} onChange={(e) => setEditDraft((d) => ({ ...d, maturity_level_id: e.target.value }))} className="rounded border px-2 py-1 text-xs">{levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>,
                                  <select key="p" value={editDraft.priority_hint ?? (row.priority_hint ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, priority_hint: e.target.value }))} className="rounded border px-2 py-1 text-xs">
                                    <option value="">Select priority</option>
                                    {priorityOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>,
                                  <span key="g" className="line-clamp-2 text-xs text-slate-600">{row.recommendation_guideline}</span>,
                                  <span key="bi" className="line-clamp-2 text-xs text-slate-600">{row.business_impact ?? ""}</span>,
                                  <select key="t" value={editDraft.tone_hint ?? (row.tone_hint ?? "")} onChange={(e) => setEditDraft((d) => ({ ...d, tone_hint: e.target.value }))} className="rounded border px-2 py-1 text-xs">
                                    <option value="">Select tone</option>
                                    {toneOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>,
                                  <div key="a" className="flex gap-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => run(async () => { await patch(`/admin/capability-recommendations/${row.id}`, { capability_id: row.capability_id, maturity_level_id: Number(editDraft.maturity_level_id), priority_hint: editDraft.priority_hint || null, tone_hint: editDraft.tone_hint || null, recommendation_guideline: row.recommendation_guideline, business_impact: row.business_impact || null, consultant_note: row.consultant_note || null }); stopEdit(); await loadCrud(); })}>Save</button><button className="rounded border px-2 py-1 text-xs" onClick={stopEdit}>Cancel</button></div>,
                                ]
                              : [
                                  levelLabelById.get(row.maturity_level_id) ?? `Level ${row.maturity_level_id}`,
                                  row.priority_hint ?? "",
                                  <span className="line-clamp-2" title={row.recommendation_guideline}>{row.recommendation_guideline}</span>,
                                  <span className="line-clamp-2" title={row.business_impact ?? ""}>{row.business_impact ?? ""}</span>,
                                  row.tone_hint ?? "",
                                  <div key={row.id} className="flex gap-2">
                                    <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(row.id, { maturity_level_id: String(row.maturity_level_id), priority_hint: row.priority_hint ?? "", tone_hint: row.tone_hint ?? "" })}>Edit</button>
                                    <button
                                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
                                      onClick={() => {
                                        setTextEditModal({
                                          kind: "recommendation_guideline",
                                          id: row.id,
                                          title: uiMetadata.recommendations.fields.recommendation_guideline?.modal_title ?? "Edit recommendation",
                                          subtitle: capName,
                                          helperText: uiMetadata.recommendations.fields.recommendation_guideline?.description ?? undefined,
                                          value: row.recommendation_guideline,
                                        });
                                        setTextEditDraft(row.recommendation_guideline);
                                      }}
                                    >
                                      {uiMetadata.recommendations.fields.recommendation_guideline?.button_label ?? "Edit logic"}
                                    </button>
                                    <button
                                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
                                      onClick={() => {
                                        setTextEditModal({
                                          kind: "recommendation_business_impact",
                                          id: row.id,
                                          title: uiMetadata.recommendations.fields.business_impact?.modal_title ?? "Edit business impact",
                                          subtitle: capName,
                                          helperText: uiMetadata.recommendations.fields.business_impact?.description ?? undefined,
                                          value: row.business_impact ?? "",
                                        });
                                        setTextEditDraft(row.business_impact ?? "");
                                      }}
                                    >
                                      {uiMetadata.recommendations.fields.business_impact?.button_label ?? "Edit impact"}
                                    </button>
                                    <button
                                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                                      onClick={() => {
                                        setTextEditModal({
                                          kind: "recommendation_consultant_note",
                                          id: row.id,
                                          title: uiMetadata.recommendations.fields.consultant_note?.modal_title ?? "Edit note",
                                          subtitle: capName,
                                          helperText: uiMetadata.recommendations.fields.consultant_note?.description ?? undefined,
                                          value: row.consultant_note ?? "",
                                        });
                                        setTextEditDraft(row.consultant_note ?? "");
                                      }}
                                    >
                                      {uiMetadata.recommendations.fields.consultant_note?.button_label ?? "Edit note"}
                                    </button>
                                  </div>,
                                ]
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          )}
        </main>
      </div>

      {createModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {createModal === "sector" ? "Add sector" : createModal === "size" ? "Add company size" : "Add maturity level"}
            </h3>
            <div className="mt-3 space-y-3">
              {createModal === "level" ? (
                <>
                  <input value={newLevelNumber} onChange={(e) => setNewLevelNumber(e.target.value)} placeholder="level number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input value={newLevelLabel} onChange={(e) => setNewLevelLabel(e.target.value)} placeholder="label" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input value={newLevelDescription} onChange={(e) => setNewLevelDescription(e.target.value)} placeholder="description (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </>
              ) : (
                <>
                  <input
                    value={createModal === "sector" ? newSectorCode : newSizeCode}
                    onChange={(e) => (createModal === "sector" ? setNewSectorCode(e.target.value) : setNewSizeCode(e.target.value))}
                    placeholder="code"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={createModal === "sector" ? newSectorName : newSizeName}
                    onChange={(e) => (createModal === "sector" ? setNewSectorName(e.target.value) : setNewSizeName(e.target.value))}
                    placeholder="name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCreateModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
              <button
                onClick={() =>
                  run(async () => {
                    if (createModal === "sector") {
                      await post("/admin/reference/sectors", { code: newSectorCode, name: newSectorName });
                      setNewSectorCode("");
                      setNewSectorName("");
                    } else if (createModal === "size") {
                      await post("/admin/reference/company-sizes", { code: newSizeCode, name: newSizeName });
                      setNewSizeCode("");
                      setNewSizeName("");
                    } else {
                      await post("/admin/reference/maturity-levels", {
                        level_number: Number(newLevelNumber),
                        label: newLevelLabel,
                        description: newLevelDescription || null,
                      });
                      setNewLevelNumber("1");
                      setNewLevelLabel("");
                      setNewLevelDescription("");
                    }
                    setCreateModal(null);
                    await loadCrud();
                  })
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {textEditModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">{textEditModal.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{textEditModal.subtitle ?? ""}</p>
            {textEditModal.helperText ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {textEditModal.helperText}
              </div>
            ) : null}
            <textarea
              value={textEditDraft}
              onChange={(e) => setTextEditDraft(e.target.value)}
              className="mt-4 min-h-[260px] w-full rounded-lg border border-slate-300 px-3 py-3 text-sm leading-6"
              placeholder={textEditModal.placeholder ?? "Write the text used by the LLM..."}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTextEditModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
              <button
                onClick={() =>
                  run(async () => {
                    if (textEditModal.kind === "capability_guideline") {
                      const row = capabilities.find((item) => item.id === textEditModal.id);
                      if (!row) throw new Error("Capability not found");
                      await patch(`/admin/capabilities/${row.id}`, {
                        code: row.code,
                        name: row.name,
                        axis_id: row.axis_id,
                        sort_order: row.sort_order,
                        question_guidelines: textEditDraft || null,
                      });
                    } else if (textEditModal.kind === "level_description") {
                      const row = levels.find((item) => item.id === textEditModal.id);
                      if (!row) throw new Error("Maturity level not found");
                      await patch(`/admin/reference/maturity-levels/${row.id}`, {
                        level_number: row.level_number,
                        label: row.label,
                        description: textEditDraft || null,
                      });
                    } else if (textEditModal.kind === "rubric_description") {
                      const row = rubrics.find((item) => item.id === textEditModal.id);
                      if (!row) throw new Error("Rubric not found");
                      await patch(`/admin/capability-maturity-rubrics/${row.id}`, {
                        capability_id: row.capability_id,
                        maturity_level_id: row.maturity_level_id,
                        description: textEditDraft,
                      });
                    } else {
                      const row = recommendations.find((item) => item.id === textEditModal.id);
                      if (!row) throw new Error("Recommendation not found");
                      if (textEditModal.kind === "recommendation_guideline") {
                        await patch(`/admin/capability-recommendations/${row.id}`, {
                          capability_id: row.capability_id,
                          maturity_level_id: row.maturity_level_id,
                          priority_hint: row.priority_hint || null,
                          recommendation_guideline: textEditDraft,
                          business_impact: row.business_impact || null,
                          consultant_note: row.consultant_note || null,
                          tone_hint: row.tone_hint || null,
                        });
                      } else if (textEditModal.kind === "recommendation_business_impact") {
                        await patch(`/admin/capability-recommendations/${row.id}`, {
                          capability_id: row.capability_id,
                          maturity_level_id: row.maturity_level_id,
                          priority_hint: row.priority_hint || null,
                          recommendation_guideline: row.recommendation_guideline,
                          business_impact: textEditDraft || null,
                          consultant_note: row.consultant_note || null,
                          tone_hint: row.tone_hint || null,
                        });
                      } else {
                        await patch(`/admin/capability-recommendations/${row.id}`, {
                          capability_id: row.capability_id,
                          maturity_level_id: row.maturity_level_id,
                          priority_hint: row.priority_hint || null,
                          recommendation_guideline: row.recommendation_guideline,
                          business_impact: row.business_impact || null,
                          consultant_note: textEditDraft || null,
                          tone_hint: row.tone_hint || null,
                        });
                      }
                    }
                    setTextEditModal(null);
                    await loadCrud();
                  })
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function CrudSimple({
  title,
  rows,
  onAdd,
  onDelete,
}: {
  title: string;
  rows: { id: number; code: string; name: string }[];
  onAdd: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Card title={title}>
      <div className="mb-4">
        <button onClick={onAdd} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
          {title === "Sectors" ? "Add sector" : "Add company size"}
        </button>
      </div>
      <SimpleTable
        headers={["Code", "Name", "Action"]}
        rows={rows.map((item) => [
          item.code,
          item.name,
          <button key={item.id} onClick={() => onDelete(item.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">Delete</button>,
        ])}
      />
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  onSort,
}: {
  headers: string[];
  rows: (ReactNode[] | string[])[];
  onSort?: (index: number) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[820px] table-fixed text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            {headers.map((header, index) => (
              <th key={header + index} className="py-2 pr-3">
                {onSort && !header.includes("↕") ? (
                  <button onClick={() => onSort(index)} className="text-left hover:text-slate-800">
                    {header}
                  </button>
                ) : (
                  header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100 align-top">
              {row.map((cell, i) => (
                <td key={i} className="py-2 pr-3 text-slate-800">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Prev</button>
      <span className="text-xs text-slate-600">{page}/{totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Next</button>
    </div>
  );
}

function paginate<T>(rows: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return { items: rows.slice(start, start + PAGE_SIZE), totalPages };
}

function sortRows<T extends Record<string, unknown>>(rows: T[], key: string, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = String(a[key] ?? "").toLowerCase();
    const bv = String(b[key] ?? "").toLowerCase();
    if (av === bv) return 0;
    const result = av > bv ? 1 : -1;
    return dir === "asc" ? result : -result;
  });
}

function sortable(headers: string[], sortKey: string, _sortDir: SortDir) {
  return headers.map((h, i) => (i < headers.length - 1 ? `${h}${sortKey ? " ↕" : ""}` : h)).map((v, idx, arr) => (idx === arr.length - 1 ? v.replace(" ↕", "") : v));
}

