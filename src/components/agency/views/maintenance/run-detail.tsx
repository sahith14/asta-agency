"use client";

/**
 * AgencyOS — maintenance run detail (Phase 4, task 4-b).
 *
 * Inline detail inside the Maintenance view (params.runId). Checklist items
 * save through PUT /api/maintenance/runs/[id]/items/[itemId] (optimistic with
 * rollback); status changes follow allowedTransitions. Completion is honestly
 * blocked while any checklist item is still PENDING.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  Loader2,
  PlayCircle,
  Save,
  SearchX,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openMaintenance, openWebsite, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  CHECKLIST_RESULTS,
  type MaintenanceChecklistItemRecord,
  type MaintenanceRunDetailData,
} from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resultChipClass } from "@/components/agency/views/maintenance/bits";

const NONE = "none";

export function MaintenanceRunDetail({ runId }: { runId: string }) {
  const back = useAppStore((s) => s.back);
  const queryClient = useQueryClient();

  const [completeOpen, setCompleteOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [workNotesDraft, setWorkNotesDraft] = useState<string | null>(null);
  const [timeSpentDraft, setTimeSpentDraft] = useState<string | null>(null);

  const detailKey = useMemo(() => ["maintenance-run", runId] as const, [runId]);

  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => apiFetch<MaintenanceRunDetailData>(`/api/maintenance/runs/${runId}`),
    enabled: !!runId,
  });

  const data = detailQuery.data;
  const run = data?.run;
  const items = data?.items ?? [];
  const allowed = data?.allowedTransitions ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: ["maintenance-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["maintenance-schedules"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  // --- status ------------------------------------------------------------------
  const statusMutation = useMutation({
    mutationFn: (action: string) =>
      apiFetch<MaintenanceRunDetailData["run"]>(`/api/maintenance/runs/${runId}/status`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: (record, action) => {
      queryClient.setQueryData<MaintenanceRunDetailData>(detailKey, (old) =>
        old ? { ...old, run: record } : old,
      );
      invalidate();
      if (action === "COMPLETED") toast.success("Run completed.");
      else if (action === "IN_PROGRESS") toast.success("Run started.");
      else if (action === "SKIPPED") toast.success("Run skipped.");
      else toast.success("Run cancelled.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the run."),
    onSettled: () => invalidate(),
  });

  // --- checklist item (optimistic with rollback) --------------------------------
  const itemMutation = useMutation({
    mutationFn: (input: { itemId: string; body: Record<string, unknown> }) =>
      apiFetch<MaintenanceChecklistItemRecord>(
        `/api/maintenance/runs/${runId}/items/${input.itemId}`,
        { method: "PUT", body: JSON.stringify(input.body) },
      ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<MaintenanceRunDetailData>(detailKey);
      if (previous) {
        queryClient.setQueryData<MaintenanceRunDetailData>(detailKey, {
          ...previous,
          items: previous.items.map((item) =>
            item.id === input.itemId ? { ...item, ...input.body } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      toast.error(error.message || "Could not save the checklist item.");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: detailKey }),
  });

  // --- run fields (work notes / time spent) --------------------------------------
  const runPatchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<MaintenanceRunDetailData["run"]>(`/api/maintenance/runs/${runId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (record) => {
      queryClient.setQueryData<MaintenanceRunDetailData>(detailKey, (old) =>
        old ? { ...old, run: record } : old,
      );
      invalidate();
      toast.success("Run details saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the run details."),
  });

  // --- render gates ---------------------------------------------------------------
  if (!runId) return null;

  const detailError = detailQuery.error as (Error & { code?: string }) | null;
  if (detailQuery.isError && detailError?.code === "NOT_FOUND") {
    return (
      <div className="space-y-6">
        <RunHeaderLite onBack={back} />
        <EmptyState
          icon={Wrench}
          title="Run not found"
          description="This run may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={back}>
              Back to runs
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="space-y-6">
        <RunHeaderLite onBack={back} />
        <EmptyState
          icon={SearchX}
          title="Could not load this run"
          description={detailError?.message ?? "Check your connection and try again."}
          action={
            <Button variant="outline" onClick={() => void detailQuery.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isLoading || !data || !run) {
    return (
      <div className="space-y-6" aria-busy aria-label="Loading run">
        <div className="flex items-start gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-9 w-48" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const pendingCount = items.filter((item) => item.result === "PENDING").length;
  const passedCount = items.filter((item) => item.result === "PASSED").length;
  const failedCount = items.filter((item) => item.result === "FAILED").length;
  const canComplete = allowed.includes("COMPLETED") && pendingCount === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => openMaintenance("runs", run.websiteId ? { websiteId: run.websiteId } : undefined)}
            aria-label="Go back to runs"
            className="mt-0.5 size-8 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-xl font-semibold break-words tracking-tight sm:text-2xl">
                {run.website?.name ?? "Maintenance run"}
              </h2>
              <StatusBadge value={run.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>Scheduled {formatDate(run.scheduledDate)}</span>
              {run.schedule ? (
                <>
                  <span aria-hidden>·</span>
                  <span>from {run.schedule.name}</span>
                </>
              ) : (
                <>
                  <span aria-hidden>·</span>
                  <span>ad-hoc run</span>
                </>
              )}
              {run.assignedTo ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{run.assignedTo.displayName}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => run.websiteId && openWebsite(run.websiteId)}
                className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open website
              </button>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {allowed.includes("IN_PROGRESS") ? (
            <Button
              variant="outline"
              className="min-h-9"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("IN_PROGRESS")}
            >
              <PlayCircle aria-hidden />
              Start
            </Button>
          ) : null}
          {allowed.includes("COMPLETED") ? (
            <span className="inline-block" title={
              pendingCount > 0
                ? "Every checklist item needs a result (PASSED, FAILED, ATTEMPTED, SKIPPED or N/A) before the run can be completed."
                : undefined
            }>
              <Button
                className="min-h-9"
                disabled={!canComplete || statusMutation.isPending}
                onClick={() => setCompleteOpen(true)}
              >
                <CheckCircle2 aria-hidden />
                Complete run
              </Button>
            </span>
          ) : null}
          {allowed.includes("SKIPPED") ? (
            <Button
              variant="outline"
              className="min-h-9"
              disabled={statusMutation.isPending}
              onClick={() => setSkipOpen(true)}
            >
              <CircleSlash aria-hidden />
              Skip
            </Button>
          ) : null}
          {allowed.includes("CANCELLED") ? (
            <Button
              variant="outline"
              className="min-h-9"
              disabled={statusMutation.isPending}
              onClick={() => setCancelOpen(true)}
            >
              Cancel run
            </Button>
          ) : null}
        </div>
      </div>

      {/* Completion blocked — honest inline explanation */}
      {allowed.includes("COMPLETED") && pendingCount > 0 ? (
        <Alert>
          <AlertTitle>Completion blocked — {pendingCount} checklist item{pendingCount === 1 ? "" : "s"} pending</AlertTitle>
          <AlertDescription>
            Set a result on every item (PASSED, FAILED, ATTEMPTED, SKIPPED or N/A) first. The rule
            exists so a run can never look finished while work is still open.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Completed summary */}
      {run.status === "COMPLETED" ? (
        <Alert className="border-success/30 bg-success/5">
          <CheckCircle2 aria-hidden className="size-4 text-success" />
          <AlertTitle>Run completed {run.completedAt ? formatDateTime(run.completedAt) : ""}</AlertTitle>
          <AlertDescription>
            {run.nextScheduledDate ? (
              <>
                Schedule advanced — next run is due {formatDate(run.nextScheduledDate)}.
              </>
            ) : (
              "This run was not linked to a schedule, so nothing was advanced."
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Checklist */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Checklist</CardTitle>
            <CardDescription>
              Results save immediately — PASSED/FAILED mean a real attempt was made, ATTEMPTED
              means tried but inconclusive.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge variant="outline" className={cn("px-2", resultChipClass("PASSED"))}>
              {passedCount} passed
            </Badge>
            <Badge variant="outline" className={cn("px-2", resultChipClass("FAILED"))}>
              {failedCount} failed
            </Badge>
            <Badge variant="outline" className={cn("px-2", resultChipClass("PENDING"))}>
              {pendingCount} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              This run has no checklist items — use the notes below to record what was done.
            </p>
          ) : (
            items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                documents={data.documents}
                busy={itemMutation.isPending}
                onSave={(body) => itemMutation.mutate({ itemId: item.id, body })}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Work notes + time spent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Work notes &amp; time spent</CardTitle>
          <CardDescription>What was actually done — kept on the run record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="run-work-notes">Work notes</Label>
            <Textarea
              id="run-work-notes"
              rows={4}
              value={workNotesDraft ?? run.workNotes ?? ""}
              onChange={(event) => setWorkNotesDraft(event.target.value)}
              placeholder="Observations, follow-ups, client-visible changes…"
              disabled={run.status === "COMPLETED" || run.status === "SKIPPED" || run.status === "CANCELLED"}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="run-time-spent">Time spent (minutes)</Label>
              <Input
                id="run-time-spent"
                type="number"
                min={0}
                value={timeSpentDraft ?? (run.timeSpentMinutes !== null ? String(run.timeSpentMinutes) : "")}
                onChange={(event) => setTimeSpentDraft(event.target.value)}
                disabled={run.status === "COMPLETED" || run.status === "SKIPPED" || run.status === "CANCELLED"}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="min-h-9"
                disabled={
                  runPatchMutation.isPending ||
                  run.status === "COMPLETED" ||
                  run.status === "SKIPPED" ||
                  run.status === "CANCELLED" ||
                  (workNotesDraft === null && timeSpentDraft === null)
                }
                onClick={() => {
                  const body: Record<string, unknown> = {};
                  if (workNotesDraft !== null) body.workNotes = workNotesDraft.trim() || null;
                  if (timeSpentDraft !== null && timeSpentDraft !== "") {
                    const parsed = Number.parseInt(timeSpentDraft, 10);
                    body.timeSpentMinutes = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
                  }
                  runPatchMutation.mutate(body);
                  setWorkNotesDraft(null);
                  setTimeSpentDraft(null);
                }}
              >
                {runPatchMutation.isPending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden />
                )}
                Save details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmations */}
      <ConfirmDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Complete this run?"
        description="All checklist items have a result. The run is marked COMPLETED and, when it belongs to a schedule, the schedule advances to its next due date. This cannot be undone."
        confirmLabel="Complete run"
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate("COMPLETED")}
      />
      <ConfirmDialog
        open={skipOpen}
        onOpenChange={setSkipOpen}
        title="Skip this run?"
        description="The run is recorded as SKIPPED — nothing was executed this cycle. The schedule still advances on completion of a later run, or you can generate the next one manually."
        confirmLabel="Skip run"
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate("SKIPPED")}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this run?"
        description="The run is recorded as CANCELLED and becomes read-only."
        confirmLabel="Cancel run"
        destructive
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate("CANCELLED")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function RunHeaderLite({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button variant="outline" size="icon" onClick={onBack} aria-label="Go back" className="mt-0.5 size-8 shrink-0">
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Maintenance run</h2>
    </div>
  );
}

function ChecklistItemRow({
  item,
  documents,
  busy,
  onSave,
}: {
  item: MaintenanceChecklistItemRecord;
  documents: { id: string; fileName: string }[];
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notes = notesDraft ?? item.notes ?? "";

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{item.label}</p>
          <p className="text-xs text-muted-foreground">{label(item.category)}</p>
        </div>
        <Select
          value={item.result}
          onValueChange={(result) => onSave({ result })}
          disabled={busy}
        >
          <SelectTrigger
            className="w-40 min-h-9 shrink-0"
            aria-label={`Result for ${item.label}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHECKLIST_RESULTS.map((result) => (
              <SelectItem key={result} value={result}>
                {label(result)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={notes}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            if (notesDraft !== null && notesDraft !== (item.notes ?? "")) {
              onSave({ notes: notesDraft.trim() || null });
            }
          }}
          placeholder="Notes (saved on blur)"
          aria-label={`Notes for ${item.label}`}
        />
        <Select
          value={item.evidenceDocumentId || NONE}
          onValueChange={(value) => onSave({ evidenceDocumentId: value === NONE ? null : value })}
          disabled={busy}
        >
          <SelectTrigger className="w-full min-h-9" aria-label={`Evidence for ${item.label}`}>
            <SelectValue placeholder="Evidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— no evidence —</SelectItem>
            {documents.map((document) => (
              <SelectItem key={document.id} value={document.id}>
                {document.fileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
