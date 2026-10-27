"use client";

/**
 * AgencyOS — client detail (view.name === "client-detail", id = params.id).
 *
 * Tabs: Overview (details + contacts + notes) | Websites | Projects | Tasks |
 * Documents | Billing (honest "not part of Phase 1") | Activity.
 * Side queries are hoisted with pageSize-capped requests so the tab count
 * badges are honest before a tab is visited. Billing shows NO fake numbers.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  FileText,
  FolderKanban,
  Globe,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Pencil,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openProject, openWebsite, useAppStore } from "@/components/agency/store";
import {
  apiFetch,
  label,
  type ActivityRecord,
  type ClientRecord,
  type ContactRecord,
  type DocumentRecord,
  type Paginated,
  type ProjectRecord,
  type TaskRecord,
  type WebsiteRecord,
} from "@/lib/types";
import { fileSize, formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { SampleBadge } from "@/components/agency/views/clients/sample-badge";
import { ClientFormDialog } from "@/components/agency/views/clients/client-form-dialog";
import { LeadManagementCard } from "@/components/agency/views/clients/lead-management-card";
import { ContactsCard } from "@/components/agency/views/clients/contacts-card";
import { ActivityTimeline } from "@/components/agency/views/dashboard/activity-timeline";
import { EntityBillingTab } from "@/components/agency/views/billing/entity-billing-tab";

interface ClientDetailPayload {
  client: ClientRecord;
  contacts: ContactRecord[];
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-primary",
  LOW: "bg-muted-foreground/40",
};

function TabLabel({ text, count }: { text: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {typeof count === "number" ? (
        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </span>
  );
}

function DetailRow({ label: rowLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {rowLabel}
      </dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading client">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function TabError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/60 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">Could not load this tab</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function GenericRow({
  onClick,
  icon,
  title,
  subtitle,
  right,
  sample,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  sample?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="record-row -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {sample ? <SampleBadge /> : null}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {right}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
      {children}
    </span>
  );
}

export function ClientDetail() {
  const id = useAppStore((s) => s.params.id);
  const back = useAppStore((s) => s.back);
  const navigate = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["client", id],
    queryFn: () => apiFetch<ClientDetailPayload>(`/api/clients/${id}`),
    enabled: !!id,
  });

  // Side lists — hoisted (small page sizes) so tab count badges are honest.
  const websitesQuery = useQuery({
    queryKey: ["websites", { clientId: id }],
    queryFn: () =>
      apiFetch<Paginated<WebsiteRecord>>(
        `/api/websites${buildQuery({ clientId: id, pageSize: 50, sort: "createdAt", dir: "desc" })}`,
      ),
    enabled: !!id,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", { clientId: id }],
    queryFn: () =>
      apiFetch<Paginated<ProjectRecord>>(
        `/api/projects${buildQuery({ clientId: id, pageSize: 50, sort: "createdAt", dir: "desc" })}`,
      ),
    enabled: !!id,
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", { clientId: id }],
    queryFn: () =>
      apiFetch<Paginated<TaskRecord>>(
        `/api/tasks${buildQuery({ clientId: id, pageSize: 10, sort: "createdAt", dir: "desc" })}`,
      ),
    enabled: !!id,
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", { clientId: id }],
    queryFn: () =>
      apiFetch<Paginated<DocumentRecord>>(
        `/api/documents${buildQuery({ clientId: id, pageSize: 10 })}`,
      ),
    enabled: !!id,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", { clientId: id }],
    queryFn: () =>
      apiFetch<Paginated<ActivityRecord>>(
        `/api/activity${buildQuery({ clientId: id, pageSize: 20 })}`,
      ),
    enabled: !!id,
  });

  if (!id) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client" onBack={back} />
        <EmptyState
          icon={Users}
          title="No client selected"
          description="Pick a client from the Clients list."
          action={
            <Button variant="outline" onClick={back}>
              Back to Clients
            </Button>
          }
        />
      </div>
    );
  }

  const detailError = detailQuery.error as (Error & { code?: string }) | null;
  if (detailQuery.isError && detailError?.code === "NOT_FOUND") {
    return (
      <div className="space-y-6">
        <PageHeader title="Client" onBack={back} />
        <EmptyState
          icon={Users}
          title="Client not found"
          description="This client may have been removed or the link is out of date."
          action={
            <Button variant="outline" onClick={back}>
              Go back
            </Button>
          }
        />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client" onBack={back} />
        <EmptyState
          icon={Users}
          title="Could not load this client"
          description="Check your connection and try again."
          action={
            <Button variant="outline" onClick={() => void detailQuery.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (detailQuery.isLoading || !detailQuery.data) {
    return <DetailSkeleton />;
  }

  const { client, contacts } = detailQuery.data;
  const archived = !!client.archivedAt;

  function invalidateClient() {
    void queryClient.invalidateQueries({ queryKey: ["client", id] });
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  }

  async function toggleArchive() {
    setArchiveBusy(true);
    try {
      if (archived) {
        await apiFetch<ClientRecord>(`/api/clients/${client.id}/restore`, { method: "POST" });
        toast.success(`Restored ${client.businessName}`);
      } else {
        await apiFetch(`/api/clients/${client.id}`, { method: "DELETE" });
        toast.success(`Archived ${client.businessName}`, {
          description: "Historical records are preserved. Restore it any time.",
        });
      }
      invalidateClient();
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong.");
    } finally {
      setArchiveBusy(false);
      setArchiveOpen(false);
    }
  }

  async function saveNotes() {
    setNotesBusy(true);
    try {
      await apiFetch<ClientRecord>(`/api/clients/${client.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft }),
      });
      toast.success("Notes updated");
      invalidateClient();
      setNotesOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Could not save the notes.");
    } finally {
      setNotesBusy(false);
    }
  }

  const tabDefs: { value: string; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "websites", label: "Websites", count: websitesQuery.data?.total },
    { value: "projects", label: "Projects", count: projectsQuery.data?.total },
    { value: "tasks", label: "Tasks", count: tasksQuery.data?.total },
    { value: "documents", label: "Documents", count: documentsQuery.data?.total },
    { value: "billing", label: "Billing" },
    { value: "activity", label: "Activity", count: activityQuery.data?.total },
  ];

  const websiteItems = websitesQuery.data?.items ?? [];
  const projectItems = projectsQuery.data?.items ?? [];
  const taskItems = tasksQuery.data?.items ?? [];
  const documentItems = documentsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.businessName}
        description={`Client since ${formatDate(client.createdAt)} · ${label(client.clientType)}`}
        onBack={back}
        actions={
          <>
            <Button onClick={() => setEditOpen(true)} disabled={archived}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {archived ? (
                  <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                    <ArchiveRestore aria-hidden />
                    Restore client
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
                    <Archive aria-hidden />
                    Archive client
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge value={client.status} />
        {client.isSample ? <SampleBadge /> : null}
      </div>

      {archived ? (
        <Alert>
          <Archive aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>This client is archived — restore to make changes.</span>
            <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
              <ArchiveRestore aria-hidden />
              Restore
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <div className="w-full overflow-x-auto pb-px scrollbar-thin">
          <TabsList className="w-max">
            {tabDefs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                <TabLabel text={tab.label} count={tab.count} />
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Overview ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
                <CardDescription>Client record</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <DetailRow label="Type">{label(client.clientType)}</DetailRow>
                  <DetailRow label="Status">
                    <StatusBadge value={client.status} />
                  </DetailRow>
                  <DetailRow label="Primary contact">
                    {client.primaryContactName ?? "—"}
                  </DetailRow>
                  <DetailRow label="Email">
                    {client.email ? (
                      <a
                        href={`mailto:${client.email}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {client.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </DetailRow>
                  <DetailRow label="Phone">
                    {client.phone ? (
                      <a
                        href={`tel:${client.phone}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {client.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </DetailRow>
                  <DetailRow label="Billing address">{client.billingAddress ?? "—"}</DetailRow>
                  <DetailRow label="Country">{client.country}</DetailRow>
                  <DetailRow label="Currency">{client.currency}</DetailRow>
                  <DetailRow label="Timezone">{client.timezone}</DetailRow>
                  <DetailRow label="Created">{formatDate(client.createdAt)}</DetailRow>
                  <DetailRow label="Updated">{formatDateTime(client.updatedAt)}</DetailRow>
                </dl>
              </CardContent>
            </Card>

            <ContactsCard clientId={client.id} contacts={contacts} />
          </div>

          <LeadManagementCard client={client} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
              <CardDescription>Internal notes — never shown to the client</CardDescription>
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archived}
                  onClick={() => {
                    setNotesDraft(client.notes ?? "");
                    setNotesOpen(true);
                  }}
                >
                  <Pencil aria-hidden />
                  Edit notes
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {client.notes ? (
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No internal notes.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Websites ─────────────────────────────────────────────── */}
        <TabsContent value="websites" className="mt-4">
          <Card>
            <CardContent>
              {websitesQuery.isLoading ? (
                <RowsSkeleton />
              ) : websitesQuery.isError ? (
                <TabError onRetry={() => void websitesQuery.refetch()} />
              ) : websiteItems.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No websites yet"
                  description="Add the client's first website to start tracking its lifecycle."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => navigate("websites", { create: "1", clientId: id })}
                    >
                      New website
                    </Button>
                  }
                  className="border-border/60"
                />
              ) : (
                <div className="space-y-1">
                  {websiteItems.map((website) => (
                    <GenericRow
                      key={website.id}
                      onClick={() => openWebsite(website.id)}
                      icon={
                        <IconChip>
                          <Globe aria-hidden className="size-4" />
                        </IconChip>
                      }
                      title={website.name}
                      subtitle={website.primaryDomain ?? "No domain set"}
                      sample={website.isSample}
                      right={
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          <StatusBadge value={website.lifecycleStatus} />
                          <span className="w-28 text-right text-xs whitespace-nowrap text-muted-foreground">
                            Maintenance: {label(website.maintenanceCoverage)}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Projects ─────────────────────────────────────────────── */}
        <TabsContent value="projects" className="mt-4">
          <Card>
            <CardContent>
              {projectsQuery.isLoading ? (
                <RowsSkeleton />
              ) : projectsQuery.isError ? (
                <TabError onRetry={() => void projectsQuery.refetch()} />
              ) : projectItems.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create a project to plan work for this client."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => navigate("projects", { create: "1", clientId: id })}
                    >
                      New project
                    </Button>
                  }
                  className="border-border/60"
                />
              ) : (
                <div className="space-y-1">
                  {projectItems.map((project) => (
                    <GenericRow
                      key={project.id}
                      onClick={() => openProject(project.id)}
                      icon={
                        <IconChip>
                          <FolderKanban aria-hidden className="size-4" />
                        </IconChip>
                      }
                      title={project.name}
                      subtitle={label(project.projectType)}
                      sample={project.isSample}
                      right={
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          <StatusBadge value={project.status} />
                          <span className="flex items-center gap-1.5">
                            <Progress
                              value={project.progress ?? 0}
                              className="h-1.5 w-16"
                              aria-label={`${project.progress ?? 0}% complete`}
                            />
                            <span className="w-9 text-xs tabular-nums text-muted-foreground">
                              {project.progress ?? 0}%
                            </span>
                          </span>
                          <span className="w-24 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                            {project.dueDate ? formatDate(project.dueDate) : "No due date"}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tasks ────────────────────────────────────────────────── */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent>
              {tasksQuery.isLoading ? (
                <RowsSkeleton />
              ) : tasksQuery.isError ? (
                <TabError onRetry={() => void tasksQuery.refetch()} />
              ) : taskItems.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="No tasks yet"
                  description="Create the first task for this client."
                  action={
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate("tasks", {
                          create: "1",
                          clientId: id,
                          clientName: client.businessName,
                        })
                      }
                    >
                      New task
                    </Button>
                  }
                  className="border-border/60"
                />
              ) : (
                <div className="space-y-1">
                  {taskItems.map((task) => (
                    <GenericRow
                      key={task.id}
                      onClick={() => navigate("tasks")}
                      icon={
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${
                            PRIORITY_DOT[task.priority] ?? "bg-muted-foreground/40"
                          }`}
                        />
                      }
                      title={task.title}
                      sample={task.isSample}
                      right={
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          <StatusBadge value={task.status} />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {label(task.priority)}
                          </span>
                          <span
                            className={`w-24 text-right text-xs tabular-nums ${
                              task.isOverdue
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {task.dueAt ? formatDate(task.dueAt) : "No due date"}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Documents ────────────────────────────────────────────── */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent>
              {documentsQuery.isLoading ? (
                <RowsSkeleton />
              ) : documentsQuery.isError ? (
                <TabError onRetry={() => void documentsQuery.refetch()} />
              ) : documentItems.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No documents yet"
                  description="Upload files from the Documents module and link them to this client."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => navigate("documents", { clientId: id })}
                    >
                      Open Documents
                    </Button>
                  }
                  className="border-border/60"
                />
              ) : (
                <div className="space-y-1">
                  {documentItems.map((doc) => (
                    <GenericRow
                      key={doc.id}
                      onClick={() => navigate("documents", { clientId: id })}
                      icon={
                        <IconChip>
                          <FileText aria-hidden className="size-4" />
                        </IconChip>
                      }
                      title={doc.fileName}
                      subtitle={`Uploaded ${timeAgo(doc.createdAt)}`}
                      right={
                        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                          {fileSize(doc.sizeBytes)}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Billing — real figures (Phase 3) ───────────────────── */}
        <TabsContent value="billing" className="mt-4">
          <EntityBillingTab clientId={id} />
        </TabsContent>

        {/* ── Activity ─────────────────────────────────────────────── */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent>
              <ActivityTimeline
                items={activityQuery.data?.items ?? []}
                loading={activityQuery.isLoading}
                emptyTitle="No activity for this client yet"
                emptyDescription="Actions involving this client will appear here."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editOpen ? (
        <ClientFormDialog
          key={`edit-${client.id}`}
          open
          onOpenChange={setEditOpen}
          client={client}
        />
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={archived ? `Restore ${client.businessName}?` : `Archive ${client.businessName}?`}
        description={
          archived
            ? "The client will appear in the active Clients list again."
            : "Historical records are preserved. The client leaves the active list but can be restored at any time."
        }
        confirmLabel={archived ? "Restore" : "Archive"}
        destructive={!archived}
        loading={archiveBusy}
        onConfirm={() => void toggleArchive()}
      />

      {/* Quick notes editor — notes are also editable in the main Edit dialog */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Internal notes</DialogTitle>
            <DialogDescription>Notes are only visible to your team.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={6}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="No internal notes."
            aria-label="Internal notes"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)} disabled={notesBusy}>
              Cancel
            </Button>
            <Button onClick={() => void saveNotes()} disabled={notesBusy}>
              {notesBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
