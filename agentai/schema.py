from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


TABLES: dict[str, dict[str, str]] = {
    "users": {
        "select": ",".join(
            [
                "id",
                "name",
                "email",
                "role",
                "phone",
                "avatar_url",
                "created_at",
                "updated_at",
            ]
        ),
        "order": "name.asc",
    },
    "cases": {
        "select": ",".join(
            [
                "id",
                "client_name",
                "agent_id",
                "product_type",
                "premium",
                "anp_estimate",
                "status",
                "missing_documents",
                "submitted_date",
                "follow_up_date",
                "priority",
                "remarks",
                "created_at",
                "updated_at",
                "created_by",
            ]
        ),
        "order": "updated_at.desc",
    },
    "claims": {
        "select": ",".join(
            [
                "id",
                "client_name",
                "claim_type",
                "assigned_admin_id",
                "status",
                "missing_documents",
                "submission_date",
                "remarks",
                "created_at",
                "updated_at",
            ]
        ),
        "order": "updated_at.desc",
    },
    "tasks": {
        "select": ",".join(
            [
                "id",
                "title",
                "description",
                "assigned_to",
                "board_date",
                "carry_source_id",
                "carry_source_date",
                "due_date",
                "priority",
                "status",
                "related_case_id",
                "related_claim_id",
                "created_at",
                "updated_at",
                "created_by",
            ]
        ),
        "order": "due_date.asc",
    },
}

TASK_PRIORITIES = {"Low", "Medium", "High", "Urgent"}
TASK_STATUSES = {"To Do", "In Progress", "Waiting", "Completed", "Overdue"}
NULLABLE_TASK_FIELDS = {
    "description",
    "carry_source_id",
    "carry_source_date",
    "related_case_id",
    "related_claim_id",
}
TABLE_SEARCH_FIELDS: dict[str, tuple[str, ...]] = {
    "users": ("id", "name", "email", "role", "phone"),
    "cases": (
        "id",
        "client_name",
        "agent_id",
        "product_type",
        "status",
        "priority",
        "remarks",
        "created_by",
    ),
    "claims": (
        "id",
        "client_name",
        "claim_type",
        "assigned_admin_id",
        "status",
        "remarks",
    ),
    "tasks": (
        "id",
        "title",
        "description",
        "assigned_to",
        "priority",
        "status",
        "related_case_id",
        "related_claim_id",
        "created_by",
        "carry_source_id",
    ),
}
TABLE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "users": (
        "user",
        "users",
        "agent",
        "agents",
        "admin",
        "admins",
        "assignee",
        "assigned to",
        "creator",
        "manager",
        "email",
        "phone",
    ),
    "cases": (
        "case",
        "cases",
        "policy",
        "policies",
        "premium",
        "underwriting",
        "payment",
        "client",
        "clients",
        "follow-up",
        "follow up",
        "submitted",
        "issued",
        "product",
    ),
    "claims": (
        "claim",
        "claims",
        "hospitalization",
        "death",
        "appeal",
        "appealed",
        "insurer",
        "submission",
        "documents",
    ),
    "tasks": (
        "task",
        "tasks",
        "todo",
        "to do",
        "kanban",
        "board",
        "due",
        "overdue",
        "completed",
        "waiting",
        "reschedule",
        "assign",
        "move",
        "mark",
    ),
}
BROAD_CONTEXT_KEYWORDS = (
    "ops",
    "operations",
    "report",
    "summary",
    "overview",
    "dashboard",
    "bottleneck",
    "workload",
    "production",
    "today",
    "daily",
    "week",
)


class ChatHistoryItem(TypedDict):
    role: Literal["user", "assistant"]
    text: str


class AgentState(TypedDict, total=False):
    question: str
    history: list[ChatHistoryItem]
    limit: int
    selected_tables: list[str]
    database: dict[str, list[dict[str, Any]]]
    messages: Annotated[list[BaseMessage], add_messages]
    answer: str
