import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { usersService } from "@/services";
import type { Priority, Task, TaskStatus } from "@/types/domain";
import { cn } from "@/lib/utils";
import {
  dateKeyToTaskDate,
  downloadCsv,
  formatDateKey,
  isCarryTask,
  loadTaskBoard,
  saveTasks,
  todayDateKey,
} from "@/lib/tasks-csv-store";

const COLUMNS: TaskStatus[] = ["To Do", "In Progress", "Waiting", "Completed", "Overdue"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Urgent"];

type NewTaskDraft = {
  title: string;
  assignedTo: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
};

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function clampBoardDate(dateKey: string, maxDateKey: string): string {
  if (!dateKey) return maxDateKey;
  return dateKey > maxDateKey ? maxDateKey : dateKey;
}

function formatBoardDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortBoardDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function carryLabel(task: Task): string | null {
  if (!task.carrySourceDate) return null;
  return `Carried from ${formatShortBoardDate(task.carrySourceDate)}`;
}

function createDraft(boardDate: string, assignedTo: string): NewTaskDraft {
  return {
    title: "",
    assignedTo,
    dueDate: boardDate,
    priority: "Medium",
    status: "To Do",
  };
}

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks - THL Operations Hub" }] }),
  component: TasksPage,
});

function TasksPage() {
  const assignableUsers = usersService.list();
  const defaultAssignedTo = assignableUsers[0]?.id ?? "";
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selectedDate, setSelectedDate] = useState(() => todayDateKey());
  const selectedDateRef = useRef(selectedDate);
  const [boardTasks, setBoardTasks] = useState<Task[]>([]);
  const [visibleTasks, setVisibleTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<NewTaskDraft>(() =>
    createDraft(todayDateKey(), defaultAssignedTo),
  );

  const selectedDateLabel = useMemo(() => formatBoardDate(selectedDate), [selectedDate]);
  const todayKey = todayDateKey();
  const completedCount = visibleTasks.filter((t) => t.status === "Completed").length;
  const openCount = visibleTasks.length - completedCount;

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadTaskBoard(selectedDate)
      .then((loadedBoard) => {
        if (cancelled) return;
        setBoardTasks(loadedBoard.boardTasks);
        setVisibleTasks(loadedBoard.visibleTasks);
      })
      .catch((err) => {
        if (cancelled) return;
        setBoardTasks([]);
        setVisibleTasks([]);
        setError(err instanceof Error ? err.message : "Unable to load tasks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const applyBoardTasks = async (boardDate: string, nextBoardTasks: Task[]) => {
    setSaving(true);
    setError(null);

    try {
      await saveTasks(boardDate, nextBoardTasks);
      setBoardTasks(nextBoardTasks);

      const loadedBoard = await loadTaskBoard(boardDate);
      if (selectedDateRef.current !== boardDate) return;
      setBoardTasks(loadedBoard.boardTasks);
      setVisibleTasks(loadedBoard.visibleTasks);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save tasks.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: TaskStatus) => {
    const now = new Date().toISOString();
    const existingBoardTask = boardTasks.find((task) => task.id === id);

    if (existingBoardTask) {
      const nextBoardTasks = boardTasks.map((task) =>
        task.id === id ? { ...task, boardDate: selectedDate, status, updatedAt: now } : task,
      );
      await applyBoardTasks(selectedDate, nextBoardTasks);
      return;
    }

    const carriedTask = visibleTasks.find((task) => task.id === id && isCarryTask(task));
    if (!carriedTask?.carrySourceId || !carriedTask.carrySourceDate) return;

    const linkedTask: Task = {
      ...carriedTask,
      boardDate: selectedDate,
      status,
      createdAt: now,
      updatedAt: now,
    };
    await applyBoardTasks(selectedDate, [linkedTask, ...boardTasks]);
  };

  const openNewTaskDialog = () => {
    setDraft(createDraft(selectedDate, defaultAssignedTo));
    setDialogOpen(true);
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || !draft.assignedTo) return;

    const now = new Date().toISOString();
    const nextTask: Task = {
      id: `T-${Date.now().toString(36).toUpperCase()}`,
      title,
      assignedTo: draft.assignedTo,
      boardDate: selectedDate,
      dueDate: dateKeyToTaskDate(draft.dueDate || selectedDate),
      priority: draft.priority,
      status: draft.status,
      createdAt: now,
      updatedAt: now,
      createdBy: draft.assignedTo,
    };

    const saved = await applyBoardTasks(selectedDate, [nextTask, ...boardTasks]);
    if (saved) setDialogOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Daily Kanban and list views. Each date keeps its own database-backed board."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => downloadCsv(visibleTasks, selectedDate)}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={openNewTaskDialog} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Task
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => setSelectedDate((date) => shiftDateKey(date, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative w-full sm:w-44">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Kanban board date"
              className="pl-9"
              max={todayKey}
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(clampBoardDate(event.target.value, todayKey))}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={selectedDate >= todayKey}
            onClick={() =>
              setSelectedDate((date) => clampBoardDate(shiftDateKey(date, 1), todayKey))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedDate === todayKey ? "secondary" : "outline"}
            size="sm"
            onClick={() => setSelectedDate(todayKey)}
          >
            Today
          </Button>
        </div>
        <div className="text-sm text-muted-foreground sm:ml-auto sm:text-right">
          <span className="font-medium text-foreground">{selectedDateLabel}</span>
          <span className="mx-2 text-border">|</span>
          {openCount} open / {visibleTasks.length} total
          {saving && <span className="ml-2">Saving...</span>}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      ) : (
        <Tabs value={view} onValueChange={(value) => setView(value as "kanban" | "list")}>
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {COLUMNS.map((column) => {
                const items = visibleTasks.filter((task) => task.status === column);
                return (
                  <div key={column} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{column}</h3>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="min-h-32 space-y-2">
                      {items.map((task) => {
                        const taskCarryLabel = carryLabel(task);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "rounded-md border border-border bg-card p-3 shadow-sm",
                              column === "Overdue" && "border-destructive/40",
                            )}
                          >
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {usersService.get(task.assignedTo)?.name}
                            </p>
                            {taskCarryLabel && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {taskCarryLabel}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {new Date(task.dueDate).toLocaleDateString("en-US")}
                              </span>
                              <StatusBadge value={task.priority} />
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2 h-7 w-full justify-between text-xs"
                                >
                                  {task.status}
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {COLUMNS.filter((status) => status !== task.status).map(
                                  (status) => (
                                    <DropdownMenuItem
                                      key={status}
                                      onClick={() => updateStatus(task.id, status)}
                                    >
                                      {status}
                                    </DropdownMenuItem>
                                  ),
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
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
              <div className="overflow-x-auto">
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
                    {visibleTasks.map((task) => {
                      const taskCarryLabel = carryLabel(task);
                      return (
                        <tr key={task.id} className="hover:bg-accent/30">
                          <td className="px-4 py-3">
                            <p className="font-medium">{task.title}</p>
                            {taskCarryLabel && (
                              <p className="mt-1 text-xs text-muted-foreground">{taskCarryLabel}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {usersService.get(task.assignedTo)?.name}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(task.dueDate).toLocaleDateString("en-US")}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge value={task.priority} />
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                  <StatusBadge value={task.status} />
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {COLUMNS.map((status) => (
                                  <DropdownMenuItem
                                    key={status}
                                    onClick={() => updateStatus(task.id, status)}
                                  >
                                    {status}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleTasks.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No tasks for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={createTask} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
              <DialogDescription>Add a task to {selectedDateLabel}.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="task-title">Task</Label>
                <Input
                  id="task-title"
                  autoFocus
                  placeholder="Follow up with client"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Assigned</Label>
                  <Select
                    value={draft.assignedTo}
                    onValueChange={(assignedTo) =>
                      setDraft((current) => ({ ...current, assignedTo }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="task-due-date">Due</Label>
                  <Input
                    id="task-due-date"
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, dueDate: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Priority</Label>
                  <Select
                    value={draft.priority}
                    onValueChange={(priority) =>
                      setDraft((current) => ({ ...current, priority: priority as Priority }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(status) =>
                      setDraft((current) => ({ ...current, status: status as TaskStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMNS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.title.trim() || !draft.assignedTo || saving}>
                {saving ? "Adding..." : "Add Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
