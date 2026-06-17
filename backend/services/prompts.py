LEVEL_MAP = {
    "child":  "a child aged 8-10 (very simple words, very short sentences)",
    "simple": "anyone (plain everyday English, no jargon)",
    "teen":   "a teenager aged 14-16 (clear and straightforward)"
}

LENGTH_MAP = {
    "short":  "2-3 sentences",
    "medium": "one paragraph",
    "full":   "2-3 paragraphs"
}

def summarize_prompt(text: str, length: str, format: str) -> str:
    fmt = "Use bullet points." if format == "bullets" else "Write in prose."
    return (
        f"Summarise the following webpage content in {LENGTH_MAP.get(length, 'one paragraph')}. "
        f"{fmt} Use plain, simple language.\n\n{text}"
    )

def simplify_prompt(text: str, level: str) -> str:
    return (
        f"Rewrite the following text so it is easy to understand for "
        f"{LEVEL_MAP.get(level, LEVEL_MAP['simple'])}. "
        f"Keep the same meaning. Do not add extra explanation, just rewrite it. "
        f"If the text is already at that level or simpler, reply with exactly: "
        f"'This text is already simple enough.'\n\n{text}"
    )

def translate_prompt(text: str, lang: str) -> str:
    return (
        f"You are a translator. Do two things:\n"
        f"1. Translate the following text into {lang}.\n"
        f"2. After the translation, on a new line starting with \"NOTE:\", briefly explain any idioms, "
        f"cultural references, or figures of speech from the original that might be confusing "
        f"(if none, write \"NOTE: No special notes.\").\n\n"
        f"Text: \"{text}\""
    )

def factcheck_prompt(text: str) -> str:
    return (
        f"You are a fact-checker. Analyse the following claim and respond ONLY with this JSON (no other text):\n"
        f"{{\n"
        f"  \"verdict\": \"likely true\" | \"misleading\" | \"unverifiable\",\n"
        f"  \"reason\": \"one or two sentence explanation\"\n"
        f"}}\n\n"
        f"Claim: \"{text}\""
    )