import { useState, type FormEvent } from "react";
import "./reportGoFurtherSection.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const STUDIO_LOGO_SRC = "/EY_Studio+_Logo_Primary_WithoutStrapline_RGB_White_Yellow_Grad_EN.png";

const OFFERS_EN = [
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

const OFFERS_FR = [
  {
    number: "-- 01",
    title: "Expérience Client",
    description:
      "Conception et orchestration d'expériences client différenciées, avec un accent clair sur la valeur client, la fidélité et l'amélioration mesurable du service.",
  },
  {
    number: "-- 02",
    title: "Transformation Marketing",
    description:
      "Transformation des capacités marketing grâce à une croissance axée sur les données, omnicanale et axée sur la performance, et à une activation commerciale plus forte.",
  },
  {
    number: "-- 03",
    title: "Innovation Produits & Services",
    description:
      "De l'idéation au lancement, façonner des produits et services qui sont désirables, viables et prêts à passer à l'échelle.",
  },
];

type Props = {
  assessmentId: number;
  language?: string | null;
};

export default function ReportGoFurtherSection({ assessmentId, language }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFrench = (language ?? "").toLowerCase().startsWith("fr");

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
      setError(isFrench ? "Veuillez entrer votre nom." : "Please enter your name.");
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
        throw new Error(payload?.detail || (isFrench ? "Impossible de préparer le message Gmail." : "Could not prepare the Gmail message."));
      }
      const payload = (await response.json()) as { gmail_url?: string };
      if (!payload.gmail_url) {
        throw new Error(isFrench ? "Le serveur n'a pas renvoyé d'URL Gmail." : "The backend did not return a Gmail URL.");
      }
      window.open(payload.gmail_url, "_blank", "noopener,noreferrer");
      setIsModalOpen(false);
      setClientName("");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : (isFrench ? "Impossible de préparer le message Gmail." : "Could not prepare the Gmail message."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const offers = isFrench ? OFFERS_FR : OFFERS_EN;

  return (
    <section className="report-go-further-shell relative overflow-hidden px-3 py-4 text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8 print:px-0 print:py-0">
      <div className="section">
        <div className="orbital-ring" />
        <div className="orbital-ring-small" />
        <div className="orbital-ring-left" />

        <div className="section-head">
          <span className="section-number">06</span>
          <h2 className="section-title">{isFrench ? "Aller plus loin" : "Go Further"}</h2>
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
              <div className="som-from">{isFrench ? "Orbit | Note de clôture" : "Orbit | Closing note"}</div>
              <div className="som-text">
                {isFrench
                  ? "Les gains rapides ci-dessus sont réels et réalisables par vous-même. Pour les organisations prêtes à aller plus vite avec une expertise senior intégrée à leurs équipes et des benchmarks sectoriels à chaque étape, c'est ici qu'Orbit se connecte à EY Studio+."
                  : "The quick wins above are real and achievable on your own. For organizations ready to move faster with senior expertise embedded alongside their team and sector benchmarks at every milestone, this is where Orbit connects to EY Studio+."}
              </div>
            </div>
          </div>

          <div className="studio-card" id="contact">
            <div className="studio-top-bar" />
            <div className="studio-inner">
              <div className="studio-bg-glow" aria-hidden="true" />

              <h2 className="studio-hl">
                {isFrench ? (
                  <>
                    Certains écarts se comblent avec un document.
                    <br />
                    D'autres nécessitent <em>les bonnes personnes</em>
                    <br />
                    autour de la table.
                  </>
                ) : (
                  <>
                    Some gaps close with a document.
                    <br />
                    Others need <em>the right people</em>
                    <br />
                    in the room.
                  </>
                )}
              </h2>

              <div className="studio-body">
                {isFrench
                  ? "EY Studio+ accompagne les organisations à chaque niveau de maturité, en concevant l'infrastructure de mesure, les systèmes de personnalisation et l'expérience numérique qui propulsent les acteurs en croissance dans la même catégorie compétitive que les leaders mentionnés dans ce rapport. La collaboration commence par un échange, pas par une proposition commerciale."
                  : "EY Studio+ works with organizations at every maturity stage, designing the measurement infrastructure, personalization systems, and digital experience that move growing operators into the same competitive league as the leaders referenced in this report. Engagement starts with a conversation, not a proposal."}
              </div>

              <div className="studio-offers">
                {offers.map((offer) => (
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
                  <div className="scta-label">{isFrench ? "Prêt à commencer ?" : "Ready to start?"}</div>
                  <h3 className="scta-heading">
                    {isFrench
                      ? "Réservez une session stratégique de 30 minutes avec un spécialiste sectoriel."
                      : "Book a 30-minute strategy session with a sector specialist."}
                  </h3>
                  <div className="scta-sub">
                    {isFrench
                      ? "Pas de proposition. Pas d'engagement. Première valeur livrée en 4 semaines."
                      : "No proposal. No commitment. First value delivered in 4 weeks."}
                  </div>
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
                    {isFrench ? "Réserver une consultation" : "Book consultation"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => window.print()}>
                    {isFrench ? "Télécharger le PDF" : "Download PDF"}
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
            <p>
              {isFrench
                ? "© 2026 EY Studio+ Expérience Client. Tous droits réservés."
                : "© 2026 EY Studio+ Customer Experience. All rights reserved."}
            </p>
          </footer>
        </div>
      </div>
      {isModalOpen ? (
        <div className="consultation-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consultation-title">
          <form className="consultation-modal" onSubmit={handleBookConsultation}>
            <h3 id="consultation-title">
              {isFrench ? "Réservez une consultation en expérience client" : "Book a customer experience consultation"}
            </h3>
            <p>
              {isFrench
                ? "Entrez votre nom uniquement. Gmail s'ouvrira avec un message préparé que vous pourrez relire avant envoi."
                : "Enter your name only. Gmail will open with a prepared message that you can review before sending."}
            </p>
            <div className="consultation-field">
              <label htmlFor="consultation-client-name">{isFrench ? "Votre nom" : "Your name"}</label>
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
                {isFrench ? "Annuler" : "Cancel"}
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting || !clientName.trim()}>
                {isSubmitting
                  ? (isFrench ? "Préparation..." : "Preparing...")
                  : (isFrench ? "Ouvrir Gmail" : "Open Gmail")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
