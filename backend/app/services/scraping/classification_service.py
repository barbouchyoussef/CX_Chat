"""Service to classify and summarize scraped reviews using Mistral LLM."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import get_settings
from app.services.llm.core.gateway import build_mistral_gateway
from app.services.llm.utils import extract_json
from app.schemas.scraping import (
    ScrapedReview,
    ReviewClassification,
    AnalysisSummary,
    TopicCount,
)

logger = logging.getLogger(__name__)


async def classify_reviews(
    reviews: list[ScrapedReview],
    brand_name: str,
) -> tuple[list[ScrapedReview], AnalysisSummary | None]:
    """Classify a list of reviews using Mistral.

    Returns the updated reviews (with classification field populated) and an AnalysisSummary.
    """
    if not reviews:
        return reviews, None

    # Limit to top 80 reviews total, taking up to 40 from Google Maps and 40 from Facebook to represent both platforms fairly
    gm_reviews = [r for r in reviews if r.platform == "Google Maps"]
    fb_reviews = [r for r in reviews if r.platform == "Facebook"]
    
    gm_count = min(40, len(gm_reviews))
    fb_count = min(40, len(fb_reviews))
    
    if len(gm_reviews) < 40:
        fb_count = min(80 - len(gm_reviews), len(fb_reviews))
    elif len(fb_reviews) < 40:
        gm_count = min(80 - len(fb_reviews), len(gm_reviews))
        
    analysis_reviews = gm_reviews[:gm_count] + fb_reviews[:fb_count]
    
    # Format reviews for the prompt
    formatted_reviews = []
    for idx, r in enumerate(analysis_reviews):
        formatted_reviews.append({
            "index": idx,
            "platform": r.platform,
            "text": r.text,
            "rating": r.rating,
        })

    prompt = f"""Vous êtes un analyste expert de l'expérience client (CX).
Analysez les avis suivants sur la marque '{brand_name}' et renvoyez un objet JSON valide contenant l'analyse complète.

Pour chaque avis, déterminez :
1. La polarité du sentiment : "positive", "neutral", ou "negative".
2. Le score de confiance (de 0.0 à 1.0).
3. Les thèmes clés abordés (ex: "Qualité de service", "Attente", "Prix", "Support client"). Max 3 thèmes.
4. Si le sentiment est "negative", identifiez la catégorie de plainte correspondante (ex: "Temps d'attente", "Accueil client", "Rupture de stock", "Problème technique", etc.). Sinon, mettez null.

Calculez également les statistiques globales (pourcentages de sentiments, top thèmes, top plaintes) et rédigez un court résumé de l'opinion client en français (max 4 phrases).

Format de réponse attendu :
```json
{{
  "classifications": [
    {{
      "index": 0,
      "sentiment": "positive",
      "confidence": 0.95,
      "themes": ["Accueil", "Professionnalisme"],
      "complaint_category": null
    }}
  ],
  "analysis": {{
    "positive_pct": 80.0,
    "neutral_pct": 10.0,
    "negative_pct": 10.0,
    "top_themes": ["Thème A", "Thème B", "Thème C"],
    "top_complaints": [
      {{
        "topic": "Sujet A",
        "count": 5
      }}
    ],
    "summary_text": "Résumé synthétique en français de l'expérience globale des clients..."
  }}
}}
```

Voici la liste des avis à analyser :
{json.dumps(formatted_reviews, ensure_ascii=False, indent=2)}

Renvoie uniquement le code JSON valide dans ta réponse, sans autre explication ni markdown autour.
"""

    try:
        settings = get_settings()
        gateway = build_mistral_gateway(settings)
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON objects."},
            {"role": "user", "content": prompt}
        ]
        
        logger.info("Sending batch reviews to Mistral for classification. Count: %d", len(analysis_reviews))
        response_text = await gateway.chat_messages(messages)
        
        # Parse JSON output
        result_dict = extract_json(response_text)
        if not result_dict:
            # Try parsing direct text if extract_json missed it (e.g. if it starts with markdown code block)
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                # strip out markdown blocks
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            try:
                result_dict = json.loads(cleaned)
            except Exception:
                logger.error("Failed to parse JSON response from Mistral: %s", response_text[:1000])
                return reviews, None
                
        # Build structured object
        classifications_list = result_dict.get("classifications", [])
        classifications_by_idx = {item.get("index"): item for item in classifications_list if "index" in item}

        for idx, review in enumerate(reviews):
            if idx in classifications_by_idx:
                c_data = classifications_by_idx[idx]
                review.classification = ReviewClassification(
                    sentiment=c_data.get("sentiment") or "neutral",
                    confidence=float(c_data.get("confidence") or 0.8),
                    themes=c_data.get("themes") or [],
                    complaint_category=c_data.get("complaint_category"),
                )
            else:
                # Default fallback
                review.classification = None

        # Build analysis summary
        analysis_data = result_dict.get("analysis", {})
        
        top_complaints = []
        for tc in analysis_data.get("top_complaints", []):
            if isinstance(tc, dict) and "topic" in tc and "count" in tc:
                top_complaints.append(TopicCount(topic=tc["topic"], count=tc["count"]))

        summary = AnalysisSummary(
            positive_pct=float(analysis_data.get("positive_pct") or 0.0),
            neutral_pct=float(analysis_data.get("neutral_pct") or 0.0),
            negative_pct=float(analysis_data.get("negative_pct") or 0.0),
            top_themes=analysis_data.get("top_themes") or [],
            top_complaints=top_complaints,
            summary_text=analysis_data.get("summary_text"),
        )
        
        return reviews, summary

    except Exception as exc:
        logger.exception("Error running LLM classification on reviews")
        return reviews, None
