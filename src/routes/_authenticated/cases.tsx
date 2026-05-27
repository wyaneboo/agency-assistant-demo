import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { casesService, usersService } from "@/services";
import type { Case, CaseStatus, Priority, User } from "@/types/domain";

const CASE_STATUSES: CaseStatus[] = [
  "Draft",
  "Submitted",
  "Pending Underwriting",
  "Pending Payment",
  "Approved",
  "Issued",
  "Closed",
  "Rejected",
];
const STATUS_FILTERS: (CaseStatus | "All")[] = ["All", ...CASE_STATUSES];
const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Urgent"];

type NewCaseDraft = {
  clientName: string;
  agentId: string;
  productType: string;
  premium: string;
  anpEstimate: string;
  status: CaseStatus;
  priority: Priority;
  submittedDate: string;
  followUpDate: string;
  missingDocuments: string;
  remarks: string;
};

function todayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDraft(defaultAgentId: string): NewCaseDraft {
  return {
    clientName: "",
    agentId: defaultAgentId,
    productType: "",
    premium: "",
    anpEstimate: "",
    status: "Draft",
    priority: "Medium",
    submittedDate: todayDateKey(),
    followUpDate: "",
    missingDocuments: "",
    remarks: "",
  };
}

export const Route = createFileRoute("/_authenticated/cases")({
  head: () => ({ meta: [{ title: "Cases - THL Operations Hub" }] }),
  component: CasesPage,
});

function CasesPage() {
  const [agents, setAgents] = useState<User[]>(usersService.agents());
  const defaultAgentId = agents[0]?.id ?? "";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [allCases, setAllCases] = useState<Awaited<ReturnType<typeof casesService.list>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewCaseDraft>(() => createDraft(defaultAgentId));
  const userName = (id: string) => agents.find((agent) => agent.id === id)?.name ?? id;

  const premium = Number(draft.premium);
  const anpEstimate = draft.anpEstimate.trim() ? Number(draft.anpEstimate) : premium;
  const canSubmit = Boolean(
    draft.clientName.trim() &&
    draft.agentId &&
    draft.productType.trim() &&
    draft.premium.trim() &&
    premium > 0 &&
    !Number.isNaN(premium) &&
    !Number.isNaN(anpEstimate) &&
    anpEstimate >= 0,
  );

  const filtered = useMemo(() => {
    return allCases.filter((c) => {
      const query = q.trim().toLowerCase();
      const matchQ =
        !query || c.clientName.toLowerCase().includes(query) || c.id.toLowerCase().includes(query);
      const matchS = status === "All" || c.status === status;
      return matchQ && matchS;
    });
  }, [allCases, q, status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([casesService.list(), usersService.load()])
      .then(([loadedCases, loadedUsers]) => {
        if (cancelled) return;
        setAllCases(loadedCases);
        setAgents(loadedUsers.filter((user) => user.role === "Agent"));
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

  const openNewCaseDialog = () => {
    setDraft(createDraft(defaultAgentId));
    setDialogOpen(true);
  };

  const createCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      const createdCase = await casesService.create({
        clientName: draft.clientName.trim(),
        agentId: draft.agentId,
        productType: draft.productType.trim(),
        premium,
        anpEstimate,
        status: draft.status,
        missingDocuments: draft.missingDocuments
          .split(",")
          .map((document) => document.trim())
          .filter(Boolean),
        submittedDate: draft.submittedDate || todayDateKey(),
        followUpDate: draft.followUpDate || undefined,
        priority: draft.priority,
        remarks: draft.remarks.trim() || undefined,
        createdBy: draft.agentId,
      });

      setAllCases((current) => [createdCase, ...current]);
      setQ("");
      setStatus("All");
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create case.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCase = async () => {
    if (!caseToDelete) return;

    setDeletingCaseId(caseToDelete.id);
    setError(null);

    try {
      await casesService.delete(caseToDelete.id);
      setAllCases((current) => current.filter((c) => c.id !== caseToDelete.id));
      setCaseToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete case.");
    } finally {
      setDeletingCaseId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cases"
        description="Track every insurance case from draft to issuance."
        actions={
          <Button onClick={openNewCaseDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Case
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by client or case ID..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {allCases.length}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading cases...
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        className="text-primary hover:underline"
                      >
                        {c.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{c.clientName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {userName(c.agentId)}
                    </td>
                    <td className="px-4 py-3">{c.productType}</td>
                    <td className="px-4 py-3 text-right">${c.premium.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.priority} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.followUpDate ? new Date(c.followUpDate).toLocaleDateString("en-US") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={deletingCaseId === c.id}
                        aria-label={`Delete case ${c.id}`}
                        onClick={() => setCaseToDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No cases match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={createCase} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New Case</DialogTitle>
              <DialogDescription>Add a client case to the agency pipeline.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="case-client">Client</Label>
                  <Input
                    id="case-client"
                    autoFocus
                    required
                    placeholder="Client name"
                    value={draft.clientName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, clientName: event.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Agent</Label>
                  <Select
                    value={draft.agentId}
                    onValueChange={(agentId) => setDraft((current) => ({ ...current, agentId }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="case-product">Product</Label>
                <Input
                  id="case-product"
                  required
                  placeholder="Whole Life, ILP, Term Life..."
                  value={draft.productType}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, productType: event.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="case-premium">Premium</Label>
                  <Input
                    id="case-premium"
                    required
                    min="1"
                    step="0.01"
                    type="number"
                    placeholder="4800"
                    value={draft.premium}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, premium: event.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="case-anp">ANP / FYP</Label>
                  <Input
                    id="case-anp"
                    min="0"
                    step="0.01"
                    type="number"
                    placeholder="Defaults to premium"
                    value={draft.anpEstimate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, anpEstimate: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(nextStatus) =>
                      setDraft((current) => ({ ...current, status: nextStatus as CaseStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CASE_STATUSES.map((nextStatus) => (
                        <SelectItem key={nextStatus} value={nextStatus}>
                          {nextStatus}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Priority</Label>
                  <Select
                    value={draft.priority}
                    onValueChange={(priority) =>
                      setDraft((current) => ({ ...current, priority: priority as Priority }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="case-submitted">Submitted</Label>
                  <Input
                    id="case-submitted"
                    type="date"
                    value={draft.submittedDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, submittedDate: event.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="case-follow-up">Follow-up</Label>
                  <Input
                    id="case-follow-up"
                    type="date"
                    value={draft.followUpDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, followUpDate: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="case-documents">Missing Documents</Label>
                <Input
                  id="case-documents"
                  placeholder="Medical Report, NRIC copy"
                  value={draft.missingDocuments}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, missingDocuments: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="case-remarks">Remarks</Label>
                <Textarea
                  id="case-remarks"
                  placeholder="Notes for underwriting, payment, or follow-up"
                  value={draft.remarks}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, remarks: event.target.value }))
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? "Adding..." : "Add Case"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={Boolean(caseToDelete)}
        onOpenChange={(open) => {
          if (!open) setCaseToDelete(null);
        }}
        title="Delete case?"
        description={
          caseToDelete
            ? `This will permanently delete case ${caseToDelete.id} for ${caseToDelete.clientName}.`
            : "This case will be permanently deleted."
        }
        confirmLabel="Delete case"
        deleting={Boolean(deletingCaseId)}
        onConfirm={deleteCase}
      />
    </div>
  );
}
