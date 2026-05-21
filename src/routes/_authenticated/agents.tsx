import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { casesService, candidatesService, usersService } from "@/services";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents — Agency Ops" }] }),
  component: AgentsPage,
});

function AgentsPage() {
  const agents = usersService.agents();
  return (
    <div>
      <PageHeader title="Agents" description="Profiles, production, and pipeline activity." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const myCases = casesService.byAgent(a.id);
          const open = myCases.filter((c) => !["Closed","Rejected","Issued"].includes(c.status));
          const followUps = myCases.filter((c) => c.followUpDate && new Date(c.followUpDate) < new Date()).length;
          const refs = candidatesService.list().filter((c) => c.referredById === a.id).length;
          const totalANP = myCases.reduce((s, c) => s + c.anpEstimate, 0);
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {a.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    <CardDescription>{a.email}{a.phone ? ` · ${a.phone}` : ""}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Open Cases" value={open.length} />
                  <Metric label="Overdue Follow-ups" value={followUps} />
                  <Metric label="Total Cases" value={myCases.length} />
                  <Metric label="Referrals" value={refs} />
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