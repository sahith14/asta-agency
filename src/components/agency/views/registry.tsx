"use client";

/**
 * AgencyOS — view registry.
 * Maps each ViewName to its view component (default export of the file).
 * Detail views reuse their module's component and read params from the store:
 * "client-detail" -> ClientsView, "website-detail" -> WebsitesView,
 * "project-detail" -> ProjectsView, "ticket-detail" -> SupportView
 * (each reads useAppStore().params.id).
 */
import type { ComponentType } from "react";
import type { ViewName } from "@/components/agency/store";
import DashboardView from "./dashboard-view";
import ClientsView from "./clients-view";
import WebsitesView from "./websites-view";
import ProjectsView from "./projects-view";
import InboxView from "./inbox-view";
import SupportView from "./support-view";
import BillingView from "./billing-view";
import TasksView from "./tasks-view";
import DocumentsView from "./documents-view";
import SettingsView from "./settings-view";
import ActivityView from "./activity-view";
import MonitoringView from "./monitoring-view";
import IncidentsView from "./incidents-view";
import MaintenanceView from "./maintenance-view";
import DeploymentsView from "./deployments-view";
import BriefsView from "./briefs-view";
import MeetingsView from "./meetings/meetings-view";

export const VIEW_COMPONENTS: Record<ViewName, ComponentType> = {
  dashboard: DashboardView,
  inbox: InboxView,
  support: SupportView,
  "ticket-detail": SupportView,
  billing: BillingView,
  "invoice-detail": BillingView,
  "quote-detail": BillingView,
  "subscription-detail": BillingView,
  clients: ClientsView,
  "client-detail": ClientsView,
  websites: WebsitesView,
  "website-detail": WebsitesView,
  projects: ProjectsView,
  "project-detail": ProjectsView,
  tasks: TasksView,
  documents: DocumentsView,
  settings: SettingsView,
  activity: ActivityView,
  monitoring: MonitoringView,
  incidents: IncidentsView,
  "incident-detail": IncidentsView,
  maintenance: MaintenanceView,
  deployments: DeploymentsView,
  // Phase 5 — pipeline
  briefs: BriefsView,
  "brief-detail": BriefsView,
  meetings: MeetingsView,
};
