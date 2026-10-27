"use client";

/**
 * AgencyOS — brief detail (Phase 5, params.id).
 *
 * Sections: business profile · goals & audience · scope · commercial (hidden
 * completely for the developer — the API strips those fields too) · gaps ·
 * demo · three recommended improvements · meeting prep · founder review.
 *
 * Status transitions come from BRIEF_TRANSITIONS gated by role (manager:
 * NEEDS_INFORMATION / READY_FOR_REVIEW / MEETING_COMPLETED / CLOSED; founder:
 * APPROVED_FOR_MEETING / CHANGES_REQUESTED / CLOSED + everything as
 * superuser). →CHANGES_REQUESTED asks for a reason. MEETING_COMPLETED offers
 * the handover dialog; HANDED_TO_DEVELOPMENT shows the banner with links.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Handshake,
  Info,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  SearchX,
  ShieldCheck,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { PageHeader } from "@/components/agency/shared/page-header";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  BRIEF_TRANSITIONS,
  label,
  BRIEF_PREVIEW_STATUSES,
  type BriefRecord,
  type Paginated,
  type ProjectRecord,
  type UserRecord,
} from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatCurrency } from "@/lib/format";
import { BriefEditDialog } from "@/components/agency/views/briefs/brief-edit-dialog";

/** Manager-settable transition targets (founder gets every allowed target). */
const MANAGER_TARGETS = ["NEEDS_INFORMATION", "READY_FOR_REVIEW", "MEETING_COMPLETED", "CLOSED"];
const FOUNDER_ONLY_TARGETS = ["APPROVED_FOR_MEETING", "CHANGES_REQUESTED"];

interface BriefPayload {
  brief: BriefRecord;
}

/** The backend may return the bare record or an envelope — accept both honestly. */
function unwrapBrief(raw: BriefRecord | BriefPayload): BriefRecord {
  if (raw && typeof raw === "object" && "brief" in raw && raw.brief) return raw.brief;
  return raw as BriefRecord;
}

export default function BriefDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [reasonTarget, setReasonTarget] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [founderReviewOpen, setFounderReviewOpen] = useState(false);

  const isFounder = user?.role === "OWNER";
  const isManager = user?.role === "CLIENT_MANAGER";
  const isDeveloper = user?.role === "WEB_DEVELOPER";
  const canManage = isFounder || isManager;

  const briefQuery = useQuery({
    queryKey: ["brief", id],
    queryFn: async () => unwrapBrief(await apiFetch<BriefRecord | BriefPayload>(`/api/briefs/${id}`)),
    enabled: !!id,
  });

  const brief = briefQuery.data;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["brief", id] });
    void queryClient.invalidateQueries({ queryKey: ["briefs"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  }

  // Allowed transition targets for THIS role.
  const transitionTargets = useMemo(() => {
    if (!brief) return [];
    const allowed =
      brief.allowedTransitions && brief.allowedTransitions.length > 0
        ? brief.allowedTransitions
        : (BRIEF_TRANSITIONS[brief.status] ?? []);
    if (isFounder) return [...allowed];
    if (isManager) return allowed.filter((t) => MANAGER_TARGETS.includes(t));
    return []; // developers and read-only roles get no transition buttons
  }, [brief, isFounder, isManager]);

  if (!id || (briefQuery.isError && (briefQuery.error as Error & { code?: string })?.code === "NOT_FOUND")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Brief" onBack={back} />
        <EmptyState
          icon={SearchX}
          title="Brief not found"
          description="This brief may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={() => navigate("briefs")}>
              Back to Briefs
            </Button>
          }
        />
      </div>
    );
  }

  if (briefQuery.isError) {
    const message = (briefQuery.error as Error)?.message ?? "Something went wrong.";
    const denied = (briefQuery.error as Error & { code?: string })?.code === "FORBIDDEN";
    return (
      <div className="space-y-6">
        <PageHeader title="Brief" onBack={back} />
        <EmptyState
          icon={SearchX}
          title={denied ? "You don't have access to this brief" : "Could not load this brief"}
          description={denied ? "Briefs are visible to their owner, the founder, and developers of the handed project." : message}
          action={
            <Button variant="outline" onClick={() => void briefQuery.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (briefQuery.isLoading || !brief) {
    return (
      <div className="space-y-6" aria-busy aria-label="Loading brief">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-52" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${brief.displayNumber} · ${brief.title ?? "Untitled brief"}`}
        description={`Updated ${formatDateTime(brief.updatedAt)}`}
        onBack={back}
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          ) : null
        }
      />

      {/* Status + context row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={brief.status} />
        {brief.client ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => brief.client && navigate("client-detail", { id: brief.client.id })}
          >
            <Building2 aria-hidden className="size-3.5" />
            {brief.client.businessName}
          </Button>
        ) : null}
        {brief.meetingId ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => navigate("meetings")}
          >
            <CalendarDays aria-hidden className="size-3.5" />
            Linked meeting
          </Button>
        ) : null}
        {brief.owner ? (
          <span className="text-xs text-muted-foreground">Owner: {brief.owner.displayName}</span>
        ) : null}
      </div>

      {/* Transition bar */}
      {transitionTargets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <ArrowRightLeft aria-hidden className="size-3.5" />
            Move to
          </span>
          {transitionTargets.map((target) => (
            <Button
              key={target}
              size="sm"
              variant={target === "CLOSED" ? "outline" : "default"}
              className={target === "CLOSED" ? "text-muted-foreground" : undefined}
              disabled={brief.status === target}
              onClick={() => {
                if (target === "CHANGES_REQUESTED") {
                  setReasonTarget(target);
                } else {
                  void transition(target);
                }
              }}
            >
              {label(target)}
            </Button>
          ))}
          {canManage && brief.status === "MEETING_COMPLETED" ? (
            <Button size="sm" onClick={() => setHandoverOpen(true)}>
              <Handshake aria-hidden />
              Hand over to development
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Handed-over banner */}
      {brief.status === "HANDED_TO_DEVELOPMENT" ? (
        <Alert>
          <Handshake aria-hidden />
          <AlertTitle>Handed to development</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              This brief was handed over {brief.handedOverAt ? `on ${formatDate(brief.handedOverAt)}` : ""}
              {brief.project ? ` — project “${brief.project.name}”` : ""}.
            </span>
            {brief.handedToProjectId ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => brief.handedToProjectId && navigate("project-detail", { id: brief.handedToProjectId })}
                >
                  <ExternalLink aria-hidden />
                  Open project
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate("tasks", brief.handedToProjectId ? { projectId: brief.handedToProjectId } : {})
                  }
                >
                  <ListChecks aria-hidden />
                  View tasks
                </Button>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Developer handover hint */}
      {isDeveloper ? (
        <Alert>
          <Info aria-hidden />
          <AlertDescription>
            You are viewing the approved requirements for your project. Commercial details are not
            shared with developers.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Business profile" icon={Building2}>
          <Rows
            rows={[
              ["Business name", brief.businessName],
              ["Business type", brief.businessType],
              ["Location", brief.location],
              ["Contact person", brief.contactPerson],
              ["Existing website", brief.existingWebsite],
              ["Public references", brief.publicReferences],
            ]}
          />
        </SectionCard>

        <SectionCard title="Goals & audience" icon={Target}>
          <ParagraphRows
            rows={[
              ["Business goals", brief.businessGoals],
              ["Current problems", brief.currentProblems],
              ["Target audience", brief.targetAudience],
            ]}
          />
        </SectionCard>

        <SectionCard title="Scope" icon={ListChecks}>
          <ParagraphRows
            rows={[
              ["Requested pages", brief.requestedPages],
              ["Requested features", brief.requestedFeatures],
              ["Branding info", brief.brandingInfo],
              ["Competitor references", brief.competitorReferences],
              ["Inspiration", brief.inspiration],
            ]}
          />
        </SectionCard>

        {/* Commercial — hidden COMPLETELY for developers (API strips it too). */}
        {!isDeveloper ? (
          <SectionCard title="Commercial" icon={Info}>
            <Rows
              rows={[
                [
                  "Budget",
                  brief.budgetMinor !== null && brief.budgetMinor !== undefined
                    ? formatCurrency(brief.budgetMinor, brief.currency || "GBP")
                    : null,
                ],
                ["Budget note", brief.budgetNote],
                ["Recommended package", brief.recommendedPackage],
                ["Proposed care plan", brief.proposedCarePlan],
                ["Deadline", brief.deadline ? formatDate(brief.deadline) : null],
              ]}
            />
          </SectionCard>
        ) : null}

        {!isDeveloper ? (
          <SectionCard title="Gaps" icon={Info}>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Missing information
                </p>
                {brief.missingInformation ? (
                  <p className="text-sm whitespace-pre-wrap">{brief.missingInformation}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing flagged as missing.</p>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Outstanding questions
                  </p>
                  {brief.outstandingQuestions ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(brief.outstandingQuestions ?? "")
                          .then(() => toast.success("Questions copied to the clipboard"))
                          .catch(() => toast.error("Could not copy — select and copy manually."));
                      }}
                    >
                      <ClipboardCopy aria-hidden className="size-3.5" />
                      Copy questions
                    </Button>
                  ) : null}
                </div>
                {brief.outstandingQuestions ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {brief.outstandingQuestions
                      .split("\n")
                      .map((q) => q.trim())
                      .filter(Boolean)
                      .map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No outstanding questions.</p>
                )}
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Demo" icon={Link2}>
          <div className="space-y-3">
            {brief.demoUrl ? (
              <a
                href={brief.demoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm break-all text-primary underline-offset-2 hover:underline"
              >
                {brief.demoUrl}
                <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No demo URL yet.</p>
            )}
            {canManage ? (
              <div className="max-w-56 space-y-1.5">
                <Label htmlFor="brief-preview-status" className="text-xs text-muted-foreground">
                  Preview status
                </Label>
                <Select
                  value={brief.previewStatus || "NOT_STARTED"}
                  onValueChange={(value) => void patchBrief({ previewStatus: value })}
                >
                  <SelectTrigger id="brief-preview-status" className="w-full" aria-label="Preview status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRIEF_PREVIEW_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {label(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Preview status: {label(brief.previewStatus)}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Three recommended improvements" icon={CheckCircle2}>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {[brief.improvement1, brief.improvement2, brief.improvement3].map((value, index) => (
              <li key={index} className="whitespace-pre-wrap">
                {value ? (
                  value
                ) : (
                  <span className="text-muted-foreground">Not recorded yet.</span>
                )}
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard title="Meeting prep" icon={CalendarDays}>
          <div className="space-y-3">
            {brief.preparationNotes ? (
              <p className="text-sm whitespace-pre-wrap">{brief.preparationNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No preparation notes yet.</p>
            )}
            {brief.meeting ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{brief.meeting.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(brief.meeting.scheduledAt)} · {brief.meeting.timezone} ·{" "}
                  {label(brief.meeting.status)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => navigate("meetings")}
                >
                  <CalendarDays aria-hidden />
                  Open Meetings
                </Button>
              </div>
            ) : brief.meetingId ? (
              <Button size="sm" variant="outline" onClick={() => navigate("meetings")}>
                <CalendarDays aria-hidden />
                Open Meetings
              </Button>
            ) : null}
          </div>
        </SectionCard>

        {!isDeveloper ? (
          <SectionCard title="Founder review" icon={ShieldCheck}>
            <div className="space-y-3">
              <ParagraphRows
                rows={[
                  ["Founder feedback", brief.founderFeedback],
                  ["Client decisions", brief.clientDecisions],
                  ["Approved changes", brief.approvedChanges],
                ]}
              />
              {isFounder ? (
                <Button size="sm" variant="outline" onClick={() => setFounderReviewOpen(true)}>
                  <Pencil aria-hidden />
                  Edit founder review
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Read-only — recorded by the founder.
                </p>
              )}
            </div>
          </SectionCard>
        ) : null}
      </div>

      {/* Edit dialog (manager/founder) */}
      {canManage ? (
        <BriefEditDialog
          brief={brief}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => invalidate()}
        />
      ) : null}

      {/* Reason dialog for → CHANGES_REQUESTED */}
      <ReasonDialog
        open={!!reasonTarget}
        onOpenChange={(open) => !open && setReasonTarget(null)}
        target={reasonTarget}
        onSubmit={(reason) => {
          const target = reasonTarget;
          setReasonTarget(null);
          if (target) void transition(target, reason || undefined);
        }}
      />

      {/* Handover */}
      {canManage ? (
        <HandoverDialog
          brief={brief}
          open={handoverOpen}
          onOpenChange={setHandoverOpen}
          onHandedOver={(projectId) => {
            invalidate();
            if (projectId) navigate("project-detail", { id: projectId });
            else navigate("projects");
          }}
        />
      ) : null}

      {/* Founder review dialog */}
      {isFounder ? (
        <FounderReviewDialog
          brief={brief}
          open={founderReviewOpen}
          onOpenChange={setFounderReviewOpen}
          onSaved={() => invalidate()}
        />
      ) : null}
    </div>
  );

  // -- internals that need `brief`/closures ----------------------------------

  async function transition(target: string, reason?: string) {
    try {
      await apiFetch<BriefRecord>(`/api/briefs/${brief!.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: target, reason }),
      });
      toast.success(`Brief moved to ${label(target)}`);
      invalidate();
    } catch (err) {
      toast.error((err as Error).message || "Could not update the brief status.");
    }
  }

  async function patchBrief(body: Record<string, unknown>) {
    try {
      await apiFetch<BriefRecord>(`/api/briefs/${brief!.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Brief updated");
      invalidate();
    } catch (err) {
      toast.error((err as Error).message || "Could not update the brief.");
    }
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | undefined }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Rows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div key={key} className="min-w-0 space-y-0.5">
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {key}
          </dt>
          <dd className="text-sm break-words">{value ? value : <span className="text-muted-foreground">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function ParagraphRows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <div className="space-y-3">
      {rows.map(([key, value]) => (
        <div key={key} className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {key}
          </p>
          {value ? (
            <p className="text-sm whitespace-pre-wrap">{value}</p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  target,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: string | null;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            The brief goes back to the manager — record what the founder wants changed. The reason
            is stored on the brief.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="brief-change-reason">Reason (required)</Label>
          <Textarea
            id="brief-change-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Focus the demo on online bookings; drop the shop feature."
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>
            Request changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverDialog({
  brief,
  open,
  onOpenChange,
  onHandedOver,
}: {
  brief: BriefRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandedOver: (projectId?: string) => void;
}) {
  const [developerUserId, setDeveloperUserId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRecord[]>("/api/users"),
    enabled: open,
    staleTime: 60_000,
  });

  const developers = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) => u.role === "WEB_DEVELOPER" && u.status === "ACTIVE",
      ),
    [users.data],
  );

  async function handover() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (developerUserId) body.developerUserId = developerUserId;
      if (projectName.trim()) body.projectName = projectName.trim();
      const result = await apiFetch<
        { project?: Pick<ProjectRecord, "id" | "name">; projectId?: string; taskId?: string } | ProjectRecord
      >(`/api/briefs/${brief.id}/handover`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const projectId =
        (result && typeof result === "object" && "project" in result && result.project?.id) ||
        (result && typeof result === "object" && "projectId" in result && result.projectId) ||
        (result && typeof result === "object" && "id" in result && result.id) ||
        undefined;
      toast.success("Brief handed over to development", {
        description: "A project was created with the approved requirements.",
      });
      onOpenChange(false);
      onHandedOver(projectId || undefined);
    } catch (err) {
      toast.error((err as Error).message || "Could not hand over the brief.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hand over to development</DialogTitle>
          <DialogDescription>
            Creates the development project from brief {brief.displayNumber} with the approved
            requirements. The commercial fields stay on the brief.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="handover-developer">Developer</Label>
            <Select value={developerUserId} onValueChange={setDeveloperUserId}>
              <SelectTrigger id="handover-developer" className="w-full" aria-label="Developer">
                <SelectValue placeholder={developers.length ? "Select a developer" : "No developers yet"} />
              </SelectTrigger>
              <SelectContent>
                {developers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No active web developers found.
                  </div>
                ) : (
                  developers.map((dev) => (
                    <SelectItem key={dev.id} value={dev.id}>
                      {dev.displayName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Optional — assigns the new project.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="handover-project">Project name</Label>
            <Input
              id="handover-project"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={`Defaults to “${brief.client?.businessName ?? "Client"} website”`}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void handover()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Hand over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FounderReviewDialog({
  brief,
  open,
  onOpenChange,
  onSaved,
}: {
  brief: BriefRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [feedback, setFeedback] = useState(brief.founderFeedback ?? "");
  const [decisions, setDecisions] = useState(brief.clientDecisions ?? "");
  const [changes, setChanges] = useState(brief.approvedChanges ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiFetch<BriefRecord>(`/api/briefs/${brief.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          founderFeedback: feedback.trim() || null,
          clientDecisions: decisions.trim() || null,
          approvedChanges: changes.trim() || null,
        }),
      });
      toast.success("Founder review saved");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Could not save the founder review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Founder review — {brief.displayNumber}</DialogTitle>
          <DialogDescription>
            What the founder concluded from the demo meeting and what the client agreed to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fr-feedback">Founder feedback</Label>
            <Textarea
              id="fr-feedback"
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fr-decisions">Client decisions</Label>
            <Textarea
              id="fr-decisions"
              rows={3}
              value={decisions}
              onChange={(event) => setDecisions(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fr-changes">Approved changes</Label>
            <Textarea
              id="fr-changes"
              rows={3}
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
