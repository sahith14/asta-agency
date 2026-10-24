'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { api, setStoredToken, ROLE_LABELS } from '@/lib/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard, Users, UserCircle, Briefcase, Clapperboard, Package, Film, CalendarDays,
  ListChecks, Wallet, BarChart3, Bell, Settings, Search, Menu, LogOut, KeyRound, ScrollText,
  Wrench, Mail, MonitorSmartphone, Loader2,
} from 'lucide-react'

export interface Me {
  userId?: string
  name: string
  email: string
  role: string
  userType: string
  clientId: string | null
  mustChangePassword: boolean
}

type SearchResult = { type: string; id: string; title: string; subtitle: string; href: string }

const NAV: Array<{ section: string; items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: string[] }> }> = [
  {
    section: 'General',
    items: [
      { href: '/app', label: 'Overview', icon: LayoutDashboard, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/clients', label: 'Clients', icon: Users, roles: ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'] },
      { href: '/app/contacts', label: 'Contacts', icon: UserCircle, roles: ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'] },
      { href: '/app/team', label: 'Team', icon: Briefcase, roles: ['OWNER', 'CLIENT_MANAGER'] },
      { href: '/app/calendar', label: 'Calendar', icon: CalendarDays, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/tasks', label: 'Tasks', icon: ListChecks, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
    ],
  },
  {
    section: 'Website Agency',
    items: [
      { href: '/app/projects', label: 'Website Projects', icon: MonitorSmartphone, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE'] },
    ],
  },
  {
    section: 'Video Production',
    items: [
      { href: '/app/video', label: 'Video Dashboard', icon: Clapperboard, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/projects', label: 'Video Projects', icon: Film, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/packages', label: 'Packages', icon: Package, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/deliverables', label: 'Deliverables', icon: Film, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/shoots', label: 'Shoot Calendar', icon: CalendarDays, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/editing-queue', label: 'Editing Queue', icon: ListChecks, roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/video/equipment', label: 'Equipment', icon: Wrench, roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEOGRAPHER'] },
      { href: '/app/video/media', label: 'Media Library', icon: Film, roles: ['OWNER', 'CLIENT_MANAGER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR', 'VIDEOGRAPHER'] },
    ],
  },
  {
    section: 'Business',
    items: [
      { href: '/app/finance', label: 'Finance', icon: Wallet, roles: ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE'] },
      { href: '/app/reports', label: 'Reports', icon: BarChart3, roles: ['OWNER', 'CLIENT_MANAGER', 'SUPPORT_FINANCE', 'CREATIVE_DIRECTOR'] },
      { href: '/app/notifications', label: 'Notifications', icon: Bell, roles: ['OWNER', 'CLIENT_MANAGER', 'WEB_DEVELOPER', 'SUPPORT_FINANCE', 'VIDEOGRAPHER', 'VIDEO_EDITOR', 'CREATIVE_DIRECTOR'] },
      { href: '/app/audit', label: 'Audit Log', icon: ScrollText, roles: ['OWNER', 'CLIENT_MANAGER'] },
      { href: '/app/settings', label: 'Settings', icon: Settings, roles: ['OWNER'] },
    ],
  },
]


function NavLinks({ sections, pathname, onNavigate }: {
  sections: Array<{ section: string; items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }> }>
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4 px-3 py-4">
      {sections.map(({ section, items }) => (
        <div key={section}>
          <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</p>
          <div className="flex flex-col gap-0.5">
            {items.map(item => {
              const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api<{ user: Me }>('/api/auth/me')
      .then(d => setMe(d.user))
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])
  return { me, loading }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe()
  const router = useRouter()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!me) return
    api<{ unreadCount: number }>('/api/notifications?unread=true').then(d => setUnread(d.unreadCount)).catch(() => {})
  }, [me, pathname])

  useEffect(() => {
    const q = search.trim()
    const t = setTimeout(() => {
      if (q.length < 2) { setResults([]); return }
      api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(d => setResults(d.results)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setStoredToken(null)
    router.push('/login')
  }, [router])

  // Redirect unauthenticated visitors in an effect — never during render.
  // Client-portal accounts belong in the portal; staff with a temporary
  // password must change it before using the app.
  useEffect(() => {
    if (loading) return
    if (!me) router.replace('/login')
    else if (me.userType === 'CLIENT_USER') router.replace('/portal')
    else if (me.mustChangePassword && pathname !== '/app/account') router.replace('/app/account')
  }, [loading, me, router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!me) {
    // Redirect handled by the effect above; show spinner until navigation completes
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const visibleNav = NAV.map(section => ({
    ...section,
    items: section.items.filter(i => i.roles.includes(me.role)),
  })).filter(s => s.items.length > 0)



  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center border-b px-4">
                <Link href="/app" className="font-semibold" onClick={() => setMobileOpen(false)}>AgencyOS</Link>
              </div>
              <ScrollArea className="h-[calc(100vh-3.5rem)]">
                <NavLinks sections={visibleNav} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Link href="/app" className="font-semibold text-base hidden lg:block">AgencyOS <span className="text-muted-foreground font-normal text-sm">— {ROLE_LABELS[me.role] ?? me.role}</span></Link>

          <div className="relative flex-1 max-w-md ml-auto lg:ml-6">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, projects, deliverables…"
              className="pl-8 h-9"
              aria-label="Global search"
            />
            {results.length > 0 && (
              <div className="absolute top-11 w-full rounded-md border bg-popover shadow-md z-50 max-h-80 overflow-y-auto">
                {results.map(r => (
                  <Link key={`${r.type}-${r.id}`} href={r.href} onClick={() => { setSearch(''); setResults([]) }}
                    className="block px-3 py-2 hover:bg-muted border-b last:border-0">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-2">{r.type}</span>
                    <span className="text-sm font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{r.subtitle}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/app/notifications" className="relative" aria-label={`Notifications (${unread} unread)`}>
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            {unread > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full">{unread}</Badge>
            )}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                <span className="hidden sm:inline text-sm font-medium">{me.name}</span>
                <span className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                  {me.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-sm font-medium">{me.name}</div>
                <div className="text-xs text-muted-foreground">{me.email}</div>
                <Badge variant="outline" className="mt-1 text-[10px]">{ROLE_LABELS[me.role] ?? me.role}</Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/app/account"><KeyRound className="h-4 w-4 mr-2" />Change password</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={logout}><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden lg:block w-60 shrink-0 border-r">
          <ScrollArea className="h-[calc(100vh-3.5rem)] sticky top-14">
            <NavLinks sections={visibleNav} pathname={pathname} />
          </ScrollArea>
        </aside>
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">{children}</div>
        </main>
      </div>

      <footer className="border-t py-3 px-4 text-center text-xs text-muted-foreground mt-auto">
        AgencyOS — unified website & video production operations
      </footer>
    </div>
  )
}
