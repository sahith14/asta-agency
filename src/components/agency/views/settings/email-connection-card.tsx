"use client";

/**
 * AgencyOS — Settings › Integrations: Gmail connection card (task 3-a).
 * Honest status card for the single Gmail connection (state machine, mailbox,
 * sync counters/errors) + Connect / Sync now / Disconnect actions and the
 * recent synchronisation runs list. Tokens are never displayed — the API does
 * not return them.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  Inbox,
  Link2Off,
  Loader2,
  RefreshCw,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { apiFetch, label, type EmailAccountStatusRecord, type GmailSyncRunRecord, type Paginated } from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/format";

const RUNS_PAGE_SIZE = 8;

const NOT_CONFIGURED_REASON =
  "Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment first.";

interface SyncSummary {
  status: string;
  fetched: number;
  fresh: number;
  skipped: number;
  error: string | null;
}

function TruncatedValue({ value, mono = false }: { value: string | null; mono?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={`inline-block max-w-56 truncate align-bottom sm:max-w-72 ${mono ? "font-mono text-xs" : "text-sm"}`}
      title={value}
    >
      {value}
    </span>
  );
}

export function EmailConnectionCard() {
  const queryClient = useQueryClient();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => apiFetch<EmailAccountStatusRecord>("/api/gmail/status"),
    // Poll only while a sync is in flight so the card reflects the outcome.
    refetchInterval: (query) => (query.state.data?.state === "SYNCING" ? 5_000 : false),
  });

  const status = statusQuery.data;
  const state = status?.state;

  function invalidateGmail() {
    queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    queryClient.invalidateQueries({ queryKey: ["gmail-runs"] });
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  }

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<SyncSummary>("/api/gmail/sync", { method: "POST" }),
    onSuccess: (result) => {
      if (result.status === "FAILED") {
        toast.error("Sync failed", {
          description: result.error ?? "Gmail reported an error during synchronisation.",
        });
      } else if (result.status === "PARTIAL") {
        toast.warning("Sync finished with errors", {
          description: `${result.fresh} new, ${result.skipped} skipped.${result.error ? ` ${result.error}` : ""}`,
        });
      } else {
        toast.success(`Sync finished — ${result.fresh} new, ${result.skipped} skipped`);
      }
      invalidateGmail();
    },
    onError: (error: Error) => {
      // Surface rate-limit / conflict messages verbatim.
      toast.error(error.message || "The synchronisation could not be started.");
      invalidateGmail();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<Record<string, never>>("/api/gmail/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast.success("Gmail disconnected", {
        description: "Stored access was revoked where possible and synchronisation stopped.",
      });
      setDisconnectOpen(false);
      invalidateGmail();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gmail could not be disconnected.");
      setDisconnectOpen(false);
    },
  });

  const copyRedirectUri = async () => {
    if (!status?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      setCopied(true);
      toast.success("Redirect URI copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy — please copy the value manually.");
    }
  };

  const connect = () => {
    // Full-page navigation: Google's consent screen, then back to /?oauth=…
    window.location.href = "/api/gmail/oauth/start";
  };

  const syncBusy = syncMutation.isPending;
  const disconnectBusy = disconnectMutation.isPending;

  return (
    <div className="space-y-6">
      {/* ------------------------------- Status card ------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox aria-hidden className="size-4 text-muted-foreground" />
            Gmail connection
          </CardTitle>
          <CardDescription>
            Synchronises the connected mailbox inbox into the review queue. Only one mailbox can be
            connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : statusQuery.isError ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden />
              <AlertTitle>Status could not be loaded</AlertTitle>
              <AlertDescription>
                {(statusQuery.error as Error)?.message ?? "Something went wrong."}
              </AlertDescription>
            </Alert>
          ) : status ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge value={state} className="px-3 py-1 text-sm" />
                {state === "SYNCING" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                    Sync in progress
                  </span>
                ) : null}
              </div>

              <Separator />

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Connected mailbox</dt>
                  <dd className="text-sm truncate">
                    <TruncatedValue value={status.emailAddress} />
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Last successful sync</dt>
                  <dd className="text-sm">
                    {status.lastSyncStatus === "SUCCESS"
                      ? formatDateTime(status.lastSyncCompletedAt)
                      : "—"}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Last attempted sync</dt>
                  <dd className="text-sm">{formatDateTime(status.lastSyncStartedAt)}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Current status</dt>
                  <dd className="text-sm">
                    {state === "SYNCING"
                      ? "Sync in progress"
                      : status.lastSyncStatus
                        ? label(status.lastSyncStatus)
                        : "—"}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Messages processed</dt>
                  <dd className="text-sm tabular-nums">{status.messagesProcessed}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-xs text-muted-foreground">Sync cursor (historyId)</dt>
                  <dd>
                    <TruncatedValue value={status.historyId} mono />
                  </dd>
                </div>
                <div className="space-y-0.5 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Connected account scope</dt>
                  <dd className="text-muted-foreground">
                    <TruncatedValue value={status.scope} mono />
                  </dd>
                </div>
              </dl>

              {status.lastSyncError ? (
                <Alert variant="destructive">
                  <AlertTriangle aria-hidden />
                  <AlertTitle>Last sync error</AlertTitle>
                  <AlertDescription className="break-all">{status.lastSyncError}</AlertDescription>
                </Alert>
              ) : null}
              {status.lastAuthError ? (
                <Alert variant="destructive">
                  <AlertTriangle aria-hidden />
                  <AlertTitle>Authorisation error</AlertTitle>
                  <AlertDescription className="break-all">{status.lastAuthError}</AlertDescription>
                </Alert>
              ) : null}

              {!status.configured ? (
                <Alert variant="destructive">
                  <AlertTriangle aria-hidden />
                  <AlertTitle>Gmail is not configured</AlertTitle>
                  <AlertDescription>
                    <ol className="list-decimal space-y-2 pl-4 text-sm">
                      <li>
                        Create an OAuth client (type &ldquo;Web application&rdquo;) in the Google
                        Cloud Console with the Gmail API enabled for the project.
                      </li>
                      <li>
                        Register this exact redirect URI for that client:{" "}
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <code className="max-w-full rounded-md border bg-muted px-2 py-1 font-mono text-xs break-all">
                            {status.redirectUri}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7 shrink-0"
                            onClick={copyRedirectUri}
                            aria-label="Copy redirect URI"
                          >
                            {copied ? (
                              <Check aria-hidden className="size-3.5" />
                            ) : (
                              <Copy aria-hidden className="size-3.5" />
                            )}
                          </Button>
                        </span>
                      </li>
                      <li>
                        Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
                        <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> in the
                        environment and restart the app.
                      </li>
                    </ol>
                    <p className="mt-2 text-sm">
                      Until then the connection stays &ldquo;Not configured&rdquo; and the
                      mailbox sync and reply features are disabled.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : null}

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Span wrapper keeps the tooltip hoverable while the button is disabled. */}
                <span className="inline-block">
                  <Button onClick={connect} disabled={statusQuery.isLoading || !status?.configured}>
                    <Inbox aria-hidden />
                    {state === "REAUTH_REQUIRED" || state === "ERROR" || status?.emailAddress
                      ? "Reconnect Gmail"
                      : "Connect Gmail"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!status?.configured ? <TooltipContent>{NOT_CONFIGURED_REASON}</TooltipContent> : null}
            </Tooltip>

            {(state === "CONNECTED" || state === "SYNCING") && status?.configured ? (
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncBusy || state === "SYNCING"}
              >
                {state === "SYNCING" || syncBusy ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                {state === "SYNCING" || syncBusy ? "Syncing…" : "Sync now"}
              </Button>
            ) : null}

            {status?.emailAddress ? (
              <Button
                variant="ghost"
                onClick={() => setDisconnectOpen(true)}
                disabled={disconnectBusy}
                className="text-destructive hover:text-destructive sm:ml-auto"
              >
                <Link2Off aria-hidden />
                Disconnect
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* --------------------------- Recent sync runs ----------------------------- */}
      <SyncRunsCard />

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect Gmail?"
        description="Stored access is revoked where possible and synchronisation stops. The mailbox can be connected again at any time."
        confirmLabel="Disconnect Gmail"
        destructive
        loading={disconnectBusy}
        onConfirm={() => disconnectMutation.mutate()}
      />
    </div>
  );
}

/** Recent synchronisation runs (most recent first, 8 per page). */
function SyncRunsCard() {
  const [page, setPage] = useState(1);

  // The runs endpoint returns an honest empty page when no account exists,
  // so no gating on the connection status is needed.
  const runsQuery = useQuery({
    queryKey: ["gmail-runs", page],
    queryFn: () =>
      apiFetch<Paginated<GmailSyncRunRecord>>(
        `/api/gmail/sync/runs${buildQuery({ page, pageSize: RUNS_PAGE_SIZE })}`,
      ),
  });

  const runs = runsQuery.data?.items ?? [];
  const pageCount = Math.max(1, runsQuery.data?.pageCount ?? 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent synchronisation runs</CardTitle>
        <CardDescription>
          Every sync execution with its outcome — including scheduled runs and honest failures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {runsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : runsQuery.isError ? (
          <p className="text-sm text-destructive">
            {(runsQuery.error as Error)?.message ?? "Run history could not be loaded."}
          </p>
        ) : runs.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No synchronisation has run yet.
          </p>
        ) : (
          <>
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="space-y-1.5 rounded-lg border px-3 py-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground" title={formatDateTime(run.startedAt)}>
                      {timeAgo(run.startedAt)}
                    </span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {label(run.kind)}
                    </Badge>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {label(run.trigger)}
                    </Badge>
                    <StatusBadge value={run.status} />
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      fetched {run.messagesFetched} · new {run.messagesNew} · skipped{" "}
                      {run.messagesSkipped}
                    </span>
                  </div>
                  {run.error ? (
                    <p className="truncate text-destructive" title={run.error}>
                      {run.error}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {pageCount > 1 ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous runs page"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next runs page"
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
