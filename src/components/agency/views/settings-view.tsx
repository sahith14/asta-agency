"use client";

/**
 * AgencyOS — Settings view (task 4-c; Integrations tab added by task 3-a,
 * Billing tab added by Phase 3 task 2-b).
 * Tabs: Agency | Profile & Security | Integrations | Billing | Sample Data | About.
 */
import { PageHeader } from "@/components/agency/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgencyForm } from "@/components/agency/views/settings/agency-form";
import { ProfileSecurity } from "@/components/agency/views/settings/profile-security";
import { EmailConnectionCard } from "@/components/agency/views/settings/email-connection-card";
import { ProviderConnectionsCard } from "@/components/agency/views/settings/provider-connections-card";
import { BillingSettingsForm } from "@/components/agency/views/settings/billing-settings-form";
import { SampleDataCard } from "@/components/agency/views/settings/sample-data-card";
import { AboutCard } from "@/components/agency/views/settings/about-card";
import { TeamTab } from "@/components/agency/views/settings/team-tab";
import { useAppStore } from "@/components/agency/store";

export default function SettingsView() {
  const user = useAppStore((s) => s.user);
  const isFounder = user?.role === "OWNER";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Agency profile, defaults and security." />

      <Tabs defaultValue="agency">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="agency">Agency</TabsTrigger>
          <TabsTrigger value="profile">Profile &amp; Security</TabsTrigger>
          {isFounder ? <TabsTrigger value="team">Team</TabsTrigger> : null}
          {isFounder ? <TabsTrigger value="integrations">Integrations</TabsTrigger> : null}
          {isFounder ? <TabsTrigger value="billing">Billing</TabsTrigger> : null}
          {isFounder ? <TabsTrigger value="sample">Sample Data</TabsTrigger> : null}
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="agency" className="mt-4">
          <AgencyForm />
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <ProfileSecurity />
        </TabsContent>
        {isFounder ? (
          <TabsContent value="team" className="mt-4">
            <TeamTab />
          </TabsContent>
        ) : null}
        {isFounder ? (
          <TabsContent value="integrations" className="mt-4">
            <div className="space-y-6">
              <EmailConnectionCard />
              <ProviderConnectionsCard />
            </div>
          </TabsContent>
        ) : null}
        {isFounder ? (
          <TabsContent value="billing" className="mt-4">
            <BillingSettingsForm />
          </TabsContent>
        ) : null}
        {isFounder ? (
          <TabsContent value="sample" className="mt-4">
            <SampleDataCard />
          </TabsContent>
        ) : null}
        <TabsContent value="about" className="mt-4">
          <AboutCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
