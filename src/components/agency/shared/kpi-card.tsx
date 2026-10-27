"use client";

/**
 * AgencyOS — KPI summary card for the dashboard.
 * When `unavailable` is set (module not implemented) it renders an honest
 * muted state with a "Not yet configured" micro-badge instead of a value.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiTone = "default" | "success" | "warning" | "danger";

const VALUE_TONES: Record<KpiTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export function KpiCard({
  title,
  value,
  icon: Icon,
  hint,
  onClick,
  tone = "default",
  unavailable,
  className,
}: {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: string;
  onClick?: () => void;
  tone?: KpiTone;
  /** Set when the module behind this KPI is not implemented yet. */
  unavailable?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
      </div>
      {unavailable ? (
        <div className="mt-2 space-y-1.5">
          <span className="block text-2xl font-semibold tabular-nums text-muted-foreground/50">
            —
          </span>
          {unavailable ? <p className="text-xs text-muted-foreground">{unavailable}</p> : null}
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Not yet configured
          </span>
        </div>
      ) : (
        <div className="mt-2">
          <span className={cn("block text-2xl font-semibold tabular-nums", VALUE_TONES[tone])}>
            {value}
          </span>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-lg border bg-card p-4 text-left shadow-xs transition-shadow outline-none hover:ring-2 hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn("rounded-lg border bg-card p-4 shadow-xs", className)}>{body}</div>;
}
