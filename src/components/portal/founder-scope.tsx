'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiGet } from './api'

const STORAGE_KEY = 'agencyos.portal.viewClientId'
const EVENT = 'agencyos:portal-client-changed'

type PickerData = { founder?: boolean; clients?: { id: string; name: string }[] }

/** Founder "view as client" selection, shared across portal pages via
 * localStorage + a custom event. CLIENT users never use this hook. */
export function useFounderClientId(): [string | null, (id: string | null) => void] {
  const [clientId, setClientId] = useState<string | null>(null)

  useEffect(() => {
    const read = () => setClientId(window.localStorage.getItem(STORAGE_KEY))
    read()
    window.addEventListener(EVENT, read)
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener(EVENT, read)
      window.removeEventListener('storage', read)
    }
  }, [])

  const set = useCallback((id: string | null) => {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
    setClientId(id)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [clientId, set]
}

export function FounderClientSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // Plain overview (no clientId) returns the picker list for founders.
    apiGet<PickerData>('/api/portal/overview')
      .then((d) => {
        if (!cancelled) setClients(d.clients ?? [])
      })
      .catch(() => {
        if (!cancelled) setClients([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Label htmlFor="founder-client" className="sr-only">
        Client
      </Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v || null)}
        disabled={clients !== null && clients.length === 0}
      >
        <SelectTrigger id="founder-client" className="w-full min-h-11 sm:w-72" aria-label="Select a client to view">
          <SelectValue placeholder={clients === null ? 'Loading clients…' : 'Select a client'} />
        </SelectTrigger>
        <SelectContent>
          {(clients ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Gate for founder portal pages: until a client is picked, show the picker. */
export function FounderScopeGate() {
  const [clientId, setClientId] = useFounderClientId()
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          View the portal as a client
        </CardTitle>
        <CardDescription>
          Choose a client business to preview their portal exactly as they see it. All founder access is logged for
          audit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FounderClientSelect value={clientId} onChange={setClientId} />
      </CardContent>
    </Card>
  )
}

/** Slim bar shown on founder-scoped pages once a client is selected. */
export function FounderViewingBar() {
  const [clientId, setClientId] = useFounderClientId()
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium">Viewing as founder — all access is audited.</span>
      <FounderClientSelect value={clientId} onChange={setClientId} />
    </div>
  )
}
