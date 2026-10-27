"use client";

/**
 * AgencyOS — Settings › Integrations: provider connections card (Phase 4, task 4-b).
 *
 * GitHub webhook/token status (honest env checks), recent webhook events,
 * provider connection CRUD (config stored ENCRYPTED server-side and never
 * returned or displayed) and the provider support matrix. No hosting/GitHub
 * adapters exist yet — connections are stored securely until an adapter is
 * available, and the copy says exactly that.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Power,
  SearchX,
  Trash2,
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
import {
  apiFetch,
  label,
  PROVIDER_SUGGESTIONS,
  type IntegrationsStatusData,
  type ProviderConnectionRecord,
} from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export function ProviderConnectionsCard() {
  const statusQuery = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => apiFetch<IntegrationsStatusData>("/api/integrations/status"),
  });

  if (statusQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug aria-hidden className="size-4 text-muted-foreground" />
            Hosting &amp; GitHub connections
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-24 rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (statusQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug aria-hidden className="size-4 text-muted-foreground" />
            Hosting &amp; GitHub connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={SearchX}
            title="Integrations status could not be loaded"
            description={(statusQuery.error as Error)?.message ?? "Something went wrong."}
            action={
              <Button variant="outline" onClick={() => void statusQuery.refetch()}>
                Try again
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const data = statusQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <GitHubCard github={data.github} events={data.recentWebhookEvents} />
      <ConnectionsCard connections={data.connections} onChanged={() => void statusQuery.refetch()} />
      <ProviderSupportTable support={data.providerSupport} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

function GitHubCard({
  github,
  events,
}: {
  github: IntegrationsStatusData["github"];
  events: IntegrationsStatusData["recentWebhookEvents"];
}) {
  const [copied, setCopied] = useState(false);
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/github/webhook`
      : "/api/integrations/github/webhook";

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("Webhook URL copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy — please copy the value manually.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GitHub</CardTitle>
        <CardDescription>{github.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              github.tokenConfigured
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground"
            }
          >
            {github.tokenConfigured ? "API token configured" : "No API token (GITHUB_TOKEN)"}
          </Badge>
          <Badge
            variant="outline"
            className={
              github.webhookSecretConfigured
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/40 bg-warning/15 text-warning-foreground"
            }
          >
            {github.webhookSecretConfigured
              ? "Webhook secret configured"
              : "No webhook secret (GITHUB_WEBHOOK_SECRET) — webhook payloads are rejected"}
          </Badge>
        </div>

        {!github.tokenConfigured || !github.webhookSecretConfigured ? (
          <Alert>
            <AlertTitle>Honest status</AlertTitle>
            <AlertDescription>
              Without a token, repository lookups are unavailable; without the webhook secret,
              incoming GitHub webhooks are rejected (HTTP 401). Neither is simulated.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Webhook endpoint
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="max-w-full rounded-md border bg-muted px-2 py-1 font-mono text-xs break-all">
              {webhookUrl}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              onClick={copyWebhookUrl}
              aria-label="Copy webhook URL"
            >
              {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Recent webhook events
          </p>
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
              No webhook events received yet — point a GitHub repository webhook at the endpoint
              above.
            </p>
          ) : (
            <ul className="scrollbar-thin max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {events.map((event) => (
                <li key={event.id} className="space-y-1 rounded-lg border px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-medium">{event.eventType ?? event.eventId}</span>
                    <StatusBadge value={event.status} />
                    <span className="ml-auto text-muted-foreground" title={formatDateTime(event.receivedAt)}>
                      {formatDateTime(event.receivedAt)}
                    </span>
                  </div>
                  {event.payloadSummary ? (
                    <p className="truncate text-muted-foreground" title={event.payloadSummary}>
                      {event.payloadSummary}
                    </p>
                  ) : null}
                  {event.error ? <p className="text-destructive">{event.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Provider connections CRUD
// ---------------------------------------------------------------------------

function ConnectionsCard({
  connections,
  onChanged,
}: {
  connections: ProviderConnectionRecord[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProviderConnectionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderConnectionRecord | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
    void queryClient.invalidateQueries({ queryKey: ["integrations-connections"] });
  };

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; disable: boolean }) =>
      apiFetch<ProviderConnectionRecord>(`/api/integrations/connections/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.disable ? "DISABLED" : "NOT_CONFIGURED" }),
      }),
    onSuccess: (record) => {
      toast.success(
        record.status === "DISABLED"
          ? "Connection disabled — no adapter will use it."
          : "Connection enabled.",
      );
      invalidate();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the connection."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown>(`/api/integrations/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Connection deleted.");
      setDeleteTarget(null);
      invalidate();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete the connection."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Provider connections</CardTitle>
          <CardDescription>
            Credentials are stored encrypted and are never displayed or logged.
          </CardDescription>
        </div>
        <Button
          size="sm"
          className="min-h-8"
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus aria-hidden className="size-3.5" />
          Add connection
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert className="bg-muted/50">
          <AlertDescription>
            No hosting/GitHub adapters are implemented yet — connections are stored securely until
            an adapter is available.
          </AlertDescription>
        </Alert>

        {connections.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No provider connections stored yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((connection) => {
              const disabled = connection.status === "DISABLED";
              return (
                <li key={connection.id} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{connection.name}</span>
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                          {label(connection.provider)}
                        </Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {metadataSummary(connection)}
                      </p>
                    </div>
                    <StatusBadge value={connection.status} />
                  </div>
                  {connection.lastError ? (
                    <p className="text-xs break-words text-destructive">{connection.lastError}</p>
                  ) : null}
                  <div className="flex items-center gap-2 border-t pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-8"
                      onClick={() => {
                        setEditTarget(connection);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil aria-hidden className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-8"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: connection.id, disable: !disabled })}
                    >
                      <Power aria-hidden className="size-3.5" />
                      {disabled ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto min-h-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(connection)}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ConnectionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        connection={editTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="The encrypted credentials are destroyed. This cannot be undone."
        confirmLabel="Delete connection"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Card>
  );
}

/** Non-secret metadata one-liner ("repo: org/repo · env: production"). */
function metadataSummary(connection: ProviderConnectionRecord): string {
  const metadata = connection.metadata;
  if (!metadata || typeof metadata !== "object") return "No non-secret metadata recorded.";
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length > 0 ? entries.join(" · ") : "No non-secret metadata recorded.";
}

/** Add/edit dialog — config entered as "key: value" lines, parsed on submit. */
function ConnectionFormDialog({
  open,
  onOpenChange,
  connection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ProviderConnectionRecord | null;
}) {
  const isEdit = Boolean(connection);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [configText, setConfigText] = useState("");

  // Seed local state each time the dialog opens (also picks up the edit target).
  // Render-time adjustment (React-endorsed alternative to a reset effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setServerError(null);
      setProvider(connection?.provider ?? "");
      setName(connection?.name ?? "");
      setConfigText("");
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const config: Record<string, string> = {};
      for (const line of configText.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf(":");
        if (separator <= 0) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (key) config[key] = value;
      }
      const body = {
        provider: provider.trim().toUpperCase(),
        name: name.trim(),
        config: Object.keys(config).length > 0 ? config : undefined,
      };
      return isEdit && connection
        ? apiFetch<ProviderConnectionRecord>(`/api/integrations/connections/${connection.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : apiFetch<ProviderConnectionRecord>("/api/integrations/connections", {
            method: "POST",
            body: JSON.stringify(body),
          });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Connection updated." : "Connection stored — credentials are encrypted at rest.");
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the connection.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit connection" : "Add provider connection"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Leave the config blank to keep the stored credentials."
              : "Config lines are parsed as key: value pairs and stored encrypted. They are never shown again."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setServerError(null);
            if (!provider.trim() || !name.trim()) return;
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

          <div className="space-y-1.5">
            <Label htmlFor="connection-provider">Provider</Label>
            <Input
              id="connection-provider"
              list="provider-suggestions-settings"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="e.g. CLOUDFLARE_PAGES"
              autoComplete="off"
              className="font-mono"
            />
            <datalist id="provider-suggestions-settings">
              {PROVIDER_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="connection-name">Name</Label>
            <Input
              id="connection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Cloudflare account (main)"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="connection-config">Config (key: value per line)</Label>
            <Textarea
              id="connection-config"
              rows={4}
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
              placeholder={"account_id: abc123\napi_token: ••••••"}
              className="font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted (AES-256-GCM) — never returned by the API, never displayed, never
              logged.
            </p>
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
            <Button
              type="submit"
              disabled={saveMutation.isPending || !provider.trim() || !name.trim()}
            >
              {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Add connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Provider support matrix
// ---------------------------------------------------------------------------

function ProviderSupportTable({
  support,
}: {
  support: IntegrationsStatusData["providerSupport"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Provider support</CardTitle>
        <CardDescription>What the platform can do with each provider today.</CardDescription>
      </CardHeader>
      <CardContent>
        {support.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No provider support information available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Provider</TableHead>
                  <TableHead className="w-32">Implemented</TableHead>
                  <TableHead>Capabilities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {support.map((row) => (
                  <TableRow key={row.provider}>
                    <TableCell className="text-sm font-medium">{label(row.provider)}</TableCell>
                    <TableCell>
                      {row.implemented ? (
                        <StatusBadge value="CONNECTED" />
                      ) : (
                        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                          Planned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.capabilities.join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
