from __future__ import annotations


SOURCE_LANGUAGES: list[dict[str, str]] = [
    {"code": "auto", "name": "Auto detect"},
    {"code": "ko", "name": "Korean"},
    {"code": "ja", "name": "Japanese"},
    {"code": "zh", "name": "Chinese"},
    {"code": "vi", "name": "Vietnamese"},
    {"code": "en", "name": "English"},
    {"code": "es", "name": "Spanish"},
    {"code": "fr", "name": "French"},
    {"code": "de", "name": "German"},
    {"code": "it", "name": "Italian"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "ru", "name": "Russian"},
    {"code": "ar", "name": "Arabic"},
    {"code": "hi", "name": "Hindi"},
    {"code": "th", "name": "Thai"},
    {"code": "id", "name": "Indonesian"},
    {"code": "ms", "name": "Malay"},
    {"code": "tl", "name": "Tagalog"},
    {"code": "tr", "name": "Turkish"},
    {"code": "pl", "name": "Polish"},
    {"code": "nl", "name": "Dutch"},
    {"code": "uk", "name": "Ukrainian"},
]

SUPPORTED_SOURCE_LANGUAGE_CODES = {language["code"] for language in SOURCE_LANGUAGES}


def normalize_source_language(value: str | None, default: str = "ko") -> str:
    code = (value or "").strip().lower()
    if code in SUPPORTED_SOURCE_LANGUAGE_CODES:
        return code

    fallback = (default or "ko").strip().lower()
    if fallback in SUPPORTED_SOURCE_LANGUAGE_CODES:
        return fallback

    return "ko"


def whisper_language_code(source_language: str) -> str | None:
    if source_language == "auto":
        return None
    return source_language
