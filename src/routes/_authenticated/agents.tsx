import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { casesService, usersService } from "@/services";
import type { Case, User } from "@/types/domain";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents - THL Operations Hub" }] }),
  component: AgentsPage,
});

type AgentDraft = {
  name: string;
  email: string;
  phone: string;
};

const EMPTY_DRAFT: AgentDraft = {
  name: "",
  email: "",
  phone: "",
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "A"
  );
}

function AgentsPage() {
  const [users, setUsers] = useState<User[]>(usersService.list());
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT);
  const [agentToDelete, setAgentToDelete] = useState<User | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);

  const agents = useMemo(() => users.filter((user) => user.role === "Agent"), [users]);
  const canSubmit = Boolean(draft.name.trim() && draft.email.trim());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([usersService.load(), casesService.list()])
      .then(([loadedUsers, loadedCases]) => {
        if (cancelled) return;
        setUsers(loadedUsers);
        setCases(loadedCases);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load agent activity.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openAddDialog = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      const createdAgent = await usersService.create({
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || undefined,
        role: "Agent",
      });
      setUsers((current) =>
        [...current.filter((user) => user.id !== createdAgent.id), createdAgent].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setDialogOpen(false);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add agent.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAgent = async () => {
    if (!agentToDelete) return;

    setDeletingAgentId(agentToDelete.id);
    setError(null);

    try {
      await usersService.delete(agentToDelete.id);
      setUsers((current) => current.filter((user) => user.id !== agentToDelete.id));
      setAgentToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete agent.");
    } finally {
      setDeletingAgentId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Profiles, production, and pipeline activity."
        actions={
          <Button onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Agent
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="mb-4 text-sm text-muted-foreground">Loading agent activity...</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const agentCases = cases.filter((c) => c.agentId === agent.id);
          const open = agentCases.filter(
            (c) => !["Closed", "Rejected", "Issued"].includes(c.status),
          );
          const followUps = agentCases.filter(
            (c) => c.followUpDate && new Date(c.followUpDate) < new Date(),
          ).length;
          const totalANP = agentCases.reduce((sum, c) => sum + c.anpEstimate, 0);

          return (
            <Card key={agent.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {initials(agent.name)}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{agent.name}</CardTitle>
                      <CardDescription className="truncate">
                        {agent.email}
                        {agent.phone ? ` | ${agent.phone}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2 h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={deletingAgentId === agent.id}
                    aria-label={`Delete ${agent.name}`}
                    onClick={() => setAgentToDelete(agent)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Open Cases" value={open.length} />
                  <Metric label="Overdue Follow-ups" value={followUps} />
                  <Metric label="Total Cases" value={agentCases.length} />
                  <Metric label="Total ANP" value={`$${totalANP.toLocaleString()}`} />
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && agents.length === 0 && (
        <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No agency agents have been added yet.
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={createAgent} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add Agent</DialogTitle>
              <DialogDescription>Add a directory profile for an agency agent.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  autoFocus
                  required
                  placeholder="Agent name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agent-email">Email</Label>
                <Input
                  id="agent-email"
                  required
                  type="email"
                  placeholder="agent@agency.com"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agent-phone">Phone</Label>
                <Input
                  id="agent-phone"
                  placeholder="+65 9000 0000"
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? "Adding..." : "Add Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={Boolean(agentToDelete)}
        onOpenChange={(open) => {
          if (!open) setAgentToDelete(null);
        }}
        title="Delete agent?"
        description={
          agentToDelete
            ? `This will permanently delete ${agentToDelete.name} from the agency directory. Existing cases keep their stored agent ID.`
            : "This agent will be permanently deleted from the agency directory."
        }
        confirmLabel="Delete agent"
        deleting={Boolean(deletingAgentId)}
        onConfirm={deleteAgent}
      />
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
