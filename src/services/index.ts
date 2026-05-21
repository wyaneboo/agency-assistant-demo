/**
 * Service layer — single boundary between UI and data.
 * Today: backed by in-memory mock data.
 * Tomorrow: swap with Lovable Cloud / Prisma / API calls without touching UI.
 * This is also the surface LangGraph AI agents will call.
 */
import {
  cases as _cases, tasks as _tasks,
  claims as _claims, users as _users, activities as _activities,
  notifications as _notifications,
} from "./mock-data";

export const casesService = {
  list: () => _cases,
  get: (id: string) => _cases.find((c) => c.id === id),
  byAgent: (agentId: string) => _cases.filter((c) => c.agentId === agentId),
};

export const tasksService = {
  list: () => _tasks,
  get: (id: string) => _tasks.find((t) => t.id === id),
  byUser: (uid: string) => _tasks.filter((t) => t.assignedTo === uid),
  byStatus: (s: string) => _tasks.filter((t) => t.status === s),
};


export const claimsService = {
  list: () => _claims,
  get: (id: string) => _claims.find((c) => c.id === id),
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
export const stats = () => {
  const all = _cases;
  const today = new Date();
  const overdueTasks = _tasks.filter(
    (t) => t.status !== "Completed" && new Date(t.dueDate) < today
  ).length;
  const overdueFollowUps = _cases.filter(
    (c) => c.followUpDate && new Date(c.followUpDate) < today
  ).length;
  return {
    activeCases: all.filter((c) => !["Closed", "Rejected", "Issued"].includes(c.status)).length,
    pendingUnderwriting: all.filter((c) => c.status === "Pending Underwriting").length,
    approvedUnpaid: all.filter((c) => c.status === "Pending Payment").length,
    overdueFollowUps,
    overdueTasks,
    openClaims: _claims.filter((c) => !["Closed", "Rejected", "Approved"].includes(c.status)).length,
    totalANP: all.reduce((s, c) => s + c.anpEstimate, 0),
  };
};