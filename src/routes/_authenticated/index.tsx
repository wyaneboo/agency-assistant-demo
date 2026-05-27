import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  AlertTriangle,
  Banknote,
  ClockAlert,
  ShieldCheck,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { casesService, claimsService, activityService, usersService } from "@/services";
import { loadAllTasks } from "@/lib/tasks-csv-store";
import type { Case, Claim, Task, User } from "@/types/domain";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function Index() {
  const [dashboardCases, setDashboardCases] = useState<Case[]>([]);
  const [dashboardClaims, setDashboardClaims] = useState<Claim[]>([]);
  const [dashboardTasks, setDashboardTasks] = useState<Task[]>([]);
  const [dashboardUsers, setDashboardUsers] = useState<User[]>(usersService.list());
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const userById = (id: string) => dashboardUsers.find((user) => user.id === id)?.name ?? id;
  const openClaims = useMemo(
    () =>
      dashboardClaims.filter((c) => !["Closed", "Rejected", "Approved"].includes(c.status)).length,
    [dashboardClaims],
  );

  const caseStats = useMemo(
    () => ({
      activeCases: dashboardCases.filter(
        (c) => !["Closed", "Rejected", "Issued"].includes(c.status),
      ).length,
      pendingUnderwriting: dashboardCases.filter((c) => c.status === "Pending Underwriting").length,
      approvedUnpaid: dashboardCases.filter((c) => c.status === "Pending Payment").length,
      totalANP: dashboardCases.reduce((sum, c) => sum + c.anpEstimate, 0),
    }),
    [dashboardCases],
  );
  const upcomingTasks = useMemo(
    () =>
      dashboardTasks
        .filter((t) => t.status !== "Completed")
        .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
        .slice(0, 5),
    [dashboardTasks],
  );
  const overdueTasks = useMemo(
    () =>
      dashboardTasks.filter((t) => t.status !== "Completed" && new Date(t.dueDate) < new Date())
        .length,
    [dashboardTasks],
  );
  const recentActivity = activityService.list().slice(0, 6);
  const overdueFollowUps = useMemo(
    () => dashboardCases.filter((c) => c.followUpDate && new Date(c.followUpDate) < new Date()),
    [dashboardCases],
  );
  const agentActivity = useMemo(
    () =>
      dashboardUsers
        .filter((user) => user.role === "Agent")
        .map((a) => {
          const agentCases = dashboardCases.filter((c) => c.agentId === a.id);
          return {
            agent: a,
            cases: agentCases.length,
            open: agentCases.filter((c) => !["Closed", "Rejected", "Issued"].includes(c.status))
              .length,
          };
        }),
    [dashboardCases, dashboardUsers],
  );

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    Promise.all([casesService.list(), loadAllTasks(), claimsService.list(), usersService.load()])
      .then(([loadedCases, loadedTasks, loadedClaims, loadedUsers]) => {
        if (cancelled) return;
        setDashboardCases(loadedCases);
        setDashboardTasks(loadedTasks);
        setDashboardClaims(loadedClaims);
        setDashboardUsers(loadedUsers);
      })
      .catch((err) => {
        if (!cancelled) {
          setDashboardCases([]);
          setDashboardTasks([]);
          setDashboardClaims([]);
          setDataError(err instanceof Error ? err.message : "Unable to load dashboard data.");
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of cases, tasks, and claims."
      />

      {dataError && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {dataError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Cases"
          value={dataLoading ? "-" : caseStats.activeCases}
          icon={Briefcase}
        />
        <StatCard
          label="Pending Underwriting"
          value={dataLoading ? "-" : caseStats.pendingUnderwriting}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="Approved Unpaid"
          value={dataLoading ? "-" : caseStats.approvedUnpaid}
          icon={Banknote}
          tone="warning"
        />
        <StatCard
          label="Overdue Follow-ups"
          value={dataLoading ? "-" : overdueFollowUps.length}
          icon={ClockAlert}
          tone="danger"
        />
        <StatCard
          label="Overdue Tasks"
          value={dataLoading ? "-" : overdueTasks}
          icon={ListChecks}
          tone="danger"
        />
        <StatCard label="Open Claims" value={dataLoading ? "-" : openClaims} icon={ShieldCheck} />
        <StatCard
          label="Total ANP"
          value={dataLoading ? "-" : `$${caseStats.totalANP.toLocaleString()}`}
          icon={TrendingUp}
          tone="success"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Tasks</CardTitle>
              <CardDescription>Next 5 Kanban tasks by due date</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/tasks">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {dataLoading && (
              <p className="text-sm text-muted-foreground">Loading Kanban tasks...</p>
            )}
            {!dataLoading && upcomingTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
            )}
            {upcomingTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {userById(t.assignedTo)} · Due {new Date(t.dueDate).toLocaleDateString("en-US")}
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
                  {a.entity} · {a.entityId} · {new Date(a.at).toLocaleDateString("en-US")}
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
              <Link
                to="/cases/$caseId"
                params={{ caseId: c.id }}
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent/40"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{c.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.id} · {userById(c.agentId)} · Follow-up{" "}
                    {new Date(c.followUpDate!).toLocaleDateString("en-US")}
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
              <div
                key={a.agent.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
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
