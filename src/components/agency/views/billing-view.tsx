"use client";

/**
 * AgencyOS — Billing view dispatcher (Phase 3, task 2-b).
 *
 * "billing"              → tabbed home (overview | invoices | quotes |
 *                          subscriptions | payments | plans)
 * "invoice-detail"       → <InvoiceDetail />   (params.id)
 * "quote-detail"         → <QuoteDetail />     (params.id)
 * "subscription-detail"  → <SubscriptionDetail /> (params.id)
 *
 * Tab changes update the store params via navigate("billing", {tab}) — deep
 * links from dashboard KPIs and entity billing tabs land on the right tab
 * with their filter params seeded.
 */
import { useAppStore } from "@/components/agency/store";
import { PageHeader } from "@/components/agency/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/agency/views/billing/overview-tab";
import { InvoiceList } from "@/components/agency/views/billing/invoice-list";
import { QuoteList } from "@/components/agency/views/billing/quote-list";
import { SubscriptionList } from "@/components/agency/views/billing/subscription-list";
import { PaymentList } from "@/components/agency/views/billing/payment-list";
import { PlanList } from "@/components/agency/views/billing/plan-list";
import InvoiceDetail from "@/components/agency/views/billing/invoice-detail";
import QuoteDetail from "@/components/agency/views/billing/quote-detail";
import SubscriptionDetail from "@/components/agency/views/billing/subscription-detail";

const BILLING_TABS = ["overview", "invoices", "quotes", "subscriptions", "payments", "plans"] as const;

export default function BillingView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);

  if (view === "invoice-detail" && id) return <InvoiceDetail />;
  if (view === "quote-detail" && id) return <QuoteDetail />;
  if (view === "subscription-detail" && id) return <SubscriptionDetail />;

  return <BillingHome />;
}

function BillingHome() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const tab = (BILLING_TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as (typeof BILLING_TABS)[number])
    : "overview";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Quotes, invoices, payments, subscriptions and service plans."
      />

      <Tabs
        value={tab}
        onValueChange={(next) => navigate("billing", { tab: next })}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoiceList />
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">
          <QuoteList />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionList />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentList />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <PlanList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
