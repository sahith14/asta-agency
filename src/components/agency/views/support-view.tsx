"use client";

/**
 * AgencyOS — Support view dispatcher (task 3-b).
 * "support" → ticket list; "ticket-detail" (params.id) → TicketDetail.
 * Both read their state from the store (views receive no props).
 */
import { useAppStore } from "@/components/agency/store";
import { TicketList } from "@/components/agency/views/support/ticket-list";
import TicketDetail from "@/components/agency/views/support/ticket-detail";

export default function SupportView() {
  const view = useAppStore((s) => s.view);
  const id = useAppStore((s) => s.params.id);

  if (view === "ticket-detail" && id) {
    return <TicketDetail />;
  }
  return <TicketList />;
}
