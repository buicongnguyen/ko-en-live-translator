from __future__ import annotations

import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

import ctranslate2
import numpy as np
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


HALLUCINATION_PHRASES = (
    "thanks for watching",
    "thank you for watching",
    "don't forget to subscribe",
    "dont forget to subscribe",
    "please subscribe",
    "subscribe to",
    "subscribe cho",
    "la la school",
    "hãy subscribe",
)


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
            "silence_filter": {
                "min_audio_rms": self.settings.min_audio_rms,
                "no_speech_threshold": self.settings.no_speech_threshold,
                "log_prob_threshold": self.settings.log_prob_threshold,
                "compression_ratio_threshold": self.settings.compression_ratio_threshold,
            },
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
        audio_rms = self._pcm_rms(pcm_bytes)
        if audio_rms < self.settings.min_audio_rms:
            raise NoSpeechDetectedError(
                f"Skipped low-energy audio chunk. RMS={audio_rms:.4f}."
            )
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
                if not translated_text.strip():
                    raise NoSpeechDetectedError("Skipped audio chunk without confident speech.")
                if self._looks_like_hallucination(source_text, translated_text):
                    raise NoSpeechDetectedError("Skipped likely silence/noise hallucination.")
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
            vad_filter=True,
            no_speech_threshold=self.settings.no_speech_threshold,
            log_prob_threshold=self.settings.log_prob_threshold,
            compression_ratio_threshold=self.settings.compression_ratio_threshold,
        )
        accepted_text: list[str] = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            if self._should_reject_segment(segment):
                continue
            accepted_text.append(text)
        return " ".join(accepted_text).strip()

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

    def _should_reject_segment(self, segment) -> bool:
        no_speech_prob = getattr(segment, "no_speech_prob", 0.0) or 0.0
        avg_logprob = getattr(segment, "avg_logprob", 0.0) or 0.0
        compression_ratio = getattr(segment, "compression_ratio", 0.0) or 0.0
        if no_speech_prob > self.settings.no_speech_threshold:
            return True
        if avg_logprob < self.settings.log_prob_threshold:
            return True
        if compression_ratio > self.settings.compression_ratio_threshold:
            return True
        return self._text_has_hallucination_phrase(segment.text)

    @staticmethod
    def _pcm_rms(pcm_bytes: bytes) -> float:
        if not pcm_bytes:
            return 0.0
        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        if samples.size == 0:
            return 0.0
        return float(np.sqrt(np.mean((samples.astype(np.float32) / 32768.0) ** 2)))

    @classmethod
    def _looks_like_hallucination(
        cls,
        source_text: str | None,
        translated_text: str,
    ) -> bool:
        return (
            cls._text_has_hallucination_phrase(source_text or "")
            or cls._text_has_hallucination_phrase(translated_text)
        )

    @staticmethod
    def _text_has_hallucination_phrase(text: str) -> bool:
        normalized = " ".join(text.lower().split())
        return any(phrase in normalized for phrase in HALLUCINATION_PHRASES)


class NoSpeechDetectedError(RuntimeError):
    pass
