/**
 * AgencyOS — tiny "SAMPLE" mini-badge for clearly-labelled demo records.
 */
import { cn } from "@/lib/utils";

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-border bg-muted px-1 py-px text-[9px] font-semibold tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      Sample
    </span>
  );
}
