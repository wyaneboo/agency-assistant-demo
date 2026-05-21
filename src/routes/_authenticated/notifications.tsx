import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { notificationsService } from "@/services";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Agency Ops" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const items = notificationsService.list();
  const Icon = (k: string) => {
    switch (k) {
      case "warning": return AlertTriangle;
      case "success": return CheckCircle2;
      case "error": return XCircle;
      default: return Info;
    }
  };
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="In-app alerts. WhatsApp and email channels are scaffolded for later."
      />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-6 w-6" />No notifications.
            </div>
          )}
          {items.map((n) => {
            const I = Icon(n.kind);
            return (
              <div key={n.id} className="flex items-start gap-3 p-4">
                <I className={`mt-0.5 h-5 w-5 ${
                  n.kind === "warning" ? "text-warning-foreground" :
                  n.kind === "success" ? "text-success" :
                  n.kind === "error" ? "text-destructive" : "text-info"
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}