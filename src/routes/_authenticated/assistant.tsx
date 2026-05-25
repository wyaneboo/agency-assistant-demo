import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant, type AssistantMessage } from "@/services/assistant-agent.server";
import { Bot, RefreshCw, Send, Sparkles, User } from "lucide-react";

const SUGGESTIONS = [
  "Summarize today's pending cases",
  "Draft follow-up messages for overdue cases",
  "List overdue tasks by agent",
  "Generate a daily ops report",
  "Identify operational bottlenecks this week",
];

type Msg = AssistantMessage;

const INITIAL_MESSAGE: Msg = {
  role: "assistant",
  text: "Hi - I'm your THL Operations Hub assistant. Ask me about cases, claims, and tasks.",
};

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "AI Assistant - THL Operations Hub" }] }),
  component: AssistantPage,
});

function AssistantPage() {
  const askAssistantFn = useServerFn(askAssistant);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  const [pending, setPending] = useState(false);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;

    const history = messages;
    setMessages((current) => [...current, { role: "user", text: question }]);
    setInput("");
    setPending(true);

    try {
      const response = await askAssistantFn({
        data: {
          question,
          history,
          limit: 25,
        },
      });

      setMessages((current) => [...current, { role: "assistant", text: response.answer }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant request failed.";
      setMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally {
      setPending(false);
    }
  };

  const startNewChat = () => {
    setInput("");
    setMessages([INITIAL_MESSAGE]);
  };

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        description="Ask the LangGraph agent about your agency operations."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex h-[600px] flex-col lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Conversation
            </CardTitle>
            <Button variant="outline" size="sm" onClick={startNewChat} disabled={pending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              New chat
            </Button>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {message.text}
                </div>
                {message.role === "user" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {pending && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
          </CardContent>
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask anything about your agency operations..."
                className="min-h-[44px] resize-none"
                disabled={pending}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
              />
              <Button
                onClick={() => void send(input)}
                size="icon"
                disabled={pending || !input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
            <CardDescription>Quick prompts to try</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => void send(suggestion)}
                disabled={pending}
                className="block w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestion}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
