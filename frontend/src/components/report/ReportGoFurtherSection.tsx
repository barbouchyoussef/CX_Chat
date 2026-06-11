import { useState, type FormEvent } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const STUDIO_LOGO_SRC = "/EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png";

const OFFERS = [
  {
    number: "-- 01",
    title: "Customer Experience",
    description:
      "Design and orchestration of differentiated customer experiences, with a clear focus on customer value, loyalty, and measurable service improvement.",
  },
  {
    number: "-- 02",
    title: "Marketing Transformation",
    description:
      "Marketing capability transformation through data-driven, omnichannel, performance-led growth and stronger commercial activation.",
  },
  {
    number: "-- 03",
    title: "Product & Service Innovation",
    description:
      "From ideation to launch, shaping products and services that are desirable, viable, and ready to scale.",
  },
];

const SECTION_STYLES = `
  .report-go-further-shell .section {
    position: relative;
    width: min(1320px, 100%);
    margin: 0 auto;
    padding: 34px 36px 28px;
    isolation: isolate;
  }
  .report-go-further-shell .orbital-ring,
  .report-go-further-shell .orbital-ring-small,
  .report-go-further-shell .orbital-ring-left {
    position: absolute;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.13);
    pointer-events: none;
  }
  .report-go-further-shell .orbital-ring { top:-52px; right:22px; width:300px; height:300px; opacity:0.28; }
  .report-go-further-shell .orbital-ring-small { top:10px; right:84px; width:180px; height:180px; opacity:0.18; }
  .report-go-further-shell .orbital-ring-left { left:-110px; bottom:140px; width:320px; height:320px; opacity:0.12; }
  .report-go-further-shell .section-head {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  .report-go-further-shell .section-number {
    font-family: "Geist Mono", monospace;
    font-size: 0.78rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.5);
  }
  .report-go-further-shell .section-title {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2.05rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 700;
    color: #fff;
  }
  .report-go-further-shell .studio-wrap {
    position: relative;
    z-index: 2;
    display: grid;
    gap: 22px;
  }
  .report-go-further-shell .studio-orbit-msg {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 18px;
    align-items: center;
    padding: 20px 22px;
    border-radius: 24px;
    border: 1px solid rgba(255,255,255,0.08);
    background: linear-gradient(135deg, rgba(255,212,71,0.08), rgba(159,147,255,0.10));
    animation: reportGoFurtherRiseIn 620ms ease both;
  }
  .report-go-further-shell .som-av {
    display: grid;
    place-items: center;
    width: 70px;
    height: 70px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .report-go-further-shell .som-av svg { width:42px; height:42px; }
  .report-go-further-shell .som-from {
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.54);
  }
  .report-go-further-shell .som-text {
    margin-top: 8px;
    color: rgba(255,255,255,0.84);
    line-height: 1.68;
    font-size: 1rem;
    max-width: 80ch;
  }
  .report-go-further-shell .studio-card {
    position: relative;
    overflow: hidden;
    border-radius: 30px;
    border: 1px solid rgba(255,255,255,0.08);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025)),
      rgba(10,13,25,0.22);
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    animation: reportGoFurtherRiseIn 720ms ease 90ms both;
  }
  .report-go-further-shell .studio-top-bar {
    height: 6px;
    background: linear-gradient(90deg, #ffd447, #85eaff, #9f93ff);
  }
  .report-go-further-shell .studio-inner {
    position: relative;
    padding: 36px 36px 32px;
  }
  .report-go-further-shell .studio-bg-glow {
    display: none;
  }
  .report-go-further-shell .studio-hl {
    position: relative;
    z-index: 2;
    margin: 0;
    max-width: 720px;
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.02;
    letter-spacing: -0.05em;
    font-weight: 700;
    color: #fff;
  }
  .report-go-further-shell .studio-hl em {
    font-style: normal;
    color: #ffd447;
  }
  .report-go-further-shell .studio-body {
    position: relative;
    z-index: 2;
    max-width: 680px;
    margin-top: 18px;
    color: rgba(255,255,255,0.84);
    font-size: 1rem;
    line-height: 1.74;
  }
  .report-go-further-shell .studio-offers {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 32px;
    align-items: stretch;
  }
  .report-go-further-shell .s-offer {
    display: flex;
    flex-direction: column;
    border-radius: 22px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    padding: 22px 20px 20px;
    transition: transform 220ms ease, border-color 220ms ease, background 220ms ease;
  }
  .report-go-further-shell .s-offer:hover {
    transform: translateY(-3px);
    border-color: rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.07);
  }
  .report-go-further-shell .so-accent {
    width: 32px;
    height: 3px;
    border-radius: 999px;
    margin-bottom: 16px;
  }
  .report-go-further-shell .s-offer:nth-child(1) .so-accent { background: #ffd447; }
  .report-go-further-shell .s-offer:nth-child(2) .so-accent { background: #85eaff; }
  .report-go-further-shell .s-offer:nth-child(3) .so-accent { background: #9f93ff; }
  .report-go-further-shell .so-num {
    font-family: "Geist Mono", monospace;
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.42);
    margin-bottom: 8px;
  }
  .report-go-further-shell .so-t {
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.28;
  }
  .report-go-further-shell .so-d {
    margin-top: 10px;
    color: rgba(255,255,255,0.68);
    font-size: 0.88rem;
    line-height: 1.62;
    flex: 1;
  }
  .report-go-further-shell .studio-cta-block {
    position: relative;
    z-index: 2;
    margin-top: 32px;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 26px 28px;
    border-radius: 22px;
    border: 1px solid rgba(255, 212, 71, 0.22);
    background: linear-gradient(135deg, rgba(255,212,71,0.10) 0%, rgba(159,147,255,0.08) 100%);
  }
  .report-go-further-shell .scta-text {
    flex: 1;
    min-width: 0;
  }
  .report-go-further-shell .scta-label {
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #ffd447;
    margin-bottom: 6px;
  }
  .report-go-further-shell .scta-heading {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
  }
  .report-go-further-shell .scta-sub {
    margin-top: 4px;
    color: rgba(255,255,255,0.66);
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .report-go-further-shell .scta-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
  }
  .report-go-further-shell .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 999px;
    padding: 14px 22px;
    font-weight: 700;
    font-size: 0.95rem;
    color: #111318;
    background: linear-gradient(135deg, #ffd447 0%, rgba(255,255,255,0.92) 100%);
    cursor: pointer;
    white-space: nowrap;
    transition: transform 200ms ease, filter 200ms ease, box-shadow 200ms ease;
    box-shadow: 0 8px 24px rgba(255,212,71,0.28), 0 2px 8px rgba(0,0,0,0.18);
    text-decoration: none;
  }
  .report-go-further-shell .btn-primary:hover {
    transform: translateY(-2px);
    filter: brightness(1.06);
    box-shadow: 0 12px 32px rgba(255,212,71,0.38), 0 4px 12px rgba(0,0,0,0.22);
  }
  .report-go-further-shell .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px;
    padding: 13px 20px;
    font-weight: 600;
    font-size: 0.92rem;
    color: rgba(255,255,255,0.88);
    background: rgba(255,255,255,0.06);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 200ms ease, background 200ms ease, transform 200ms ease;
    text-decoration: none;
  }
  .report-go-further-shell .btn-secondary:hover {
    border-color: rgba(255,255,255,0.34);
    background: rgba(255,255,255,0.10);
    transform: translateY(-1px);
  }
  .report-go-further-shell .section-footer {
    position: relative;
    z-index: 2;
    margin-top: 26px;
    padding-top: 22px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: rgba(255, 255, 255, 0.72);
    font-family: "Geist Mono", monospace;
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-align: center;
  }
  .report-go-further-shell .section-footer img {
    width: 124px;
    height: auto;
    flex: 0 0 auto;
    filter: brightness(1.04);
  }
  .report-go-further-shell .section-footer p {
    margin: 0;
  }
  .report-go-further-shell .consultation-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(7, 10, 24, 0.72);
    backdrop-filter: blur(12px);
  }
  .report-go-further-shell .consultation-modal {
    width: min(460px, 100%);
    border-radius: 26px;
    border: 1px solid rgba(255,255,255,0.12);
    background: linear-gradient(145deg, rgba(20,26,48,0.98), rgba(29,39,76,0.98));
    box-shadow: 0 28px 90px rgba(0,0,0,0.42);
    padding: 26px;
  }
  .report-go-further-shell .consultation-modal h3 {
    margin: 0;
    color: #fff;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
  }
  .report-go-further-shell .consultation-modal p {
    margin: 8px 0 0;
    color: rgba(255,255,255,0.68);
    line-height: 1.55;
    font-size: 0.94rem;
  }
  .report-go-further-shell .consultation-field {
    margin-top: 20px;
  }
  .report-go-further-shell .consultation-field label {
    display: block;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.78);
    font-size: 0.86rem;
    font-weight: 700;
  }
  .report-go-further-shell .consultation-field input {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 16px;
    background: rgba(255,255,255,0.08);
    color: #fff;
    padding: 13px 14px;
    outline: none;
  }
  .report-go-further-shell .consultation-field input:focus {
    border-color: rgba(255,212,71,0.7);
    box-shadow: 0 0 0 3px rgba(255,212,71,0.12);
  }
  .report-go-further-shell .consultation-error {
    margin-top: 12px;
    color: #ffc0d0;
    font-size: 0.86rem;
  }
  .report-go-further-shell .consultation-success {
    margin-top: 12px;
    color: #a7f3d0;
    font-size: 0.86rem;
  }
  .report-go-further-shell .consultation-modal-actions {
    margin-top: 22px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  @keyframes reportGoFurtherRiseIn {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 1100px) {
    .report-go-further-shell .studio-offers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .report-go-further-shell .studio-offers .s-offer:last-child {
      grid-column: 1 / -1;
    }
    .report-go-further-shell .scta-actions {
      flex-direction: column;
      align-items: flex-start;
    }
  }
  @media (max-width: 720px) {
    .report-go-further-shell .section {
      padding: 24px 0 12px;
    }
    .report-go-further-shell .studio-inner {
      padding: 22px 18px 20px;
    }
    .report-go-further-shell .studio-orbit-msg {
      grid-template-columns: 1fr;
    }
    .report-go-further-shell .studio-offers {
      grid-template-columns: 1fr;
    }
    .report-go-further-shell .studio-cta-block {
      flex-direction: column;
      align-items: flex-start;
    }
    .report-go-further-shell .scta-actions {
      width: 100%;
    }
    .report-go-further-shell .btn-primary,
    .report-go-further-shell .btn-secondary {
      width: 100%;
      justify-content: center;
    }
    .report-go-further-shell .section-footer {
      flex-direction: column;
      gap: 10px;
      font-size: 0.68rem;
    }
  }
  @media print {
    .report-go-further-shell .orbital-ring,
    .report-go-further-shell .orbital-ring-small,
    .report-go-further-shell .orbital-ring-left,
    .report-go-further-shell .som-av {
      display: none !important;
    }
    .report-go-further-shell .section {
      width: 100%;
      padding: 18px 0 8px;
    }
    .report-go-further-shell .section-number,
    .report-go-further-shell .som-from,
    .report-go-further-shell .so-num,
    .report-go-further-shell .scta-label,
    .report-go-further-shell .section-footer {
      color: rgba(0, 0, 0, 0.55);
    }
    .report-go-further-shell .section-title,
    .report-go-further-shell .studio-hl,
    .report-go-further-shell .so-t,
    .report-go-further-shell .scta-heading {
      color: #111318;
    }
    .report-go-further-shell .studio-card,
    .report-go-further-shell .studio-orbit-msg,
    .report-go-further-shell .s-offer,
    .report-go-further-shell .studio-cta-block,
    .report-go-further-shell .consultation-modal {
      background: #fff !important;
      border-color: rgba(0, 0, 0, 0.1) !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      color: #111318;
    }
    .report-go-further-shell .studio-body,
    .report-go-further-shell .so-d,
    .report-go-further-shell .som-text,
    .report-go-further-shell .scta-sub {
      color: rgba(17, 19, 24, 0.8) !important;
    }
    .report-go-further-shell .btn-primary,
    .report-go-further-shell .btn-secondary {
      color: #17315f;
      background: transparent;
      border: 1px solid rgba(23, 49, 95, 0.25);
      box-shadow: none;
    }
  }
`;

type Props = {
  assessmentId: number;
};

export default function ReportGoFurtherSection({ assessmentId }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
    setError(null);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setClientName("");
    setError(null);
  };

  const handleBookConsultation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanedName = clientName.trim();
    if (!cleanedName) {
      setError("Please enter your name.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/consultations/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_id: assessmentId, client_name: cleanedName }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "Could not prepare the Gmail message.");
      }
      const payload = (await response.json()) as { gmail_url?: string };
      if (!payload.gmail_url) {
        throw new Error("The backend did not return a Gmail URL.");
      }
      window.open(payload.gmail_url, "_blank", "noopener,noreferrer");
      setIsModalOpen(false);
      setClientName("");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not prepare the Gmail message.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="report-go-further-shell relative overflow-hidden px-3 py-4 text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8 print:px-0 print:py-0">
      <style>{SECTION_STYLES}</style>
      <div className="section">
        <div className="orbital-ring" />
        <div className="orbital-ring-small" />
        <div className="orbital-ring-left" />

        <div className="section-head">
          <span className="section-number">06</span>
          <h2 className="section-title">Go Further</h2>
        </div>

        <div className="studio-wrap">
          <div className="studio-orbit-msg">
            <div className="som-av" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#ffd447" />
                <circle cx="12" cy="12" r="7" stroke="#ffd447" strokeWidth="1" strokeDasharray="2 2" opacity=".5" />
              </svg>
            </div>
            <div>
              <div className="som-from">Orbit | Closing note</div>
              <div className="som-text">
                The quick wins above are real and achievable on your own. For organizations ready to move faster with
                senior expertise embedded alongside their team and sector benchmarks at every milestone, this is where
                Orbit connects to EY Studio+.
              </div>
            </div>
          </div>

          <div className="studio-card" id="contact">
            <div className="studio-top-bar" />
            <div className="studio-inner">
              <div className="studio-bg-glow" aria-hidden="true" />

              <h2 className="studio-hl">
                Some gaps close with a document.
                <br />
                Others need <em>the right people</em>
                <br />
                in the room.
              </h2>

              <div className="studio-body">
                EY Studio+ works with organizations at every maturity stage, designing the measurement infrastructure,
                personalization systems, and digital experience that move growing operators into the same competitive
                league as the leaders referenced in this report. Engagement starts with a conversation, not a proposal.
              </div>

              <div className="studio-offers">
                {OFFERS.map((offer) => (
                  <div className="s-offer" key={offer.number}>
                    <div className="so-accent" aria-hidden="true" />
                    <div className="so-num">{offer.number}</div>
                    <div className="so-t">{offer.title}</div>
                    <div className="so-d">{offer.description}</div>
                  </div>
                ))}
              </div>

              <div className="studio-cta-block">
                <div className="scta-text">
                  <div className="scta-label">Ready to start?</div>
                  <h3 className="scta-heading">Book a free 30-minute strategy session with a sector specialist.</h3>
                  <div className="scta-sub">No proposal. No commitment. First value delivered in 4 weeks.</div>
                </div>
                <div className="scta-actions">
                  <button type="button" className="btn-primary" onClick={openModal}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M2 4l6 5 6-5"
                        stroke="#111318"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <rect x="1" y="3" width="14" height="10" rx="2" stroke="#111318" strokeWidth="1.5" />
                    </svg>
                    Book consultation
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => window.print()}>
                    Download PDF
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M2 7h10M8 3l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer className="section-footer">
            <img src={STUDIO_LOGO_SRC} alt="EY Studio+ logo" />
            <p>&copy; 2026 EY Studio+ Customer Experience. All rights reserved.</p>
          </footer>
        </div>
      </div>
      {isModalOpen ? (
        <div className="consultation-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consultation-title">
          <form className="consultation-modal" onSubmit={handleBookConsultation}>
            <h3 id="consultation-title">Book a CX consultation</h3>
            <p>Enter your name only. Gmail will open with a prepared message that you can review before sending.</p>
            <div className="consultation-field">
              <label htmlFor="consultation-client-name">Your name</label>
              <input
                id="consultation-client-name"
                type="text"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Ahmed Ben Ali"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            {error ? <div className="consultation-error">{error}</div> : null}
            <div className="consultation-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting || !clientName.trim()}>
                {isSubmitting ? "Preparing..." : "Open Gmail"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
