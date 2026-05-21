import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { candidatesService, usersService } from "@/services";
import type { CandidateStage } from "@/types/domain";

const STAGES: CandidateStage[] = [
  "New Lead", "Contacted", "Interview Scheduled", "Attended",
  "Interested", "Follow-Up", "Joined", "Dropped",
];

export const Route = createFileRoute("/_authenticated/recruitment")({
  head: () => ({ meta: [{ title: "Recruitment — Agency Ops" }] }),
  component: RecruitmentPage,
});

function RecruitmentPage() {
  const all = candidatesService.list();
  return (
    <div>
      <PageHeader
        title="Recruitment Pipeline"
        description="Track candidates from lead to joined."
        actions={<Button><Plus className="mr-1.5 h-4 w-4" />New Candidate</Button>}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {STAGES.map((stage) => {
          const items = all.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage}</h3>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <div key={c.id} className="rounded-md border border-border bg-card p-3 shadow-sm">
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.source}</p>
                    {c.referredById && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        via {usersService.get(c.referredById)?.name}
                      </p>
                    )}
                    {c.nextFollowUpDate && (
                      <p className="mt-1 text-xs text-warning-foreground">
                        Follow-up {new Date(c.nextFollowUpDate).toLocaleDateString("en-US")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}