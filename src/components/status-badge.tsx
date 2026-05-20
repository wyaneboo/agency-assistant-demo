import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-info/15 text-info border border-info/30",
  warning: "bg-warning/20 text-warning-foreground border border-warning/40",
  success: "bg-success/15 text-success border border-success/30",
  danger: "bg-destructive/15 text-destructive border border-destructive/30",
  muted: "bg-muted text-muted-foreground",
};

const map: Record<string, Tone> = {
  "Draft": "muted",
  "Submitted": "info",
  "Pending Underwriting": "warning",
  "Pending Payment": "warning",
  "Approved": "success",
  "Issued": "success",
  "Closed": "muted",
  "Rejected": "danger",
  "To Do": "neutral",
  "In Progress": "info",
  "Waiting": "warning",
  "Completed": "success",
  "Overdue": "danger",
  "Reported": "info",
  "Collecting Documents": "warning",
  "Pending": "warning",
  "Appealed": "info",
  "New Lead": "info",
  "Contacted": "neutral",
  "Interview Scheduled": "info",
  "Attended": "info",
  "Interested": "success",
  "Follow-Up": "warning",
  "Joined": "success",
  "Dropped": "muted",
  "Low": "muted",
  "Medium": "neutral",
  "High": "warning",
  "Urgent": "danger",
};

export function StatusBadge({ value }: { value: string }) {
  const tone = map[value] ?? "neutral";
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      toneClasses[tone]
    )}>
      {value}
    </span>
  );
}