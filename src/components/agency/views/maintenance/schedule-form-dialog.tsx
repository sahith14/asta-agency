"use client";

/**
 * AgencyOS — maintenance schedule create/edit dialog (Phase 4, task 4-b).
 * POST /api/maintenance/schedules or PATCH /api/maintenance/schedules/[id].
 * checklistTemplate is entered one item per line and sent as a string[].
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  apiFetch,
  label,
  MAINTENANCE_FREQUENCIES,
  type MaintenanceScheduleRecord,
  type Paginated,
} from "@/lib/types";
import { useUsersLookup, useWebsitesLookup } from "@/components/agency/views/tasks/lookups";
import { todayInput } from "@/components/agency/views/maintenance/bits";

const NONE = "none";

interface PlanOption {
  id: string;
  name: string;
}

export function ScheduleFormDialog({
  open,
  onOpenChange,
  schedule,
  presetWebsiteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits this schedule, otherwise it creates one. */
  schedule?: MaintenanceScheduleRecord | null;
  presetWebsiteId?: string;
  onSaved?: (schedule: MaintenanceScheduleRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{schedule ? "Edit schedule" : "New maintenance schedule"}</DialogTitle>
            <DialogDescription>
              Recurring checklists per website. A run is generated each cycle — the schedule owns
              the template, runs own the results.
            </DialogDescription>
          </DialogHeader>
          <ScheduleFormInner
            schedule={schedule ?? null}
            presetWebsiteId={presetWebsiteId}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ScheduleFormInner({
  schedule,
  presetWebsiteId,
  onOpenChange,
  onSaved,
}: {
  schedule: MaintenanceScheduleRecord | null;
  presetWebsiteId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (schedule: MaintenanceScheduleRecord) => void;
}) {
  const isEdit = Boolean(schedule);
  const queryClient = useQueryClient();
  const users = useUsersLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState(schedule?.websiteId ?? presetWebsiteId ?? "");
  const [planId, setPlanId] = useState(schedule?.planId ?? "");
  const [name, setName] = useState(schedule?.name ?? "");
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "MONTHLY");
  const [nextDueDate, setNextDueDate] = useState(
    schedule?.nextDueDate ? schedule.nextDueDate.slice(0, 10) : todayInput(),
  );
  const [assignedToId, setAssignedToId] = useState(schedule?.assignedToId ?? "");
  const [notes, setNotes] = useState(schedule?.notes ?? "");
  const [checklistText, setChecklistText] = useState(
    (schedule?.checklistTemplate ?? []).join("\n"),
  );

  const websites = useWebsitesLookup("");

  // Service plans for the optional plan link (may be empty on a fresh install).
  const plansQuery = useQuery({
    queryKey: ["plans", "lookup"],
    queryFn: () => apiFetch<Paginated<PlanOption>>("/api/billing/plans?pageSize=100"),
    staleTime: 60_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const checklistTemplate = checklistText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const body = {
        websiteId,
        planId: planId || null,
        name: name.trim(),
        frequency,
        nextDueDate,
        assignedToId: assignedToId || null,
        checklistTemplate,
        notes: notes.trim() || null,
      };
      return isEdit && schedule
        ? apiFetch<MaintenanceScheduleRecord>(`/api/maintenance/schedules/${schedule.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : apiFetch<MaintenanceScheduleRecord>("/api/maintenance/schedules", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Schedule updated." : "Schedule created.");
      queryClient.invalidateQueries({ queryKey: ["maintenance-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the schedule.");
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        if (!websiteId || !name.trim()) return;
        saveMutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Select
            value={websiteId || NONE}
            onValueChange={(next) => setWebsiteId(next === NONE ? "" : next)}
          >
            <SelectTrigger className="w-full" aria-label="Website">
              <SelectValue placeholder="Select a website" />
            </SelectTrigger>
            <SelectContent>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="schedule-name">Name</Label>
          <Input
            id="schedule-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Monthly care-plan check"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="w-full" aria-label="Frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_FREQUENCIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="schedule-due">Next due date</Label>
          <Input
            id="schedule-due"
            type="date"
            value={nextDueDate}
            onChange={(event) => setNextDueDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Service plan (optional)</Label>
          <Select value={planId || NONE} onValueChange={(next) => setPlanId(next === NONE ? "" : next)}>
            <SelectTrigger className="w-full" aria-label="Service plan (optional)">
              <SelectValue placeholder="No plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No plan</SelectItem>
              {(plansQuery.data?.items ?? []).map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Assigned to</Label>
          <Select
            value={assignedToId || NONE}
            onValueChange={(next) => setAssignedToId(next === NONE ? "" : next)}
          >
            <SelectTrigger className="w-full" aria-label="Assigned to (optional)">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {(users.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="schedule-checklist">Checklist template (one item per line)</Label>
        <Textarea
          id="schedule-checklist"
          rows={5}
          value={checklistText}
          onChange={(event) => setChecklistText(event.target.value)}
          placeholder={"Check homepage loads\nTest contact form\nVerify SSL certificate\nCheck backups ran"}
        />
        <p className="text-xs text-muted-foreground">
          Each line becomes a checklist item on generated runs.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="schedule-notes">Notes</Label>
        <Textarea
          id="schedule-notes"
          rows={2}
          value={notes ?? ""}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything the person doing the run should know."
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending || !websiteId || !name.trim()}>
          {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {isEdit ? "Save changes" : "Create schedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
