from __future__ import annotations

import datetime
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .local_ru_en_translator import get_local_ru_en_translator

try:
    import joblib
    import numpy as np
    import pandas as pd
except Exception:  # pragma: no cover - dependency availability varies by env
    joblib = None
    np = None
    pd = None


@dataclass(frozen=True)
class TaskDurationEstimate:
    task_id: int
    hours: float
    days: float
    label: str


class DurationEstimator:
    KEYWORDS_ERROR = ["error", "fail", "crash", "exception", "broken", "bug"]
    KEYWORDS_UI = ["button", "menu", "dialog", "ui", "display", "screen", "popup"]
    KEYWORDS_PERF = ["slow", "performance", "lag", "timeout", "hang", "freeze"]

    def __init__(
        self,
        model_path: Path | None = None,
        meta_path: Path | None = None,
    ):
        base_dir = Path(__file__).resolve().parents[2] / "ml files"
        self.model_path = model_path or (base_dir / "duration_model.pkl")
        self.meta_path = meta_path or (base_dir / "model_meta.json")

        self.model = None
        self.feature_cols: list[str] = []
        self.priority_map: dict[str, int] = {}
        self.priority_median: dict[float, float] = {}
        self.available = False
        self.translator = get_local_ru_en_translator()

        self._load()

    def _load(self) -> None:
        if joblib is None or np is None or pd is None:
            return

        if not self.model_path.exists() or not self.meta_path.exists():
            return

        try:
            self.model = joblib.load(self.model_path)
            with self.meta_path.open(encoding="utf-8") as meta_file:
                meta = json.load(meta_file)
            self.feature_cols = meta["feature_cols"]
            self.priority_map = meta["priority_map"]
            self.priority_median = {float(key): value for key, value in meta["priority_median_dur"].items()}
            self.available = True
        except Exception:
            self.available = False

    def _build_features(
        self,
        summary: str,
        issue_type: str,
        priority: str,
        created_at: datetime.datetime | None,
    ):
        if created_at is None:
            created_at = datetime.datetime.now()

        safe_summary = summary or ""
        priority_ord = self.priority_map.get(priority, 3)
        priority_median = self.priority_median.get(float(priority_ord), 631.4)

        hour = created_at.hour
        day_of_week = created_at.weekday()
        summary_lc = safe_summary.lower()

        feat = {
            "priority_ord": priority_ord,
            "priority_median_dur": priority_median,
            "hour_sin": np.sin(2 * np.pi * hour / 24),
            "hour_cos": np.cos(2 * np.pi * hour / 24),
            "dow_sin": np.sin(2 * np.pi * day_of_week / 7),
            "dow_cos": np.cos(2 * np.pi * day_of_week / 7),
            "is_weekend": int(day_of_week >= 5),
            "is_business_hours": int(9 <= hour <= 18),
            "summary_len": len(safe_summary),
            "summary_word_count": len(safe_summary.split()),
            "summary_has_error": int(any(key in summary_lc for key in self.KEYWORDS_ERROR)),
            "summary_has_ui": int(any(key in summary_lc for key in self.KEYWORDS_UI)),
            "summary_has_perf": int(any(key in summary_lc for key in self.KEYWORDS_PERF)),
            "type_Bug": int(issue_type == "Bug"),
            "type_Suggestion": int(issue_type == "Suggestion"),
        }
        return pd.DataFrame([feat])[self.feature_cols]

    def predict(
        self,
        task_id: int,
        summary: str,
        issue_type: str,
        priority: str,
        created_at: datetime.datetime | None = None,
    ) -> TaskDurationEstimate | None:
        if not self.available or self.model is None:
            return None

        try:
            summary_for_model = self.translator.translate_to_english(summary)
            if summary_for_model is None:
                # Translation is required (Cyrillic input) but unavailable.
                return None

            features = self._build_features(summary_for_model, issue_type, priority, created_at)
            log_prediction = self.model.predict(features)[0]
            hours = max(0.0, float(np.expm1(log_prediction)))
            days = hours / 24

            if days < 1:
                label = f"~{hours:.0f} часов"
            elif days < 7:
                label = f"~{days:.1f} дней"
            elif days < 30:
                label = f"~{days / 7:.1f} недель"
            else:
                label = f"~{days / 30:.1f} месяцев"

            return TaskDurationEstimate(
                task_id=task_id,
                hours=round(hours, 1),
                days=round(days, 1),
                label=label,
            )
        except Exception:
            return None


@lru_cache(maxsize=1)
def get_duration_estimator() -> DurationEstimator:
    return DurationEstimator()
