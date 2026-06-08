from __future__ import annotations

import json
from datetime import date
from typing import Any

from .schema import TABLES


def clamp_limit(value: Any, *, default: int = 25, maximum: int = 100) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, maximum))


def normalize_selected_tables(tables: Any) -> list[str]:
    if not isinstance(tables, list):
        return list(TABLES)

    normalized: list[str] = []
    for table in tables:
        if isinstance(table, str) and table in TABLES and table not in normalized:
            normalized.append(table)
    return normalized or list(TABLES)


def contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def tool_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def required_text(value: str | None, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required.")
    return value.strip()


def optional_text(value: str | None, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    text = value.strip()
    return text or None


def date_key(value: str | None, field: str, *, required: bool = False) -> str | None:
    text = optional_text(value, field)
    if text is None:
        if required:
            raise ValueError(f"{field} is required.")
        return None
    if len(text) != 10 or text[4] != "-" or text[7] != "-":
        raise ValueError(f"{field} must use YYYY-MM-DD.")
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError as exc:
        raise ValueError(f"{field} must be a valid YYYY-MM-DD date.") from exc
