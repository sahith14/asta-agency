"use client";

/**
 * AgencyOS — Lead management card on the client detail (Phase 5, spec §1B).
 * Visible to the client manager and the founder. Employees other than the
 * manager never receive the editable fields (server strips nothing here —
 * the PATCH endpoint enforces who may write what).
 *
 * Tracks: outreach eligibility / opt-outs, follow-up date, qualification
 * (founder-approved decisions live in briefs; qualification is the manager's
 * pipeline action) and, for the founder, the assigned client manager.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/components/agency/store";
import { apiFetch, label, OUTREACH_STATUSES, type ClientRecord, type UserRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";

export function LeadManagementCard({ client }: { client: ClientRecord }) {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const canManage = user?.role === "OWNER" || user?.role === "CLIENT_MANAGER";
  const isFounder = user?.role === "OWNER";
  const [leadSource, setLeadSource] = useState(client.leadSource ?? "");
  const [followUpAt, setFollowUpAt] = useState(client.followUpAt ? client.followUpAt.slice(0, 10) : "");

  const managersQuery = useQuery({
    queryKey: ["users", "managers"],
    queryFn: () => apiFetch<UserRecord[]>("/api/users"),
    enabled: isFounder,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ClientRecord>(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("Lead record updated");
      void queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error("Update rejected", { description: error.message }),
  });

  if (!canManage) return null;
  const qualified = !!client.qualifiedAt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users aria-hidden className="size-4 text-muted-foreground" />
          Lead management
        </CardTitle>
        <CardDescription>Outreach, follow-ups and qualification for this {label(client.status).toLowerCase()}.</CardDescription>
        <CardAction>
          {qualified ? (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 aria-hidden className="size-3" />
              Qualified {client.qualifiedAt ? formatDate(client.qualifiedAt) : ""}
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={patch.isPending || client.status !== "PROSPECT"}
              onClick={() => patch.mutate({ qualifiedAt: new Date().toISOString() })}
            >
              <CheckCircle2 aria-hidden className="size-3.5" />
              Mark qualified
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="lead-source">Contact source</Label>
          {canManage ? (
            <div className="flex gap-2">
              <Input
                id="lead-source"
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                placeholder="Google search, referral, walk-in…"
                disabled={patch.isPending}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={patch.isPending || leadSource === (client.leadSource ?? "")}
                onClick={() => patch.mutate({ leadSource: leadSource.trim() || null })}
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="text-sm">{client.leadSource ?? "—"}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Outreach status</Label>
          <Select
            value={client.outreachStatus ?? "UNSPECIFIED"}
            onValueChange={(v) => patch.mutate({ outreachStatus: v })}
            disabled={patch.isPending}
          >
            <SelectTrigger className="w-full" aria-label="Outreach status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTREACH_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}{s === "OPTED_OUT" ? " — do not contact" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="follow-up">Follow-up due</Label>
          <div className="flex gap-2">
            <Input
              id="follow-up"
              type="date"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              disabled={patch.isPending}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={patch.isPending || followUpAt === (client.followUpAt ? client.followUpAt.slice(0, 10) : "")}
              onClick={() => patch.mutate({ followUpAt: followUpAt || null })}
            >
              Save
            </Button>
          </div>
          {client.outreachStatus === "OPTED_OUT" ? (
            <p className="text-xs text-destructive">This contact opted out — no further outreach.</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label>Assigned manager</Label>
          {isFounder ? (
            <Select
              value={client.assignedManagerId ?? "none"}
              onValueChange={(v) => patch.mutate({ assignedManagerId: v === "none" ? null : v })}
              disabled={patch.isPending}
            >
              <SelectTrigger className="w-full" aria-label="Assigned manager">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(managersQuery.data ?? [])
                  .filter((u) => u.role === "CLIENT_MANAGER")
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{client.assignedManager?.displayName ?? "Unassigned"}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
