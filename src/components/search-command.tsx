'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchItem = { id: string; title: string; subtitle: string | null; href: string }
type SearchGroup = { type: string; label: string; items: SearchItem[] }

/** Top-bar global search (Stage 2). Results honour the signed-in role — the
 * API enforces the same visibility as each source module. */
export function SearchCommand({ variant = 'app' }: { variant?: 'app' | 'portal' }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<SearchGroup[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setGroups(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const mySeq = ++seq.current
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        const data = await res.json()
        if (seq.current !== mySeq) return
        setGroups(res.ok ? (data.groups as SearchGroup[]) : [])
        setOpen(true)
      } catch {
        if (seq.current === mySeq) setGroups([])
      } finally {
        if (seq.current === mySeq) setLoading(false)
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function go(href: string) {
    setOpen(false)
    setQ('')
    setGroups(null)
    router.push(href)
  }

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => groups && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={variant === 'portal' ? 'Search my records…' : 'Search clients, projects, tickets…'}
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          autoComplete="off"
          className={cn(
            'h-10 rounded-lg border bg-background pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30',
            'w-36 focus:w-52 sm:w-44 sm:focus:w-64 md:w-56 md:focus:w-80'
          )}
        />
        {loading ? <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>

      {open && groups !== null ? (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          {total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results for “{q.trim()}”.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {groups.map((g) => (
                <div key={g.type} className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  {g.items.map((item) => (
                    <button
                      key={`${g.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => go(item.href)}
                      className="block w-full rounded-lg px-2 py-2 text-left hover:bg-accent transition-colors"
                    >
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      {item.subtitle ? <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p> : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
