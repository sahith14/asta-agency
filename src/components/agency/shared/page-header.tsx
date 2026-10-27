"use client";

/**
 * AgencyOS — standard page header: title + optional description, optional
 * back button (detail views) and right-aligned actions slot.
 */
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  onBack,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {onBack ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Go back"
            className="mt-0.5 size-8 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
