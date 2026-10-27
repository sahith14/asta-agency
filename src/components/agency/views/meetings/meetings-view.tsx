"use client";

/**
 * AgencyOS — Meetings view (Phase 5, spec §4).
 *
 * INTERNAL SCHEDULING ONLY — external calendar sync is not connected, and the
 * UI says so plainly (Alert with the exact wording from the API).
 *
 * - Upcoming table (SCHEDULED, soonest first) + past (COMPLETED/CANCELLED).
 * - Schedule dialog: client, title, date, timezone (explicit), duration,
 *   attendees, location, link, agenda; "Check availability" strip renders
 *   bookable 30-min slots from /api/meetings/availability.
 * - Conflict handling: a 409 from the API opens a confirm dialog quoting the
 *   overlapping bookings; confirming retries with confirmConflict: true.
 * - Row actions: reschedule (same conflict flow), cancel (reason), record
 *   outcome (marks COMPLETED, feeds the brief/founder decision trail).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ClipboardCheck,
  ExternalLink,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { KpiCard } from "@/components/agency/shared/kpi-card";
import { useCanAccessModule, useAppStore } from "@/components/agency/store";
import { AccessDenied } from "@/components/agency/shared/access-denied";
import { PageHeader } from "@/components/agency/shared/page-header";
import { zonedTimeToIso, formatInTz } from "@/components/agency/views/meetings/tz";
import {
  apiFetch,
  label,
  MEETING_TIMEZONES,
  type ClientRecord,
  type MeetingRecord,
  type Paginated,
} from "@/lib/types";

interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
  conflictWith: string | null;
}
interface AvailabilityData {
  date: string;
  timezone: string;
  durationMinutes: number;
  workingHours: { start: string; end: string };
  slots: AvailabilitySlot[];
  note: string;
}

const DURATIONS = [30, 45, 60, 90, 120];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function apiErrorMessage(err: unknown): string {
  const anyErr = err as { message?: string; error?: { message?: string } };
  return anyErr?.error?.message ?? anyErr?.message ?? "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Schedule / reschedule dialog (shared)
// ---------------------------------------------------------------------------

interface MeetingFormState {
  clientId: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  meetingLink: string;
  attendees: string;
  agenda: string;
}

const EMPTY_FORM: MeetingFormState = {
  clientId: "",
  title: "",
  date: todayStr(),
  time: "10:00",
  durationMinutes: 45,
  timezone: "Europe/London",
  location: "",
  meetingLink: "",
  attendees: "",
  agenda: "",
};

function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog reschedules this meeting instead of creating one. */
  meeting: MeetingRecord | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = meeting != null;

  const [form, setForm] = useState<MeetingFormState>(() =>
    meeting
      ? {
          clientId: meeting.clientId,
          title: meeting.title,
          date: meeting.scheduledAt.slice(0, 10),
          time: meeting.scheduledAt.slice(11, 16),
          durationMinutes: meeting.durationMinutes,
          timezone: meeting.timezone,
          location: meeting.location ?? "",
          meetingLink: meeting.meetingLink ?? "",
          attendees: (() => {
            try {
              return meeting.attendees ? (JSON.parse(meeting.attendees) as string[]).join(", ") : "";
            } catch {
              return "";
            }
          })(),
          agenda: meeting.agenda ?? "",
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ message: string; payload: Record<string, unknown> } | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ["clients", "picker"],
    queryFn: () => apiFetch<Paginated<ClientRecord>>("/api/clients?pageSize=100&sort=businessName&dir=asc"),
    enabled: open,
  });

  const availabilityQuery = useQuery({
    queryKey: ["meetings", "availability", form.date, form.durationMinutes, form.timezone],
    queryFn: () =>
      apiFetch<AvailabilityData>(
        `/api/meetings/availability?date=${form.date}&duration=${form.durationMinutes}&timezone=${encodeURIComponent(form.timezone)}`,
      ),
    enabled: open && availabilityOpen && !!form.date,
  });

  const set = <K extends keyof MeetingFormState>(key: K, value: MeetingFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function buildPayload(): Record<string, unknown> | null {
    const iso = zonedTimeToIso(form.date, form.time, form.timezone);
    if (!iso) return null;
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      scheduledAt: iso,
      durationMinutes: form.durationMinutes,
      timezone: form.timezone,
      location: form.location.trim() || null,
      meetingLink: form.meetingLink.trim() || null,
      agenda: form.agenda.trim() || null,
      attendees: form.attendees.trim()
        ? form.attendees.split(",").map((a) => a.trim()).filter(Boolean)
        : null,
    };
    if (!isEdit) payload.clientId = form.clientId;
    return payload;
  }

  async function submit(confirmConflict = false) {
    if (!isEdit && !form.clientId) {
      toast.error("Choose the client or lead this meeting is for.");
      return;
    }
    if (form.title.trim().length < 2) {
      toast.error("Give the meeting a title.");
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      toast.error("Enter a valid date and time.");
      return;
    }
    if (confirmConflict) payload.confirmConflict = true;
    setSaving(true);
    try {

      if (isEdit && meeting) {
        await apiFetch<MeetingRecord>(`/api/meetings/${meeting.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Meeting rescheduled.");
      } else {
        await apiFetch<MeetingRecord>("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Meeting booked.");
      }
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err);
      if (message.includes("overlaps")) {
        // Conflict — surface the confirm dialog quoting the API's details.
        setConflict({
          message,
          payload: isEdit ? payload : { ...payload, clientId: form.clientId },
        });
      } else {
        toast.error("Could not save the meeting", { description: message });
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmConflict() {
    if (!conflict) return;
    const payload = { ...conflict.payload, confirmConflict: true };
    setSaving(true);
    try {
      if (isEdit && meeting) {
        await apiFetch<MeetingRecord>(`/api/meetings/${meeting.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Meeting rescheduled — booked despite the conflict.");
      } else {
        await apiFetch<MeetingRecord>("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Meeting booked — recorded as booked despite a conflict.");
      }
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setConflict(null);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save the meeting", { description: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const slots = availabilityQuery.data?.slots ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setConflict(null); onOpenChange(o); }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Reschedule meeting" : "Schedule meeting"}</DialogTitle>
            <DialogDescription>
              Internal scheduling only — external calendar sync is not connected. Timezone is recorded
              explicitly and conflicts are checked against AgencyOS bookings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {!isEdit && (
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-client">Client / lead</Label>
                <Select value={form.clientId} onValueChange={(v) => set("clientId", v)}>
                  <SelectTrigger id="meeting-client" className="w-full">
                    <SelectValue placeholder="Select a client or lead" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {(clientsQuery.data?.items ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.businessName} ({label(c.status)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Demo review — The Corner Bakery"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-date">Date</Label>
                <Input id="meeting-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-time">Time</Label>
                <Input id="meeting-time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-duration">Duration</Label>
                <Select value={String(form.durationMinutes)} onValueChange={(v) => set("durationMinutes", Number(v))}>
                  <SelectTrigger id="meeting-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-tz">Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
                  <SelectTrigger id="meeting-tz" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {MEETING_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setAvailabilityOpen((v) => !v)}
              >
                <CalendarClock aria-hidden className="size-4" />
                {availabilityOpen ? "Hide availability" : "Check availability"}
              </Button>
              {availabilityOpen ? (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-md border p-2 scrollbar-thin">
                  {availabilityQuery.isLoading ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-8" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">No slots for this day.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((slot) => {
                        const time = slot.start.slice(11, 16);
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            disabled={!slot.available}
                            onClick={() => set("time", time)}
                            title={slot.conflictWith ?? undefined}
                            className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                              slot.available
                                ? "hover:bg-accent hover:text-accent-foreground"
                                : "cursor-not-allowed opacity-40 line-through"
                            } ${form.time === time ? "border-primary bg-primary/10 text-primary" : ""}`}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {availabilityQuery.data ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">{availabilityQuery.data.note}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-location">Location (optional)</Label>
                <Input id="meeting-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Client's office" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-link">Meeting link (optional)</Label>
                <Input id="meeting-link" value={form.meetingLink} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://…" />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="meeting-attendees">Attendees (comma-separated)</Label>
              <Input id="meeting-attendees" value={form.attendees} onChange={(e) => set("attendees", e.target.value)} placeholder="Founder, Sarah Miller (client)" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="meeting-agenda">Agenda / preparation notes (optional)</Label>
              <Textarea id="meeting-agenda" rows={3} value={form.agenda} onChange={(e) => set("agenda", e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit(false)} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Reschedule" : "Book meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict confirmation — requires the explicit human go-ahead */}
      <Dialog open={conflict != null} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Booking conflict</DialogTitle>
            <DialogDescription>{conflict?.message}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You can still book this slot. The meeting will be recorded as “booked despite a conflict” so the
            overlap stays visible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)} disabled={saving}>
              Pick another time
            </Button>
            <Button variant="destructive" onClick={() => void confirmConflict()} disabled={saving}>
              {saving ? "Booking…" : "Book anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Row actions: cancel + outcome
// ---------------------------------------------------------------------------

function CancelDialog({ meeting, onClose }: { meeting: MeetingRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function cancel() {
    if (!meeting) return;
    setSaving(true);
    try {
      await apiFetch(`/api/meetings/${meeting.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      toast.success("Meeting cancelled.");
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err) {
      toast.error("Could not cancel", { description: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={meeting != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel meeting</DialogTitle>
          <DialogDescription>
            {meeting ? `“${meeting.title}” — ${formatInTz(meeting.scheduledAt, meeting.timezone)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep meeting
          </Button>
          <Button variant="destructive" onClick={() => void cancel()} disabled={saving}>
            {saving ? "Cancelling…" : "Cancel meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeDialog({ meeting, onClose }: { meeting: MeetingRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const canRecord = user?.role === "OWNER" || user?.role === "CLIENT_MANAGER";

  async function save() {
    if (!meeting) return;
    if (outcome.trim().length < 2) {
      toast.error("Record the decision or outcome of the meeting.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/meetings/${meeting.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: outcome.trim() }),
      });
      toast.success("Outcome recorded — meeting marked completed.");
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err) {
      toast.error("Could not record the outcome", { description: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={meeting != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record meeting outcome</DialogTitle>
          <DialogDescription>
            {meeting ? `“${meeting.title}” — ${meeting.client?.businessName ?? ""}` : ""}{" "}
            {canRecord ? "" : "(manager or founder only)"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="meeting-outcome">Founder-approved decisions / outcome</Label>
          <Textarea
            id="meeting-outcome"
            rows={4}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What was agreed? Approved changes, next steps…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={() => void save()} disabled={saving || !canRecord}>
            {saving ? "Saving…" : "Record outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function MeetingsView() {
  const canAccess = useCanAccessModule("meetings");
  const user = useAppStore((s) => s.user);
  const canSchedule = user?.role === "OWNER" || user?.role === "CLIENT_MANAGER";

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<MeetingRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MeetingRecord | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<MeetingRecord | null>(null);

  const upcomingQuery = useQuery({
    queryKey: ["meetings", "upcoming"],
    queryFn: () => apiFetch<Paginated<MeetingRecord>>("/api/meetings?upcoming=true"),
    placeholderData: keepPreviousData,
    enabled: canAccess,
  });
  const pastQuery = useQuery({
    queryKey: ["meetings", "past"],
    queryFn: () => apiFetch<Paginated<MeetingRecord>>("/api/meetings?pageSize=50"),
    placeholderData: keepPreviousData,
    enabled: canAccess,
  });

  const pastRows = useMemo(
    () => (pastQuery.data?.items ?? []).filter((m) => m.status !== "SCHEDULED"),
    [pastQuery.data],
  );

  const upcomingCount = upcomingQuery.data?.items.length ?? 0;
  const thisWeekCount = (upcomingQuery.data?.items ?? []).filter((m) => {
    const t = new Date(m.scheduledAt).getTime();
    return t - Date.now() < 7 * 24 * 3_600_000;
  }).length;
  const conflictCount = (upcomingQuery.data?.items ?? []).filter((m) => m.conflictConfirmed).length;

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meetings" />
        <AccessDenied module="meetings" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description="Client meetings booked by the team — schedule, reschedule, cancel and record outcomes."
        actions={
          canSchedule ? (
            <Button onClick={() => setScheduleOpen(true)} className="gap-2">
              <CalendarDays aria-hidden className="size-4" />
              Schedule meeting
            </Button>
          ) : undefined
        }
      />

      <Alert>
        <Info aria-hidden className="size-4" />
        <AlertTitle>Internal scheduling only</AlertTitle>
        <AlertDescription>
          External calendar sync is not connected. Availability and conflict checks cover AgencyOS bookings
          only, and meeting confirmations are in-app — no external invites are sent.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard title="Upcoming meetings" value={upcomingCount} icon={CalendarDays} />
        <KpiCard title="Next 7 days" value={thisWeekCount} icon={CalendarClock} />
        <KpiCard title="Booked despite conflict" value={conflictCount} icon={CalendarX2} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "upcoming" | "past")}>
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {upcomingQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (upcomingQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming meetings"
              description={
                canSchedule
                  ? "Book the first client meeting — availability is checked automatically."
                  : "Meetings booked by client managers will appear here."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meeting</TableHead>
                    <TableHead className="hidden md:table-cell">Client</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="hidden sm:table-cell">Booked by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingQuery.data!.items.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-56">
                        <span className="block truncate font-medium">{m.title}</span>
                        {m.conflictConfirmed ? (
                          <span className="text-[11px] font-medium text-destructive">booked despite conflict</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{m.client?.businessName ?? "—"}</TableCell>
                      <TableCell>
                        <span className="block text-sm">{formatInTz(m.scheduledAt, m.timezone)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {m.durationMinutes} min · {m.timezone}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{m.createdBy?.displayName ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canSchedule ? (
                            <>
                              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setRescheduleTarget(m)}>
                                <RefreshCw aria-hidden className="size-3.5" />
                                Reschedule
                              </Button>
                              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setCancelTarget(m)}>
                                <CalendarX2 aria-hidden className="size-3.5" />
                                Cancel
                              </Button>
                            </>
                          ) : null}
                          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOutcomeTarget(m)}>
                            <ClipboardCheck aria-hidden className="size-3.5" />
                            Outcome
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {pastQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : pastRows.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No past meetings" description="Completed and cancelled meetings are listed here." />
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto scrollbar-thin">
              {pastRows.map((m) => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={m.status} />
                    <span className="text-sm font-medium">{m.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.client?.businessName ?? ""} · {formatInTz(m.scheduledAt, m.timezone)} ({m.timezone})
                    </span>
                  </div>
                  {m.outcome ? (
                    <p className="mt-1.5 border-l-2 pl-2.5 text-sm text-muted-foreground">{m.outcome}</p>
                  ) : m.status === "COMPLETED" ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">No outcome recorded.</p>
                  ) : m.cancelReason ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Cancelled: {m.cancelReason}</p>
                  ) : null}
                  {m.briefs && m.briefs.length > 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ExternalLink aria-hidden className="size-3" /> Linked brief {m.briefs[0].displayNumber}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MeetingDialog
        open={scheduleOpen || rescheduleTarget != null}
        onOpenChange={(o) => {
          if (!o) {
            setScheduleOpen(false);
            setRescheduleTarget(null);
          }
        }}
        meeting={rescheduleTarget}
        onSaved={() => {
          setScheduleOpen(false);
          setRescheduleTarget(null);
        }}
      />
      <CancelDialog meeting={cancelTarget} onClose={() => setCancelTarget(null)} />
      <OutcomeDialog meeting={outcomeTarget} onClose={() => setOutcomeTarget(null)} />
    </div>
  );
}
