"use client";

/**
 * AgencyOS — Websites tab of the project detail view.
 * Rows link through to the website detail; [Link website] offers the client's
 * other websites (POST /api/projects/{id}/websites) and rows can be unlinked
 * (DELETE /api/projects/{id}/websites?websiteId=). Both return the refreshed
 * ProjectRecord, which is written straight into the detail cache.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openWebsite } from "@/components/agency/store";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import {
  apiFetch,
  type Paginated,
  type ProjectRecord,
  type TaskRecord,
  type WebsiteRecord,
} from "@/lib/types";
import type { ProjectDetailPayload } from "@/components/agency/views/projects/milestones-tab";

export function WebsitesLinkTab({
  project,
  detailKey,
}: {
  project: ProjectRecord;
  detailKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");

  const linked = project.websites ?? [];
  const linkedIds = new Set(linked.map((w) => w.id));

  const clientWebsitesQuery = useQuery({
    queryKey: ["websites", { clientId: project.clientId, picker: true }],
    queryFn: () =>
      apiFetch<Paginated<WebsiteRecord>>(
        `/api/websites${buildQuery({ clientId: project.clientId, pageSize: 100 })}`
      ),
    // Fetched eagerly (not just for the dialog) so linked rows can show the
    // full lifecycle badge — the ProjectRecord link payload only carries
    // id/name/primaryDomain.
    enabled: Boolean(project.clientId),
  });

  const lifecycleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const website of clientWebsitesQuery.data?.items ?? []) {
      map.set(website.id, website.lifecycleStatus);
    }
    return map;
  }, [clientWebsitesQuery.data]);

  const linkable = (clientWebsitesQuery.data?.items ?? []).filter(
    (website) => !linkedIds.has(website.id)
  );

  /** Both link mutations return the refreshed ProjectRecord — cache it. */
  function applyRecord(record: ProjectRecord) {
    queryClient.setQueryData<ProjectDetailPayload>(detailKey, (old) =>
      old ? { ...old, project: record } : old
    );
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["websites"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const link = useMutation({
    mutationFn: (websiteId: string) =>
      apiFetch<ProjectRecord>(`/api/projects/${project.id}/websites`, {
        method: "POST",
        body: JSON.stringify({ websiteId }),
      }),
    onSuccess: (record) => {
      toast.success("Website linked.");
      setLinkOpen(false);
      setSelectedWebsiteId("");
      applyRecord(record);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const unlink = useMutation({
    mutationFn: (websiteId: string) =>
      apiFetch<ProjectRecord>(
        `/api/projects/${project.id}/websites${buildQuery({ websiteId })}`,
        { method: "DELETE" }
      ),
    onSuccess: (record) => {
      toast.success("Website unlinked.");
      applyRecord(record);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Client websites this project covers.
        </p>
        <Button size="sm" onClick={() => setLinkOpen(true)}>
          <Link2 className="size-4" />
          Link website
        </Button>
      </div>

      {linked.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No websites linked to this project."
          description="Link one or more of the client's websites so delivery context stays attached."
          action={
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
              <Link2 className="size-4" />
              Link website
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {linked.map((website) => (
            <li
              key={website.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openWebsite(website.id)}
              >
                <p className="truncate text-sm font-medium">{website.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {website.primaryDomain ?? "No domain set"}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {lifecycleById.has(website.id) ? (
                  <StatusBadge value={lifecycleById.get(website.id)} />
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Unlink ${website.name}`}
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate(website.id)}
                >
                  {unlink.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Unlink className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link website</DialogTitle>
            <DialogDescription>
              Choose one of the client's websites to attach to this project.
            </DialogDescription>
          </DialogHeader>
          {clientWebsitesQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading websites…</p>
          ) : linkable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All of this client's websites are already linked (or they have none yet).
            </p>
          ) : (
            <Select value={selectedWebsiteId || undefined} onValueChange={setSelectedWebsiteId}>
              <SelectTrigger aria-label="Website to link">
                <SelectValue placeholder="Select a website" />
              </SelectTrigger>
              <SelectContent>
                {linkable.map((website) => (
                  <SelectItem key={website.id} value={website.id}>
                    {website.name}
                    {website.primaryDomain ? ` · ${website.primaryDomain}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedWebsiteId || link.isPending}
              onClick={() => link.mutate(selectedWebsiteId)}
            >
              {link.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Link website
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
