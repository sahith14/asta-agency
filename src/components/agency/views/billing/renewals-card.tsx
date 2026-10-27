"use client";

/**
 * AgencyOS — dashboard "Upcoming renewals" billing card (Phase 3).
 * Renders data.billingRenewals when the dashboard payload includes it.
 * Rows navigate to the subscription detail.
 */
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/agency/shared/empty-state";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { openSubscription } from "@/components/agency/store";
import type { BillingRenewalItem } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { intervalNoun } from "@/components/agency/views/billing/bits";

export function BillingRenewalsCard({ items }: { items: BillingRenewalItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
          Upcoming subscription renewals
        </CardTitle>
        <CardDescription>Recurring agreements that renew soon.</CardDescription>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming renewals"
            description="Active subscriptions with a renewal date will appear here."
            className="border-0 py-6"
          />
        ) : (
          items.map((item) => (
            <button
              key={item.subscriptionId}
              type="button"
              onClick={() => openSubscription(item.subscriptionId)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.clientName}</span>
                  <StatusBadge value={item.status} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.planName ?? "Custom"}
                  {item.websiteName ? ` · ${item.websiteName}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums">
                  {formatCurrency(item.amountMinor, item.currency)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {intervalNoun(item.billingInterval)}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(item.nextRenewalDate)}
                </span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
