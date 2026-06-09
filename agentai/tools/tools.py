from __future__ import annotations

from datetime import date
from typing import Any, Literal

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from ..schema import NULLABLE_TASK_FIELDS, TASK_PRIORITIES, TASK_STATUSES
from .supabase import SupabaseRestClient, SupabaseRestConfig
from ..utils import clamp_limit, date_key, optional_text, required_text, tool_json


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


def _list_table_rows(table: str, *, limit: int | None) -> str:
    try:
        row_limit = clamp_limit(limit, default=25, maximum=100)
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        records = client.fetch_table(table, limit=row_limit)
        return tool_json(
            {
                "ok": True,
                "table": table,
                "count": len(records),
                "limit": row_limit,
                "records": records,
            }
        )
    except Exception as exc:
        return tool_json({"ok": False, "table": table, "error": str(exc)})


def _get_table_record(table: str, *, record_id: str) -> str:
    try:
        row_id = required_text(record_id, "record_id")
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        record = client.get_record(table, row_id)
        if record is None:
            return tool_json(
                {
                    "ok": False,
                    "table": table,
                    "record_id": row_id,
                    "error": f"No {table} row found for id {row_id}.",
                }
            )
        return tool_json(
            {"ok": True, "table": table, "record_id": row_id, "record": record}
        )
    except Exception as exc:
        return tool_json({"ok": False, "table": table, "error": str(exc)})


def _search_table_rows(table: str, *, query: str, limit: int | None) -> str:
    try:
        search_query = required_text(query, "query")
        row_limit = clamp_limit(limit, default=10, maximum=50)
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        records = client.search_table(table, query_text=search_query, limit=row_limit)
        return tool_json(
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
        return tool_json({"ok": False, "table": table, "query": query, "error": str(exc)})


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


def _choice(
    value: str | None, field: str, allowed: set[str], default: str | None = None
) -> str:
    selected = optional_text(value, field) or default
    if selected not in allowed:
        allowed_text = ", ".join(sorted(allowed))
        raise ValueError(f"{field} must be one of: {allowed_text}.")
    return selected


def _build_task_create_payload(input_data: TaskDatabaseChangeInput) -> dict[str, Any]:
    assigned_to = required_text(input_data.assigned_to, "assigned_to")
    payload: dict[str, Any] = {
        "title": required_text(input_data.title, "title"),
        "assigned_to": assigned_to,
        "board_date": date_key(input_data.board_date, "board_date")
        or date.today().isoformat(),
        "due_date": date_key(input_data.due_date, "due_date", required=True),
        "priority": _choice(input_data.priority, "priority", TASK_PRIORITIES, "Medium"),
        "status": _choice(input_data.status, "status", TASK_STATUSES, "To Do"),
        "created_by": optional_text(input_data.created_by, "created_by") or assigned_to,
    }

    task_id = optional_text(input_data.task_id, "task_id")
    if task_id:
        payload["id"] = task_id

    optional_fields = {
        "description": optional_text(input_data.description, "description"),
        "related_case_id": optional_text(input_data.related_case_id, "related_case_id"),
        "related_claim_id": optional_text(
            input_data.related_claim_id, "related_claim_id"
        ),
        "carry_source_id": optional_text(input_data.carry_source_id, "carry_source_id"),
        "carry_source_date": date_key(
            input_data.carry_source_date, "carry_source_date"
        ),
    }
    payload.update(
        {key: value for key, value in optional_fields.items() if value is not None}
    )
    return payload


def _build_task_update_payload(
    input_data: TaskDatabaseChangeInput,
) -> tuple[str, dict[str, Any]]:
    task_id = required_text(input_data.task_id, "task_id")
    payload: dict[str, Any] = {}

    if input_data.title is not None:
        payload["title"] = required_text(input_data.title, "title")
    if input_data.description is not None:
        payload["description"] = optional_text(input_data.description, "description")
    if input_data.assigned_to is not None:
        payload["assigned_to"] = required_text(input_data.assigned_to, "assigned_to")
    if input_data.board_date is not None:
        payload["board_date"] = date_key(
            input_data.board_date, "board_date", required=True
        )
    if input_data.due_date is not None:
        payload["due_date"] = date_key(input_data.due_date, "due_date", required=True)
    if input_data.priority is not None:
        payload["priority"] = _choice(input_data.priority, "priority", TASK_PRIORITIES)
    if input_data.status is not None:
        payload["status"] = _choice(input_data.status, "status", TASK_STATUSES)
    if input_data.related_case_id is not None:
        payload["related_case_id"] = optional_text(
            input_data.related_case_id, "related_case_id"
        )
    if input_data.related_claim_id is not None:
        payload["related_claim_id"] = optional_text(
            input_data.related_claim_id, "related_claim_id"
        )
    if input_data.carry_source_id is not None:
        payload["carry_source_id"] = optional_text(
            input_data.carry_source_id, "carry_source_id"
        )
    if input_data.carry_source_date is not None:
        payload["carry_source_date"] = date_key(
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
            return tool_json({"ok": True, "action": "create", "task": task})

        if input_data.action == "update":
            update_task_id, payload = _build_task_update_payload(input_data)
            client = SupabaseRestClient(SupabaseRestConfig.from_env())
            task = client.update_task(update_task_id, payload)
            return tool_json(
                {
                    "ok": True,
                    "action": "update",
                    "task": task,
                    "changed_fields": sorted(payload.keys()),
                }
            )

        delete_task_id = required_text(input_data.task_id, "task_id")
        client = SupabaseRestClient(SupabaseRestConfig.from_env())
        task = client.delete_task(delete_task_id)
        return tool_json({"ok": True, "action": "delete", "task": task})
    except Exception as exc:
        return tool_json({"ok": False, "action": input_data.action, "error": str(exc)})


TASK_DATABASE_TOOLS = [change_task_database]
AGENT_TOOLS = READ_DATABASE_TOOLS + TASK_DATABASE_TOOLS
