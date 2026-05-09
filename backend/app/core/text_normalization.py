def normalize_text(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""

    replacements = {
        "â€™": "'",
        "â€˜": "'",
        "â€œ": '"',
        "â€": '"',
        "â€“": "-",
        "â€”": "-",
        "â€¦": "...",
        "Â ": " ",
        "Â": "",
        "Ã¢â‚¬â„¢": "'",
        "Ã¢â‚¬Ëœ": "'",
        "Ã¢â‚¬Å“": '"',
        "Ã¢â‚¬Â": '"',
        "Ã¢â‚¬â€œ": "-",
        "Ã¢â‚¬â€": "-",
        "Ã¢â‚¬Â¦": "...",
        "Ã‚ ": " ",
        "Ã‚": "",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text
