from __future__ import annotations

import os
from typing import Literal

from dotenv import load_dotenv
from langchain_core.messages import AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from .config import DEFAULT_MODEL
from .context import load_database_context, select_context_tables
from .messages import content_to_text, prepare_agent_messages
from .schema import AgentState, ChatHistoryItem
from .tools import AGENT_TOOLS


def call_agent_model(state: AgentState) -> AgentState:
    """Ask Gemini for the next assistant message, allowing task tool calls."""
    load_dotenv()

    model_name = os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
    model = ChatGoogleGenerativeAI(model=model_name, temperature=0).bind_tools(AGENT_TOOLS)
    response = model.invoke(state.get("messages", []))
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
