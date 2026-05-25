from __future__ import annotations

import datetime as dt
from collections import deque
from queue import Queue
from threading import Event, Thread

import webrtcvad

from .config import Settings
from .languages import normalize_source_language, normalize_target_language
from .translator import NoSpeechDetectedError, WhisperTranslator


class VadSegmenter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.vad = webrtcvad.Vad(settings.vad_aggressiveness)
        self.pre_roll = deque(maxlen=max(1, settings.pre_roll_ms // settings.frame_ms))
        self.end_silence_frames = max(1, settings.end_silence_ms // settings.frame_ms)
        self.min_speech_frames = max(1, settings.min_speech_ms // settings.frame_ms)
        self.max_segment_frames = max(1, settings.max_segment_ms // settings.frame_ms)
        self.active = False
        self.silence_frames = 0
        self.segment_frames = 0
        self.speech_frames = 0
        self.segment_buffer = bytearray()

    def accept(self, frame: bytes) -> bytes | None:
        is_speech = self.vad.is_speech(frame, self.settings.sample_rate)

        if not self.active:
            self.pre_roll.append(frame)
            if is_speech:
                self.active = True
                self.silence_frames = 0
                self.segment_frames = len(self.pre_roll)
                self.speech_frames = 1
                self.segment_buffer = bytearray(b"".join(self.pre_roll))
            return None

        self.segment_buffer.extend(frame)
        self.segment_frames += 1

        if is_speech:
            self.silence_frames = 0
            self.speech_frames += 1
        else:
            self.silence_frames += 1

        should_flush = (
            self.silence_frames >= self.end_silence_frames
            or self.segment_frames >= self.max_segment_frames
        )
        if not should_flush:
            return None

        return self._flush_active()

    def flush(self) -> bytes | None:
        if not self.active:
            return None
        return self._flush_active()

    def _flush_active(self) -> bytes | None:
        payload = bytes(self.segment_buffer)
        enough_speech = self.speech_frames >= self.min_speech_frames
        self.active = False
        self.silence_frames = 0
        self.segment_frames = 0
        self.speech_frames = 0
        self.segment_buffer.clear()
        self.pre_roll.clear()
        if enough_speech:
            return payload
        return None


class TranslationSession:
    def __init__(self, translator: WhisperTranslator, settings: Settings) -> None:
        self.translator = translator
        self.settings = settings
        self.segmenter = VadSegmenter(settings)
        self.input_queue: Queue[tuple[str, bytes | dict[str, str | None] | None]] = Queue()
        self.translation_queue: Queue[tuple[bytes, str, str] | None] = Queue()
        self.result_queue: Queue[dict[str, object] | None] = Queue()
        self.source_language = normalize_source_language(settings.source_language)
        self.target_language = normalize_target_language(settings.target_language)
        self._pcm_buffer = bytearray()
        self._stop_event = Event()
        self._thread = Thread(target=self._run, daemon=True)
        self._translation_thread = Thread(target=self._run_translation_worker, daemon=True)

    def start(self) -> None:
        self._thread.start()
        self._translation_thread.start()

    def push_audio(self, pcm_bytes: bytes) -> None:
        self.input_queue.put(("audio", pcm_bytes))

    def flush(self) -> None:
        self.input_queue.put(("flush", None))

    def set_languages(
        self,
        source_language: str | None = None,
        target_language: str | None = None,
    ) -> None:
        self.input_queue.put(
            (
                "language",
                {
                    "source_language": source_language,
                    "target_language": target_language,
                },
            )
        )

    def stop(self) -> None:
        if self._stop_event.is_set():
            return
        self._stop_event.set()
        self.input_queue.put(("stop", None))
        self._thread.join(timeout=5)
        self.translation_queue.put(None)
        self._translation_thread.join(timeout=5)
        self.result_queue.put(None)

    def _run(self) -> None:
        self.result_queue.put({"type": "status", "state": "warming_up"})
        try:
            self.translator.ensure_model()
            self.result_queue.put(
                {
                    "type": "ready",
                    "state": "ready",
                    "runtime": self.translator.describe(),
                }
            )
        except Exception as exc:
            self.result_queue.put({"type": "error", "message": str(exc)})
            return

        while True:
            kind, payload = self.input_queue.get()
            if kind == "audio" and payload:
                self._consume_audio(payload)
            elif kind == "flush":
                self._flush_partial_frame()
                flushed = self.segmenter.flush()
                if flushed:
                    self._queue_translation(flushed)
            elif kind == "language":
                self._set_languages(payload if isinstance(payload, dict) else {})
            elif kind == "stop":
                self._flush_partial_frame()
                flushed = self.segmenter.flush()
                if flushed:
                    self._queue_translation(flushed)
                break

    def _consume_audio(self, payload: bytes) -> None:
        self._pcm_buffer.extend(payload)
        frame_bytes = self.settings.frame_bytes
        while len(self._pcm_buffer) >= frame_bytes:
            frame = bytes(self._pcm_buffer[:frame_bytes])
            del self._pcm_buffer[:frame_bytes]
            utterance = self.segmenter.accept(frame)
            if utterance:
                self._queue_translation(utterance)

    def _flush_partial_frame(self) -> None:
        if not self._pcm_buffer:
            return
        frame_bytes = self.settings.frame_bytes
        padded = bytes(self._pcm_buffer).ljust(frame_bytes, b"\x00")
        self._pcm_buffer.clear()
        utterance = self.segmenter.accept(padded)
        if utterance:
            self._queue_translation(utterance)

    def _queue_translation(self, utterance: bytes) -> None:
        self.translation_queue.put(
            (utterance, self.source_language, self.target_language)
        )

    def _run_translation_worker(self) -> None:
        while True:
            job = self.translation_queue.get()
            if job is None:
                return
            utterance, source_language, target_language = job
            self._translate_segment(utterance, source_language, target_language)

    def _translate_segment(
        self,
        utterance: bytes,
        source_language: str,
        target_language: str,
    ) -> None:
        self.result_queue.put({"type": "status", "state": "translating"})
        try:
            result = self.translator.translate_pcm16(
                utterance,
                self.settings.sample_rate,
                source_language=source_language,
                target_language=target_language,
            )
            if result.translated_text:
                self.result_queue.put(
                    {
                        "type": "translation",
                        "translated_text": result.translated_text,
                        "english_text": result.translated_text,
                        "source_text": result.source_text,
                        "source_language": source_language,
                        "target_language": result.target_language,
                        "audio_seconds": round(result.audio_seconds, 2),
                        "latency_seconds": round(result.latency_seconds, 2),
                        "created_at": dt.datetime.now().strftime("%H:%M:%S"),
                    }
                )
        except NoSpeechDetectedError as exc:
            self.result_queue.put(
                {
                    "type": "status",
                    "state": "listening",
                    "message": str(exc),
                }
            )
        except Exception as exc:
            self.result_queue.put({"type": "error", "message": str(exc)})
        finally:
            self.result_queue.put({"type": "status", "state": "listening"})

    def _set_languages(self, payload: dict[str, str | None]) -> None:
        self.source_language = normalize_source_language(
            payload.get("source_language"),
            self.settings.source_language,
        )
        self.target_language = normalize_target_language(
            payload.get("target_language"),
            self.settings.target_language,
        )
        self.result_queue.put(
            {
                "type": "language",
                "source_language": self.source_language,
                "target_language": self.target_language,
            }
        )
