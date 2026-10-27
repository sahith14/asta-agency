"use client";

/**
 * AgencyOS — Inbox view (task 3-a).
 * Synchronised customer emails + review queue. Tabs (All / Needs review /
 * Matched / Unrelated), debounced search, client + direction filters, a
 * responsive table/card list and the message review drawer.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Inbox, Mail, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { PageHeader } from "@/components/agency/shared/page-header";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { buildQuery } from "@/components/agency/shared/record-list-helpers";
import { openTicket, useAppStore } from "@/components/agency/store";
import { useClientsLookup, useDebouncedValue } from "@/components/agency/views/tasks/lookups";
import { ListPagination } from "@/components/agency/views/tasks/list-pagination";
import { ListSkeleton, LoadErrorState } from "@/components/agency/views/websites/list-bits";
import { EmailDrawer } from "@/components/agency/views/inbox/email-drawer";
import {
  AttachmentDot,
  DirectionIcon,
  senderName,
  ticketLabel,
} from "@/components/agency/views/inbox/list-bits";
import {
  apiFetch,
  label,
  EMAIL_DIRECTIONS,
  type EmailAccountStatusRecord,
  type EmailMessageRecord,
  type Paginated,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";

const PAGE_SIZE = 25;

type InboxTab = "all" | "review" | "matched" | "unrelated";

const TAB_PARAM: Record<InboxTab, { review?: string; matchStatus?: string }> = {
  all: {},
  review: { review: "1" },
  matched: { matchStatus: "CONFIRMED" },
  unrelated: { matchStatus: "NO_MATCH" },
};

/** Honest, small Gmail connection chip for the page header. */
function GmailStatusChip({ state }: { state: string | undefined }) {
  const navigate = useAppStore((s) => s.navigate);
  if (!state) return null;
  const openSettings = () => navigate("settings");
  if (state === "SYNCING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-primary">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />
        Syncing…
      </span>
    );
  }
  if (state === "CONNECTED") return null;

  const destructive = state === "REAUTH_REQUIRED" || state === "ERROR";
  const warning = state === "AWAITING_AUTHORISATION";
  return (
    <button
      type="button"
      onClick={openSettings}
      className={
        destructive
          ? "inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-destructive hover:bg-destructive/15"
          : warning
            ? "inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-warning-foreground hover:bg-warning/25"
            : "inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground hover:bg-muted/70"
      }
    >
      {state === "NOT_CONFIGURED" ? "Gmail not configured" : label(state)}
    </button>
  );
}

export default function InboxView() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  // Tab + filters (local state; deep-link seeding for clientId like other views).
  const [tab, setTab] = useState<InboxTab>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [clientId, setClientId] = useState(() => params.clientId ?? "");
  const [direction, setDirection] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const clients = useClientsLookup();

  const setTabAndReset = (next: InboxTab) => {
    setTab(next);
    setPage(1);
  };

  // --- queries ----------------------------------------------------------------

  const { review, matchStatus } = TAB_PARAM[tab];

  const listQueryKey = useMemo(
    () =>
      [
        "emails",
        {
          page,
          search: debouncedSearch,
          matchStatus: matchStatus ?? "",
          review: review ?? "",
          clientId,
          direction,
        },
      ] as const,
    [page, debouncedSearch, matchStatus, review, clientId, direction],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      apiFetch<Paginated<EmailMessageRecord>>(
        `/api/emails${buildQuery({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          review,
          matchStatus,
          clientId: clientId || undefined,
          direction: direction || undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Lightweight count for the header description ("{n} awaiting review").
  const reviewMetaQuery = useQuery({
    queryKey: ["emails", "meta"],
    queryFn: async () => {
      const data = await apiFetch<Paginated<EmailMessageRecord>>(
        `/api/emails${buildQuery({ review: 1, pageSize: 5 })}`,
      );
      return data.total;
    },
    staleTime: 15_000,
  });

  const gmailStatusQuery = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => apiFetch<EmailAccountStatusRecord>("/api/gmail/status"),
    staleTime: 10_000,
    // Poll only while a sync is in flight so the header chip stays honest.
    refetchInterval: (query) => (query.state.data?.state === "SYNCING" ? 5_000 : false),
  });

  // --- derived ----------------------------------------------------------------

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = listQuery.data?.pageCount ?? 1;
  const hasActiveFilters = !!debouncedSearch || !!clientId || !!direction;
  const gmailState = gmailStatusQuery.data?.state;
  const mailboxUsable = gmailState === "CONNECTED" || gmailState === "SYNCING";

  const clearFilters = () => {
    setSearchInput("");
    setClientId("");
    setDirection("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={
          reviewMetaQuery.data !== undefined
            ? `${reviewMetaQuery.data} awaiting review`
            : "Synchronised customer emails and the review queue."
        }
        actions={<GmailStatusChip state={gmailState} />}
      />

      {/* Tab bar + filters */}
      <div className="space-y-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={tab}
          onValueChange={(value) => {
            if (value) setTabAndReset(value as InboxTab);
          }}
          className="flex-wrap gap-1.5"
          aria-label="Inbox view"
        >
          <ToggleGroupItem value="all" className="flex-none whitespace-nowrap">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="review" className="flex-none whitespace-nowrap">
            Needs review
          </ToggleGroupItem>
          <ToggleGroupItem value="matched" className="flex-none whitespace-nowrap">
            Matched
          </ToggleGroupItem>
          <ToggleGroupItem value="unrelated" className="flex-none whitespace-nowrap">
            Unrelated
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex flex-col gap-2 sm:flex-row">
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
              placeholder="Search sender, subject…"
              aria-label="Search emails"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select
              value={clientId || "all"}
              onValueChange={(value) => {
                setClientId(value === "all" ? "" : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Client filter">
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

            <Select
              value={direction || "all"}
              onValueChange={(value) => {
                setDirection(value === "all" ? "" : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-36" aria-label="Direction filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                {EMAIL_DIRECTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {label(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : listQuery.isError ? (
        <LoadErrorState
          message={(listQuery.error as Error)?.message ?? "Something went wrong."}
          onRetry={() => listQuery.refetch()}
        />
      ) : items.length === 0 ? (
        hasActiveFilters || tab === "matched" || tab === "unrelated" ? (
          <EmptyState
            icon={SearchX}
            title="No emails match the current filters."
            description="Try widening the search or clearing a filter."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : tab === "review" ? (
          <EmptyState
            icon={Mail}
            title="Nothing needs review"
            description="All synchronised emails have been matched or marked unrelated."
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No emails synchronised yet"
            description="Connect a Gmail mailbox in Settings → Integrations and run a synchronisation. New customer emails will appear here for review."
            action={
              mailboxUsable ? undefined : (
                <Button variant="outline" onClick={() => navigate("settings")}>
                  Open Gmail settings
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-52">From</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-36">Match</TableHead>
                  <TableHead className="w-44">Client / ticket</TableHead>
                  <TableHead className="w-32">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((email) => (
                  <TableRow
                    key={email.id}
                    onClick={() => setDetailId(email.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="max-w-52">
                      <div className="space-y-0.5">
                        <p className="truncate text-sm font-medium">{senderName(email)}</p>
                        <p className="truncate text-xs text-muted-foreground">{email.fromEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-start gap-2">
                        <DirectionIcon direction={email.direction} className="mt-0.5 size-4" />
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate text-sm font-medium">
                            {email.subject?.trim() || "(no subject)"}
                          </p>
                          {email.snippet ? (
                            <p className="truncate text-xs text-muted-foreground">{email.snippet}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={email.matchStatus} />
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-col items-start gap-0.5">
                        {email.client ? (
                          <span className="max-w-36 truncate text-xs text-muted-foreground">
                            {email.client.businessName}
                          </span>
                        ) : null}
                        {email.ticket ? (
                          <button
                            type="button"
                            onClick={() => openTicket(email.ticket!.id)}
                            className="max-w-36 truncate text-xs font-medium text-foreground hover:underline"
                            aria-label={`Open ticket ${ticketLabel(email.ticket.number)}`}
                          >
                            {ticketLabel(email.ticket.number)}
                          </button>
                        ) : null}
                        {!email.client && !email.ticket ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {email.hasAttachments ? <AttachmentDot /> : null}
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {email.sentAt ? timeAgo(email.sentAt) : "—"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {items.map((email) => (
              <div
                key={email.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(email.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDetailId(email.id);
                  }
                }}
                className="flex items-start gap-3 rounded-xl border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DirectionIcon direction={email.direction} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {email.subject?.trim() || "(no subject)"}
                    </p>
                    {email.hasAttachments ? <AttachmentDot /> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {senderName(email)} · {email.sentAt ? timeAgo(email.sentAt) : "—"}
                  </p>
                  {email.snippet ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{email.snippet}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge value={email.matchStatus} />
                    {email.client ? (
                      <span className="max-w-40 truncate text-xs text-muted-foreground">
                        {email.client.businessName}
                      </span>
                    ) : null}
                    {email.ticket ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTicket(email.ticket!.id);
                        }}
                        className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                        aria-label={`Open ticket ${ticketLabel(email.ticket.number)}`}
                      >
                        {ticketLabel(email.ticket.number)}
                      </button>
                    ) : null}
                  </div>
                </div>
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

      <EmailDrawer
        emailId={detailId}
        onClose={() => setDetailId(null)}
        onCloseAfterMatch={() => {
          // Resolve the review queue item: close the drawer when the list was
          // showing the review queue so the operator sees the updated queue.
          if (tab === "review") setDetailId(null);
        }}
      />
    </div>
  );
}
