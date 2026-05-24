from __future__ import annotations


TRANSLATION_LANGUAGES: list[dict[str, str]] = [
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

SOURCE_LANGUAGES: list[dict[str, str]] = [
    {"code": "auto", "name": "Auto detect"},
    *TRANSLATION_LANGUAGES,
]
TARGET_LANGUAGES = TRANSLATION_LANGUAGES

SUPPORTED_SOURCE_LANGUAGE_CODES = {language["code"] for language in SOURCE_LANGUAGES}
SUPPORTED_TARGET_LANGUAGE_CODES = {language["code"] for language in TARGET_LANGUAGES}

NLLB_LANGUAGE_CODES = {
    "ar": "arb_Arab",
    "de": "deu_Latn",
    "en": "eng_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "hi": "hin_Deva",
    "id": "ind_Latn",
    "it": "ita_Latn",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "ms": "zsm_Latn",
    "nl": "nld_Latn",
    "pl": "pol_Latn",
    "pt": "por_Latn",
    "ru": "rus_Cyrl",
    "th": "tha_Thai",
    "tl": "tgl_Latn",
    "tr": "tur_Latn",
    "uk": "ukr_Cyrl",
    "vi": "vie_Latn",
    "zh": "zho_Hans",
}


def normalize_source_language(value: str | None, default: str = "ko") -> str:
    code = (value or "").strip().lower()
    if code in SUPPORTED_SOURCE_LANGUAGE_CODES:
        return code

    fallback = (default or "ko").strip().lower()
    if fallback in SUPPORTED_SOURCE_LANGUAGE_CODES:
        return fallback

    return "ko"


def normalize_target_language(value: str | None, default: str = "en") -> str:
    code = (value or "").strip().lower()
    if code in SUPPORTED_TARGET_LANGUAGE_CODES:
        return code

    fallback = (default or "en").strip().lower()
    if fallback in SUPPORTED_TARGET_LANGUAGE_CODES:
        return fallback

    return "en"


def whisper_language_code(source_language: str) -> str | None:
    if source_language == "auto":
        return None
    return source_language
