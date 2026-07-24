"""Generates one detailed social/website report by merging the automatically scraped
Google Maps + Facebook reviews with a consultant's manually filled analysis workbook."""

from __future__ import annotations

import json
import logging
import unicodedata

from app.core.config import get_settings
from app.services.llm.core.gateway import build_mistral_gateway
from app.services.llm.utils import extract_json
from app.schemas.manual_analysis import ChannelAnalysis, ManualAnalysisWorkbook, ThemeInsight
from app.schemas.scraping import (
    DetailedSocialReport,
    FrictionPoint,
    PlatformResult,
    ReportEvidence,
    ThemeFrequency,
)
from app.services.scraping.analytics import build_evidence

logger = logging.getLogger(__name__)


def _evidence_block(evidence: ReportEvidence) -> str:
    """Render the computed statistics for the prompt.

    The model used to receive an unordered set of theme names, which made it structurally
    unable to say how big a problem was. It now receives the actual distributions, so the
    narrative can be written against volume instead of vibes.
    """
    if evidence.reviews_classified == 0:
        return "No usable reviews were collected automatically."

    lines: list[str] = [
        f"Volume: {evidence.reviews_collected} reviews collected, of which "
        f"{evidence.reviews_with_text} carry a written comment, of which "
        f"{evidence.reviews_classified} were analysed semantically. Reviews without a comment "
        f"count towards the rating distribution but not towards the topics."
    ]

    if evidence.overall_sentiment:
        s = evidence.overall_sentiment
        lines.append(
            f"Overall sentiment: {s.positive_pct}% positive, {s.neutral_pct}% neutral, "
            f"{s.negative_pct}% negative."
        )

    if evidence.rating_distribution:
        d = evidence.rating_distribution
        lines.append(
            f"Rating distribution ({d.total} rated reviews, average {d.average}/5): "
            f"1★ {d.one} · 2★ {d.two} · 3★ {d.three} · 4★ {d.four} · 5★ {d.five}."
        )

    if evidence.platform_sentiment:
        lines.append("\nBy channel (most degraded first):")
        for p in evidence.platform_sentiment:
            bits = [
                f"- {p.platform}: {p.classified_count} classified reviews — "
                f"{p.positive_pct}% positive / {p.neutral_pct}% neutral / {p.negative_pct}% negative"
            ]
            if p.avg_rating is not None:
                bits.append(f"average rating {p.avg_rating}/5")
            if p.summary_stat:
                bits.append(f"platform public score: {p.summary_stat}")
            if p.reply_rate_pct is not None:
                bits.append(f"brand reply rate: {p.reply_rate_pct}%")
            lines.append(", ".join(bits))

    if evidence.top_complaints:
        lines.append("\nComplaint categories ranked by volume (share of negative reviews):")
        for c in evidence.top_complaints:
            lines.append(
                f"- [{c.label}] {c.count} occurrences — {c.share_pct}% of negative reviews"
                + (f" — seen on: {', '.join(f'{k} {v}' for k, v in c.by_platform.items())}" if c.by_platform else "")
            )

    if evidence.top_themes:
        lines.append("\nTopics ranked by volume (share of classified reviews, and how many of those mentions are negative):")
        for t in evidence.top_themes:
            lines.append(
                f"- [{t.label}] {t.count} mentions — {t.share_pct}% of reviews, "
                f"of which {t.negative_pct}% negative"
            )

    if evidence.verbatims:
        lines.append("\nReal customer verbatims attached to these labels:")
        for v in evidence.verbatims:
            rating = f" {v.rating}/5" if v.rating is not None else ""
            lines.append(f'- [{v.label}] ({v.platform}{rating}) "{v.text}"')

    return "\n".join(lines)


def _channel_block(channel: ChannelAnalysis) -> str:
    lines = [f"### {channel.channel}" + (f" ({channel.account_handle})" if channel.account_handle else "")]
    metric_labels = {
        "followers_growth": "Followers & growth",
        "page_verification": "Page verification",
        "engagement_rate": "Engagement rate",
        "post_interaction_rate": "Post interaction rate",
        "response_time_to_comments": "Response time to comments",
        "response_quality": "Response quality",
        "posting_frequency": "Posting frequency",
        "content_format_variety": "Content format variety",
        "campaign": "Campaign",
        "complaints_handling": "Complaints handling",
        "resolution_effectiveness": "Resolution effectiveness",
        "sentiment_analysis": "Consultant-assessed sentiment",
    }
    for field, label in metric_labels.items():
        value = getattr(channel, field)
        if value:
            lines.append(f"- {label}: {value}")
    if channel.posts:
        lines.append(
            f"- Logged posts: {len(channel.posts)}"
            + (f" (avg engagement: {channel.avg_engagement})" if channel.avg_engagement is not None else "")
        )
        top_posts = sorted(
            (p for p in channel.posts if p.total_engagement),
            key=lambda p: p.total_engagement or 0,
            reverse=True,
        )[:2]
        for p in top_posts:
            lines.append(f"  Top post: {p.post or 'untitled'} — engagement {p.total_engagement}")
    if channel.notes:
        lines.append(f"- Consultant notes: {channel.notes}")
    return "\n".join(lines)


def _manual_analysis_block(manual: ManualAnalysisWorkbook) -> str:
    parts: list[str] = []
    if manual.channels:
        parts.append("\n\n".join(_channel_block(c) for c in manual.channels))
    if manual.website and manual.website.has_any_data():
        w = manual.website
        website_lines = [f"### Website" + (f" ({w.url})" if w.url else "")]
        if w.sections:
            website_lines.append(f"- Main sections: {', '.join(w.sections)}")
        t = w.traffic
        traffic_bits = [
            f"{label}: {value}"
            for label, value in [
                ("Total visits", t.total_visits),
                ("Desktop share", t.desktop_share),
                ("Mobile share", t.mobile_share),
                ("Pages per visit", t.pages_per_visit),
                ("Bounce rate", t.bounce_rate),
                ("Avg visit duration", t.avg_visit_duration),
            ]
            if value
        ]
        if traffic_bits:
            website_lines.append("- Traffic: " + "; ".join(traffic_bits))
        parts.append("\n".join(website_lines))
    if manual.themes:
        theme_lines = ["### Consultant-identified themes (Themes & Insights tab)"]
        for t in manual.themes:
            bits = [f"[{t.type or 'Theme'}", f"source: {t.source or 'n/a'}]", t.theme]
            line = " ".join(bits)
            if t.opinions_count:
                line += f" — {t.opinions_count} opinions"
                if t.share_of_mentions is not None:
                    line += f" ({round(t.share_of_mentions * 100)}% of consolidated mentions)"
            if t.description:
                line += f": {t.description}"
            if t.examples:
                line += f" Examples: {t.examples}"
            if t.interpretation:
                line += f" Interpretation: {t.interpretation}"
            theme_lines.append(f"- {line}")
        parts.append("\n".join(theme_lines))
    return "\n\n".join(parts) if parts else "Le consultant n'a rempli aucune donnée exploitable dans le classeur."


def _fold(value: str) -> str:
    """Casefold and strip accents, so 'Après-vente' and 'apres-vente' compare equal."""
    stripped = unicodedata.normalize("NFKD", (value or "").casefold())
    return "".join(ch for ch in stripped if not unicodedata.combining(ch)).strip()


def _match_consultant_theme(theme_name: str, themes: list) -> "ThemeInsight | None":
    """Find the workbook theme a generated friction point refers to.

    The model paraphrases ('Service après-vente (SAV)' for 'Service après-vente'), so an
    exact match is too strict; containment either way is enough and cannot collide across
    the handful of themes a workbook carries.
    """
    if not theme_name or not themes:
        return None

    target = _fold(theme_name)
    if not target:
        return None
    for theme in themes:
        candidate = _fold(theme.theme)
        if candidate and (candidate in target or target in candidate):
            return theme
    return None


def _match_friction_point(theme_name: str, points: list) -> "FrictionPoint | None":
    """Resolve a recommendation's 'addresses' to one of the report's own friction points.

    Same containment rule as the workbook matcher: the model paraphrases its own themes
    between two places in the same JSON document, so exact equality is too strict.
    """
    if not theme_name or not points:
        return None
    target = _fold(theme_name)
    if not target:
        return None
    for point in points:
        candidate = _fold(point.theme)
        if candidate and (candidate in target or target in candidate):
            return point
    return None


async def generate_detailed_social_report(
    brand_name: str,
    platforms: list[PlatformResult],
    manual_analysis: ManualAnalysisWorkbook | None = None,
) -> DetailedSocialReport | None:
    """Produce one unified, evidenced social + website report. Always covers the scraped
    Google Maps / Facebook reviews, and additionally folds in the consultant's manual
    analysis workbook (LinkedIn / Instagram / X / Website / consolidated themes) when provided."""

    evidence = build_evidence(platforms)
    scraped_block = _evidence_block(evidence)

    # The exact labels the model may cite, so a friction point can be tied back to a real
    # count. Complaints win over themes on a duplicate label: the two are measured against
    # different denominators (share of negatives vs share of all reviews), so keeping both
    # would let one label resolve to two different numbers and put a badge on screen that
    # contradicts the sentence next to it.
    counts_by_label: dict[str, ThemeFrequency] = {}
    for item in list(evidence.top_complaints) + list(evidence.top_themes):
        counts_by_label.setdefault(item.label.lower(), item)
    ranked_labels = [item.label for item in counts_by_label.values()]

    has_manual = manual_analysis is not None and (
        bool(manual_analysis.channels)
        or (manual_analysis.website is not None and manual_analysis.website.has_any_data())
        or bool(manual_analysis.themes)
    )
    manual_block = (
        _manual_analysis_block(manual_analysis)
        if has_manual and manual_analysis is not None
        else "No manual analysis was supplied. Build the report from the scraped data above alone."
    )
    ranked_labels_block = (
        "\n".join(f"- {label}" for label in ranked_labels)
        if ranked_labels
        else "(no computed labels — use null)"
    )

    prompt = f"""You are a senior EY consultant specialising in customer experience (CX) and digital presence.
Produce ONE detailed, structured report on the social and web presence of the brand '{brand_name}',
covering everything available from the following sources:

1. Public reviews (Google Maps, Facebook, Trustpilot) collected, auto-classified and then aggregated
   statistically. The figures below are computed, not estimated: reuse them verbatim (source: "scraped").
2. Where present, a manual analysis by an EY consultant covering LinkedIn, Instagram, X and the brand's
   website, including performance metrics, qualitative observations and consolidated customer themes with
   real verbatims (source: "consultant").

The underlying reviews may be in French, Arabic or any other language. WRITE THE ENTIRE REPORT IN ENGLISH —
it is an English-language client deliverable. Translate any verbatim you quote into English, keeping its meaning
intact; do not invent quotes.

=== COMPUTED STATISTICS ON PUBLIC REVIEWS ===
{scraped_block}

=== CONSULTANT'S MANUAL ANALYSIS ===
{manual_block}

Produce a structured JSON report that faithfully synthesises all available data without ever inventing figures
or facts absent from it. Where information comes from only one source, let the content make that clear (never
attribute scraped data to a channel that was not scraped, or vice versa).

QUANTIFICATION REQUIREMENT: this is a client deliverable. Every claim about scale must carry a figure taken from
the statistics above ("34 mentions, i.e. 28% of negative reviews"), never a vague phrase ("many customers",
"often"). Always prioritise by volume: the most frequent problem comes first. Distinguish a heavily discussed but
mildly negative topic from a less discussed but overwhelmingly negative one — the latter is usually more urgent.

Expected response format (JSON only, no surrounding markdown):
{{
  "executive_summary": "4-6 sentences of overall synthesis, quantified, usable by an executive.",
  "channel_breakdown": [
    {{
      "channel": "Channel name (Google Maps, Facebook, Trustpilot, LinkedIn, Instagram, X, Website)",
      "summary": "2-4 sentences summarising performance and perception on this channel.",
      "strengths": ["Strength 1", "Strength 2"],
      "friction_points": ["Friction point 1"],
      "key_stats": ["Label: value", "Label: value"]
    }}
  ],
  "top_strengths": [
    {{
      "text": "One of the 3-5 biggest cross-channel strengths, quantified where the statistics allow",
      "related_label": "The EXACT label copied from the allowed list below when this strength maps to a measured topic, otherwise null"
    }}
  ],
  "top_friction_points": [
    {{
      "theme": "Name of the friction theme",
      "source": "scraped | consultant | both",
      "related_label": "The EXACT label copied from the allowed list below, or null if this point comes only from the manual analysis",
      "description": "Factual description of the problem, its quantified scale and its business impact",
      "supporting_evidence": ["A real customer verbatim (translated to English) or a statistic supporting this point"]
    }}
  ],
  "website_assessment": "2-4 sentences on website performance and structure, or null if no website data is available.",
  "recommendations": [
    {{
      "text": "A concrete, actionable recommendation (3-6 in total)",
      "addresses": "The EXACT 'theme' value of the friction point above that this recommendation resolves, or null if it addresses none of them"
    }}
  ],
  "methodology_note": "1-2 sentences stating explicitly which channels come from automated scraping and which from the consultant's manual analysis (or, if no manual analysis was supplied, that the report rests on scraped reviews alone)."
}}

Allowed values for 'related_label' (copy one exactly, or null):
{ranked_labels_block}

Order 'top_friction_points' by decreasing scale (volume of mentions), not by order of appearance.
Every recommendation that resolves one of the friction points MUST carry its 'theme' verbatim in
'addresses' — that is what lets the report state how many customers each action would affect.

Include a channel in 'channel_breakdown' ONLY if it genuinely appears with concrete data in the sections above.
NEVER add an entry for an absent channel (for example Facebook or X) merely because it is listed as a possible
channel in this prompt, and never write an entry whose only content is that there is no data: simply omit that
channel from the list.
Only produce 'website_assessment' if website data was supplied, otherwise return null.
Return only valid JSON, with no surrounding text or markdown.
"""

    try:
        settings = get_settings()
        gateway = build_mistral_gateway(settings)
        messages = [
            {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON objects."},
            {"role": "user", "content": prompt},
        ]
        logger.info("Generating detailed social report for '%s'", brand_name)
        response_text = await gateway.chat_messages(messages)

        result_dict = extract_json(response_text)
        if not result_dict:
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            result_dict = json.loads(cleaned)

        report = DetailedSocialReport.model_validate(result_dict)

        # Hard safety net: never trust the model to have honored the "don't fabricate
        # channels with no data" instruction -- drop anything that isn't actually backed
        # by a successfully scraped platform or a filled-in manual analysis section.
        available_channels = {p.platform.lower() for p in platforms if p.status == "success"}
        if manual_analysis is not None:
            available_channels.update(c.channel.lower() for c in manual_analysis.channels)
            if manual_analysis.website and manual_analysis.website.has_any_data():
                available_channels.add("website")
        report.channel_breakdown = [
            section for section in report.channel_breakdown if section.channel.lower() in available_channels
        ]

        # Every number in the report comes from `evidence`, computed in Python. The LLM only
        # ever wrote the prose around it, so the headline figures cannot drift.
        report.evidence = evidence
        report.overall_sentiment = evidence.overall_sentiment

        # Attach real volume to each friction point via the label the model echoed back.
        # Matching is exact (case-insensitive) -- a label the model invented simply stays
        # unquantified rather than being force-fitted to the nearest count.
        # Consultant-only points are quantified from the consultant's OWN theme counts, never
        # from a scraped label: mixing the two put "7 scraped mentions" next to a sentence
        # saying "41 consultant opinions". Sourcing the badge from the same place as the
        # sentence keeps them consistent, and gives every point a magnitude to rank by.
        consultant_themes = list(manual_analysis.themes) if manual_analysis is not None else []
        for point in report.top_friction_points:
            if point.source == "consultant":
                point.related_label = None
                theme = _match_consultant_theme(point.theme, consultant_themes)
                if theme is not None and theme.opinions_count:
                    point.mention_count = theme.opinions_count
                    point.share_pct = (
                        round(theme.share_of_mentions * 100, 1)
                        if theme.share_of_mentions is not None
                        else None
                    )
                continue
            if not point.related_label:
                continue
            match = counts_by_label.get(point.related_label.strip().lower())
            if match is None:
                point.related_label = None
                continue
            point.related_label = match.label
            point.mention_count = match.count
            point.share_pct = match.share_pct

        # Ranked by how many customers evidence each point. Scraped mentions and consultant
        # opinions are counted over different populations, so this is an approximation --
        # but it is far better than the previous rule, which sank a 47-opinion consultant
        # finding below a single stray scraped review purely for lacking a number.
        report.top_friction_points.sort(key=lambda p: p.mention_count or 0, reverse=True)

        # Strengths get the same treatment as friction points, for the same reason: a bare
        # sentence beside a badged "47 mentions" reads as opinion next to evidence.
        for strength in report.top_strengths:
            if not strength.related_label:
                continue
            match = counts_by_label.get(strength.related_label.strip().lower())
            if match is None:
                strength.related_label = None
                continue
            strength.related_label = match.label
            strength.mention_count = match.count
            strength.share_pct = match.share_pct

        # Tie each recommendation to the friction point it resolves, so the reader can see
        # how many customers the action would reach. An 'addresses' the model invented is
        # dropped rather than shown unbacked.
        for rec in report.recommendations:
            if not rec.addresses:
                continue
            point = _match_friction_point(rec.addresses, report.top_friction_points)
            if point is None:
                rec.addresses = None
                continue
            rec.addresses = point.theme
            rec.mention_count = point.mention_count
            rec.share_pct = point.share_pct

        # Prioritised by the volume of friction each one resolves -- which is what the
        # section already claims to be. Unattributed recommendations sink to the bottom
        # rather than displacing a quantified one.
        report.recommendations.sort(key=lambda r: r.mention_count or 0, reverse=True)

        return report
    except Exception:
        logger.exception("Failed to generate detailed social report for '%s'", brand_name)
        return None
