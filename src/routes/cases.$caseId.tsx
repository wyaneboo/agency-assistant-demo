import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { casesService, usersService, activityService, tasksService } from "@/services";

export const Route = createFileRoute("/cases/$caseId")({
  component: CaseDetail,
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">Case not found.</p>
      <Link to="/cases" className="text-primary hover:underline">Back to cases</Link>
    </div>
  ),
  loader: ({ params }) => {
    const c = casesService.get(params.caseId);
    if (!c) throw notFound();
    return c;
  },
});

function CaseDetail() {
  const c = Route.useLoaderData();
  const agent = usersService.get(c.agentId);
  const activity = activityService.forEntity("case", c.id);
  const relatedTasks = tasksService.list().filter((t) => t.relatedCaseId === c.id);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/cases"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
      </Button>
      <PageHeader
        title={`${c.id} — ${c.clientName}`}
        description={`${c.productType} · ${agent?.name}`}
        actions={<><Button variant="outline">Edit</Button><Button>Add Note</Button></>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Case Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <Field label="Status"><StatusBadge value={c.status} /></Field>
              <Field label="Priority"><StatusBadge value={c.priority} /></Field>
              <Field label="Premium">${c.premium.toLocaleString()}</Field>
              <Field label="ANP / FYP">${c.anpEstimate.toLocaleString()}</Field>
              <Field label="Submitted">{new Date(c.submittedDate).toLocaleDateString()}</Field>
              <Field label="Follow-up">{c.followUpDate ? new Date(c.followUpDate).toLocaleDateString() : "—"}</Field>
              <Field label="Missing Documents">
                {c.missingDocuments.length ? c.missingDocuments.join(", ") : "None"}
              </Field>
              <Field label="Remarks">{c.remarks ?? "—"}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            {activity.map((a) => (
              <div key={a.id} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm text-foreground">{a.action}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Related Tasks</CardTitle></CardHeader>
        <CardContent>
          {relatedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks linked.</p>
          ) : (
            <div className="space-y-2">
              {relatedTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Due {new Date(t.dueDate).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge value={t.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}