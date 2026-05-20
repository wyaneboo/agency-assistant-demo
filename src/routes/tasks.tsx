import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { tasksService, usersService } from "@/services";
import type { TaskStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const COLUMNS: TaskStatus[] = ["To Do", "In Progress", "Waiting", "Completed", "Overdue"];

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Agency Ops" }] }),
  component: TasksPage,
});

function TasksPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const tasks = tasksService.list();

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Kanban and list view of all team tasks."
        actions={<Button><Plus className="mr-1.5 h-4 w-4" />New Task</Button>}
      />
      <Tabs value={view} onValueChange={(v) => setView(v as "kanban" | "list")}>
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = tasks.filter((t) => t.status === col);
              return (
                <div key={col} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{col}</h3>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <div key={t.id} className={cn(
                        "rounded-md border border-border bg-card p-3 shadow-sm",
                        col === "Overdue" && "border-destructive/40"
                      )}>
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {usersService.get(t.assignedTo)?.name}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.dueDate).toLocaleDateString()}
                          </span>
                          <StatusBadge value={t.priority} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{t.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{usersService.get(t.assignedTo)?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(t.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><StatusBadge value={t.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}