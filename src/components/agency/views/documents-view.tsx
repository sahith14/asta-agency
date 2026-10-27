"use client";

/**
 * AgencyOS — Documents view (task 4-c).
 * Multipart uploads, link-filter chips (seeded from deep-link params), fetch
 * blob download (surfaces the server's honest 404 when a blob is missing),
 * note/link editing and soft-delete confirmation.
 */
import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Download,
  FileArchive,
  FileImage,
  FileText,
  Files,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openClient, openProject, openWebsite, useAppStore } from "@/components/agency/store";
import { apiFetch, type DocumentRecord, type Paginated } from "@/lib/types";
import { fileSize, timeAgo } from "@/lib/format";
import { useClientsLookup, useDebouncedValue, useRefName } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { UploadDialog } from "@/components/agency/views/documents/upload-dialog";
import { DocumentEditDialog } from "@/components/agency/views/documents/edit-dialog";

const PAGE_SIZE = 25;

interface DocumentFilters {
  clientId: string;
  websiteId: string;
  projectId: string;
}

export default function DocumentsView() {
  const queryClient = useQueryClient();
  const params = useAppStore((s) => s.params);

  // Seed link filters from deep-link params ONCE (lazy initializer).
  const [filters, setFilters] = useState<DocumentFilters>(() => ({
    clientId: params.clientId ?? "",
    websiteId: params.websiteId ?? "",
    projectId: params.projectId ?? "",
  }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const setFilter = (patch: Partial<DocumentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  // --- queries -----------------------------------------------------------------

  const listQueryKey = useMemo(
    () => ["documents", { page, search: debouncedSearch, ...filters }] as const,
    [page, debouncedSearch, filters],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<DocumentRecord>>(
        `/api/documents${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          clientId: filters.clientId || undefined,
          websiteId: filters.websiteId || undefined,
          projectId: filters.projectId || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Stable total for the header description ("{total} files"), independent of filters.
  const metaQuery = useQuery({
    queryKey: ["documents", "meta"],
    queryFn: () => apiFetch<Paginated<DocumentRecord>>(`/api/documents${buildQuery({ pageSize: 5 })}`),
    staleTime: 30_000,
  });

  const clients = useClientsLookup();

  // --- mutations -----------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete the document."),
  });

  async function handleDownload(doc: DocumentRecord) {
    setDownloadingId(doc.id);
    try {
      // fetch-blob (not anchor navigation) so a missing blob surfaces the
      // server's 404 message as a toast instead of a broken JSON page.
      const res = await fetch(`/api/documents/${doc.id}/download`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(json?.error?.message || "Download failed — the file may be missing from storage.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = doc.fileName;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      toast.error("Download failed. Check your connection and try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  // --- derived ---------------------------------------------------------------------

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters = !!debouncedSearch || !!filters.clientId || !!filters.websiteId || !!filters.projectId;

  const clientChipName = useRefName("client", filters.clientId || null, params.clientName);
  const websiteChipName = useRefName("website", filters.websiteId || null, params.websiteName);
  const projectChipName = useRefName("project", filters.projectId || null, params.projectName);

  const clearFilters = () => {
    setFilters({ clientId: "", websiteId: "", projectId: "" });
    setSearchInput("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={metaQuery.data ? `${metaQuery.data.total} files` : undefined}
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden />
            Upload
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Search file names and notes…"
              aria-label="Search documents"
              className="pl-9"
            />
          </div>
          <Select
            value={filters.clientId || "all"}
            onValueChange={(value) => setFilter({ clientId: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Client filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {(clients.data ?? []).map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Deep-link filter chips (seeded from params; dismissible) */}
        {filters.clientId || filters.websiteId || filters.projectId ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.clientId ? (
              <FilterChip
                text={`Client: ${clientChipName ?? "loading…"}`}
                onRemove={() => setFilter({ clientId: "" })}
              />
            ) : null}
            {filters.websiteId ? (
              <FilterChip
                text={`Website: ${websiteChipName ?? "loading…"}`}
                onRemove={() => setFilter({ websiteId: "" })}
              />
            ) : null}
            {filters.projectId ? (
              <FilterChip
                text={`Project: ${projectChipName ?? "loading…"}`}
                onRemove={() => setFilter({ projectId: "" })}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : listQuery.isError ? (
        <EmptyState
          icon={SearchX}
          title="Documents could not be loaded"
          description={(listQuery.error as Error)?.message ?? "Something went wrong."}
          action={<Button variant="outline" onClick={() => listQuery.refetch()}>Try again</Button>}
        />
      ) : total === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Files}
          title="No documents yet"
          description="Upload contracts, briefs or exports and link them to clients, websites or projects."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Upload aria-hidden />
              Upload your first document
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No documents match"
          description="No documents match the current filters. Try widening them."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>File</TableHead>
                  <TableHead className="w-56">Note</TableHead>
                  <TableHead className="w-44">Linked to</TableHead>
                  <TableHead className="w-20">Size</TableHead>
                  <TableHead className="w-44">Uploaded</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-64">
                      <span className="flex items-center gap-2.5">
                        <FileIcon mime={doc.mimeType} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{doc.fileName}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {doc.note || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <LinkedToCell doc={doc} />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {fileSize(doc.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col text-xs">
                        <span className="text-foreground">{timeAgo(doc.createdAt)}</span>
                        {doc.uploadedBy?.displayName ? (
                          <span className="text-muted-foreground">by {doc.uploadedBy.displayName}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Actions for ${doc.fileName}`}
                          >
                            {downloadingId === doc.id ? (
                              <Loader2 aria-hidden className="size-4 animate-spin" />
                            ) : (
                              <MoreHorizontal aria-hidden />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void handleDownload(doc)}>
                            <Download aria-hidden />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditTarget(doc)}>
                            <Pencil aria-hidden />
                            Edit note / links
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(doc)}>
                            <Trash2 aria-hidden />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((doc) => (
              <div key={doc.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <FileIcon mime={doc.mimeType} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{doc.fileName}</span>
                      {doc.note ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {doc.note}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={`Actions for ${doc.fileName}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void handleDownload(doc)}>
                        <Download aria-hidden />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditTarget(doc)}>
                        <Pencil aria-hidden />
                        Edit note / links
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(doc)}>
                        <Trash2 aria-hidden />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{fileSize(doc.sizeBytes)}</span>
                  <span>{timeAgo(doc.createdAt)}</span>
                  {doc.uploadedBy?.displayName ? <span>by {doc.uploadedBy.displayName}</span> : null}
                </div>
                {doc.client || doc.website || doc.project ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <LinkedToCell doc={doc} />
                  </div>
                ) : null}
              </div>
            ))}
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

      {/* Dialogs */}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DocumentEditDialog document={editTarget} onOpenChange={(open) => !open && setEditTarget(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this document?"
        description={
          deleteTarget
            ? `"${deleteTarget.fileName}" will be permanently removed from storage. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete document"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function FilterChip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-64 items-center gap-1 rounded-full border bg-muted/60 py-1 pr-1 pl-2.5 text-xs font-medium">
      <span className="truncate">{text}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${text}`}
        className="rounded-full p-0.5 transition-colors hover:bg-muted"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage aria-hidden className={className} />;
  if (mime === "application/zip") return <FileArchive aria-hidden className={className} />;
  return <FileText aria-hidden className={className} />;
}

function LinkedToCell({ doc }: { doc: DocumentRecord }) {
  const links = [
    doc.client
      ? {
          key: "client",
          text: doc.client.businessName,
          onClick: () => openClient(doc.client!.id),
        }
      : null,
    doc.website
      ? {
          key: "website",
          text: doc.website.name,
          onClick: () => openWebsite(doc.website!.id),
        }
      : null,
    doc.project
      ? {
          key: "project",
          text: doc.project.name,
          onClick: () => openProject(doc.project!.id),
        }
      : null,
  ].filter(Boolean) as { key: string; text: string; onClick: () => void }[];

  if (links.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <span className="flex flex-col items-start gap-0.5">
      {links.map((link) => (
        <button
          key={link.key}
          type="button"
          onClick={link.onClick}
          className="max-w-40 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {link.text}
        </button>
      ))}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="size-4" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
