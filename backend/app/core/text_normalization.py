from __future__ import annotations

import re


_REPLACEMENTS = {
    "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢": "'",
    "ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“": "'",
    "ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ": '"',
    "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â": '"',
    "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“": "-",
    "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â": "-",
    "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦": "...",
    "Ãƒâ€š ": " ",
    "Ãƒâ€š": "",
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢": "'",
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¹Ã…â€œ": "'",
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“": '"',
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â": '"',
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ": "-",
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â": "-",
    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦": "...",
    "ÃƒÆ’Ã¢â‚¬Å¡ ": " ",
    "ÃƒÆ’Ã¢â‚¬Å¡": "",
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€": '"',
    "â€“": "-",
    "â€”": "-",
    "â€¢": "-",
    "â€¦": "...",
    "Â°": "°",
    "Â·": "·",
    "Â ": " ",
    "Â": "",
}

_MOJIBAKE_MARKERS = ("Ã", "Â", "â", "€", "™", "œ", "ž", "¢")


def _mojibake_score(text: str) -> int:
    return sum(text.count(marker) for marker in _MOJIBAKE_MARKERS)


def _repair_mojibake(text: str) -> str:
    repaired = text
    for _ in range(3):
        if not any(marker in repaired for marker in _MOJIBAKE_MARKERS):
            break
        best = repaired
        for encoding in ("latin-1", "cp1252"):
            try:
                candidate = repaired.encode(encoding).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
            if _mojibake_score(candidate) < _mojibake_score(best):
                best = candidate
        if best == repaired:
            break
        repaired = best
    return repaired


def normalize_text(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""

    text = _repair_mojibake(text)
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    text = re.sub(r"([A-Za-z])âs\b", r"\1's", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text
