"use client";

/**
 * AgencyOS — Monitoring › Domains tab (Phase 4, task 4-b).
 *
 * All domains across the agency with honest expiry sources: RDAP-verified
 * (registry response) vs Manual (hand-maintained renewal date) vs unknown.
 * TLS certificate expiry with error reporting, auto-renew flag, and real
 * "Check now" actions (POST /api/monitoring/domains/check).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, PlayCircle, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { openWebsite } from "@/components/agency/store";
import { apiFetch, type DomainCheckOutcomeRow, type JobRunOutcome, type MonitoringDomainsData } from "@/lib/types";
import { formatDate, timeAgo } from "@/lib/format";
import { expiryToneClass, toastJobOutcome } from "@/components/agency/views/monitoring/bits";
import { cn } from "@/lib/utils";

export function MonitoringDomainsTab() {
  const queryClient = useQueryClient();
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);

  const domainsQuery = useQuery({
    queryKey: ["monitoring-domains"],
    queryFn: () => apiFetch<MonitoringDomainsData>("/api/monitoring/domains"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["monitoring-domains"] });
    void queryClient.invalidateQueries({ queryKey: ["monitoring-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const checkAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<JobRunOutcome>("/api/monitoring/domains/check", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (outcome) => {
      toastJobOutcome(outcome);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "The domain check could not be run.");
      invalidate();
    },
  });

  const checkOneMutation = useMutation({
    mutationFn: (domainId: string) =>
      apiFetch<JobRunOutcome>("/api/monitoring/domains/check", {
        method: "POST",
        body: JSON.stringify({ domainId }),
      }),
    onSuccess: (outcome, domainId) => {
      const results = (outcome.results ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(results.rows) ? (results.rows as DomainCheckOutcomeRow[]) : [];
      const row = rows.find((entry) => entry.domainId === domainId) ?? rows[0];
      if (row) {
        const errors = row.errors ?? [];
        if (errors.length > 0) {
          toast.warning(`${row.domainName}: checked with errors`, {
            description: errors.join(" · "),
          });
        } else {
          toast.success(
            `${row.domainName}: cert ${row.certNotAfter ? "valid" : "unavailable"}, RDAP ${
              row.rdapExpiryDate ? "found" : "not published"
            }`,
          );
        }
      } else {
        toastJobOutcome(outcome);
      }
      setCheckingDomainId(null);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "The domain check could not be run.");
      setCheckingDomainId(null);
      invalidate();
    },
  });

  const items = domainsQuery.data?.items ?? [];
  const loading = domainsQuery.isLoading;
  const busy = checkAllMutation.isPending || checkOneMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading domains…"
            : `${items.length} ${items.length === 1 ? "domain" : "domains"} — soonest expiry first. RDAP-verified expiries come from the registry; Manual dates are hand-maintained.`}
        </p>
        <Button
          variant="outline"
          onClick={() => checkAllMutation.mutate()}
          disabled={busy}
          className="min-h-9 shrink-0"
        >
          <RefreshCw aria-hidden className={cn(busy && checkAllMutation.isPending && "animate-spin")} />
          Check all
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy aria-label="Loading domains">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-4 flex-1 rounded bg-muted" />
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-5 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : domainsQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Domains could not be loaded"
          description={(domainsQuery.error as Error)?.message ?? "Something went wrong."}
          action={
            <Button variant="outline" onClick={() => void domainsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No domains recorded yet"
          description="Add domains on a website's detail page under the Domains tab — renewals and certificates will be checked from here."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Domain</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead className="w-32">Registrar</TableHead>
                  <TableHead className="w-44">Renewal</TableHead>
                  <TableHead className="w-44">Certificate</TableHead>
                  <TableHead className="w-24">Auto-renew</TableHead>
                  <TableHead className="w-28">Checked</TableHead>
                  <TableHead className="w-24 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((domain) => (
                  <DomainRow
                    key={domain.id}
                    domain={domain}
                    busy={busy}
                    checking={checkingDomainId === domain.id}
                    onCheck={() => {
                      setCheckingDomainId(domain.id);
                      checkOneMutation.mutate(domain.id);
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {items.map((domain) => (
              <DomainCard
                key={domain.id}
                domain={domain}
                busy={busy}
                checking={checkingDomainId === domain.id}
                onCheck={() => {
                  setCheckingDomainId(domain.id);
                  checkOneMutation.mutate(domain.id);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type DomainItem = MonitoringDomainsData["items"][number];

/** Renewal column: honest about the source (RDAP vs manual vs unknown). */
function RenewalCell({ domain }: { domain: DomainItem }) {
  if (domain.rdapExpiryDate) {
    return (
      <div className="space-y-0.5">
        <p className={cn("text-sm", expiryToneClass(domain.daysUntilRenewal))}>
          {formatDate(domain.rdapExpiryDate)}
        </p>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          RDAP-verified
        </Badge>
      </div>
    );
  }
  if (domain.renewalDate) {
    return (
      <div className="space-y-0.5">
        <p className={cn("text-sm", expiryToneClass(domain.daysUntilRenewal))}>
          {formatDate(domain.renewalDate)}
        </p>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          Manual
        </Badge>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">—</span>;
}

function CertCell({ domain }: { domain: DomainItem }) {
  if (domain.certError) {
    return (
      <span className="block max-w-40 truncate text-xs text-destructive" title={domain.certError}>
        {domain.certError}
      </span>
    );
  }
  if (domain.certNotAfter) {
    return (
      <div className="space-y-0.5">
        <p className={cn("text-sm", expiryToneClass(domain.daysUntilCertExpiry))}>
          {formatDate(domain.certNotAfter)}
        </p>
        {domain.daysUntilCertExpiry !== null ? (
          <p className={cn("text-xs tabular-nums", expiryToneClass(domain.daysUntilCertExpiry))}>
            {domain.daysUntilCertExpiry <= 0 ? "expired" : `in ${domain.daysUntilCertExpiry} d`}
          </p>
        ) : null}
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">not checked</span>;
}

function DomainRow({
  domain,
  busy,
  checking,
  onCheck,
}: {
  domain: DomainItem;
  busy: boolean;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="max-w-56">
        <p className="truncate font-mono text-sm" title={domain.domainName}>
          {domain.domainName}
        </p>
        {domain.rdapError ? (
          <p className="truncate text-xs text-muted-foreground" title={domain.rdapError}>
            RDAP: {domain.rdapError}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-48">
        <button
          type="button"
          onClick={() => openWebsite(domain.websiteId)}
          className="block max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate text-sm hover:underline">{domain.websiteName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {domain.clientName ?? "—"}
          </span>
        </button>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {domain.registrar ?? "—"}
      </TableCell>
      <TableCell>
        <RenewalCell domain={domain} />
      </TableCell>
      <TableCell>
        <CertCell domain={domain} />
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            domain.autoRenew
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted text-muted-foreground"
          }
        >
          {domain.autoRenew ? "On" : "Off"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
        {domain.lastCheckedAt ? timeAgo(domain.lastCheckedAt) : "never"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          className="min-h-8"
          onClick={onCheck}
          disabled={busy}
        >
          <PlayCircle aria-hidden className="size-3.5" />
          {checking ? "Checking…" : "Check now"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DomainCard({
  domain,
  busy,
  checking,
  onCheck,
}: {
  domain: DomainItem;
  busy: boolean;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => openWebsite(domain.websiteId)}
          className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate font-mono text-sm font-medium">{domain.domainName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {domain.websiteName} · {domain.clientName ?? "—"}
          </span>
        </button>
        <Badge
          variant="outline"
          className={
            domain.autoRenew
              ? "shrink-0 border-success/30 bg-success/10 text-success"
              : "shrink-0 border-border bg-muted text-muted-foreground"
          }
        >
          auto-renew {domain.autoRenew ? "on" : "off"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-0.5">
          <p className="text-muted-foreground">Renewal</p>
          <RenewalCell domain={domain} />
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground">Certificate</p>
          <CertCell domain={domain} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <span className="text-xs text-muted-foreground">
          {domain.lastCheckedAt ? `checked ${timeAgo(domain.lastCheckedAt)}` : "never checked"}
        </span>
        <Button variant="outline" size="sm" className="min-h-9" onClick={onCheck} disabled={busy}>
          <PlayCircle aria-hidden className="size-3.5" />
          {checking ? "Checking…" : "Check now"}
        </Button>
      </div>
    </div>
  );
}
