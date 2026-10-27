"use client";

/**
 * AgencyOS — Settings › Sample Data tab (task 4-c).
 * Honest demo-data loader: clearly-labelled records ("SAMPLE — " prefix),
 * with an explicit removal path that never touches real records.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { apiFetch } from "@/lib/types";

type SampleCounts = Record<string, number>;

const COUNT_LABELS: Record<string, string> = {
  clients: "client",
  contacts: "contact",
  websites: "website",
  domains: "domain",
  projects: "project",
  milestones: "milestone",
  tasks: "task",
};

function formatCounts(counts: SampleCounts): string {
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${COUNT_LABELS[key] ?? key}${count === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "no records";
}

/** Keys refreshed after sample data changes (dashboards + every list view). */
const INVALIDATE_KEYS = [
  "settings",
  "dashboard",
  "clients",
  "websites",
  "projects",
  "tasks",
  "activity",
] as const;

export function SampleDataCard() {
  const queryClient = useQueryClient();
  const [removeOpen, setRemoveOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ sampleDataLoaded: boolean }>("/api/settings"),
  });

  function refreshCaches() {
    for (const key of INVALIDATE_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const loadMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ created: SampleCounts }>("/api/settings/sample-data", { method: "POST" }),
    onSuccess: (data) => {
      toast.success("Sample data loaded", {
        description: `Created ${formatCounts(data.created ?? {})} — every record is prefixed "SAMPLE — ".`,
      });
      refreshCaches();
    },
    onError: (error: Error & { code?: string }) => {
      // 409 CONFLICT: samples already exist. Info, not error — the state is fine.
      if (error.code === "CONFLICT") {
        toast.info(error.message || "Sample data already loaded.");
      } else {
        toast.error(error.message || "Could not load sample data.");
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ removed: boolean }>("/api/settings/sample-data", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Sample data removed", {
        description: "Only sample-labelled records were deleted.",
      });
      setRemoveOpen(false);
      refreshCaches();
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove sample data."),
  });

  const loaded = settingsQuery.data?.sampleDataLoaded;
  const busy = loadMutation.isPending || removeMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical aria-hidden className="size-4 text-muted-foreground" />
          Sample dataset
        </CardTitle>
        <CardDescription>
          Loads a small, clearly-labelled demo dataset (names prefixed{" "}
          <span className="font-mono text-xs">SAMPLE —</span>). Useful for exploring AgencyOS
          without real client data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-44" />
          </div>
        ) : (
          <>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>3 sample clients with contacts, websites and a domain</li>
              <li>2 projects with milestones and live task/board activity</li>
              <li>4 tasks including one overdue and one completed</li>
              <li>Sample records appear in every list, search and the dashboard</li>
            </ul>

            <Separator />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {loaded ? (
                <>
                  <p className="flex-1 text-sm text-muted-foreground">
                    Sample data is currently <span className="font-medium text-foreground">loaded</span>.
                    Removing it deletes ONLY sample-labelled records — real records are untouched.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setRemoveOpen(true)}
                    disabled={busy}
                  >
                    {removeMutation.isPending ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    Remove sample data
                  </Button>
                </>
              ) : (
                <>
                  <p className="flex-1 text-sm text-muted-foreground">
                    No sample data is loaded right now. Nothing is fake-labelled as real — every
                    generated record carries the sample flag.
                  </p>
                  <Button onClick={() => loadMutation.mutate()} disabled={busy}>
                    {loadMutation.isPending ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <FlaskConical aria-hidden />
                    )}
                    Load sample data
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove sample data?"
        description="Removes ONLY sample-labelled records. Real records are untouched."
        confirmLabel="Remove sample data"
        destructive
        loading={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </Card>
  );
}
