'use client'

/**
 * Public site header — slim cinematic bar.
 * Transparent over the dark 3D hero (light text via `onDark`), resolves into
 * an ivory paper bar on scroll or on light pages. Always-available routes
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

  /* Over the dark opening hero (homepage, top of page) the bar stays
     transparent and the chrome flips to ivory for contrast. */
  const onDark = pathname === '/' && !scrolled && !open

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-500',
          /* on the homepage the opening hero slides under the transparent bar */
          pathname === '/' && '-mb-16',
          scrolled || open
            ? 'border-border/80 bg-background/90 shadow-[0_1px_24px_rgba(38,26,22,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75'
            : 'border-transparent bg-transparent'
        )}
        data-testid="site-header"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 sm:px-8 lg:px-12">
          <Link
            href="/"
            className={cn(
              'group flex shrink-0 items-center gap-2.5 transition-colors',
              onDark ? 'text-ivory' : 'text-foreground'
            )}
            aria-label={`${site.company.name} home`}
          >
            {/* monolith mark */}
            <span className="relative flex h-8 w-[18px] items-stretch overflow-hidden rounded-[3px] shadow-[0_0_18px_rgba(178,58,52,0.3)]">
              <span
                className="h-full w-full"
                style={{
                  background:
                    'linear-gradient(105deg, #dedad4 0%, #6f6c67 32%, #f4f1eb 50%, #5c5955 70%, #cbc7c1 100%)',
                }}
                aria-hidden="true"
              />
              <span className="absolute inset-y-0 right-0 w-[2px] bg-electric/90" aria-hidden="true" />
            </span>
            <span className="text-[0.95rem] font-bold tracking-[0.08em]">{site.company.name}</span>
          </Link>

          <nav aria-label="Main" className={cn('ml-auto hidden items-center gap-7 lg:flex', onDark && 'text-ivory')}>
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'group relative py-2 text-[0.78rem] font-medium uppercase tracking-[0.16em] transition-colors',
                  onDark
                    ? isActive(pathname, l.href)
                      ? 'text-white'
                      : 'text-white/65 hover:text-white'
                    : isActive(pathname, l.href)
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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
              className={cn(
                'hidden min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.72rem] font-medium uppercase tracking-[0.14em] transition-colors sm:inline-flex',
                onDark ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Client Login
            </Link>
            <Link
              href="/login"
              aria-label="Staff login"
              className={cn(
                'hidden min-h-11 min-w-11 items-center justify-center rounded-full transition-colors lg:inline-flex',
                onDark ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => openConfigurator()}
              data-testid="header-start-project"
              className="slab inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-electric px-5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]"
            >
              Start a project
            </button>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors lg:hidden',
                onDark ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-foreground/5'
              )}
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation — full-screen chapter menu */}
      {open && (
        <div className="fixed inset-0 z-40 bg-background text-foreground lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          {/* subtle warm wash behind the menu links */}
          <div aria-hidden="true" className="ambient-taupe absolute inset-0 opacity-70" />
          <nav aria-label="Mobile" className="relative flex h-full flex-col justify-center px-8">
            {[{ href: '/', label: 'Home' }, ...NAV_LINKS].map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                className={cn(
                  'flex items-baseline gap-4 border-b border-border/70 py-4 text-3xl font-extrabold uppercase tracking-tight transition-colors',
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
