from __future__ import annotations

from threading import Lock

from .config import Settings
from .languages import NLLB_LANGUAGE_CODES, normalize_target_language


class TextTranslationUnavailableError(RuntimeError):
    pass


class TextTranslator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = Lock()
        self._tokenizer = None
        self._model = None
        self._torch = None
        self._device = "cpu"

    def describe(self) -> dict[str, object]:
        return {
            "enabled": self.settings.enable_text_translation,
            "model": self.settings.text_translation_model,
            "device": self._device if self._model is not None else self.settings.text_translation_device,
            "ready": self._model is not None,
            "pivot_language": "en",
        }

    def translate_from_english(self, text: str, target_language: str) -> str:
        target = normalize_target_language(target_language)
        if target == "en" or not text.strip():
            return text

        if not self.settings.enable_text_translation:
            raise TextTranslationUnavailableError(
                "This backend can translate speech directly to English. "
                "For non-English targets, install optional text translation dependencies "
                "and set ENABLE_TEXT_TRANSLATION=true."
            )

        if target not in NLLB_LANGUAGE_CODES:
            raise TextTranslationUnavailableError(
                f"Target language '{target}' is not mapped for the local text translator."
            )

        tokenizer, model, torch_module = self._ensure_model()
        tokenizer.src_lang = NLLB_LANGUAGE_CODES["en"]
        encoded = tokenizer(text, return_tensors="pt", truncation=True)
        encoded = {key: value.to(self._device) for key, value in encoded.items()}
        target_token_id = tokenizer.convert_tokens_to_ids(NLLB_LANGUAGE_CODES[target])

        with torch_module.no_grad():
            generated = model.generate(
                **encoded,
                forced_bos_token_id=target_token_id,
                max_new_tokens=256,
            )

        return tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()

    def _ensure_model(self):
        if self._model is not None and self._tokenizer is not None and self._torch is not None:
            return self._tokenizer, self._model, self._torch

        with self._lock:
            if self._model is not None and self._tokenizer is not None and self._torch is not None:
                return self._tokenizer, self._model, self._torch

            try:
                import torch
                from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            except ImportError as exc:
                raise TextTranslationUnavailableError(
                    "Optional text translation packages are not installed. "
                    "Install requirements-text-translation.txt, then restart the backend."
                ) from exc

            self._device = self._resolve_device(torch)
            self._tokenizer = AutoTokenizer.from_pretrained(self.settings.text_translation_model)
            self._model = AutoModelForSeq2SeqLM.from_pretrained(self.settings.text_translation_model)
            self._model.to(self._device)
            self._model.eval()
            self._torch = torch

        return self._tokenizer, self._model, self._torch

    def _resolve_device(self, torch_module) -> str:
        if self.settings.text_translation_device != "auto":
            return self.settings.text_translation_device
        return "cuda" if torch_module.cuda.is_available() else "cpu"
