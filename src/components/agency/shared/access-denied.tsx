"use client";

/**
 * AgencyOS — "no access" card for client-side role gates (Phase 5).
 * Rendered by module views when the signed-in role cannot read the module.
 * Honest: the server enforces the same rule; this only avoids rendering an
 * empty shell after a deep link.
 */
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { label } from "@/lib/types";
import { useAppStore } from "@/components/agency/store";

export function AccessDenied({ module }: { module: string }) {
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <ShieldAlert aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">You don&rsquo;t have access to this area</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {module ? `The ${module} module is not part of your role. ` : ""}
          Your role: <span className="font-medium text-foreground">{label(user?.role)}</span>.
          Ask the agency founder if you believe this is a mistake.
        </p>
      </div>
      <Button onClick={() => navigate("dashboard")}>Go to overview</Button>
    </div>
  );
}
