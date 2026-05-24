from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    host: str = os.getenv("APP_HOST", "127.0.0.1")
    port: int = int(os.getenv("APP_PORT", "8000"))
    cors_allow_origins: str = os.getenv("CORS_ALLOW_ORIGINS", "*")
    whisper_model: str = os.getenv("WHISPER_MODEL", "medium")
    source_language: str = os.getenv("SOURCE_LANGUAGE", "ko")
    target_language: str = os.getenv("TARGET_LANGUAGE", "en")
    device: str = os.getenv("WHISPER_DEVICE", "auto")
    compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
    enable_text_translation: bool = _env_bool("ENABLE_TEXT_TRANSLATION", False)
    text_translation_model: str = os.getenv(
        "TEXT_TRANSLATION_MODEL",
        "facebook/nllb-200-distilled-600M",
    )
    text_translation_device: str = os.getenv("TEXT_TRANSLATION_DEVICE", "auto")
    beam_size: int = int(os.getenv("WHISPER_BEAM_SIZE", "3"))
    cpu_threads: int = int(os.getenv("WHISPER_CPU_THREADS", "4"))
    show_source_text: bool = _env_bool("SHOW_SOURCE_TEXT", True)
    sample_rate: int = 16000
    frame_ms: int = 30
    pre_roll_ms: int = int(os.getenv("PRE_ROLL_MS", "300"))
    end_silence_ms: int = int(os.getenv("END_SILENCE_MS", "700"))
    min_speech_ms: int = int(os.getenv("MIN_SPEECH_MS", "360"))
    max_segment_ms: int = int(os.getenv("MAX_SEGMENT_MS", "7000"))
    vad_aggressiveness: int = int(os.getenv("VAD_AGGRESSIVENESS", "2"))
    model_cache_dir: Path | None = (
        Path(os.getenv("MODEL_CACHE_DIR")).expanduser()
        if os.getenv("MODEL_CACHE_DIR")
        else None
    )

    @property
    def frame_bytes(self) -> int:
        samples_per_frame = self.sample_rate * self.frame_ms // 1000
        return samples_per_frame * 2

    @property
    def cors_allow_origin_list(self) -> list[str]:
        raw = self.cors_allow_origins.strip()
        if not raw or raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


def load_settings() -> Settings:
    return Settings()
