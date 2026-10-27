"use client";

/**
 * AgencyOS — New incident dialog (Phase 4, task 4-b).
 * POST /api/incidents { title, description?, severity, websiteIds?, assignedToId? }.
 * Websites are a checkbox multi-select (real /api/websites list, not guesses).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  INCIDENT_SEVERITIES,
  label,
  type IncidentRecord,
  type Paginated,
  type WebsiteRecord,
} from "@/lib/types";
import { useUsersLookup } from "@/components/agency/views/tasks/lookups";
import { incidentNumber } from "@/components/agency/views/incidents/bits";

const NONE = "none";

export function IncidentFormDialog({
  open,
  onOpenChange,
  presetWebsiteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deep-linked website (e.g. from the Operations tab) — pre-ticked. */
  presetWebsiteId?: string;
  onSaved?: (incident: IncidentRecord) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New incident</DialogTitle>
            <DialogDescription>
              Log an incident manually. Auto-detected incidents are created by monitoring when a
              website goes down.
            </DialogDescription>
          </DialogHeader>
          <IncidentFormInner
            presetWebsiteId={presetWebsiteId}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function IncidentFormInner({
  presetWebsiteId,
  onOpenChange,
  onSaved,
}: {
  presetWebsiteId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (incident: IncidentRecord) => void;
}) {
  const queryClient = useQueryClient();
  const users = useUsersLookup();

  const [serverError, setServerError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("SEV3");
  const [assignedToId, setAssignedToId] = useState("");
  const [websiteIds, setWebsiteIds] = useState<string[]>(presetWebsiteId ? [presetWebsiteId] : []);

  const websitesQuery = useQuery({
    queryKey: ["websites-all"],
    queryFn: () => apiFetch<Paginated<WebsiteRecord>>("/api/websites?pageSize=100"),
    staleTime: 60_000,
  });

  const toggleWebsite = (id: string, checked: boolean) => {
    setWebsiteIds((current) =>
      checked ? [...current, id] : current.filter((existing) => existing !== id),
    );
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<IncidentRecord>("/api/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          websiteIds: websiteIds.length > 0 ? websiteIds : undefined,
          assignedToId: assignedToId || undefined,
        }),
      }),
    onSuccess: (incident) => {
      toast.success(`Incident ${incidentNumber(incident.number)} created.`);
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(incident);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not create the incident.");
    },
  });

  const titleError = title.trim().length > 0 && title.trim().length < 3;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        if (title.trim().length < 3) return;
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
        <Label htmlFor="incident-title">Title</Label>
        <Input
          id="incident-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Bakery site returning 500 errors"
          autoFocus
          aria-invalid={titleError}
        />
        {titleError ? (
          <p className="text-xs text-destructive">Title must be at least 3 characters.</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-full" aria-label="Severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INCIDENT_SEVERITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Assignee</Label>
          <Select value={assignedToId || NONE} onValueChange={(next) => setAssignedToId(next === NONE ? "" : next)}>
            <SelectTrigger className="w-full" aria-label="Assignee (optional)">
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
        <Label htmlFor="incident-description">Description</Label>
        <Textarea
          id="incident-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is happening, since when, and what the client sees."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Affected websites</Label>
        {websitesQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : websitesQuery.isError ? (
          <p className="text-xs text-destructive">
            {(websitesQuery.error as Error)?.message ?? "Websites could not be loaded."}
          </p>
        ) : (websitesQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No websites exist yet — create one under Websites first.
          </p>
        ) : (
          <div className="scrollbar-thin max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
            {websitesQuery.data!.items.map((website) => (
              <label
                key={website.id}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  checked={websiteIds.includes(website.id)}
                  onCheckedChange={(checked) => toggleWebsite(website.id, checked === true)}
                  aria-label={`Affect ${website.name}`}
                />
                <span className="min-w-0 truncate">
                  {website.name}
                  {website.client?.businessName ? (
                    <span className="text-muted-foreground"> · {website.client.businessName}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
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
        <Button type="submit" disabled={createMutation.isPending || title.trim().length < 3}>
          {createMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Create incident
        </Button>
      </DialogFooter>
    </form>
  );
}
