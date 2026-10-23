'use client'

import { useEffect, useState, FormEvent } from 'react'
import { api } from '@/lib/client'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Wrench, Plus, Loader2, CalendarClock } from 'lucide-react'

interface Item {
  id: string; name: string; category: string | null; serial: string | null; status: string
  reservations: Array<{ id: string; startAt: string; endAt: string; session: { id: string; title: string; date: string; startTime: string; endTime: string } }>
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESERVED: 'bg-sky-50 text-sky-700 border-sky-200',
  MAINTENANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  RETIRED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

export default function EquipmentPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api<{ items: Item[] }>('/api/video/equipment').then(d => setItems(d.items)).catch(e => setError(e.message))
  useEffect(() => { load() }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api('/api/video/equipment', { method: 'POST', body: {
        name: String(fd.get('name')), category: String(fd.get('category')) || undefined, serial: String(fd.get('serial')) || undefined,
      } })
      setBusy(false); load()
    } catch { setBusy(false) }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/video/equipment/${id}`, { method: 'PATCH', body: { status } }).catch(() => {})
    load()
  }

  if (error) return <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Equipment</h1>
          <p className="text-muted-foreground text-sm">Kit inventory with reservation tracking — double-bookings are flagged when scheduling shoots.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add equipment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add equipment item</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="eq-name">Name</Label><Input id="eq-name" name="name" required maxLength={160} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="eq-cat">Category</Label><Input id="eq-cat" name="category" placeholder="Camera / Audio / Lighting" /></div>
                <div className="space-y-1.5"><Label htmlFor="eq-serial">Serial</Label><Input id="eq-serial" name="serial" /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!items && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>}
      {items && (
        items.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No equipment registered</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => (
              <Card key={item.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category ?? 'Kit'}{item.serial ? ` · ${item.serial}` : ''}</p>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold border rounded px-1.5 py-0.5 ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                  </div>
                  {item.reservations.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-2">
                      {item.reservations.slice(0, 3).map(r => (
                        <p key={r.id} className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />{new Date(r.startAt).toLocaleDateString('en-GB')} {r.session.startTime}–{r.session.endTime} · {r.session.title}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5 pt-3">
                    {['AVAILABLE', 'MAINTENANCE', 'RETIRED'].filter(s => s !== item.status).map(s => (
                      <Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(item.id, s)}>{s === 'AVAILABLE' ? 'Mark available' : s === 'MAINTENANCE' ? 'Maintenance' : 'Retire'}</Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
