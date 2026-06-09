from __future__ import annotations

import argparse
import sys

from langchain_core.tracers.langchain import wait_for_all_tracers

from .main.graph import ask_agent
from .schema import ChatHistoryItem


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ask Gemini questions about Agency Hub cases, claims, and tasks."
    )
    parser.add_argument("question", nargs="*", help="Question to ask the agent.")
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
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
