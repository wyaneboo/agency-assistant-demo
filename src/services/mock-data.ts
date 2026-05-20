import type {
  Case,
  Candidate,
  Claim,
  Task,
  User,
  ActivityEntry,
  Notification,
} from "@/types/domain";

export const users: User[] = [
  { id: "u1", name: "Priya Sharma", email: "priya@agency.com", role: "GroupManager" },
  { id: "u2", name: "Marcus Lee", email: "marcus@agency.com", role: "Admin" },
  { id: "u3", name: "Aisha Tan", email: "aisha@agency.com", role: "Agent", phone: "+65 9123 4567" },
  { id: "u4", name: "Daniel Koh", email: "daniel@agency.com", role: "Agent", phone: "+65 9234 5678" },
  { id: "u5", name: "Sara Lim", email: "sara@agency.com", role: "Agent", phone: "+65 9345 6789" },
  { id: "u6", name: "Jonas Ng", email: "jonas@agency.com", role: "Agent", phone: "+65 9456 7890" },
];

const now = new Date().toISOString();
const days = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

export const cases: Case[] = [
  {
    id: "C-1001", clientName: "Tan Wei Ming", agentId: "u3", productType: "Whole Life",
    premium: 4800, anpEstimate: 4800, status: "Pending Underwriting",
    missingDocuments: ["Medical Report"], submittedDate: days(-5), followUpDate: days(2),
    priority: "High", remarks: "Awaiting GP report.", createdAt: days(-5), updatedAt: now, createdBy: "u3",
  },
  {
    id: "C-1002", clientName: "Rachel Goh", agentId: "u4", productType: "ILP",
    premium: 12000, anpEstimate: 12000, status: "Pending Payment",
    missingDocuments: [], submittedDate: days(-12), followUpDate: days(-1),
    priority: "Urgent", remarks: "Payment due — chase today.", createdAt: days(-12), updatedAt: now, createdBy: "u4",
  },
  {
    id: "C-1003", clientName: "Ahmad Razak", agentId: "u3", productType: "Term Life",
    premium: 1800, anpEstimate: 1800, status: "Approved",
    missingDocuments: [], submittedDate: days(-20), priority: "Medium",
    createdAt: days(-20), updatedAt: now, createdBy: "u3",
  },
  {
    id: "C-1004", clientName: "Linda Chua", agentId: "u5", productType: "Endowment",
    premium: 6000, anpEstimate: 6000, status: "Issued",
    missingDocuments: [], submittedDate: days(-30), priority: "Low",
    createdAt: days(-30), updatedAt: now, createdBy: "u5",
  },
  {
    id: "C-1005", clientName: "Kenji Yeo", agentId: "u6", productType: "Whole Life",
    premium: 3200, anpEstimate: 3200, status: "Submitted",
    missingDocuments: ["NRIC copy"], submittedDate: days(-2), followUpDate: days(3),
    priority: "Medium", createdAt: days(-2), updatedAt: now, createdBy: "u6",
  },
  {
    id: "C-1006", clientName: "Mary Tan", agentId: "u4", productType: "Critical Illness",
    premium: 2400, anpEstimate: 2400, status: "Rejected",
    missingDocuments: [], submittedDate: days(-40), priority: "Low",
    remarks: "Pre-existing condition.", createdAt: days(-40), updatedAt: now, createdBy: "u4",
  },
  {
    id: "C-1007", clientName: "Vincent Ho", agentId: "u5", productType: "ILP",
    premium: 9600, anpEstimate: 9600, status: "Draft",
    missingDocuments: ["Application Form"], submittedDate: days(0), priority: "Medium",
    createdAt: days(0), updatedAt: now, createdBy: "u5",
  },
];

export const tasks: Task[] = [
  {
    id: "T-1", title: "Chase medical report for Tan Wei Ming", assignedTo: "u3",
    dueDate: days(1), priority: "High", status: "In Progress", relatedCaseId: "C-1001",
    createdAt: days(-3), updatedAt: now, createdBy: "u2",
  },
  {
    id: "T-2", title: "Call Rachel Goh re: premium payment", assignedTo: "u4",
    dueDate: days(-1), priority: "Urgent", status: "Overdue", relatedCaseId: "C-1002",
    createdAt: days(-2), updatedAt: now, createdBy: "u2",
  },
  {
    id: "T-3", title: "Prepare Q4 production report", assignedTo: "u1",
    dueDate: days(5), priority: "Medium", status: "To Do",
    createdAt: days(-1), updatedAt: now, createdBy: "u1",
  },
  {
    id: "T-4", title: "Schedule interview — Jovan Wee", assignedTo: "u2",
    dueDate: days(2), priority: "Medium", status: "To Do", relatedCandidateId: "R-2",
    createdAt: days(-1), updatedAt: now, createdBy: "u1",
  },
  {
    id: "T-5", title: "Submit claim documents — Linda Chua", assignedTo: "u2",
    dueDate: days(3), priority: "High", status: "Waiting", relatedClaimId: "CL-2",
    createdAt: days(-2), updatedAt: now, createdBy: "u2",
  },
  {
    id: "T-6", title: "Weekly team sync notes", assignedTo: "u1",
    dueDate: days(-3), priority: "Low", status: "Completed",
    createdAt: days(-7), updatedAt: now, createdBy: "u1",
  },
];

export const candidates: Candidate[] = [
  {
    id: "R-1", name: "Hui Min Lau", phone: "+65 9111 2222", source: "Referral",
    referredById: "u3", stage: "Contacted", nextFollowUpDate: days(2),
    notes: [{ id: "n1", text: "Interested, asked for brochure.", at: days(-1), by: "u2" }],
    createdAt: days(-3), updatedAt: now,
  },
  {
    id: "R-2", name: "Jovan Wee", phone: "+65 9222 3333", source: "LinkedIn",
    stage: "Interview Scheduled", interviewDate: days(2),
    notes: [], createdAt: days(-5), updatedAt: now,
  },
  {
    id: "R-3", name: "Felicia Ong", phone: "+65 9333 4444", source: "Walk-in",
    stage: "New Lead", notes: [], createdAt: days(-1), updatedAt: now,
  },
  {
    id: "R-4", name: "Brandon Teo", phone: "+65 9444 5555", source: "Referral",
    referredById: "u4", stage: "Attended", nextFollowUpDate: days(1),
    notes: [{ id: "n2", text: "Strong fit, decision pending.", at: days(-2), by: "u1" }],
    createdAt: days(-10), updatedAt: now,
  },
  {
    id: "R-5", name: "Nadia Karim", phone: "+65 9555 6666", source: "Job Portal",
    stage: "Joined", notes: [], createdAt: days(-30), updatedAt: now,
  },
  {
    id: "R-6", name: "Eric Sim", phone: "+65 9666 7777", source: "Referral",
    referredById: "u5", stage: "Dropped",
    notes: [{ id: "n3", text: "Took another offer.", at: days(-5), by: "u2" }],
    createdAt: days(-20), updatedAt: now,
  },
];

export const claims: Claim[] = [
  {
    id: "CL-1", clientName: "Tan Wei Ming", claimType: "Hospitalization",
    assignedAdminId: "u2", status: "Collecting Documents",
    missingDocuments: ["Discharge summary"], submissionDate: days(-3),
    remarks: "Patient still hospitalized.", createdAt: days(-3), updatedAt: now,
  },
  {
    id: "CL-2", clientName: "Linda Chua", claimType: "Critical Illness",
    assignedAdminId: "u2", status: "Submitted",
    missingDocuments: [], submissionDate: days(-10),
    createdAt: days(-10), updatedAt: now,
  },
  {
    id: "CL-3", clientName: "Ahmad Razak", claimType: "Death",
    assignedAdminId: "u2", status: "Pending",
    missingDocuments: ["Coroner report"], submissionDate: days(-20),
    createdAt: days(-20), updatedAt: now,
  },
  {
    id: "CL-4", clientName: "Rachel Goh", claimType: "Outpatient",
    assignedAdminId: "u2", status: "Approved", missingDocuments: [],
    submissionDate: days(-30), createdAt: days(-30), updatedAt: now,
  },
];

export const activities: ActivityEntry[] = [
  { id: "a1", entity: "case", entityId: "C-1002", action: "Status changed to Pending Payment", by: "u4", at: days(-1) },
  { id: "a2", entity: "task", entityId: "T-2", action: "Task marked Overdue", by: "system", at: days(0) },
  { id: "a3", entity: "candidate", entityId: "R-2", action: "Interview scheduled", by: "u2", at: days(-1) },
  { id: "a4", entity: "claim", entityId: "CL-2", action: "Claim submitted to insurer", by: "u2", at: days(-2) },
  { id: "a5", entity: "case", entityId: "C-1004", action: "Policy issued", by: "u5", at: days(-3) },
];

export const notifications: Notification[] = [
  { id: "N1", title: "Overdue follow-up", body: "Rachel Goh premium payment overdue.", read: false, at: days(0), kind: "warning" },
  { id: "N2", title: "New candidate", body: "Felicia Ong added to pipeline.", read: false, at: days(-1), kind: "info" },
  { id: "N3", title: "Claim approved", body: "CL-4 approved by insurer.", read: true, at: days(-3), kind: "success" },
];