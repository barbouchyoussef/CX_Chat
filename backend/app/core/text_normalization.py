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
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text
