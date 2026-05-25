import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
};

type AskAssistantInput = {
  question: string;
  history: AssistantMessage[];
  limit?: number;
};

type LangGraphResponse = {
  answer?: unknown;
  output?: {
    answer?: unknown;
  };
};

function validateInput(data: unknown): AskAssistantInput {
  if (!data || typeof data !== "object") {
    throw new Error("Assistant request must be an object.");
  }

  const input = data as Partial<AskAssistantInput>;
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question) {
    throw new Error("Question is required.");
  }

  const history = Array.isArray(input.history)
    ? input.history
        .filter(
          (message) =>
            message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.text === "string" &&
            message.text.trim(),
        )
        .map((message) => ({
          role: message.role,
          text: message.text.trim(),
        }))
    : [];

  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(Math.floor(input.limit), 100))
      : 25;

  return { question, history, limit };
}

function readAnswer(payload: LangGraphResponse): string {
  const answer = payload.answer ?? payload.output?.answer;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("LangGraph returned no assistant answer.");
  }

  return answer;
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data }) => {
    const baseUrl = process.env.LANGGRAPH_API_URL ?? "http://127.0.0.1:2024";
    const endpoint = `${baseUrl.replace(/\/$/, "")}/runs/wait`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistant_id: "agent",
          input: {
            question: data.question,
            history: data.history,
            limit: data.limit,
          },
          stream_mode: "values",
        }),
      });
    } catch (error) {
      throw new Error(
        `Unable to reach LangGraph at ${endpoint}. Start the Python agent server and try again.`,
        { cause: error },
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `LangGraph request failed with HTTP ${response.status}: ${detail || response.statusText}`,
      );
    }

    const payload = (await response.json()) as LangGraphResponse;
    return { answer: readAnswer(payload) };
  });
