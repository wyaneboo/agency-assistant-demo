from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal, TypedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tracers.langchain import wait_for_all_tracers
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph


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


class ChatHistoryItem(TypedDict):
    role: Literal["user", "assistant"]
    text: str


class AgentState(TypedDict, total=False):
    question: str
    history: list[ChatHistoryItem]
    limit: int
    database: dict[str, list[dict[str, Any]]]
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
            "Supabase reads require an authenticated credential. The configured "
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
            headers=self._headers(),
            method="GET",
        )

        try:
            with urlopen(request, timeout=20) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase rejected {table} read with HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Supabase: {exc.reason}") from exc

        data = json.loads(payload)
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected Supabase response for {table}: {data}")
        return data

    def _headers(self) -> dict[str, str]:
        headers = {
            "apikey": self.config.api_key,
            "Accept": "application/json",
        }
        if self.config.authorization_token:
            headers["Authorization"] = f"Bearer {self.config.authorization_token}"
        return headers

    def fetch_database_snapshot(self, *, limit: int) -> dict[str, list[dict[str, Any]]]:
        return {
            table: self.fetch_table(table, limit=100 if table == "users" else limit)
            for table in TABLES
        }


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


def answer_from_database(state: AgentState) -> AgentState:
    """LangGraph node that asks Gemini to answer from the database snapshot.

    Expects `question` and `database` to already be present in state. The node
    builds a grounded prompt that tells the model to use only the Supabase data,
    then returns the model response under the `answer` key.
    """
    load_dotenv()

    question = state["question"]
    history = normalize_history(state.get("history", []))
    database = state["database"]
    model_name = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL

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
                "are users, cases, claims, and tasks. Use users to resolve "
                "agent, admin, creator, and assignee IDs to names. Cite record "
                "IDs when useful. If "
                "the snapshot does not contain enough data, say what is missing "
                "instead of guessing. Use the conversation history only to "
                "understand references and follow-up questions; do not treat it "
                "as database truth. Today's date is "
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
                "Database snapshot:\n"
                f"```json\n{database_json}\n```"
            )
        )
    )

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
