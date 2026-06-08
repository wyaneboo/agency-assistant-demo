from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

from .schema import TABLES, TABLE_SEARCH_FIELDS


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
