import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { claimsService, usersService } from "@/services";
import type { Claim, ClaimStatus } from "@/types/domain";

const CLAIM_STATUSES: ClaimStatus[] = [
  "Reported",
  "Collecting Documents",
  "Submitted",
  "Pending",
  "Approved",
  "Rejected",
  "Appealed",
  "Closed",
];

type NewClaimDraft = {
  clientName: string;
  claimType: string;
  assignedAdminId: string;
  status: ClaimStatus;
  submissionDate: string;
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

function dateKeyToIsoDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toISOString();
}

function createDraft(defaultAdminId: string): NewClaimDraft {
  return {
    clientName: "",
    claimType: "",
    assignedAdminId: defaultAdminId,
    status: "Reported",
    submissionDate: todayDateKey(),
    missingDocuments: "",
    remarks: "",
  };
}

export const Route = createFileRoute("/_authenticated/claims")({
  head: () => ({ meta: [{ title: "Claims - THL Operations Hub" }] }),
  component: ClaimsPage,
});

function ClaimsPage() {
  const users = usersService.list();
  const adminUsers = users.filter((user) => user.role === "Admin");
  const assignableAdmins = adminUsers.length ? adminUsers : users;
  const defaultAdminId = assignableAdmins[0]?.id ?? "";
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [claimToDelete, setClaimToDelete] = useState<Claim | null>(null);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewClaimDraft>(() => createDraft(defaultAdminId));

  const canSubmit = Boolean(
    draft.clientName.trim() &&
    draft.claimType.trim() &&
    draft.assignedAdminId &&
    draft.submissionDate,
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    claimsService
      .list()
      .then((loadedClaims) => {
        if (!cancelled) setClaims(loadedClaims);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load claims.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openNewClaimDialog = () => {
    setDraft(createDraft(defaultAdminId));
    setDialogOpen(true);
  };

  const createClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      const createdClaim = await claimsService.create({
        clientName: draft.clientName.trim(),
        claimType: draft.claimType.trim(),
        assignedAdminId: draft.assignedAdminId,
        status: draft.status,
        missingDocuments: draft.missingDocuments
          .split(",")
          .map((document) => document.trim())
          .filter(Boolean),
        submissionDate: dateKeyToIsoDate(draft.submissionDate || todayDateKey()),
        remarks: draft.remarks.trim() || undefined,
      });

      setClaims((current) => [createdClaim, ...current]);
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create claim.");
    } finally {
      setSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!claimToDelete) return;

    setDeletingClaimId(claimToDelete.id);
    setError(null);

    try {
      await claimsService.delete(claimToDelete.id);
      setClaims((current) => current.filter((claim) => claim.id !== claimToDelete.id));
      setClaimToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete claim.");
    } finally {
      setDeletingClaimId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Claims"
        description="Track every claim from report to closure."
        actions={
          <Button onClick={openNewClaimDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Claim
          </Button>
        }
      />
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
                <th className="px-4 py-3">Claim ID</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Missing Docs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading claims...
                  </td>
                </tr>
              )}
              {!loading &&
                claims.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{c.id}</td>
                    <td className="px-4 py-3">{c.clientName}</td>
                    <td className="px-4 py-3">{c.claimType}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {usersService.get(c.assignedAdminId)?.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.submissionDate).toLocaleDateString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.missingDocuments.length ? c.missingDocuments.join(", ") : "None"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={deletingClaimId === c.id}
                        aria-label={`Delete claim ${c.id}`}
                        onClick={() => setClaimToDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && claims.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No claims have been added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={createClaim} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New Claim</DialogTitle>
              <DialogDescription>Add a client claim to the claims tracker.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="claim-client">Client</Label>
                  <Input
                    id="claim-client"
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
                  <Label htmlFor="claim-type">Claim Type</Label>
                  <Input
                    id="claim-type"
                    required
                    placeholder="Hospitalization, Critical Illness..."
                    value={draft.claimType}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, claimType: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Assigned Admin</Label>
                  <Select
                    value={draft.assignedAdminId}
                    onValueChange={(assignedAdminId) =>
                      setDraft((current) => ({ ...current, assignedAdminId }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select admin" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableAdmins.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {admin.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(status) =>
                      setDraft((current) => ({ ...current, status: status as ClaimStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLAIM_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="claim-submitted">Submitted</Label>
                <Input
                  id="claim-submitted"
                  type="date"
                  value={draft.submissionDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, submissionDate: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="claim-documents">Missing Documents</Label>
                <Input
                  id="claim-documents"
                  placeholder="Discharge summary, insurer form"
                  value={draft.missingDocuments}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, missingDocuments: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="claim-remarks">Remarks</Label>
                <Textarea
                  id="claim-remarks"
                  placeholder="Notes for claims follow-up"
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
                {saving ? "Adding..." : "Add Claim"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={Boolean(claimToDelete)}
        onOpenChange={(open) => {
          if (!open) setClaimToDelete(null);
        }}
        title="Delete claim?"
        description={
          claimToDelete
            ? `This will permanently delete claim ${claimToDelete.id} for ${claimToDelete.clientName}.`
            : "This claim will be permanently deleted."
        }
        confirmLabel="Delete claim"
        deleting={Boolean(deletingClaimId)}
        onConfirm={deleteClaim}
      />
    </div>
  );
}
