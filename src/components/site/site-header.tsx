'use client'

/**
 * Public site header — slim cinematic bar.
 * Transparent over the 3D hero, solidifies on scroll. Always-available routes
 * (Services / Work / About / Contact), Client + Staff login, and the primary
 * "Start a project" action which opens the genuine project configurator.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogIn, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { site } from '@/lib/site-content'
import { useConfigurator } from '@/components/site/configurator/configurator-store'

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/portfolio', label: 'Work' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const openConfigurator = useConfigurator(s => s.openConfigurator)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  /* Mobile links close the menu via their own onClick handlers. */

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-colors duration-500',
          scrolled || open
            ? 'border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
            : 'border-transparent bg-transparent'
        )}
        data-testid="site-header"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 sm:px-8 lg:px-12">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label={`${site.company.name} home`}>
            {/* monolith mark */}
            <span className="relative flex h-8 w-[18px] items-stretch overflow-hidden rounded-[3px] shadow-[0_0_18px_rgba(255,176,58,0.25)]">
              <span
                className="h-full w-full"
                style={{
                  background:
                    'linear-gradient(105deg, #dedad4 0%, #6f6c67 32%, #f4f1eb 50%, #5c5955 70%, #cbc7c1 100%)',
                }}
                aria-hidden="true"
              />
              <span className="absolute inset-y-0 right-0 w-[2px] bg-electric/80" aria-hidden="true" />
            </span>
            <span className="text-[0.95rem] font-bold tracking-[0.08em]">{site.company.name}</span>
          </Link>

          <nav aria-label="Main" className="ml-auto hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'group relative py-2 text-[0.78rem] font-medium uppercase tracking-[0.16em] transition-colors',
                  isActive(pathname, l.href) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {l.label}
                <span
                  className={cn(
                    'absolute -bottom-0.5 left-0 h-px bg-electric transition-all duration-400',
                    isActive(pathname, l.href) ? 'w-full' : 'w-0 group-hover:w-full'
                  )}
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-6">
            <Link
              href="/login"
              className="hidden min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Client Login
            </Link>
            <Link
              href="/login"
              aria-label="Staff login"
              className="hidden min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => openConfigurator()}
              data-testid="header-start-project"
              className="inline-flex min-h-11 items-center rounded-full bg-electric px-5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Start a project
            </button>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5 lg:hidden"
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation — full-screen chapter menu */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-background" aria-hidden="true" />
          <nav aria-label="Mobile" className="relative flex h-full flex-col justify-center px-8">
            {[{ href: '/', label: 'Home' }, ...NAV_LINKS].map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'flex items-baseline gap-4 border-b border-border/60 py-4 text-3xl font-extrabold uppercase tracking-tight transition-colors',
                  isActive(pathname, l.href) ? 'text-electric' : 'text-foreground'
                )}
              >
                <span className="font-mono text-[0.65rem] tracking-widest text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {l.label}
              </Link>
            ))}
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <Link href="/login" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-muted-foreground">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Client Login
              </Link>
              <Link href="/login" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-muted-foreground">
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Staff Login
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
