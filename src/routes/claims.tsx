import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { claimsService, usersService } from "@/services";

export const Route = createFileRoute("/claims")({
  head: () => ({ meta: [{ title: "Claims — Agency Ops" }] }),
  component: ClaimsPage,
});

function ClaimsPage() {
  const claims = claimsService.list();
  return (
    <div>
      <PageHeader
        title="Claims"
        description="Track every claim from report to closure."
        actions={<Button><Plus className="mr-1.5 h-4 w-4" />New Claim</Button>}
      />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Claim ID</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Missing Docs</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {claims.map((c) => (
              <tr key={c.id} className="hover:bg-accent/30">
                <td className="px-4 py-3 font-medium">{c.id}</td>
                <td className="px-4 py-3">{c.clientName}</td>
                <td className="px-4 py-3">{c.claimType}</td>
                <td className="px-4 py-3 text-muted-foreground">{usersService.get(c.assignedAdminId)?.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(c.submissionDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.missingDocuments.length ? c.missingDocuments.join(", ") : "None"}
                </td>
                <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}