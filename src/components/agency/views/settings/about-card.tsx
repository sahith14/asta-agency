"use client";

/**
 * AgencyOS — Settings › About tab (task 4-c).
 * Honest scope statement: what is implemented in Phase 1, what is planned,
 * and the environment substitution (SQLite for PostgreSQL).
 */
import { BadgeCheck, CircleDashed, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const IMPLEMENTED = [
  "Clients",
  "Websites",
  "Projects",
  "Tasks",
  "Documents",
  "Activity log",
  "Global search",
  "Sample data",
] as const;

const PLANNED = [
  "Support tickets",
  "Gmail inbox",
  "Billing",
  "Monitoring",
  "AI",
  "Staff & portal",
] as const;

export function AboutCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AgencyOS</CardTitle>
        <CardDescription>Phase 1 — Core Operations MVP</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Implemented</p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {IMPLEMENTED.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <BadgeCheck aria-hidden className="size-4 shrink-0 text-success" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Planned for later phases</p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {PLANNED.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleDashed aria-hidden className="size-4 shrink-0" />
                {feature}
                <span className="rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide uppercase">
                  Planned
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Tech stack:</span> Next.js · TypeScript ·
          Prisma · SQLite
        </p>

        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <p>
            PostgreSQL is unavailable in this environment; SQLite is the durable local substitute.
            Money is stored as integer minor units (pence) — never floating point.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
