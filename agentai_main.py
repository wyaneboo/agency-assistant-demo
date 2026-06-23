from __future__ import annotations

from agentai.cli import main, parse_args
from agentai.config import DEFAULT_MODEL
from agentai.main.context import load_database_context, select_context_tables
from agentai.main.graph import (
    agent,
    ask_agent,
    build_agent,
    call_agent_model,
    finalize_answer,
    route_after_agent,
)
from agentai.main.messages import content_to_text, normalize_history, prepare_agent_messages
from agentai.schema import (
    AgentState,
    BROAD_CONTEXT_KEYWORDS,
    ChatHistoryItem,
    NULLABLE_TASK_FIELDS,
    TABLE_KEYWORDS,
    TABLE_SEARCH_FIELDS,
    TABLES,
    TASK_PRIORITIES,
    TASK_STATUSES,
)
from agentai.tools.supabase import SupabaseRestClient, SupabaseRestConfig
from agentai.tools.tools import (
    AGENT_TOOLS,
    READ_DATABASE_TOOLS,
    TASK_DATABASE_TOOLS,
    GetRecordInput,
    ListRowsInput,
    SearchRowsInput,
    TaskDatabaseChangeInput,
    change_task_database,
    get_case,
    get_claim,
    get_task,
    get_user,
    list_cases,
    list_claims,
    list_tasks,
    list_users,
    search_cases,
    search_claims,
    search_tasks,
    search_users,
)


if __name__ == "__main__":
    raise SystemExit(main())
