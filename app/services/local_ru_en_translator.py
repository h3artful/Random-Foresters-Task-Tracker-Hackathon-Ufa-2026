from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path


class LocalRuEnTranslator:
    """Local translator wrapper for ru->en using Argos Translate."""

    CYRILLIC_PATTERN = re.compile(r"[А-Яа-яЁё]")

    def __init__(self, package_path: Path | None = None, cache_size: int = 512):
        self._configure_argos_paths()
        self.minisbd_cache_dir = Path(os.environ["XDG_CACHE_HOME"]) / "minisbd"
        self.minisbd_cache_dir.mkdir(parents=True, exist_ok=True)

        env_package_path = os.getenv("ARGOS_RU_EN_PACKAGE_PATH", "").strip()
        self.package_path = package_path or (Path(env_package_path) if env_package_path else None)
        self.cache_size = max(16, cache_size)

        self._cache: dict[str, str] = {}
        self._init_attempted = False
        self._translation = None

        self.available = False
        self.error_reason: str | None = None

    @staticmethod
    def _configure_argos_paths() -> None:
        project_root = Path(__file__).resolve().parents[2]
        argos_root = project_root / ".argos"
        data_home = argos_root / "data"
        cache_home = argos_root / "cache"
        config_home = argos_root / "config"

        data_home.mkdir(parents=True, exist_ok=True)
        cache_home.mkdir(parents=True, exist_ok=True)
        config_home.mkdir(parents=True, exist_ok=True)

        os.environ.setdefault("XDG_DATA_HOME", str(data_home))
        os.environ.setdefault("XDG_CACHE_HOME", str(cache_home))
        os.environ.setdefault("XDG_CONFIG_HOME", str(config_home))
        os.environ.setdefault("ARGOS_PACKAGES_DIR", str(data_home / "argos-translate" / "packages"))
        # Avoid Stanza runtime downloads; use fully local sentence splitting.
        os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")

    def _set_error(self, reason: str) -> None:
        self.available = False
        self.error_reason = reason

    def _ensure_ready(self) -> None:
        if self._init_attempted:
            return
        self._init_attempted = True

        try:
            import argostranslate.package as argos_package
            import argostranslate.translate as argos_translate
        except Exception as exc:  # pragma: no cover - optional dependency
            self._set_error(f"argostranslate import failed: {exc}")
            return

        try:
            import minisbd.models as minisbd_models

            minisbd_models.cache_dir = str(self.minisbd_cache_dir)
            minisbd_models.get_model_file("ru")
        except Exception as exc:
            self._set_error(f"minisbd ru model is unavailable: {exc}")
            return

        if self.package_path is not None and self.package_path.exists():
            try:
                argos_package.install_from_path(str(self.package_path))
            except Exception:
                # If package already installed or installation failed, keep going.
                pass

        try:
            languages = argos_translate.get_installed_languages()
        except Exception as exc:
            self._set_error(f"unable to read installed Argos languages: {exc}")
            return

        from_lang = next((lang for lang in languages if lang.code == "ru"), None)
        to_lang = next((lang for lang in languages if lang.code == "en"), None)
        if from_lang is None or to_lang is None:
            self._set_error("Argos ru->en model is not installed")
            return

        try:
            self._translation = from_lang.get_translation(to_lang)
        except Exception as exc:
            self._set_error(f"unable to initialize ru->en translation: {exc}")
            return

        self.available = self._translation is not None
        if not self.available:
            self._set_error("ru->en translation object is unavailable")

    @classmethod
    def contains_cyrillic(cls, text: str) -> bool:
        return bool(cls.CYRILLIC_PATTERN.search(text))

    def _read_cache(self, text: str) -> str | None:
        return self._cache.get(text)

    def _write_cache(self, text: str, translated: str) -> None:
        if len(self._cache) >= self.cache_size:
            self._cache.pop(next(iter(self._cache)))
        self._cache[text] = translated

    def translate_to_english(self, text: str) -> str | None:
        normalized = (text or "").strip()
        if not normalized:
            return ""

        if not self.contains_cyrillic(normalized):
            return normalized

        cached = self._read_cache(normalized)
        if cached is not None:
            return cached

        self._ensure_ready()
        if not self.available or self._translation is None:
            return None

        try:
            translated = (self._translation.translate(normalized) or "").strip()
        except Exception:
            return None

        if not translated:
            return None

        self._write_cache(normalized, translated)
        return translated


@lru_cache(maxsize=1)
def get_local_ru_en_translator() -> LocalRuEnTranslator:
    return LocalRuEnTranslator()
