"use client";

/**
 * AgencyOS — Deployments list (Phase 4, task 4-b).
 *
 * Deployment history with website/status/environment filters. Rows expand
 * inline into a detail card: full fields, status actions from
 * allowedTransitions (FAILED requires an error summary), post-deployment
 * health recording, edit (while QUEUED/BUILDING/DEPLOYING) and Record
 * rollback (pre-filled create dialog).
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ListX,
  Pencil,
  Plus,
  Rocket,
  SearchX,
  Undo2,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUSES,
  DEPLOYMENT_TRANSITIONS,
  label,
  type DeploymentRecord,
  type Paginated,
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { DeploymentFormDialog } from "@/components/agency/views/deployments/deployment-form-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;
const EDITABLE_STATUSES = ["QUEUED", "BUILDING", "DEPLOYING"];

export function DeploymentList() {
  const params = useAppStore((s) => s.params);

  const [filters, setFilters] = useState<{
    status: string;
    environment: string;
    websiteId: string;
  }>(() => ({
    status: (DEPLOYMENT_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : "",
    environment: (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(params.environment ?? "")
      ? params.environment
      : "",
    websiteId: params.websiteId ?? "",
  }));
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeploymentRecord | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<DeploymentRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const websitesQuery = useQuery({
    queryKey: ["websites", "lookup", "all"],
    queryFn: () => apiFetch<Paginated<{ id: string; name: string }>>("/api/websites?pageSize=100&sort=name&dir=asc"),
    staleTime: 60_000,
  });

  const setFilter = (patch: Partial<{ status: string; environment: string; websiteId: string }>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const listQueryKey = useMemo(
    () =>
      ["deployments", { page, status: filters.status, environment: filters.environment, websiteId: filters.websiteId }] as const,
    [page, filters.status, filters.environment, filters.websiteId],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<DeploymentRecord>>(
        `/api/deployments${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          status: filters.status || undefined,
          environment: filters.environment || undefined,
          websiteId: filters.websiteId || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasFilters = !!filters.status || !!filters.environment || !!filters.websiteId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading
            ? "Loading deployments…"
            : `${total} ${total === 1 ? "deployment" : "deployments"}`}
        </p>
        <Button onClick={() => setCreateOpen(true)} className="min-h-9">
          <Plus aria-hidden />
          Record deployment
        </Button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Select
          value={filters.websiteId || "all"}
          onValueChange={(value) => setFilter({ websiteId: value === "all" ? "" : value })}
        >
          <SelectTrigger className="w-full lg:w-52" aria-label="Website filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All websites</SelectItem>
            {(websitesQuery.data?.items ?? []).map((website) => (
              <SelectItem key={website.id} value={website.id}>
                {website.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status || "all"}
          onValueChange={(value) => setFilter({ status: value === "all" ? "" : value })}
        >
          <SelectTrigger className="w-full lg:w-44" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DEPLOYMENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.environment || "all"}
          onValueChange={(value) => setFilter({ environment: value === "all" ? "" : value })}
        >
          <SelectTrigger className="w-full lg:w-40" aria-label="Environment filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {DEPLOYMENT_ENVIRONMENTS.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-2" aria-busy aria-label="Loading deployments">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-4 flex-1 rounded bg-muted" />
              <div className="h-5 w-20 rounded bg-muted" />
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Deployments could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : total === 0 && !hasFilters ? (
        <EmptyState
          icon={Rocket}
          title="No deployments recorded yet"
          description="Record deployments manually (provider, commit, environment) — status is updated as it progresses, and a post-deployment health result can be attached once checked."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Record deployment
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No deployments match the current filters"
          description="Try widening the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setFilters({ status: "", environment: "", websiteId: "" });
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table with expandable detail rows */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" aria-hidden />
                  <TableHead className="w-36">Started</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead className="w-28">Environment</TableHead>
                  <TableHead className="w-28">Provider</TableHead>
                  <TableHead className="w-24">Commit</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-36">Finished</TableHead>
                  <TableHead className="w-16 text-right">Build</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((deployment) => {
                  const expanded = expandedId === deployment.id;
                  return (
                    <DeploymentRowGroup
                      key={deployment.id}
                      deployment={deployment}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : deployment.id)}
                      onEdit={() => setEditTarget(deployment)}
                      onRollback={() => setRollbackTarget(deployment)}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards with expandable detail */}
          <div className="grid gap-2 md:hidden">
            {items.map((deployment) => {
              const expanded = expandedId === deployment.id;
              return (
                <div key={deployment.id} className="rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : deployment.id)}
                    aria-expanded={expanded}
                    className="flex w-full min-h-11 items-start justify-between gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {deployment.website?.name ?? "—"}
                        </span>
                        <StatusBadge value={deployment.status} />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {label(deployment.environment)}
                        {deployment.provider ? ` · ${deployment.provider}` : ""} ·{" "}
                        {timeAgo(deployment.startedAt)}
                      </span>
                    </span>
                    {expanded ? (
                      <ChevronDown aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {expanded ? (
                    <div className="border-t p-4">
                      <DeploymentDetailCard
                        deployment={deployment}
                        onEdit={() => setEditTarget(deployment)}
                        onRollback={() => setRollbackTarget(deployment)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <ListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <DeploymentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeploymentFormDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        deployment={editTarget}
      />
      <DeploymentFormDialog
        open={!!rollbackTarget}
        onOpenChange={(open) => !open && setRollbackTarget(null)}
        rollbackOf={rollbackTarget}
        presetWebsiteId={rollbackTarget?.websiteId}
      />
    </div>
  );
}

/** Desktop row + expanded detail row (two <TableRow>s). */
function DeploymentRowGroup({
  deployment,
  expanded,
  onToggle,
  onEdit,
  onRollback,
}: {
  deployment: DeploymentRecord;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRollback: () => void;
}) {
  return (
    <>
      <TableRow
        onClick={onToggle}
        className="record-row cursor-pointer"
        aria-expanded={expanded}
      >
        <TableCell>
          {expanded ? (
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell
          className="text-sm whitespace-nowrap text-muted-foreground"
          title={formatDateTime(deployment.startedAt)}
        >
          {timeAgo(deployment.startedAt)}
        </TableCell>
        <TableCell className="max-w-56">
          <p className="truncate text-sm font-medium">{deployment.website?.name ?? "—"}</p>
          {deployment.website?.clientName ? (
            <p className="truncate text-xs text-muted-foreground">{deployment.website.clientName}</p>
          ) : null}
        </TableCell>
        <TableCell className="text-sm">{label(deployment.environment)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{deployment.provider ?? "—"}</TableCell>
        <TableCell>
          {deployment.commitSha ? (
            <span
              className="font-mono text-xs"
              title={deployment.commitSha}
            >
              {deployment.commitSha.slice(0, 7)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <StatusBadge value={deployment.status} />
        </TableCell>
        <TableCell
          className="text-sm whitespace-nowrap text-muted-foreground"
          title={deployment.completedAt ? formatDateTime(deployment.completedAt) : undefined}
        >
          {deployment.completedAt ? timeAgo(deployment.completedAt) : "—"}
        </TableCell>
        <TableCell className="text-right">
          {deployment.buildUrl ? (
            <a
              href={deployment.buildUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open build URL in a new tab"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Build
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-muted/20 p-0">
            <div className="p-4">
              <DeploymentDetailCard deployment={deployment} onEdit={onEdit} onRollback={onRollback} />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Expanded detail card — own mutations, opened dialogs owned by the parent
// ---------------------------------------------------------------------------

export function DeploymentDetailCard({
  deployment,
  onEdit,
  onRollback,
}: {
  deployment: DeploymentRecord;
  onEdit: () => void;
  onRollback: () => void;
}) {
  const queryClient = useQueryClient();
  const [failedOpen, setFailedOpen] = useState(false);
  const [errorSummary, setErrorSummary] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rollbackMarkOpen, setRollbackMarkOpen] = useState(false);
  const [healthDraft, setHealthDraft] = useState<string | null>(null);
  const [healthNoteDraft, setHealthNoteDraft] = useState<string | null>(null);

  const detailKey = useMemo(() => ["deployment", deployment.id] as const, [deployment.id]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["deployments"] });
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const statusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<DeploymentRecord>(`/api/deployments/${deployment.id}/status`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (record, body) => {
      const action = String(body.action ?? "");
      if (action === "FAILED") toast.error("Deployment marked as failed.");
      else toast.success(`Status set to ${label(record.status)}.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the deployment."),
    onSettled: () => invalidate(),
  });

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<DeploymentRecord>(`/api/deployments/${deployment.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (record, body) => {
      if ("postDeploymentHealth" in body) {
        toast.success(
          record.postDeploymentHealth && record.postDeploymentHealth !== "NOT_CHECKED"
            ? `Post-deployment health recorded: ${label(record.postDeploymentHealth)}.`
            : "Post-deployment check cleared.",
        );
      } else {
        toast.success("Deployment updated.");
      }
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the deployment."),
  });

  const allowed = DEPLOYMENT_TRANSITIONS[deployment.status] ?? [];
  const canEdit = EDITABLE_STATUSES.includes(deployment.status);
  const health = healthDraft ?? deployment.postDeploymentHealth ?? "NOT_CHECKED";
  const healthNote = healthNoteDraft ?? deployment.postDeploymentNote ?? "";
  const healthDirty =
    healthDraft !== null &&
    (healthDraft !== (deployment.postDeploymentHealth ?? "NOT_CHECKED") ||
      (healthNoteDraft !== null && healthNoteDraft !== (deployment.postDeploymentNote ?? "")));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={deployment.status} />
          <span className="text-sm text-muted-foreground">
            Started {formatDateTime(deployment.startedAt)}
            {deployment.completedAt ? ` · finished ${formatDateTime(deployment.completedAt)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-8" onClick={onEdit} disabled={!canEdit}>
            <Pencil aria-hidden className="size-3.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-8"
            onClick={onRollback}
            disabled={!!deployment.rollbackOfId}
            title={
              deployment.rollbackOfId
                ? "This deployment already is a rollback."
                : "Record a new deployment linked as this one's rollback"
            }
          >
            <Undo2 aria-hidden className="size-3.5" />
            Record rollback
          </Button>
        </div>
      </div>

      {/* Status actions from the transition map */}
      {allowed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Set status
          </span>
          {allowed.map((action) => (
            <Button
              key={action}
              variant="outline"
              size="sm"
              className="min-h-8"
              disabled={statusMutation.isPending}
              onClick={() => {
                if (action === "FAILED") {
                  setErrorSummary("");
                  setFailedOpen(true);
                  return;
                }
                if (action === "CANCELLED") {
                  setCancelOpen(true);
                  return;
                }
                if (action === "ROLLED_BACK") {
                  setRollbackMarkOpen(true);
                  return;
                }
                statusMutation.mutate({ action });
              }}
            >
              {label(action)}
            </Button>
          ))}
          {statusMutation.isPending ? (
            <span className="text-xs text-muted-foreground">Updating…</span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {label(deployment.status)} is terminal — record a rollback as a new deployment instead.
        </p>
      )}

      {deployment.errorSummary ? (
        <Alert variant="destructive">
          <AlertDescription className="break-words">{deployment.errorSummary}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        <DetailRow label="Website">{deployment.website?.name ?? "—"}</DetailRow>
        <DetailRow label="Environment">{label(deployment.environment)}</DetailRow>
        <DetailRow label="Provider">{deployment.provider ?? "—"}</DetailRow>
        <DetailRow label="Project">{deployment.project?.name ?? "—"}</DetailRow>
        <DetailRow label="Repository ref">{deployment.repositoryRef ?? "—"}</DetailRow>
        <DetailRow label="Commit">
          {deployment.commitSha ? (
            <span className="font-mono text-xs">{deployment.commitSha}</span>
          ) : (
            "—"
          )}
        </DetailRow>
        <DetailRow label="Deployment ref">{deployment.deploymentRef ?? "—"}</DetailRow>
        <DetailRow label="Initiated by">{deployment.initiatedBy?.displayName ?? "—"}</DetailRow>
        {deployment.rollbackOf ? (
          <DetailRow label="Rollback of">
            {deployment.rollbackOf.displayRef ?? deployment.rollbackOf.id}
          </DetailRow>
        ) : null}
        <DetailRow label="Build URL">
          {deployment.buildUrl ? (
            <a
              href={deployment.buildUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Open build
            </a>
          ) : (
            "—"
          )}
        </DetailRow>
        {deployment.notes ? <DetailRow label="Notes">{deployment.notes}</DetailRow> : null}
      </dl>

      {/* Post-deployment health — recorded from a real check only */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Post-deployment health</p>
            <p className="text-xs text-muted-foreground">
              Record the outcome of a real post-deployment check — never a guess.
            </p>
          </div>
          {deployment.postDeploymentHealth && deployment.postDeploymentHealth !== "NOT_CHECKED" ? (
            <StatusBadge value={deployment.postDeploymentHealth} />
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="sr-only" htmlFor={`health-${deployment.id}`}>
              Post-deployment health
            </Label>
            <Select
              value={health}
              onValueChange={setHealthDraft}
            >
              <SelectTrigger id={`health-${deployment.id}`} className="w-full min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOT_CHECKED">Not checked</SelectItem>
                <SelectItem value="PASSED">Passed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="sr-only" htmlFor={`health-note-${deployment.id}`}>
              Post-deployment note
            </Label>
            <Input
              id={`health-note-${deployment.id}`}
              value={healthNote}
              onChange={(event) => setHealthNoteDraft(event.target.value)}
              placeholder="e.g. Homepage 200 in 420 ms, contact form submits"
            />
          </div>
          <Button
            variant="outline"
            className="min-h-9"
            disabled={!healthDirty || patchMutation.isPending}
            onClick={() => {
              patchMutation.mutate({
                postDeploymentHealth: health,
                postDeploymentNote: healthNote.trim() || null,
              });
              setHealthDraft(null);
              setHealthNoteDraft(null);
            }}
          >
            Save
          </Button>
        </div>
      </div>

      {/* FAILED requires an error summary */}
      <Dialog open={failedOpen} onOpenChange={(open) => !open && setFailedOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark deployment as failed</DialogTitle>
            <DialogDescription>
              An error summary is required — it explains what broke and is kept on the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="deployment-error-summary">Error summary</Label>
            <Textarea
              id="deployment-error-summary"
              rows={3}
              value={errorSummary}
              onChange={(event) => setErrorSummary(event.target.value)}
              placeholder="e.g. Build failed: missing env var DATABASE_URL in production."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailedOpen(false)} disabled={statusMutation.isPending}>
              Cancel
            </Button>
            <Button
              className={cn("bg-destructive text-white hover:bg-destructive/90")}
              disabled={!errorSummary.trim() || statusMutation.isPending}
              onClick={() => {
                statusMutation.mutate({ action: "FAILED", errorSummary: errorSummary.trim() });
                setFailedOpen(false);
              }}
            >
              Mark as failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Mark this deployment as cancelled?"
        description="The deployment is recorded as CANCELLED and becomes read-only."
        confirmLabel="Mark cancelled"
        destructive
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate({ action: "CANCELLED" })}
      />
      <ConfirmDialog
        open={rollbackMarkOpen}
        onOpenChange={setRollbackMarkOpen}
        title="Mark this deployment as rolled back?"
        description="Use this when the site was actually reverted (e.g. by the provider). If you are deploying a rollback build, record it via “Record rollback” instead — the original is marked automatically when that rollback succeeds."
        confirmLabel="Mark rolled back"
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate({ action: "ROLLED_BACK" })}
      />
    </div>
  );
}

function DetailRow({ label: rowLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {rowLabel}
      </span>
      <span className="min-w-0 text-sm break-words">{children}</span>
    </div>
  );
}
