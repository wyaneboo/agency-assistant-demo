import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label, value, sublabel, icon: Icon, tone = "default",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneRing = {
    default: "text-primary bg-primary/10",
    warning: "text-warning-foreground bg-warning/20",
    danger: "text-destructive bg-destructive/10",
    success: "text-success bg-success/10",
  }[tone];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
            {sublabel && (
              <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
            )}
          </div>
          {Icon && (
            <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneRing}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}