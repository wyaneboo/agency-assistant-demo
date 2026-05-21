import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  Briefcase, AlertTriangle, Banknote, ClockAlert, Users,
  ShieldCheck, ListChecks, TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  casesService, tasksService, candidatesService, activityService,
  usersService, stats,
} from "@/services";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function Index() {
  const s = stats();
  const userById = (id: string) => usersService.get(id)?.name ?? id;
  const upcomingTasks = tasksService.list()
    .filter((t) => t.status !== "Completed")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
    .slice(0, 5);
  const recentActivity = activityService.list().slice(0, 6);
  const overdueFollowUps = casesService.list().filter(
    (c) => c.followUpDate && new Date(c.followUpDate) < new Date()
  );
  const agentActivity = usersService.agents().map((a) => ({
    agent: a,
    cases: casesService.byAgent(a.id).length,
    open: casesService.byAgent(a.id).filter((c) => !["Closed","Rejected","Issued"].includes(c.status)).length,
  }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of cases, tasks, claims, and recruitment."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Cases" value={s.activeCases} icon={Briefcase} />
        <StatCard label="Pending Underwriting" value={s.pendingUnderwriting} icon={AlertTriangle} tone="warning" />
        <StatCard label="Approved Unpaid" value={s.approvedUnpaid} icon={Banknote} tone="warning" />
        <StatCard label="Overdue Follow-ups" value={s.overdueFollowUps} icon={ClockAlert} tone="danger" />
        <StatCard label="Recruitment Pipeline" value={s.candidatesInPipeline} icon={Users} />
        <StatCard label="Open Claims" value={s.openClaims} icon={ShieldCheck} />
        <StatCard label="Overdue Tasks" value={s.overdueTasks} icon={ListChecks} tone="danger" />
        <StatCard label="Total ANP" value={`$${s.totalANP.toLocaleString()}`} icon={TrendingUp} tone="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Tasks</CardTitle>
              <CardDescription>Next 5 tasks by due date</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/tasks">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {userById(t.assignedTo)} · Due {new Date(t.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={t.priority} />
                  <StatusBadge value={t.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Across all modules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((a) => (
              <div key={a.id} className="text-sm">
                <p className="text-foreground">{a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {a.entity} · {a.entityId} · {new Date(a.at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overdue Follow-ups</CardTitle>
            <CardDescription>Cases past their follow-up date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueFollowUps.length === 0 && (
              <p className="text-sm text-muted-foreground">No overdue follow-ups.</p>
            )}
            {overdueFollowUps.map((c) => (
              <Link to="/cases/$caseId" params={{ caseId: c.id }} key={c.id}
                className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent/40">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.id} · {userById(c.agentId)} · Follow-up {new Date(c.followUpDate!).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge value={c.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Activity</CardTitle>
            <CardDescription>Cases per agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {agentActivity.map((a) => (
              <div key={a.agent.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.agent.name}</p>
                  <p className="text-xs text-muted-foreground">{a.agent.email}</p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-foreground">{a.open} open</div>
                  <div className="text-xs text-muted-foreground">{a.cases} total</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
