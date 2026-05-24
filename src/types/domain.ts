export type Role = "GroupManager" | "Admin" | "Agent";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatarUrl?: string;
}

export type CaseStatus =
  | "Draft"
  | "Submitted"
  | "Pending Underwriting"
  | "Pending Payment"
  | "Approved"
  | "Issued"
  | "Closed"
  | "Rejected";

export type Priority = "Low" | "Medium" | "High" | "Urgent";

export interface Case {
  id: string;
  clientName: string;
  agentId: string;
  productType: string;
  premium: number;
  anpEstimate: number;
  status: CaseStatus;
  missingDocuments: string[];
  submittedDate: string;
  followUpDate?: string;
  priority: Priority;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type TaskStatus = "To Do" | "In Progress" | "Waiting" | "Completed" | "Overdue";

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  boardDate?: string;
  carrySourceId?: string;
  carrySourceDate?: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  relatedCaseId?: string;
  relatedClaimId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ClaimStatus =
  | "Reported"
  | "Collecting Documents"
  | "Submitted"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Appealed"
  | "Closed";

export interface Claim {
  id: string;
  clientName: string;
  claimType: string;
  assignedAdminId: string;
  status: ClaimStatus;
  missingDocuments: string[];
  submissionDate: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  entity: "case" | "task" | "claim" | "agent";
  entityId: string;
  action: string;
  by: string;
  at: string;
  meta?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  title: string;
  body?: string;
  read: boolean;
  at: string;
  kind: "info" | "warning" | "success" | "error";
}
