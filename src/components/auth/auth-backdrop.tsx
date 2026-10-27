import { cn } from '@/lib/utils'

/**
 * Decorative brand backdrop for the standalone auth pages (login, request
 * access, password flows). Pure presentation — no text, no interaction.
 * Must be rendered inside a `.site-scope` wrapper so the Gallery & Oxblood
 * tokens (champagne / blush / electric hairlines, grain) are available.
 */
export function AuthBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Soft ambient light — champagne top-right, blush bottom-left */}
      <div className="ambient-ivory absolute inset-0" />
      <div className="absolute -top-48 right-[-12%] h-[36rem] w-[36rem] rounded-full bg-champagne/25 blur-3xl" />
      <div className="absolute bottom-[-14rem] left-[-12rem] h-[32rem] w-[32rem] rounded-full bg-blush/30 blur-3xl" />

      {/* Layered hairline geometry — echoes the gallery plate motif */}
      <div className="absolute -right-44 top-16 h-[30rem] w-[30rem] rounded-full border border-border/70" />
      <div className="absolute -right-28 top-32 h-[30rem] w-[30rem] rounded-full border border-border/45" />
      <div className="absolute -left-56 bottom-[-7rem] h-[28rem] w-[28rem] rounded-full border border-border/60" />
      <div className="absolute left-[14%] top-[58%] hidden h-24 w-24 rounded-full border border-electric/20 lg:block" />

      {/* Studio registration marks */}
      <div className="absolute left-8 top-8 h-1.5 w-1.5 rounded-full bg-electric/70" />
      <div className="absolute left-12 top-8 h-1.5 w-1.5 rounded-full bg-champagne" />
      <div className="absolute right-8 bottom-8 h-px w-16 bg-electric/40" />

      {/* Paper grain */}
      <div className="grain absolute inset-0" />
    </div>
  )
}
