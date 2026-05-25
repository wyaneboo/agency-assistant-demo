import type { Task, TaskStatus, Priority } from "@/types/domain";
import { tasksService } from "@/services";

const HEADERS = [
  "id",
  "title",
  "description",
  "assignedTo",
  "boardDate",
  "carrySourceId",
  "carrySourceDate",
  "dueDate",
  "priority",
  "status",
  "relatedCaseId",
  "relatedClaimId",
  "createdAt",
  "updatedAt",
  "createdBy",
] as const;

type TaskCsvHeader = (typeof HEADERS)[number];

export type TaskBoardLoad = {
  boardTasks: Task[];
  visibleTasks: Task[];
};

function sourceIdentity(sourceDate: string, sourceId: string): string {
  return `${sourceDate}\u0000${sourceId}`;
}

function taskSourceIdentity(task: Task): string | null {
  if (!task.carrySourceDate || !task.carrySourceId) return null;
  return sourceIdentity(task.carrySourceDate, task.carrySourceId);
}

function carryTaskId(sourceDate: string, sourceId: string, boardDate: string): string {
  return `carry:${sourceDate}:${sourceId}:${boardDate}`;
}

export function isCarryTask(task: Task): boolean {
  return Boolean(task.carrySourceId && task.carrySourceDate);
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateKey(): string {
  return formatDateKey(new Date());
}

export function dateKeyToTaskDate(dateKey: string): string {
  return `${dateKey}T12:00:00`;
}

export function taskDateToDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayDateKey() : formatDateKey(date);
}

export function isTaskPastDue(task: Pick<Task, "dueDate">, today = todayDateKey()): boolean {
  return taskDateToDateKey(task.dueDate) < today;
}

export function applyOverdueStatus(task: Task, today = todayDateKey(), changedAt?: string): Task {
  if (!isTaskPastDue(task, today) || task.status === "Completed" || task.status === "Overdue") {
    return task;
  }

  return {
    ...task,
    status: "Overdue",
    updatedAt: changedAt ?? task.updatedAt,
  };
}

export function applyOverdueStatuses(
  tasks: Task[],
  today = todayDateKey(),
  changedAt?: string,
): Task[] {
  return tasks.map((task) => applyOverdueStatus(task, today, changedAt));
}

function escape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(csv: string, fallbackBoardDate = todayDateKey()): Task[] {
  const trimmed = csv.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= 1) return [];
  const csvHeaders = parseCsvLine(lines[0]);
  const headers = csvHeaders.includes("id") ? csvHeaders : [...HEADERS];
  const rows = csvHeaders.includes("id") ? lines.slice(1) : lines;
  const now = new Date().toISOString();
  return rows.filter(Boolean).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    const dueDate = row.dueDate || dateKeyToTaskDate(row.boardDate || fallbackBoardDate);
    const boardDate = row.boardDate || fallbackBoardDate || taskDateToDateKey(dueDate);

    return applyOverdueStatus({
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      assignedTo: row.assignedTo,
      boardDate,
      carrySourceId: row.carrySourceId || undefined,
      carrySourceDate: row.carrySourceDate || undefined,
      dueDate,
      priority: row.priority as Priority,
      status: row.status as TaskStatus,
      relatedCaseId: row.relatedCaseId || undefined,
      relatedClaimId: row.relatedClaimId || undefined,
      createdAt: row.createdAt || now,
      updatedAt: row.updatedAt || now,
      createdBy: row.createdBy,
    });
  });
}

export function serializeCsv(tasks: Task[], fallbackBoardDate = todayDateKey()): string {
  const rows = tasks.map((t) =>
    HEADERS.map((h) => {
      const record = t as unknown as Record<TaskCsvHeader, unknown>;
      if (h === "boardDate") return escape(String(record[h] ?? fallbackBoardDate));
      if (h === "dueDate") return escape(String(record[h] ?? dateKeyToTaskDate(fallbackBoardDate)));
      return escape(String(record[h] ?? ""));
    }).join(","),
  );
  return [HEADERS.join(","), ...rows].join("\n");
}

export async function loadTasks(boardDate = todayDateKey()): Promise<Task[]> {
  return applyOverdueStatuses(await tasksService.byBoardDate(boardDate));
}

async function loadStoredBoardsBefore(boardDate: string) {
  const tasks = applyOverdueStatuses(await tasksService.beforeBoardDate(boardDate));
  return groupTasksByBoardDate(tasks);
}

function groupTasksByBoardDate(tasks: Task[]): Array<{ boardDate: string; tasks: Task[] }> {
  const grouped = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const boardDate = task.boardDate || taskDateToDateKey(task.dueDate);
    const boardTasks = grouped.get(boardDate) ?? [];
    boardTasks.push({ ...task, boardDate });
    grouped.set(boardDate, boardTasks);
  });

  return Array.from(grouped.entries())
    .map(([boardDate, groupedTasks]) => ({ boardDate, tasks: groupedTasks }))
    .sort((a, b) => a.boardDate.localeCompare(b.boardDate));
}

function buildSourceTaskMap(
  boards: Array<{ boardDate: string; tasks: Task[] }>,
): Map<string, Task> {
  const sources = new Map<string, Task>();

  boards.forEach(({ boardDate, tasks }) => {
    tasks.forEach((task) => {
      if (isCarryTask(task)) return;
      const sourceDate = task.boardDate || boardDate;
      sources.set(sourceIdentity(sourceDate, task.id), { ...task, boardDate: sourceDate });
    });
  });

  return sources;
}

function filterVisibleBoardTasks(
  boardDate: string,
  boardTasks: Task[],
  sourceTasks: Map<string, Task>,
): Task[] {
  return boardTasks.filter((task) => {
    if (!isCarryTask(task)) return true;

    const identity = taskSourceIdentity(task);
    if (!identity || !task.carrySourceDate || task.carrySourceDate >= boardDate) return false;

    const sourceTask = sourceTasks.get(identity);
    return Boolean(sourceTask && sourceTask.status !== "Completed");
  });
}

function buildCarriedTasks(
  boardDate: string,
  boardTasks: Task[],
  sourceTasks: Map<string, Task>,
): Task[] {
  const linkedSourceIdentities = new Set(
    boardTasks
      .map((task) => taskSourceIdentity(task))
      .filter((identity): identity is string => Boolean(identity)),
  );

  return Array.from(sourceTasks.values())
    .filter((sourceTask) => {
      const sourceDate = sourceTask.boardDate;
      if (!sourceDate || sourceDate >= boardDate) return false;
      if (sourceTask.status === "Completed") return false;
      return !linkedSourceIdentities.has(sourceIdentity(sourceDate, sourceTask.id));
    })
    .map((sourceTask) => {
      const sourceDate = sourceTask.boardDate!;
      return {
        ...sourceTask,
        id: carryTaskId(sourceDate, sourceTask.id, boardDate),
        boardDate,
        carrySourceId: sourceTask.id,
        carrySourceDate: sourceDate,
      };
    });
}

export async function loadTaskBoard(boardDate = todayDateKey()): Promise<TaskBoardLoad> {
  const boardTasks = await loadTasks(boardDate);
  const priorBoards = await loadStoredBoardsBefore(boardDate);
  const sourceTasks = buildSourceTaskMap(priorBoards);
  const visibleBoardTasks = filterVisibleBoardTasks(boardDate, boardTasks, sourceTasks);
  const carriedTasks = buildCarriedTasks(boardDate, boardTasks, sourceTasks);

  return {
    boardTasks,
    visibleTasks: [...visibleBoardTasks, ...carriedTasks],
  };
}

export async function loadAllTasks(): Promise<Task[]> {
  const boards = groupTasksByBoardDate(applyOverdueStatuses(await tasksService.list()));
  const sourceTasks = buildSourceTaskMap(boards);

  return boards.flatMap(({ boardDate, tasks }) =>
    filterVisibleBoardTasks(boardDate, tasks, sourceTasks),
  );
}

export async function saveTasks(boardDate: string, tasks: Task[]): Promise<void> {
  const today = todayDateKey();
  const changedAt = new Date().toISOString();
  await tasksService.upsertMany(
    applyOverdueStatuses(tasks, today, changedAt).map((task) => ({ ...task, boardDate })),
  );
}

export function downloadCsv(tasks: Task[], boardDate = todayDateKey()): void {
  const csv = serializeCsv(tasks, boardDate);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks-${boardDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
