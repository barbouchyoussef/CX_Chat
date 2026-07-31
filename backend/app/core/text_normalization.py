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


# Runs of Latin-1 supplement bytes (0x80-0xFF) are the fingerprint of UTF-8 text that was
# decoded as Latin-1/CP1252 -- "mojibake". Repairing per-run (not whole-string) is what makes
# this safe on MIXED content: a single already-correct character (e.g. a real curly quote or
# real Arabic) elsewhere in the string won't block the fix, and a legitimate lone accented
# byte (café, Größe) won't decode as UTF-8 so it is left untouched.
_MOJIBAKE_RUN = re.compile(r"[\x80-\xff]+")


def repair_encoding(text: str | None) -> str:
    """Repair UTF-8-decoded-as-Latin-1 mojibake for ANY script (Latin, Arabic, ...).

    Unlike :func:`_repair_mojibake` (Western-marker heuristic, whole-string), this fixes each
    run of high bytes independently, so it recovers Arabic filenames (``Ø§ÙØ¬ÙØ¯Ø©`` →
    ``الجودة``) and English punctuation (``Libyanaâ€™s`` → ``Libyana's``) alike, preserves
    document structure (newlines, table pipes), and leaves clean text unchanged.
    """
    if not text:
        return text or ""

    def _fix_run(match: re.Match[str]) -> str:
        seg = match.group(0)
        try:
            decoded = seg.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return seg  # not valid UTF-8 → a genuine Latin-1 accent, keep as-is
        return decoded

    out = text
    for _ in range(3):  # a couple of passes clears double-encoding
        repaired = _MOJIBAKE_RUN.sub(_fix_run, out)
        if repaired == out:
            break
        out = repaired
    return out


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
