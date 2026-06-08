from __future__ import annotations

from .schema import AgentState, BROAD_CONTEXT_KEYWORDS, TABLE_KEYWORDS, TABLES
from .supabase import SupabaseRestClient, SupabaseRestConfig
from .utils import clamp_limit, contains_any, normalize_selected_tables


def select_context_tables(state: AgentState) -> AgentState:
    """Choose which tables to preload before the main agent runs."""
    history_text = " ".join(
        item.get("text", "")
        for item in state.get("history", [])
        if isinstance(item, dict)
    )
    text = f"{history_text} {state.get('question', '')}".lower()
    selected = {
        table
        for table, keywords in TABLE_KEYWORDS.items()
        if contains_any(text, keywords)
    }

    if contains_any(text, BROAD_CONTEXT_KEYWORDS):
        selected.update(TABLES)

    if "overdue" in text and not selected:
        selected.update({"cases", "tasks"})

    if not selected:
        selected.update(TABLES)

    return {"selected_tables": [table for table in TABLES if table in selected]}


def load_database_context(state: AgentState) -> AgentState:
    """Load selected read-only Supabase tables into the graph state."""
    limit = clamp_limit(state.get("limit", 25))
    selected_tables = normalize_selected_tables(state.get("selected_tables"))
    client = SupabaseRestClient(SupabaseRestConfig.from_env())
    return {
        "database": client.fetch_database_snapshot(
            tables=selected_tables,
            limit=limit,
        )
    }
