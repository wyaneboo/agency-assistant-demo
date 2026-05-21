import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Download, ChevronDown } from "lucide-react";
import { usersService } from "@/services";
import type { Task, TaskStatus } from "@/types/domain";
import { cn } from "@/lib/utils";
import { loadTasks, saveTasks, downloadCsv } from "@/lib/tasks-csv-store";

const COLUMNS: TaskStatus[] = ["To Do", "In Progress", "Waiting", "Completed", "Overdue"];

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Agency Ops" }] }),
  component: TasksPage,
});

function TasksPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks().then((t) => {
      setTasks(t);
      setLoading(false);
    });
  }, []);

  const updateStatus = (id: string, status: TaskStatus) => {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t,
      );
      saveTasks(next);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Kanban and list view of all team tasks. Stored as CSV."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadCsv(tasks)}>
              <Download className="mr-1.5 h-4 w-4" />Export CSV
            </Button>
            <Button><Plus className="mr-1.5 h-4 w-4" />New Task</Button>
          </div>
        }
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
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
                            {new Date(t.dueDate).toLocaleDateString("en-US")}
                          </span>
                          <StatusBadge value={t.priority} />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="mt-2 h-7 w-full justify-between text-xs">
                              {t.status}
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Move to</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {COLUMNS.filter((s) => s !== t.status).map((s) => (
                              <DropdownMenuItem key={s} onClick={() => updateStatus(t.id, s)}>
                                {s}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">No tasks</p>
                    )}
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
                    <td className="px-4 py-3 text-muted-foreground">{new Date(t.dueDate).toLocaleDateString("en-US")}</td>
                    <td className="px-4 py-3"><StatusBadge value={t.priority} /></td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <StatusBadge value={t.status} />
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {COLUMNS.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => updateStatus(t.id, s)}>
                              {s}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}