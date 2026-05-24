import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { casesService, usersService } from "@/services";
import type { Case } from "@/types/domain";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents - THL Operations Hub" }] }),
  component: AgentsPage,
});

function AgentsPage() {
  const agents = usersService.agents();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    casesService
      .list()
      .then((loadedCases) => {
        if (!cancelled) setCases(loadedCases);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load cases.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Agents" description="Profiles, production, and pipeline activity." />
      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="mb-4 text-sm text-muted-foreground">Loading agent activity...</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const myCases = cases.filter((c) => c.agentId === a.id);
          const open = myCases.filter((c) => !["Closed", "Rejected", "Issued"].includes(c.status));
          const followUps = myCases.filter(
            (c) => c.followUpDate && new Date(c.followUpDate) < new Date(),
          ).length;
          const totalANP = myCases.reduce((s, c) => s + c.anpEstimate, 0);
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {a.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    <CardDescription>
                      {a.email}
                      {a.phone ? ` · ${a.phone}` : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Open Cases" value={open.length} />
                  <Metric label="Overdue Follow-ups" value={followUps} />
                  <Metric label="Total Cases" value={myCases.length} />
                  <Metric label="Total ANP" value={`$${totalANP.toLocaleString()}`} />
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
