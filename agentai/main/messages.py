from __future__ import annotations

import json
from datetime import date
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from ..schema import AgentState, ChatHistoryItem
from ..utils import normalize_selected_tables


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text" and isinstance(block.get("text"), str):
                    text_parts.append(block["text"])
            elif isinstance(getattr(block, "type", None), str):
                if block.type == "text" and isinstance(getattr(block, "text", None), str):
                    text_parts.append(block.text)

        return "\n".join(text_parts)

    return json.dumps(content, ensure_ascii=False)


def normalize_history(history: Any) -> list[ChatHistoryItem]:
    if not isinstance(history, list):
        return []

    normalized: list[ChatHistoryItem] = []
    for item in history:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        text = item.get("text")
        if role not in ("user", "assistant") or not isinstance(text, str):
            continue

        text = text.strip()
        if text:
            normalized.append({"role": role, "text": text})

    return normalized


def prepare_agent_messages(state: AgentState) -> AgentState:
    """Build the initial grounded conversation for the tool-calling agent."""
    question = state.get("question", "")
    history = normalize_history(state.get("history", []))
    database = state.get("database", {})
    selected_tables = normalize_selected_tables(state.get("selected_tables"))

    database_json = json.dumps(database, indent=2, default=str)
    messages: list[BaseMessage] = [
        SystemMessage(
            content=(
                "You are the Agency Hub operations assistant. Answer questions "
                "using Agency Hub database data as the source of truth. The "
                "tables are users, cases, claims, and tasks. An initial limited "
                "snapshot is provided only for selected tables. You also have "
                "read tools for every table: list, get by exact ID, and search. "
                "Use those read tools when the selected snapshot is missing a "
                "needed table, when you need an exact row, or when the answer "
                "depends on rows outside the limited snapshot. Use users to "
                "resolve agent, admin, creator, and assignee IDs to names when "
                "names matter. Cite record IDs when useful. You may change the "
                "tasks table only by calling the change_task_database tool. Use "
                "that tool when the user clearly asks to create, update, delete, "
                "mark, move, assign, or reschedule a task. Do not change users, "
                "cases, or claims. Before calling the write tool, resolve task "
                "IDs and user IDs from the snapshot or read tools. If the "
                "requested change is ambiguous or missing a required field, ask "
                "a concise clarification instead of changing data. After a tool "
                "call, summarize exactly what changed and include the affected "
                "task ID. Use the conversation history only to understand "
                "references and follow-up questions; do not treat it as database "
                "truth. Today's date is "
                f"{date.today().isoformat()}."
            )
        ),
    ]

    for item in history:
        if item["role"] == "user":
            messages.append(HumanMessage(content=item["text"]))
        else:
            messages.append(AIMessage(content=item["text"]))

    messages.append(
        HumanMessage(
            content=(
                f"Question: {question}\n\n"
                "Selected initial tables: "
                f"{', '.join(selected_tables)}\n\n"
                "Initial database snapshot:\n"
                f"```json\n{database_json}\n```"
            )
        )
    )
    return {"messages": messages}
