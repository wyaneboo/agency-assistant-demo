import type { Task, TaskStatus, Priority } from "@/types/domain";

const STORAGE_KEY = "tasks.csv";
const SEED_URL = "/tasks.csv";

const HEADERS = [
  "id",
  "title",
  "assignedTo",
  "dueDate",
  "priority",
  "status",
  "relatedCaseId",
  "relatedClaimId",
  "createdBy",
] as const;

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
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(csv: string): Task[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const now = new Date().toISOString();
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    HEADERS.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return {
      id: row.id,
      title: row.title,
      assignedTo: row.assignedTo,
      dueDate: row.dueDate,
      priority: row.priority as Priority,
      status: row.status as TaskStatus,
      relatedCaseId: row.relatedCaseId || undefined,
      relatedClaimId: row.relatedClaimId || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: row.createdBy,
    };
  });
}

export function serializeCsv(tasks: Task[]): string {
  const rows = tasks.map((t) =>
    HEADERS.map((h) => escape(String((t as Record<string, unknown>)[h] ?? ""))).join(","),
  );
  return [HEADERS.join(","), ...rows].join("\n");
}

export async function loadTasks(): Promise<Task[]> {
  if (typeof window === "undefined") return [];
  const cached = window.localStorage.getItem(STORAGE_KEY);
  if (cached) return parseCsv(cached);
  const res = await fetch(SEED_URL);
  const text = await res.text();
  window.localStorage.setItem(STORAGE_KEY, text);
  return parseCsv(text);
}

export function saveTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeCsv(tasks));
}

export function downloadCsv(tasks: Task[]): void {
  const csv = serializeCsv(tasks);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tasks.csv";
  a.click();
  URL.revokeObjectURL(url);
}