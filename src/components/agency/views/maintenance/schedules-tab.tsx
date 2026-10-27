"use client";

/**
 * AgencyOS — Maintenance › Schedules tab (Phase 4, task 4-b).
 *
 * Recurring maintenance schedules with per-row Generate run (server 409s are
 * surfaced verbatim), activate/deactivate and delete. Deleting a schedule
 * keeps runs already recorded — the confirm says so.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Pencil, Plus, Power, SearchX, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openMaintenance, openWebsite } from "@/components/agency/store";
import {
  apiFetch,
  type Paginated,
  label,
  type MaintenanceScheduleRecord,
  type MaintenanceRunRecord,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { isPastDate, MaintenanceListSkeleton } from "@/components/agency/views/maintenance/bits";
import { ScheduleFormDialog } from "@/components/agency/views/maintenance/schedule-form-dialog";
import { cn } from "@/lib/utils";

export function MaintenanceSchedulesTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceScheduleRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceScheduleRecord | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["maintenance-schedules", "list"],
    queryFn: () =>
      apiFetch<Paginated<MaintenanceScheduleRecord>>("/api/maintenance/schedules?pageSize=100"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["maintenance-schedules"] });
    void queryClient.invalidateQueries({ queryKey: ["maintenance-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const generateMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      apiFetch<MaintenanceRunRecord>("/api/maintenance/runs/generate", {
        method: "POST",
        body: JSON.stringify({ scheduleId }),
      }),
    onSuccess: (run) => {
      toast.success("Run generated from the schedule.");
      invalidate();
      if (run?.id) openMaintenance("runs", { runId: run.id });
    },
    onError: (error: Error) => {
      // "already has an open run" style 409s arrive verbatim.
      toast.error(error.message || "The run could not be generated.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      apiFetch<MaintenanceScheduleRecord>(`/api/maintenance/schedules/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: input.isActive }),
      }),
    onSuccess: (record) => {
      toast.success(record.isActive ? "Schedule activated." : "Schedule deactivated — no new runs will be generated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the schedule."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown>(`/api/maintenance/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Schedule deleted. Runs already recorded are kept.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete the schedule."),
  });

  const schedules = schedulesQuery.data?.items ?? [];
  const busy =
    generateMutation.isPending || toggleActiveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {schedulesQuery.isLoading
            ? "Loading schedules…"
            : `${schedules.length} ${schedules.length === 1 ? "schedule" : "schedules"}`}
        </p>
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
          className="min-h-9"
        >
          <Plus aria-hidden />
          New schedule
        </Button>
      </div>

      {schedulesQuery.isLoading ? (
        <MaintenanceListSkeleton />
      ) : schedulesQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Schedules could not be loaded"
          description={(schedulesQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void schedulesQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance schedules yet"
          description="Create a recurring checklist for a website — runs are generated from it each cycle and reminders are sent before the due date."
          action={
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus aria-hidden />
              New schedule
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Schedule</TableHead>
                  <TableHead className="w-44">Website</TableHead>
                  <TableHead className="w-28">Frequency</TableHead>
                  <TableHead className="w-32">Next due</TableHead>
                  <TableHead className="w-36">Plan</TableHead>
                  <TableHead className="w-20 text-right">Runs</TableHead>
                  <TableHead className="w-52 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const overdue = schedule.isActive && isPastDate(schedule.nextDueDate);
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="max-w-64">
                        <p className="truncate text-sm font-medium">{schedule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {schedule.checklistTemplate.length} checklist item
                          {schedule.checklistTemplate.length === 1 ? "" : "s"}
                          {schedule.assignedTo?.displayName
                            ? ` · ${schedule.assignedTo.displayName}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-44">
                        <button
                          type="button"
                          onClick={() => openWebsite(schedule.websiteId)}
                          className="block max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block truncate text-sm hover:underline">
                            {schedule.website?.name ?? "—"}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {label(schedule.frequency)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-sm whitespace-nowrap",
                            overdue ? "font-medium text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {formatDate(schedule.nextDueDate)}
                          {overdue ? " · overdue" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-36">
                        {schedule.plan ? (
                          <span className="block truncate text-sm">{schedule.plan.name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {schedule._count?.runs ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              schedule.isActive
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-border bg-muted text-muted-foreground"
                            }
                          >
                            {schedule.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-8"
                            disabled={busy}
                            onClick={() => generateMutation.mutate(schedule.id)}
                          >
                            <CalendarPlus aria-hidden className="size-3.5" />
                            Generate run
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Edit ${schedule.name}`}
                            onClick={() => {
                              setEditTarget(schedule);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil aria-hidden className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={schedule.isActive ? "Deactivate schedule" : "Activate schedule"}
                            disabled={busy}
                            onClick={() =>
                              toggleActiveMutation.mutate({
                                id: schedule.id,
                                isActive: !schedule.isActive,
                              })
                            }
                          >
                            <Power
                              aria-hidden
                              className={cn("size-3.5", schedule.isActive ? "text-success" : "")}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${schedule.name}`}
                            onClick={() => setDeleteTarget(schedule)}
                          >
                            <Trash2 aria-hidden className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {schedules.map((schedule) => {
              const overdue = schedule.isActive && isPastDate(schedule.nextDueDate);
              return (
                <Card key={schedule.id} className="py-0">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{schedule.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {schedule.website?.name ?? "—"} · {label(schedule.frequency)}
                        </p>
                      </div>
                      <StatusBadge value={schedule.isActive ? "ACTIVE" : "INACTIVE"} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          overdue ? "font-medium text-destructive" : "",
                        )}
                      >
                        Next due {formatDate(schedule.nextDueDate)}
                        {overdue ? " · overdue" : ""}
                      </span>
                      {schedule.plan ? <span>Plan: {schedule.plan.name}</span> : null}
                      <span>{schedule._count?.runs ?? 0} runs</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        disabled={busy}
                        onClick={() => generateMutation.mutate(schedule.id)}
                      >
                        <CalendarPlus aria-hidden className="size-3.5" />
                        Generate run
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        onClick={() => {
                          setEditTarget(schedule);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        disabled={busy}
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: schedule.id,
                            isActive: !schedule.isActive,
                          })
                        }
                      >
                        <Power aria-hidden className="size-3.5" />
                        {schedule.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto min-h-9 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(schedule)}
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ScheduleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schedule={editTarget}
        onSaved={() => invalidate()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="The schedule and its template are removed. Runs already recorded are kept."
        confirmLabel="Delete schedule"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
