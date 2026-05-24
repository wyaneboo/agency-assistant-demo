/**
 * Service layer: the UI talks to this boundary, not directly to storage.
 * Cases, claims, and tasks are backed by Supabase. Remaining demo modules still use
 * local mock data until they get their own database tables.
 */
import {
  users as _users,
  activities as _activities,
  notifications as _notifications,
} from "./mock-data";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { Case, Claim, Task } from "@/types/domain";

type CreateCaseInput = Omit<Case, "id" | "createdAt" | "updatedAt">;
type CreateClaimInput = Omit<Claim, "id" | "createdAt" | "updatedAt">;
type CreateTaskInput = Omit<Task, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CaseRow = Tables<"cases">;
type ClaimRow = Tables<"claims">;
type TaskRow = Tables<"tasks">;
type CaseInsert = TablesInsert<"cases">;
type ClaimInsert = TablesInsert<"claims">;
type TaskInsert = TablesInsert<"tasks">;

function toDateKey(value: string | undefined | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToAppDate(value: string): string {
  return `${value.slice(0, 10)}T12:00:00`;
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

function mapCase(row: CaseRow): Case {
  return {
    id: row.id,
    clientName: row.client_name,
    agentId: row.agent_id,
    productType: row.product_type,
    premium: Number(row.premium),
    anpEstimate: Number(row.anp_estimate),
    status: row.status as Case["status"],
    missingDocuments: row.missing_documents ?? [],
    submittedDate: dateKeyToAppDate(row.submitted_date),
    followUpDate: row.follow_up_date ? dateKeyToAppDate(row.follow_up_date) : undefined,
    priority: row.priority as Case["priority"],
    remarks: row.remarks ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function caseToInsert(input: CreateCaseInput): CaseInsert {
  return {
    client_name: input.clientName,
    agent_id: input.agentId,
    product_type: input.productType,
    premium: input.premium,
    anp_estimate: input.anpEstimate,
    status: input.status,
    missing_documents: input.missingDocuments,
    submitted_date: toDateKey(input.submittedDate),
    follow_up_date: input.followUpDate ? toDateKey(input.followUpDate) : null,
    priority: input.priority,
    remarks: input.remarks ?? null,
    created_by: input.createdBy,
  };
}

function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    clientName: row.client_name,
    claimType: row.claim_type,
    assignedAdminId: row.assigned_admin_id,
    status: row.status as Claim["status"],
    missingDocuments: row.missing_documents ?? [],
    submissionDate: dateKeyToAppDate(row.submission_date),
    remarks: row.remarks ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function claimToInsert(input: CreateClaimInput): ClaimInsert {
  return {
    client_name: input.clientName,
    claim_type: input.claimType,
    assigned_admin_id: input.assignedAdminId,
    status: input.status,
    missing_documents: input.missingDocuments,
    submission_date: toDateKey(input.submissionDate),
    remarks: input.remarks ?? null,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    assignedTo: row.assigned_to,
    boardDate: row.board_date,
    carrySourceId: row.carry_source_id ?? undefined,
    carrySourceDate: row.carry_source_date ?? undefined,
    dueDate: dateKeyToAppDate(row.due_date),
    priority: row.priority as Task["priority"],
    status: row.status as Task["status"],
    relatedCaseId: row.related_case_id ?? undefined,
    relatedClaimId: row.related_claim_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function taskToInsert(task: CreateTaskInput | Task): TaskInsert {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    assigned_to: task.assignedTo,
    board_date: toDateKey(task.boardDate) || toDateKey(task.dueDate),
    carry_source_id: task.carrySourceId ?? null,
    carry_source_date: task.carrySourceDate ? toDateKey(task.carrySourceDate) : null,
    due_date: toDateKey(task.dueDate),
    priority: task.priority,
    status: task.status,
    related_case_id: task.relatedCaseId ?? null,
    related_claim_id: task.relatedClaimId ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    created_by: task.createdBy,
  };
}

export const casesService = {
  list: async (): Promise<Case[]> => {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) fail("Unable to load cases", error);
    return (data ?? []).map(mapCase);
  },

  get: async (id: string): Promise<Case | undefined> => {
    const { data, error } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();

    if (error) fail(`Unable to load case ${id}`, error);
    return data ? mapCase(data) : undefined;
  },

  byAgent: async (agentId: string): Promise<Case[]> => {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) fail(`Unable to load cases for agent ${agentId}`, error);
    return (data ?? []).map(mapCase);
  },

  create: async (input: CreateCaseInput): Promise<Case> => {
    const { data, error } = await supabase
      .from("cases")
      .insert(caseToInsert(input))
      .select()
      .single();

    if (error) fail("Unable to create case", error);
    return mapCase(data);
  },
};

export const tasksService = {
  list: async (): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) fail("Unable to load tasks", error);
    return (data ?? []).map(mapTask);
  },

  get: async (id: string): Promise<Task | undefined> => {
    const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();

    if (error) fail(`Unable to load task ${id}`, error);
    return data ? mapTask(data) : undefined;
  },

  byBoardDate: async (boardDate: string): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("board_date", boardDate)
      .order("created_at", { ascending: false });

    if (error) fail(`Unable to load tasks for ${boardDate}`, error);
    return (data ?? []).map(mapTask);
  },

  beforeBoardDate: async (boardDate: string): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .lt("board_date", boardDate)
      .order("board_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) fail(`Unable to load tasks before ${boardDate}`, error);
    return (data ?? []).map(mapTask);
  },

  byCase: async (caseId: string): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("related_case_id", caseId)
      .order("due_date", { ascending: true });

    if (error) fail(`Unable to load tasks for case ${caseId}`, error);
    return (data ?? []).map(mapTask);
  },

  byUser: async (uid: string): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", uid)
      .order("due_date", { ascending: true });

    if (error) fail(`Unable to load tasks for user ${uid}`, error);
    return (data ?? []).map(mapTask);
  },

  byStatus: async (status: string): Promise<Task[]> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", status)
      .order("due_date", { ascending: true });

    if (error) fail(`Unable to load ${status} tasks`, error);
    return (data ?? []).map(mapTask);
  },

  create: async (input: CreateTaskInput): Promise<Task> => {
    const { data, error } = await supabase
      .from("tasks")
      .insert(taskToInsert(input))
      .select()
      .single();

    if (error) fail("Unable to create task", error);
    return mapTask(data);
  },

  upsertMany: async (tasks: Task[]): Promise<Task[]> => {
    if (tasks.length === 0) return [];

    const { data, error } = await supabase
      .from("tasks")
      .upsert(tasks.map(taskToInsert), { onConflict: "id" })
      .select();

    if (error) fail("Unable to save tasks", error);
    return (data ?? []).map(mapTask);
  },
};

export const claimsService = {
  list: async (): Promise<Claim[]> => {
    const { data, error } = await supabase
      .from("claims")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) fail("Unable to load claims", error);
    return (data ?? []).map(mapClaim);
  },

  get: async (id: string): Promise<Claim | undefined> => {
    const { data, error } = await supabase.from("claims").select("*").eq("id", id).maybeSingle();

    if (error) fail(`Unable to load claim ${id}`, error);
    return data ? mapClaim(data) : undefined;
  },

  create: async (input: CreateClaimInput): Promise<Claim> => {
    const { data, error } = await supabase
      .from("claims")
      .insert(claimToInsert(input))
      .select()
      .single();

    if (error) fail("Unable to create claim", error);
    return mapClaim(data);
  },
};

export const usersService = {
  list: () => _users,
  get: (id: string) => _users.find((u) => u.id === id),
  agents: () => _users.filter((u) => u.role === "Agent"),
};

export const activityService = {
  list: () => _activities,
  forEntity: (entity: string, id: string) =>
    _activities.filter((a) => a.entity === entity && a.entityId === id),
};

export const notificationsService = {
  list: () => _notifications,
  unreadCount: () => _notifications.filter((n) => !n.read).length,
};

/* Helpers used by Dashboard & AI assistant context. */
export const stats = async () => {
  const [allCases, allTasks, allClaims] = await Promise.all([
    casesService.list(),
    tasksService.list(),
    claimsService.list(),
  ]);
  const today = new Date();
  const overdueTasks = allTasks.filter(
    (t) => t.status !== "Completed" && new Date(t.dueDate) < today,
  ).length;
  const overdueFollowUps = allCases.filter(
    (c) => c.followUpDate && new Date(c.followUpDate) < today,
  ).length;
  return {
    activeCases: allCases.filter((c) => !["Closed", "Rejected", "Issued"].includes(c.status))
      .length,
    pendingUnderwriting: allCases.filter((c) => c.status === "Pending Underwriting").length,
    approvedUnpaid: allCases.filter((c) => c.status === "Pending Payment").length,
    overdueFollowUps,
    overdueTasks,
    openClaims: allClaims.filter((c) => !["Closed", "Rejected", "Approved"].includes(c.status))
      .length,
    totalANP: allCases.reduce((s, c) => s + c.anpEstimate, 0),
  };
};
