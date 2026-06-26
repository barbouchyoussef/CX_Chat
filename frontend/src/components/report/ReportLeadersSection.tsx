import { useEffect, useMemo, useState } from "react";
import type { FinalReportLeadersSnapshot } from "../../types/final-report";
import "./reportLeadersSection.css";

type Props = {
  snapshot?: FinalReportLeadersSnapshot | null;
  language?: string | null;
};

const LEADER_EMOJIS = ["🧭", "🌍", "🎟️", "📊"];

export default function ReportLeadersSection({ snapshot, language }: Props) {
  const leaders = snapshot?.leaders ?? [];
  const logoSrc = `${import.meta.env.BASE_URL}EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png`;

  const competitorLeaders = useMemo(
    () => leaders.filter((l) => l.key !== "ey-insights"),
    [leaders]
  );

  const eyLeader = useMemo(
    () => leaders.find((l) => l.key === "ey-insights"),
    [leaders]
  );

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [pptxModalUrl, setPptxModalUrl] = useState<string | null>(null);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (url.toLowerCase().endsWith(".pptx")) {
      e.preventDefault();
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (isLocal) {
        setPptxModalUrl(url);
      } else {
        const previewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(window.location.origin + url)}`;
        window.open(previewUrl, "_blank");
      }
    }
  };

  useEffect(() => {
    if (competitorLeaders.length > 0) {
      setSelectedKey(competitorLeaders[0].key);
    }
  }, [competitorLeaders]);

  const selectedLeader = useMemo(
    () => competitorLeaders.find((leader) => leader.key === selectedKey) ?? competitorLeaders[0] ?? null,
    [competitorLeaders, selectedKey],
  );

  if (!snapshot) {
    return null;
  }

  const isFrench = (language ?? "").toLowerCase().startsWith("fr");
  const isPending = snapshot.status === "pending" || snapshot.status === "running";
  const emptyMessage =
    snapshot.message ??
    (isPending
      ? (isFrench ? "Le contenu de référence des leaders est en cours de préparation en arrière-plan." : "Leader benchmark content is being prepared in the background.")
      : (isFrench ? "Le contenu de référence des leaders n'est pas encore disponible pour ce rapport." : "Leader benchmark content is not available for this report yet."));

  return (
    <div className="report-leaders-shell">
      <section className="section">
        <div className="orbital-ring" aria-hidden="true"></div>
        <div className="orbital-ring-small" aria-hidden="true"></div>
        <div className="orbital-ring-left" aria-hidden="true"></div>

        <div className="section-head">
          <span className="section-number">04</span>
          <h1 className="section-title">
            {isFrench ? "Ce que font les leaders" : "What Leaders Are Doing"}
          </h1>
        </div>

        <div className="panel">
          <div className="panel-inner">
            <div className="content-shell print:hidden">
              <div className="content-stage active" data-stage="leaders">
                <div className="stage-meta">
                  <div className="stage-summary">
                    <h3 className="stage-heading">
                      {isFrench
                        ? "Ces leaders gèrent l'expérience client comme un système de croissance coordonné, et non comme une simple collection de bonnes intentions."
                        : "These leaders run customer experience as a coordinated growth system, not a collection of good intentions."}
                    </h3>
                  </div>
                </div>

                {competitorLeaders.length ? (
                  <>
                    <div className="chip-grid">
                      {competitorLeaders.map((leader, index) => (
                        <button
                          key={leader.key}
                          className={`comp-chip ${leader.key === (selectedLeader?.key ?? "") ? "active" : ""}`}
                          type="button"
                          data-competitor={leader.key}
                          onClick={() => setSelectedKey(leader.key)}
                        >
                          <div className="chip-head">
                             <span className="chip-emoji">{LEADER_EMOJIS[index] ?? "✦"}</span>
                          </div>
                          <p className="chip-name">{leader.company_name}</p>
                          <p className="chip-note">
                            {leader.leader_summary ?? leader.note ?? (isFrench ? "Des données de référence publiques ont été sélectionnées pour ce leader." : "Public benchmark evidence was selected for this leader.")}
                          </p>
                        </button>
                      ))}
                    </div>

                    <div className="drawer" data-drawer="leaders">
                      <div className="drawer-head">
                        <h4 className="drawer-name">{selectedLeader?.company_name ?? ""}</h4>
                      </div>
                      <p className="drawer-title">{isFrench ? "Ce que font les leaders" : "What leaders are doing"}</p>
                      <div className="practice-list">
                        {(selectedLeader?.evidence_links ?? []).map((link, index) => (
                          <div key={`${selectedLeader?.key ?? "leader"}-${index}`} className="practice">
                            <span className="practice-copy">{link.label}</span>
                            <a
                              className="practice-link"
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => handleLinkClick(e, link.url)}
                            >
                              {link.source_title
                                ? isFrench
                                  ? `Source ouverte : ${link.source_title}`
                                  : `Open source: ${link.source_title}`
                                : isFrench
                                  ? "Source ouverte"
                                  : "Open source"}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="drawer" data-drawer="leaders">
                    <p className="empty-state">{emptyMessage}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="print-leaders-list hidden">
              {competitorLeaders.length ? (
                competitorLeaders.map((leader, index) => (
                  <section key={`print-${leader.key}`} className="print-leader-card">
                    <div className="chip-head">
                       <span className="chip-emoji">{LEADER_EMOJIS[index] ?? "·"}</span>
                    </div>
                    <h4 className="drawer-name">{leader.company_name}</h4>
                    <p className="chip-note">
                      {leader.leader_summary ?? leader.note ?? (isFrench ? "Des données de référence publiques ont été sélectionnées pour ce leader." : "Public benchmark evidence was selected for this leader.")}
                    </p>
                    <div className="practice-list">
                      {(leader.evidence_links ?? []).map((link, linkIndex) => (
                        <div key={`${leader.key}-print-${linkIndex}`} className="practice">
                          <span className="practice-copy">{link.label}</span>
                          <a className="practice-link" href={link.url} target="_blank" rel="noreferrer">
                            {link.source_title
                              ? isFrench
                                ? `Source ouverte : ${link.source_title}`
                                : `Open source: ${link.source_title}`
                              : isFrench
                                ? "Source ouverte"
                                : "Open source"}
                          </a>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="drawer">
                  <p className="empty-state">{emptyMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {eyLeader && (
          <div className="ey-insights-wrapper print:page-break-inside-avoid">
            <div className="ey-insights-header">
              <img src={logoSrc} alt="EY Logo" className="ey-insights-brand-logo" />
              <div className="ey-insights-title-block">
                <p className="ey-insights-pre">{isFrench ? "Perspective exclusive" : "Exclusive thought leadership"}</p>
                <h3 className="ey-insights-title">{eyLeader.company_name}</h3>
              </div>
            </div>
            <div className="ey-insights-body">
              <p className="ey-insights-summary">{eyLeader.leader_summary}</p>
              <div className="ey-insights-links-grid">
                {(eyLeader.evidence_links ?? []).map((link, index) => (
                  <a
                    key={`ey-link-${index}`}
                    className="ey-link-card"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => handleLinkClick(e, link.url)}
                  >
                    <div>
                      <h4 className="ey-link-label">{link.label}</h4>
                      <p className="ey-link-desc">{link.why_relevant}</p>
                    </div>
                    <div className="ey-link-footer">
                      <span>{isFrench ? "Consulter l'article EY" : "Read EY Article"}</span>
                      <span className="ey-link-arrow">→</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Local Preview Modal for PPTX on localhost */}
      {pptxModalUrl && (
        <div 
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xl p-4 transition-all duration-300"
          onClick={() => setPptxModalUrl(null)}
        >
          <div 
            className="w-full max-w-md bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025)),rgba(9,12,22,0.98)] border border-white/10 rounded-[28px] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.5)] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5 mb-5">
              <span className="text-[28px]">📊</span>
              <div>
                <span className="font-mono text-[0.7rem] text-white/50 uppercase tracking-[0.2em]">
                  {isFrench ? "Aperçu de la présentation" : "Presentation Preview"}
                </span>
                <h3 className="text-xl font-bold tracking-tight text-white m-0 mt-0.5">
                  {isFrench ? "Mode local détecté" : "Local Environment Detected"}
                </h3>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300 mb-6 m-0">
              {isFrench 
                ? "Vous exécutez l'application en mode local. Le visualiseur PowerPoint en ligne ne peut pas se connecter à votre serveur local pour afficher le document en direct."
                : "You are running this application in a local environment. The online PowerPoint viewer cannot connect to your local server to preview the document live."}
            </p>

            <div className="flex flex-col gap-3">
              <a
                href={pptxModalUrl}
                download
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#ffd447_0%,#c8973f_100%)] px-5 py-3.5 text-sm font-bold text-[#111318] shadow-[0_12px_26px_rgba(200,151,63,0.28)] transition-all hover:translate-y-[-2px]"
                onClick={() => setPptxModalUrl(null)}
              >
                {isFrench ? "Télécharger pour visionner" : "Download to View"}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-xl bg-white/5 border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={() => setPptxModalUrl(null)}
              >
                {isFrench ? "Fermer" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
