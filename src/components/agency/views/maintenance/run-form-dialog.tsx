"use client";

/**
 * AgencyOS — ad-hoc maintenance run dialog (Phase 4, task 4-b).
 * POST /api/maintenance/runs { websiteId, scheduledDate, items?, assignedToId? }.
 * Ad-hoc runs are not tied to a schedule.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { apiFetch, type MaintenanceRunRecord } from "@/lib/types";
import { useUsersLookup, useWebsitesLookup } from "@/components/agency/views/tasks/lookups";
import { todayInput } from "@/components/agency/views/maintenance/bits";

const NONE = "none";

export function RunFormDialog({
  open,
  onOpenChange,
  presetWebsiteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetWebsiteId?: string;
  onSaved?: (run: MaintenanceRunRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New maintenance run</DialogTitle>
            <DialogDescription>
              Log an ad-hoc run not tied to a schedule. Checklist items are optional — they can be
              one per line.
            </DialogDescription>
          </DialogHeader>
          <RunFormInner
            presetWebsiteId={presetWebsiteId}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RunFormInner({
  presetWebsiteId,
  onOpenChange,
  onSaved,
}: {
  presetWebsiteId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (run: MaintenanceRunRecord) => void;
}) {
  const queryClient = useQueryClient();
  const users = useUsersLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState(presetWebsiteId ?? "");
  const [scheduledDate, setScheduledDate] = useState(todayInput());
  const [assignedToId, setAssignedToId] = useState("");
  const [itemsText, setItemsText] = useState("");

  const websites = useWebsitesLookup("");

  const createMutation = useMutation({
    mutationFn: () => {
      const items = itemsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return apiFetch<MaintenanceRunRecord>("/api/maintenance/runs", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          scheduledDate,
          assignedToId: assignedToId || null,
          items: items.length > 0 ? items : undefined,
        }),
      });
    },
    onSuccess: (run) => {
      toast.success("Run created.");
      queryClient.invalidateQueries({ queryKey: ["maintenance-runs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(run);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not create the run.");
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        if (!websiteId) return;
        createMutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label>Website</Label>
        <Select value={websiteId || NONE} onValueChange={(next) => setWebsiteId(next === NONE ? "" : next)}>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="run-date">Scheduled date</Label>
          <Input
            id="run-date"
            type="date"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
          />
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
        <Label htmlFor="run-items">Checklist items (optional, one per line)</Label>
        <Textarea
          id="run-items"
          rows={4}
          value={itemsText}
          onChange={(event) => setItemsText(event.target.value)}
          placeholder={"Check homepage loads\nTest contact form"}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending || !websiteId}>
          {createMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Create run
        </Button>
      </DialogFooter>
    </form>
  );
}
