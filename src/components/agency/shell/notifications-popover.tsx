"use client";

/**
 * AgencyOS — topbar notifications popover (Phase 5 v2).
 *
 * Two tabs:
 *  - "Notifications": real in-app notifications (GET /api/notifications).
 *    Clicking marks the notification read and routes to its record.
 *    "Mark all read" is one tap. The dot shows unreadCount > 0.
 *  - "Priority queue": the founder/ops dashboard priority queue (unchanged
 *    behaviour from Phase 3/4, shared queryKey with the dashboard).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiFetch, type DashboardData, type NotificationRecord } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import {
  navigate,
  openBrief,
  openClient,
  openIncident,
  openMeetings,
  openProject,
  openWebsite,
  useAppStore,
} from "@/components/agency/store";

type PriorityQueueItem = DashboardData["priorityQueue"][number];

const SEVERITY_DOT: Record<PriorityQueueItem["severity"], string> = {
  CRITICAL: "bg-destructive",
  HIGH: "bg-warning",
  NORMAL: "bg-muted-foreground/40",
};

function routeToNotification(n: NotificationRecord): void {
  switch (n.entityType) {
    case "CLIENT":
      if (n.entityId) openClient(n.entityId);
      else navigate("clients");
      break;
    case "PROJECT":
      if (n.entityId) openProject(n.entityId);
      else navigate("projects");
      break;
    case "WEBSITE":
      if (n.entityId) openWebsite(n.entityId);
      else navigate("websites");
      break;
    case "TASK":
      navigate("tasks", n.entityId ? { taskId: n.entityId } : {});
      break;
    case "BRIEF":
      if (n.entityId) openBrief(n.entityId);
      else navigate("briefs");
      break;
    case "MEETING":
      openMeetings();
      break;
    case "TICKET":
      navigate("support", n.entityId ? { id: n.entityId } : {});
      break;
    case "INVOICE":
    case "PAYMENT":
    case "SUBSCRIPTION":
      navigate("billing", { tab: n.entityType === "SUBSCRIPTION" ? "subscriptions" : "payments" });
      break;
    case "MAINTENANCE_RUN":
    case "MAINTENANCE_SCHEDULE":
      navigate("maintenance", { tab: "runs" });
      break;
    case "INCIDENT":
      if (n.entityId) openIncident(n.entityId);
      else navigate("incidents");
      break;
    case "USER":
      navigate("settings");
      break;
    default:
      break;
  }
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const navigateStore = useAppStore((s) => s.navigate);
  const queryClient = useQueryClient();

  // In-app notifications (own records only — server scopes by session user).
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiFetch<{ items: NotificationRecord[]; unreadCount: number }>("/api/notifications"),
    staleTime: 30_000,
  });

  // Priority queue — shared cache with the dashboard view.
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
    staleTime: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Could not mark the notification read."),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/notifications/read-all", { method: "POST" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Could not mark all as read."),
  });

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const queueItems = (dashboardQuery.data?.priorityQueue ?? []).slice(0, 5);
  const hasDot = unreadCount > 0 || queueItems.length > 0;

  function routeToQueueItem(item: PriorityQueueItem) {
    switch (item.kind) {
      case "TASK_OVERDUE":
      case "TASK_TODAY":
        navigate("tasks");
        break;
      case "PROJECT_DUE":
      case "MILESTONE_DUE":
        openProject(item.entityId);
        break;
      case "DOMAIN_RENEWAL":
      case "SSL_EXPIRY":
        openWebsite(item.entityId);
        break;
    }
    setOpen(false);
  }

  const items = notificationsQuery.data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          className="relative size-11 lg:size-9"
        >
          <Bell className="size-4 lg:size-4" />
          {hasDot ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Tabs defaultValue="notifications">
          <div className="flex items-center justify-between px-3 pt-3">
            <TabsList className="h-8">
              <TabsTrigger value="notifications" className="h-6 px-2.5 text-xs">
                Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </TabsTrigger>
              <TabsTrigger value="queue" className="h-6 px-2.5 text-xs">
                Priority queue
              </TabsTrigger>
            </TabsList>
            {unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck aria-hidden className="size-3.5" />
                All read
              </Button>
            ) : null}
          </div>
          <Separator className="mt-2" />

          <TabsContent value="notifications" className="mt-0">
            {notificationsQuery.isLoading ? (
              <div className="space-y-3 px-4 py-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : notificationsQuery.isError ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Could not load notifications.
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                You&rsquo;re all caught up.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      routeToNotification(n);
                      setOpen(false);
                    }}
                    className="record-row flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.readAt ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-sm",
                          n.readAt ? "font-normal text-muted-foreground" : "font-medium",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                      ) : null}
                      <span className="block text-[10px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queue" className="mt-0">
            {dashboardQuery.isLoading ? (
              <div className="space-y-3 px-4 py-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : queueItems.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing needs attention right now.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
                {queueItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => routeToQueueItem(item)}
                    className="record-row flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        SEVERITY_DOT[item.severity],
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Separator />
        <div className="p-1.5">
          <Button
            variant="ghost"
            className="w-full justify-center text-sm font-normal"
            onClick={() => {
              setOpen(false);
              navigateStore("dashboard");
            }}
          >
            View dashboard
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
