"use client";

/**
 * AgencyOS — Domains tab of the website detail view.
 * Lists Domain records (name, registrar, renewal, auto-renew badge) with an
 * add dialog (POST /api/websites/{id}/domains) and per-domain removal
 * (DELETE /api/domains/{domainId}, confirm-guarded).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { apiFetch, type DomainRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { daysUntil } from "@/components/agency/views/websites/list-bits";
import { cn } from "@/lib/utils";

function renewalTone(iso: string | null): string | null {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < 0) return "text-destructive";
  if (days < 30) return "text-destructive";
  return "text-muted-foreground";
}

export function DomainsTab({
  websiteId,
  domains,
}: {
  websiteId: string;
  domains: DomainRecord[];
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [domainName, setDomainName] = useState("");
  const [registrar, setRegistrar] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<DomainRecord | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["website", websiteId] });
  }

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch<DomainRecord>(`/api/websites/${websiteId}/domains`, {
        method: "POST",
        body: JSON.stringify({
          domainName: domainName.trim(),
          registrar: registrar.trim() || null,
          renewalDate: renewalDate || null,
          autoRenew,
        }),
      }),
    onSuccess: (domain) => {
      toast.success(`Domain ${domain.domainName} added.`);
      setAddOpen(false);
      setDomainName("");
      setRegistrar("");
      setRenewalDate("");
      setAutoRenew(true);
      refresh();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (domainId: string) =>
      apiFetch<{ id?: string }>(`/api/domains/${domainId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Domain removed.");
      setRemoveTarget(null);
      refresh();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Domains</CardTitle>
          <CardDescription>
            Every domain registered against this website, including aliases.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add domain
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {domains.length === 0 ? (
          <div className="border-t p-4">
            <EmptyState
              icon={Globe}
              title="No domains recorded"
              description="Add the primary domain and any aliases so renewals are tracked."
            />
          </div>
        ) : (
          <ul className="divide-y border-t">
            {domains.map((domain) => {
              const tone = renewalTone(domain.renewalDate);
              return (
                <li
                  key={domain.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{domain.domainName}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{domain.registrar ? `Registrar: ${domain.registrar}` : "Registrar not set"}</span>
                      <span
                        className={cn(
                          tone === "text-destructive" && "font-medium text-destructive"
                        )}
                      >
                        {domain.renewalDate
                          ? `Renews ${formatDate(domain.renewalDate)}`
                          : "No renewal date"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        domain.autoRenew
                          ? "border-success/30 bg-success/10 text-success"
                          : "text-muted-foreground"
                      )}
                    >
                      {domain.autoRenew ? "Auto-renew" : "Manual renewal"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${domain.domainName}`}
                      onClick={() => setRemoveTarget(domain)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add domain</DialogTitle>
            <DialogDescription>
              Track an additional domain or alias for this website.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="domain-name">Domain name</Label>
              <Input
                id="domain-name"
                value={domainName}
                onChange={(event) => setDomainName(event.target.value)}
                placeholder="e.g. example.co.uk"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain-registrar">Registrar</Label>
              <Input
                id="domain-registrar"
                value={registrar}
                onChange={(event) => setRegistrar(event.target.value)}
                placeholder="e.g. 123 Reg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain-renewal">Renewal date</Label>
              <Input
                id="domain-renewal"
                type="date"
                value={renewalDate}
                onChange={(event) => setRenewalDate(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoRenew}
                onCheckedChange={(checked) => setAutoRenew(checked === true)}
              />
              Auto-renew is enabled with the registrar
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!domainName.trim()) {
                  toast.error("Domain name is required.");
                  return;
                }
                addMutation.mutate();
              }}
              disabled={addMutation.isPending || !domainName.trim()}
            >
              {addMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Add domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={`Remove ${removeTarget?.domainName ?? "domain"}?`}
        description="The domain record is deleted from this website. Renewal tracking for it stops immediately."
        confirmLabel="Remove domain"
        destructive
        loading={removeMutation.isPending}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.id);
        }}
      />
    </Card>
  );
}
