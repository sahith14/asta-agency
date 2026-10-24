'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { api, setStoredToken } from '@/lib/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Clapperboard, LayoutDashboard, Film, MonitorSmartphone, PackageCheck, Wallet, LifeBuoy, LogOut, Menu, KeyRound, Bell, Loader2 } from 'lucide-react'

export interface PortalMe { name: string; email: string; role: string; userType: string; clientId: string | null; mustChangePassword: boolean }


function PortalNavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Portal navigation" className="flex flex-col gap-0.5 px-3 py-4">
      {NAV.map(item => {
        const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <item.icon className="h-4 w-4 shrink-0" />{item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function useMe() {
  const [me, setMe] = useState<PortalMe | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api<{ user: PortalMe }>('/api/auth/me').then(d => setMe(d.user)).catch(() => setMe(null)).finally(() => setLoading(false))
  }, [])
  return { me, loading }
}

const NAV = [
  { href: '/portal', label: 'Overview', icon: LayoutDashboard },
  { href: '/portal/projects', label: 'My projects', icon: MonitorSmartphone },
  { href: '/portal/deliverables', label: 'Video reviews', icon: Film },
  { href: '/portal/deliveries', label: 'Deliveries', icon: PackageCheck },
  { href: '/portal/invoices', label: 'Invoices', icon: Wallet },
  { href: '/portal/support', label: 'Support', icon: LifeBuoy },
]

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe()
  const router = useRouter()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!me) return
    api<{ unreadCount: number }>('/api/notifications?unread=true').then(d => setUnread(d.unreadCount)).catch(() => {})
  }, [me, pathname])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setStoredToken(null)
    router.push('/login')
  }, [router])

  // Redirect unauthenticated visitors in an effect — never during render
  useEffect(() => {
    if (!loading && !me) router.replace('/login')
  }, [loading, me, router])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }
  if (!me) {
    // Redirect handled by the effect above; show spinner until navigation completes
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl flex h-14 items-center gap-3 px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center border-b px-4"><Link href="/portal" className="font-semibold">Client portal</Link></div>
              <ScrollArea className="h-[calc(100vh-3.5rem)]"><PortalNavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} /></ScrollArea>
            </SheetContent>
          </Sheet>

          <Link href="/portal" className="flex items-center gap-2 font-semibold">
            <span className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Clapperboard className="h-3.5 w-3.5" /></span>
            <span className="hidden sm:inline">AgencyOS <span className="font-normal text-muted-foreground text-sm">client portal</span></span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/portal" aria-label={`Notifications (${unread} unread)`} className="relative hidden sm:block">
              <Button variant="ghost" size="icon"><Bell className="h-5 w-5" /></Button>
              {unread > 0 && <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full">{unread}</Badge>}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                  <span className="hidden sm:inline text-sm font-medium">{me.name}</span>
                  <span className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">{me.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><div className="text-sm font-medium">{me.name}</div><div className="text-xs text-muted-foreground">{me.email}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/portal/account"><KeyRound className="h-4 w-4 mr-2" />Change password</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={logout}><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl w-full flex-1 flex">
        <aside className="hidden md:block w-56 shrink-0 border-r">
          <ScrollArea className="h-[calc(100vh-3.5rem)] sticky top-14"><PortalNavLinks pathname={pathname} /></ScrollArea>
        </aside>
        <main className="flex-1 min-w-0"><div className="px-4 py-6 lg:px-8">{children}</div></main>
      </div>

      <footer className="border-t py-3 px-4 text-center text-xs text-muted-foreground mt-auto">
        AgencyOS client portal — your projects, reviews and deliveries in one place
      </footer>
    </div>
  )
}
