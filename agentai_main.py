from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date
from typing import Any, TypedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph


DEFAULT_MODEL = "gemini-2.5-flash"

TABLES: dict[str, dict[str, str]] = {
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


class AgentState(TypedDict, total=False):
    question: str
    limit: int
    database: dict[str, list[dict[str, Any]]]
    answer: str


@dataclass(frozen=True)
class SupabaseRestConfig:
    url: str
    api_key: str
    auth_token: str
    using_public_key_without_user_token: bool

    @classmethod
    def from_env(cls) -> "SupabaseRestConfig":
        load_dotenv()

        url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
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

        if not url:
            raise RuntimeError("Missing SUPABASE_URL in .env.")

        api_key = service_role_key or publishable_key
        if not api_key:
            raise RuntimeError(
                "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY for this "
                "server-side script, or set SUPABASE_PUBLISHABLE_KEY plus "
                "SUPABASE_ACCESS_TOKEN."
            )

        auth_token = service_role_key or user_access_token or api_key

        return cls(
            url=url.rstrip("/"),
            api_key=api_key,
            auth_token=auth_token,
            using_public_key_without_user_token=(
                service_role_key is None and user_access_token is None
            ),
        )


class SupabaseRestReader:
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
        request = Request(
            f"{self.config.url}/rest/v1/{table}?{query}",
            headers={
                "apikey": self.config.api_key,
                "Authorization": f"Bearer {self.config.auth_token}",
                "Accept": "application/json",
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=20) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            hint = ""
            if exc.code in {401, 403} and self.config.using_public_key_without_user_token:
                hint = (
                    " These tables have authenticated RLS policies; set "
                    "SUPABASE_SERVICE_ROLE_KEY for local server-side reads, or "
                    "set SUPABASE_ACCESS_TOKEN to a signed-in user's JWT."
                )
            raise RuntimeError(
                f"Supabase rejected {table} read with HTTP {exc.code}: {detail}.{hint}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Supabase: {exc.reason}") from exc

        data = json.loads(payload)
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase response for {table}: {data}")
        return data

    def fetch_database_snapshot(self, *, limit: int) -> dict[str, list[dict[str, Any]]]:
        return {table: self.fetch_table(table, limit=limit) for table in TABLES}


def load_database_context(state: AgentState) -> AgentState:
    """LangGraph node that loads a read-only Supabase snapshot into state.

    Reads the requested row limit from the incoming state, fetches the
    configured `cases`, `claims`, and `tasks` tables, and returns only the
    `database` key so LangGraph can merge it into the graph state.
    """
    limit = max(1, min(int(state.get("limit", 25)), 100))
    reader = SupabaseRestReader(SupabaseRestConfig.from_env())
    return {"database": reader.fetch_database_snapshot(limit=limit)}


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)


def answer_from_database(state: AgentState) -> AgentState:
    """LangGraph node that asks Gemini to answer from the database snapshot.

    Expects `question` and `database` to already be present in state. The node
    builds a grounded prompt that tells the model to use only the Supabase data,
    then returns the model response under the `answer` key.
    """
    load_dotenv()

    question = state["question"]
    database = state["database"]
    model_name = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)

    model = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
    )

    database_json = json.dumps(database, indent=2, default=str)
    messages = [
        SystemMessage(
            content=(
                "You are the Agency Hub operations assistant. Answer questions "
                "using only the provided read-only database snapshot. The tables "
                "are cases, claims, and tasks. Cite record IDs when useful. If "
                "the snapshot does not contain enough data, say what is missing "
                "instead of guessing. Today's date is "
                f"{date.today().isoformat()}."
            )
        ),
        HumanMessage(
            content=(
                f"Question: {question}\n\n"
                "Database snapshot:\n"
                f"```json\n{database_json}\n```"
            )
        ),
    ]

    response = model.invoke(messages)
    return {"answer": content_to_text(response.content)}


def build_agent():
    """Build and compile the two-step LangGraph workflow."""
    graph = StateGraph(AgentState)
    graph.add_node("load_database_context", load_database_context)
    graph.add_node("answer_from_database", answer_from_database)
    graph.add_edge(START, "load_database_context")
    graph.add_edge("load_database_context", "answer_from_database")
    graph.add_edge("answer_from_database", END)
    return graph.compile()


def ask_agent(question: str, *, limit: int = 25) -> str:
    """Run the compiled agent for a single question and return its answer."""
    app = build_agent()
    result = app.invoke({"question": question, "limit": limit})
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
    if not question:
        question = input("Ask about cases, claims, or tasks: ").strip()

    if not question:
        print("No question provided.", file=sys.stderr)
        return 2

    try:
        print(ask_agent(question, limit=args.limit))
    except Exception as exc:
        print(f"Agent error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
