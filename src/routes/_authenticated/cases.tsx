import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { casesService, usersService } from "@/services";
import type { CaseStatus } from "@/types/domain";

const STATUSES: (CaseStatus | "All")[] = [
  "All", "Draft", "Submitted", "Pending Underwriting", "Pending Payment",
  "Approved", "Issued", "Closed", "Rejected",
];

export const Route = createFileRoute("/_authenticated/cases")({
  head: () => ({ meta: [{ title: "Cases — Agency Ops" }] }),
  component: CasesPage,
});

function CasesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("All");
  const all = casesService.list();
  const filtered = useMemo(() => {
    return all.filter((c) => {
      const matchQ = !q ||
        c.clientName.toLowerCase().includes(q.toLowerCase()) ||
        c.id.toLowerCase().includes(q.toLowerCase());
      const matchS = status === "All" || c.status === status;
      return matchQ && matchS;
    });
  }, [all, q, status]);

  return (
    <div>
      <PageHeader
        title="Cases"
        description="Track every insurance case from draft to issuance."
        actions={<Button><Plus className="mr-1.5 h-4 w-4" />New Case</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search by client or case ID…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">{filtered.length} of {all.length}</div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Case ID</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Premium</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/cases/$caseId" params={{ caseId: c.id }} className="text-primary hover:underline">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.clientName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{usersService.get(c.agentId)?.name}</td>
                  <td className="px-4 py-3">{c.productType}</td>
                  <td className="px-4 py-3 text-right">${c.premium.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge value={c.status} /></td>
                  <td className="px-4 py-3"><StatusBadge value={c.priority} /></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.followUpDate ? new Date(c.followUpDate).toLocaleDateString("en-US") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}