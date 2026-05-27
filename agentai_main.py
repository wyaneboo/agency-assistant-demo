from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Any, Literal, TypedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_core.tracers.langchain import wait_for_all_tracers
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field


load_dotenv()
os.environ.setdefault("LANGCHAIN_CALLBACKS_BACKGROUND", "false")

DEFAULT_MODEL = "gemma-4-31b-it"

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


@dataclass(frozen=True)
class SupabaseRestConfig:
    url: str
    api_key: str
    authorization_token: str | None
    auth_mode: str

    @classmethod
    def from_env(cls) -> "SupabaseRestConfig":
        load_dotenv()

        url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
        secret_key = os.getenv("SUPABASE_SECRET_KEY")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        publishable_key = (
            os.getenv("SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
        )
        user_access_token = (
            os.getenv("SUPABASE_ACCESS_TOKEN")
            or os.getenv("SUPABASE_AUTH_TOKEN")
            or os.getenv("SUPABASE_JWT")
        )
        auth_email = os.getenv("SUPABASE_AUTH_EMAIL") or os.getenv("SUPABASE_USER_EMAIL")
        auth_password = os.getenv("SUPABASE_AUTH_PASSWORD") or os.getenv(
            "SUPABASE_USER_PASSWORD"
        )

        if not url:
            raise RuntimeError("Missing SUPABASE_URL in .env.")

        url = url.rstrip("/")

        if secret_key:
            return cls(
                url=url,
                api_key=secret_key,
                authorization_token=None,
                auth_mode="secret_key",
            )

        if service_role_key:
            return cls(
                url=url,
                api_key=service_role_key,
                authorization_token=(
                    None
                    if service_role_key.startswith("sb_secret_")
                    else service_role_key
                ),
                auth_mode="service_role_key",
            )

        if not publishable_key:
            raise RuntimeError(
                "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY for this "
                "server-side script, or set SUPABASE_PUBLISHABLE_KEY plus "
                "SUPABASE_ACCESS_TOKEN."
            )

        if user_access_token:
            return cls(
                url=url,
                api_key=publishable_key,
                authorization_token=user_access_token,
                auth_mode="user_access_token",
            )

        if auth_email and auth_password:
            return cls(
                url=url,
                api_key=publishable_key,
                authorization_token=cls.fetch_password_access_token(
                    url=url,
                    api_key=publishable_key,
                    email=auth_email,
                    password=auth_password,
                ),
                auth_mode="password",
            )

        raise RuntimeError(
            "Supabase access requires an authenticated credential. The configured "
            "cases, claims, and tasks tables use RLS policies for the authenticated "
            "role, so SUPABASE_PUBLISHABLE_KEY alone reads as anon and can return "
            "empty arrays. Set one of: SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, "
            "SUPABASE_ACCESS_TOKEN, or SUPABASE_AUTH_EMAIL plus SUPABASE_AUTH_PASSWORD."
        )

    @staticmethod
    def fetch_password_access_token(
        *, url: str, api_key: str, email: str, password: str
    ) -> str:
        request = Request(
            f"{url}/auth/v1/token?grant_type=password",
            data=json.dumps({"email": email, "password": password}).encode("utf-8"),
            headers={
                "apikey": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=20) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                "Supabase password sign-in failed for SUPABASE_AUTH_EMAIL: "
                f"HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Supabase Auth: {exc.reason}") from exc

        data = json.loads(payload)
        access_token = data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise RuntimeError("Supabase Auth did not return an access_token.")
        return access_token


class SupabaseRestClient:
    def __init__(self, config: SupabaseRestConfig) -> None:
        self.config = config

    def fetch_table(self, table: str, *, limit: int) -> list[dict[str, Any]]:
        table_config = TABLES[table]
        query = urlencode(
            {
                "select": table_config["select"],
                "order": table_config["order"],
                "limit": str(limit),
            }
        )
        data = self._request_json("GET", f"/rest/v1/{table}?{query}")
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase response for {table}: {data}")
        return data

    def get_record(self, table: str, record_id: str) -> dict[str, Any] | None:
        table_config = TABLES[table]
        query = urlencode(
            {
                "select": table_config["select"],
                "id": f"eq.{record_id}",
                "limit": "1",
            }
        )
        data = self._request_json("GET", f"/rest/v1/{table}?{query}")
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase response for {table}: {data}")
        if not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise RuntimeError(f"Unexpected Supabase row for {table}: {row}")
        return row

    def search_table(
        self, table: str, *, query_text: str, limit: int
    ) -> list[dict[str, Any]]:
        table_config = TABLES[table]
        search_term = self._search_term(query_text)
        filters = ",".join(
            f"{field}.ilike.*{search_term}*" for field in TABLE_SEARCH_FIELDS[table]
        )
        query = urlencode(
            {
                "select": table_config["select"],
                "or": f"({filters})",
                "order": table_config["order"],
                "limit": str(limit),
            }
        )
        data = self._request_json("GET", f"/rest/v1/{table}?{query}")
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase response for {table}: {data}")
        return data

    def insert_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = urlencode({"select": TABLES["tasks"]["select"]})
        data = self._request_json(
            "POST",
            f"/rest/v1/tasks?{query}",
            body=payload,
            prefer="return=representation",
        )
        return self._single_task_response(data, "create")

    def update_task(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        query = urlencode(
            {
                "id": f"eq.{task_id}",
                "select": TABLES["tasks"]["select"],
            }
        )
        data = self._request_json(
            "PATCH",
            f"/rest/v1/tasks?{query}",
            body=payload,
            prefer="return=representation",
        )
        return self._single_task_response(data, "update")

    def delete_task(self, task_id: str) -> dict[str, Any]:
        query = urlencode(
            {
                "id": f"eq.{task_id}",
                "select": TABLES["tasks"]["select"],
            }
        )
        data = self._request_json(
            "DELETE",
            f"/rest/v1/tasks?{query}",
            prefer="return=representation",
        )
        return self._single_task_response(data, "delete")

    def _headers(self) -> dict[str, str]:
        headers = {
            "apikey": self.config.api_key,
            "Accept": "application/json",
        }
        if self.config.authorization_token:
            headers["Authorization"] = f"Bearer {self.config.authorization_token}"
        return headers

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = self._headers()
        request_body = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            request_body = json.dumps(body, default=str).encode("utf-8")
        if prefer:
            headers["Prefer"] = prefer

        request = Request(
            f"{self.config.url}{path}",
            data=request_body,
            headers=headers,
            method=method,
        )

        try:
            with urlopen(request, timeout=20) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            endpoint = path.split("?", 1)[0]
            raise RuntimeError(
                f"Supabase rejected {method} {endpoint} with HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Supabase: {exc.reason}") from exc

        if not payload:
            return None
        return json.loads(payload)

    @staticmethod
    def _single_task_response(data: Any, action: str) -> dict[str, Any]:
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase task {action} response: {data}")
        if not data:
            raise RuntimeError(f"No task row was returned for {action}.")
        row = data[0]
        if not isinstance(row, dict):
            raise RuntimeError(f"Unexpected Supabase task row: {row}")
        return row

    def fetch_database_snapshot(
        self, *, tables: list[str], limit: int
    ) -> dict[str, list[dict[str, Any]]]:
        return {
            table: self.fetch_table(table, limit=100 if table == "users" else limit)
            for table in tables
        }

    @staticmethod
    def _search_term(query_text: str) -> str:
        if not isinstance(query_text, str) or not query_text.strip():
            raise ValueError("query is required.")

        # PostgREST OR filters use comma and parenthesis delimiters.
        term = "".join(
            character for character in query_text.strip()[:80] if character not in ",()"
        ).strip()
        if not term:
            raise ValueError("query must contain searchable text.")
        return term


def _clamp_limit(value: Any, *, default: int = 25, maximum: int = 100) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, maximum))


def _normalize_selected_tables(tables: Any) -> list[str]:
    if not isinstance(tables, list):
        return list(TABLES)

    normalized: list[str] = []
    for table in tables:
        if isinstance(table, str) and table in TABLES and table not in normalized:
            normalized.append(table)
    return normalized or list(TABLES)


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


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
        if _contains_any(text, keywords)
    }

    if _contains_any(text, BROAD_CONTEXT_KEYWORDS):
        selected.update(TABLES)

    if "overdue" in text and not selected:
        selected.update({"cases", "tasks"})

    if not selected:
        selected.update(TABLES)

    return {"selected_tables": [table for table in TABLES if table in selected]}


def load_database_context(state: AgentState) -> AgentState:
    """LangGraph node that loads selected read-only Supabase tables into state.

    Reads the requested row limit from the incoming state and fetches only
    the tables chosen by `select_context_tables`.
    """
    limit = _clamp_limit(state.get("limit", 25))
    selected_tables = _normalize_selected_tables(state.get("selected_tables"))
    client = SupabaseRestClient(SupabaseRestConfig.from_env())
    return {
        "database": client.fetch_database_snapshot(
            tables=selected_tables,
            limit=limit,
        )
    }


class TaskDatabaseChangeInput(BaseModel):
    action: Literal["create", "update", "delete"] = Field(
        description="Task database operation to perform."
    )
    task_id: str | None = Field(
        default=None,
        description=(
            "Required for update/delete. Optional for create only when the task "
            "must use a specific existing ID format such as T-123."
        ),
    )
    title: str | None = Field(default=None, description="Task title.")
    description: str | None = Field(default=None, description="Optional task detail.")
    assigned_to: str | None = Field(
        default=None,
        description="Assignee user ID from the users table, for example u3.",
    )
    board_date: str | None = Field(
        default=None,
        description="Kanban board date as YYYY-MM-DD. Defaults to today's date on create.",
    )
    due_date: str | None = Field(default=None, description="Task due date as YYYY-MM-DD.")
    priority: str | None = Field(
        default=None,
        description="One of: Low, Medium, High, Urgent. Defaults to Medium on create.",
    )
    status: str | None = Field(
        default=None,
        description=(
            "One of: To Do, In Progress, Waiting, Completed, Overdue. "
            "Defaults to To Do on create."
        ),
    )
    related_case_id: str | None = Field(
        default=None,
        description="Optional related case ID, for example C-1001.",
    )
    related_claim_id: str | None = Field(
        default=None,
        description="Optional related claim ID, for example CL-2.",
    )
    carry_source_id: str | None = Field(
        default=None,
        description="Optional source task ID for carried tasks.",
    )
    carry_source_date: str | None = Field(
        default=None,
        description="Optional carried-from board date as YYYY-MM-DD.",
    )
    created_by: str | None = Field(
        default=None,
        description="Creator user ID. Defaults to assigned_to on create.",
    )
    clear_fields: list[str] | None = Field(
        default=None,
        description=(
            "Nullable task fields to clear on update. Allowed: description, "
            "carry_source_id, carry_source_date, related_case_id, related_claim_id."
        ),
    )


class ListRowsInput(BaseModel):
    limit: int | None = Field(
        default=25,
        description="Maximum rows to return, capped at 100.",
    )


class GetRecordInput(BaseModel):
    record_id: str = Field(description="Exact row ID to fetch.")


class SearchRowsInput(BaseModel):
    query: str = Field(description="Text to search for in the table.")
    limit: int | None = Field(
        default=10,
        description="Maximum matching rows to return, capped at 50.",
    )


def _tool_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def _required_text(value: str | None, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required.")
    return value.strip()


def _optional_text(value: str | None, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    text = value.strip()
    return text or None


def _date_key(value: str | None, field: str, *, required: bool = False) -> str | None:
    text = _optional_text(value, field)
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


def _list_table_rows(table: str, *, limit: int | None) -> str:
    try:
        row_limit = _clamp_limit(limit, default=25, maximum=100)
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        records = client.fetch_table(table, limit=row_limit)
        return _tool_json(
            {
                "ok": True,
                "table": table,
                "count": len(records),
                "limit": row_limit,
                "records": records,
            }
        )
    except Exception as exc:
        return _tool_json({"ok": False, "table": table, "error": str(exc)})


def _get_table_record(table: str, *, record_id: str) -> str:
    try:
        row_id = _required_text(record_id, "record_id")
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        record = client.get_record(table, row_id)
        if record is None:
            return _tool_json(
                {
                    "ok": False,
                    "table": table,
                    "record_id": row_id,
                    "error": f"No {table} row found for id {row_id}.",
                }
            )
        return _tool_json(
            {"ok": True, "table": table, "record_id": row_id, "record": record}
        )
    except Exception as exc:
        return _tool_json({"ok": False, "table": table, "error": str(exc)})


def _search_table_rows(table: str, *, query: str, limit: int | None) -> str:
    try:
        search_query = _required_text(query, "query")
        row_limit = _clamp_limit(limit, default=10, maximum=50)
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        records = client.search_table(table, query_text=search_query, limit=row_limit)
        return _tool_json(
            {
                "ok": True,
                "table": table,
                "query": search_query,
                "count": len(records),
                "limit": row_limit,
                "records": records,
            }
        )
    except Exception as exc:
        return _tool_json({"ok": False, "table": table, "query": query, "error": str(exc)})


@tool("list_users", args_schema=ListRowsInput)
def list_users(limit: int | None = 25) -> str:
    """List rows from the users table."""
    return _list_table_rows("users", limit=limit)


@tool("get_user", args_schema=GetRecordInput)
def get_user(record_id: str) -> str:
    """Get one user by exact users.id."""
    return _get_table_record("users", record_id=record_id)


@tool("search_users", args_schema=SearchRowsInput)
def search_users(query: str, limit: int | None = 10) -> str:
    """Search users by ID, name, email, role, or phone."""
    return _search_table_rows("users", query=query, limit=limit)


@tool("list_cases", args_schema=ListRowsInput)
def list_cases(limit: int | None = 25) -> str:
    """List rows from the cases table."""
    return _list_table_rows("cases", limit=limit)


@tool("get_case", args_schema=GetRecordInput)
def get_case(record_id: str) -> str:
    """Get one case by exact cases.id."""
    return _get_table_record("cases", record_id=record_id)


@tool("search_cases", args_schema=SearchRowsInput)
def search_cases(query: str, limit: int | None = 10) -> str:
    """Search cases by ID, client, agent ID, product, status, priority, or remarks."""
    return _search_table_rows("cases", query=query, limit=limit)


@tool("list_claims", args_schema=ListRowsInput)
def list_claims(limit: int | None = 25) -> str:
    """List rows from the claims table."""
    return _list_table_rows("claims", limit=limit)


@tool("get_claim", args_schema=GetRecordInput)
def get_claim(record_id: str) -> str:
    """Get one claim by exact claims.id."""
    return _get_table_record("claims", record_id=record_id)


@tool("search_claims", args_schema=SearchRowsInput)
def search_claims(query: str, limit: int | None = 10) -> str:
    """Search claims by ID, client, claim type, admin ID, status, or remarks."""
    return _search_table_rows("claims", query=query, limit=limit)


@tool("list_tasks", args_schema=ListRowsInput)
def list_tasks(limit: int | None = 25) -> str:
    """List rows from the tasks table."""
    return _list_table_rows("tasks", limit=limit)


@tool("get_task", args_schema=GetRecordInput)
def get_task(record_id: str) -> str:
    """Get one task by exact tasks.id."""
    return _get_table_record("tasks", record_id=record_id)


@tool("search_tasks", args_schema=SearchRowsInput)
def search_tasks(query: str, limit: int | None = 10) -> str:
    """Search tasks by ID, title, description, assignee ID, priority, status, or related IDs."""
    return _search_table_rows("tasks", query=query, limit=limit)


READ_DATABASE_TOOLS = [
    list_users,
    get_user,
    search_users,
    list_cases,
    get_case,
    search_cases,
    list_claims,
    get_claim,
    search_claims,
    list_tasks,
    get_task,
    search_tasks,
]


def _choice(value: str | None, field: str, allowed: set[str], default: str | None = None) -> str:
    selected = _optional_text(value, field) or default
    if selected not in allowed:
        allowed_text = ", ".join(sorted(allowed))
        raise ValueError(f"{field} must be one of: {allowed_text}.")
    return selected


def _build_task_create_payload(input_data: TaskDatabaseChangeInput) -> dict[str, Any]:
    assigned_to = _required_text(input_data.assigned_to, "assigned_to")
    payload: dict[str, Any] = {
        "title": _required_text(input_data.title, "title"),
        "assigned_to": assigned_to,
        "board_date": _date_key(input_data.board_date, "board_date")
        or date.today().isoformat(),
        "due_date": _date_key(input_data.due_date, "due_date", required=True),
        "priority": _choice(input_data.priority, "priority", TASK_PRIORITIES, "Medium"),
        "status": _choice(input_data.status, "status", TASK_STATUSES, "To Do"),
        "created_by": _optional_text(input_data.created_by, "created_by") or assigned_to,
    }

    task_id = _optional_text(input_data.task_id, "task_id")
    if task_id:
        payload["id"] = task_id

    optional_fields = {
        "description": _optional_text(input_data.description, "description"),
        "related_case_id": _optional_text(input_data.related_case_id, "related_case_id"),
        "related_claim_id": _optional_text(input_data.related_claim_id, "related_claim_id"),
        "carry_source_id": _optional_text(input_data.carry_source_id, "carry_source_id"),
        "carry_source_date": _date_key(input_data.carry_source_date, "carry_source_date"),
    }
    payload.update({key: value for key, value in optional_fields.items() if value is not None})
    return payload


def _build_task_update_payload(input_data: TaskDatabaseChangeInput) -> tuple[str, dict[str, Any]]:
    task_id = _required_text(input_data.task_id, "task_id")
    payload: dict[str, Any] = {}

    if input_data.title is not None:
        payload["title"] = _required_text(input_data.title, "title")
    if input_data.description is not None:
        payload["description"] = _optional_text(input_data.description, "description")
    if input_data.assigned_to is not None:
        payload["assigned_to"] = _required_text(input_data.assigned_to, "assigned_to")
    if input_data.board_date is not None:
        payload["board_date"] = _date_key(input_data.board_date, "board_date", required=True)
    if input_data.due_date is not None:
        payload["due_date"] = _date_key(input_data.due_date, "due_date", required=True)
    if input_data.priority is not None:
        payload["priority"] = _choice(input_data.priority, "priority", TASK_PRIORITIES)
    if input_data.status is not None:
        payload["status"] = _choice(input_data.status, "status", TASK_STATUSES)
    if input_data.related_case_id is not None:
        payload["related_case_id"] = _optional_text(
            input_data.related_case_id, "related_case_id"
        )
    if input_data.related_claim_id is not None:
        payload["related_claim_id"] = _optional_text(
            input_data.related_claim_id, "related_claim_id"
        )
    if input_data.carry_source_id is not None:
        payload["carry_source_id"] = _optional_text(
            input_data.carry_source_id, "carry_source_id"
        )
    if input_data.carry_source_date is not None:
        payload["carry_source_date"] = _date_key(
            input_data.carry_source_date, "carry_source_date", required=True
        )

    for field in input_data.clear_fields or []:
        if field not in NULLABLE_TASK_FIELDS:
            allowed = ", ".join(sorted(NULLABLE_TASK_FIELDS))
            raise ValueError(f"clear_fields can only include: {allowed}.")
        payload[field] = None

    if not payload:
        raise ValueError("At least one task field must be provided for update.")
    return task_id, payload


@tool("change_task_database", args_schema=TaskDatabaseChangeInput)
def change_task_database(
    action: Literal["create", "update", "delete"],
    task_id: str | None = None,
    title: str | None = None,
    description: str | None = None,
    assigned_to: str | None = None,
    board_date: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    related_case_id: str | None = None,
    related_claim_id: str | None = None,
    carry_source_id: str | None = None,
    carry_source_date: str | None = None,
    created_by: str | None = None,
    clear_fields: list[str] | None = None,
) -> str:
    """Create, update, or delete rows in the Agency Hub tasks table."""
    input_data = TaskDatabaseChangeInput(
        action=action,
        task_id=task_id,
        title=title,
        description=description,
        assigned_to=assigned_to,
        board_date=board_date,
        due_date=due_date,
        priority=priority,
        status=status,
        related_case_id=related_case_id,
        related_claim_id=related_claim_id,
        carry_source_id=carry_source_id,
        carry_source_date=carry_source_date,
        created_by=created_by,
        clear_fields=clear_fields,
    )

    try:
        if input_data.action == "create":
            payload = _build_task_create_payload(input_data)
            client = SupabaseRestClient(SupabaseRestConfig.from_env())
            task = client.insert_task(payload)
            return _tool_json({"ok": True, "action": "create", "task": task})

        if input_data.action == "update":
            update_task_id, payload = _build_task_update_payload(input_data)
            client = SupabaseRestClient(SupabaseRestConfig.from_env())
            task = client.update_task(update_task_id, payload)
            return _tool_json(
                {
                    "ok": True,
                    "action": "update",
                    "task": task,
                    "changed_fields": sorted(payload.keys()),
                }
            )

        delete_task_id = _required_text(input_data.task_id, "task_id")
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        task = client.delete_task(delete_task_id)
        return _tool_json({"ok": True, "action": "delete", "task": task})
    except Exception as exc:
        return _tool_json({"ok": False, "action": input_data.action, "error": str(exc)})


TASK_DATABASE_TOOLS = [change_task_database]
AGENT_TOOLS = READ_DATABASE_TOOLS + TASK_DATABASE_TOOLS


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
    question = state["question"]
    history = normalize_history(state.get("history", []))
    database = state["database"]
    selected_tables = _normalize_selected_tables(state.get("selected_tables"))

    database_json = json.dumps(database, indent=2, default=str)
    messages = [
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


def call_agent_model(state: AgentState) -> AgentState:
    """Ask Gemini for the next assistant message, allowing task tool calls."""
    load_dotenv()

    model_name = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    model = ChatGoogleGenerativeAI(model=model_name, temperature=0).bind_tools(AGENT_TOOLS)
    response = model.invoke(state["messages"])
    return {"messages": [response]}


def route_after_agent(state: AgentState) -> Literal["database_tools", "finalize_answer"]:
    messages = state.get("messages", [])
    if messages:
        last_message = messages[-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "database_tools"
    return "finalize_answer"


def finalize_answer(state: AgentState) -> AgentState:
    messages = state.get("messages", [])
    if not messages:
        return {"answer": "I could not produce an answer."}

    last_message = messages[-1]
    content = getattr(last_message, "content", "")
    answer = content_to_text(content).strip()
    if not answer:
        answer = "The request completed, but the model did not return a final answer."
    return {"answer": answer}


def build_agent():
    """Build and compile the tool-enabled LangGraph workflow."""
    graph = StateGraph(AgentState)
    graph.add_node("select_context_tables", select_context_tables)
    graph.add_node("load_database_context", load_database_context)
    graph.add_node("prepare_agent_messages", prepare_agent_messages)
    graph.add_node("call_agent_model", call_agent_model)
    graph.add_node("database_tools", ToolNode(AGENT_TOOLS))
    graph.add_node("finalize_answer", finalize_answer)
    graph.add_edge(START, "select_context_tables")
    graph.add_edge("select_context_tables", "load_database_context")
    graph.add_edge("load_database_context", "prepare_agent_messages")
    graph.add_edge("prepare_agent_messages", "call_agent_model")
    graph.add_conditional_edges(
        "call_agent_model",
        route_after_agent,
        {
            "database_tools": "database_tools",
            "finalize_answer": "finalize_answer",
        },
    )
    graph.add_edge("database_tools", "call_agent_model")
    graph.add_edge("finalize_answer", END)
    return graph.compile()


agent = build_agent()


def ask_agent(
    question: str, *, history: list[ChatHistoryItem] | None = None, limit: int = 25
) -> str:
    """Run the compiled agent for a question and return its answer."""
    result = agent.invoke(
        {"question": question, "history": history or [], "limit": limit},
        config={
            "run_name": "agency_hub_agent",
            "tags": ["agency-hub", "gemini"],
            "metadata": {"source": "cli"},
        },
    )
    return result["answer"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ask Gemini questions about Agency Hub cases, claims, and tasks."
    )
    parser.add_argument("question", nargs="*", help="Question to ask the agent.")
    parser.add_argument(
        "--limit",
        type=int,
        default=25,
        help="Maximum rows to read per table, capped at 100.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    question = " ".join(args.question).strip()

    try:
        if question:
            print(ask_agent(question, limit=args.limit))
            return 0

        history: list[ChatHistoryItem] = []
        print("Agency Hub assistant chat. Type exit or quit to end.")
        while True:
            try:
                question = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0

            if not question or question.lower() in {"exit", "quit"}:
                return 0

            answer = ask_agent(question, history=history, limit=args.limit)
            print(f"Assistant: {answer}")
            history.extend(
                [
                    {"role": "user", "text": question},
                    {"role": "assistant", "text": answer},
                ]
            )

    except Exception as exc:
        print(f"Agent error: {exc}", file=sys.stderr)
        return 1
    finally:
        wait_for_all_tracers()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
