from __future__ import annotations

import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

import ctranslate2
from faster_whisper import WhisperModel

from .config import Settings
from .languages import (
    SOURCE_LANGUAGES,
    TARGET_LANGUAGES,
    normalize_source_language,
    normalize_target_language,
    whisper_language_code,
)
from .text_translator import TextTranslator


@dataclass(slots=True)
class TranslationResult:
    translated_text: str
    source_text: str | None
    target_language: str
    audio_seconds: float
    latency_seconds: float


class WhisperTranslator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._model: WhisperModel | None = None
        self._model_lock = Lock()
        self._inference_lock = Lock()
        self._runtime_device: str | None = None
        self._runtime_compute_type: str | None = None
        self._text_translator = TextTranslator(settings)

    def describe(self) -> dict[str, object]:
        return {
            "model": self.settings.whisper_model,
            "source_language": normalize_source_language(self.settings.source_language),
            "target_language": normalize_target_language(self.settings.target_language),
            "supported_source_languages": SOURCE_LANGUAGES,
            "supported_target_languages": TARGET_LANGUAGES,
            "text_translation": self._text_translator.describe(),
            "device": self._runtime_device or self.settings.device,
            "compute_type": self._runtime_compute_type or self.settings.compute_type,
            "ready": self._model is not None,
            "show_source_text": self.settings.show_source_text,
        }

    def ensure_model(self) -> WhisperModel:
        if self._model is not None:
            return self._model

        with self._model_lock:
            if self._model is not None:
                return self._model

            preferred_device = self._resolve_device()
            attempts: list[tuple[str, str]] = []

            if preferred_device == "cuda":
                attempts.extend(
                    [
                        ("cuda", self._resolve_compute_type("cuda")),
                        ("cuda", "float16"),
                        ("cuda", "int8"),
                    ]
                )
                if self.settings.device == "auto":
                    attempts.extend([("cpu", "int8"), ("cpu", "float32")])
            else:
                attempts.extend([("cpu", self._resolve_compute_type("cpu")), ("cpu", "float32")])

            last_error: Exception | None = None
            tried: set[tuple[str, str]] = set()

            for device, compute_type in attempts:
                key = (device, compute_type)
                if key in tried:
                    continue
                tried.add(key)
                try:
                    model = WhisperModel(
                        self.settings.whisper_model,
                        device=device,
                        compute_type=compute_type,
                        cpu_threads=self.settings.cpu_threads,
                        download_root=str(self.settings.model_cache_dir)
                        if self.settings.model_cache_dir
                        else None,
                    )
                    self._model = model
                    self._runtime_device = device
                    self._runtime_compute_type = compute_type
                    return model
                except Exception as exc:  # pragma: no cover - best effort fallback
                    last_error = exc

            raise RuntimeError("Unable to load a Whisper model.") from last_error

    def translate_pcm16(
        self,
        pcm_bytes: bytes,
        sample_rate: int,
        source_language: str | None = None,
        target_language: str | None = None,
    ) -> TranslationResult:
        model = self.ensure_model()
        started_at = time.perf_counter()
        source = normalize_source_language(source_language, self.settings.source_language)
        target = normalize_target_language(target_language, self.settings.target_language)

        with self._inference_lock:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_path = Path(temp_file.name)

            try:
                with wave.open(str(temp_path), "wb") as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(pcm_bytes)

                source_text = None
                if self.settings.show_source_text or self._can_reuse_source_as_target(source, target):
                    source_text = self._run_transcribe(
                        model,
                        temp_path,
                        task="transcribe",
                        source_language=source,
                    )
                if target == "en":
                    translated_text = self._run_transcribe(
                        model,
                        temp_path,
                        task="translate",
                        source_language=source,
                    )
                elif self._can_reuse_source_as_target(source, target):
                    translated_text = source_text or ""
                else:
                    english_pivot = (
                        source_text
                        if source == "en" and source_text
                        else self._run_transcribe(
                            model,
                            temp_path,
                            task="translate",
                            source_language=source,
                        )
                    )
                    translated_text = self._text_translator.translate_from_english(
                        english_pivot,
                        target,
                    )
            finally:
                temp_path.unlink(missing_ok=True)

        latency_seconds = time.perf_counter() - started_at
        audio_seconds = len(pcm_bytes) / 2 / sample_rate
        return TranslationResult(
            translated_text=translated_text,
            source_text=source_text,
            target_language=target,
            audio_seconds=audio_seconds,
            latency_seconds=latency_seconds,
        )

    def _run_transcribe(
        self,
        model: WhisperModel,
        audio_path: Path,
        task: str,
        source_language: str,
    ) -> str:
        segments, _info = model.transcribe(
            str(audio_path),
            language=whisper_language_code(source_language),
            task=task,
            beam_size=self.settings.beam_size,
            condition_on_previous_text=False,
            without_timestamps=True,
            temperature=0.0,
            vad_filter=False,
        )
        return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()

    def _resolve_device(self) -> str:
        if self.settings.device != "auto":
            return self.settings.device
        try:
            return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:  # pragma: no cover - library/platform edge case
            return "cpu"

    def _resolve_compute_type(self, device: str) -> str:
        if self.settings.compute_type != "auto":
            return self.settings.compute_type
        if device == "cuda":
            return "int8_float16"
        return "int8"

    @staticmethod
    def _can_reuse_source_as_target(source_language: str, target_language: str) -> bool:
        return source_language != "auto" and source_language == target_language
