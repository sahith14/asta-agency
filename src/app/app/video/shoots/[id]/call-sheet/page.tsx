'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, fmtDate } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface CallSheet {
  id: string; reference: string; title: string; date: string; startTime: string; endTime: string; timezone: string
  address: string | null; accessArrangements: string | null; callSheetNotes: string | null
  clientContact: string | null
  project: { name: string; reference: string; client: { name: string; contactName: string | null; contactPhone: string | null } }
  manager: { name: string } | null
  assignments: Array<{ employee: { name: string; phone: string | null }; crewRole: string }>
  deliverableLinks: Array<{ deliverable: { title: string; reference: string; targetPlatform: string | null; aspectRatio: string | null; targetDurationSec: number | null; briefVersions: Array<{ content: string }> } | null }>
  equipmentReservations: Array<{ item: { name: string; category: string | null } }>
}

// Print-optimized call sheet — excludes internal notes, costs and private data by design.
export default function CallSheetPage() {
  const { id } = useParams<{ id: string }>()
  const [sheet, setSheet] = useState<CallSheet | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ shoot: CallSheet }>(`/api/video/shoots/${id}`).then(d => setSheet(d.shoot)).catch(e => setError(e.message))
  }, [id])

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-destructive font-medium mb-3">{error}</p>
        <Button variant="outline" asChild><Link href="/app/video/shoots"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
      </div>
    </div>
  )
  if (!sheet) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  const deliverables = sheet.deliverableLinks.map(l => l.deliverable).filter(Boolean) as NonNullable<CallSheet['deliverableLinks'][0]['deliverable']>[]

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-3xl mx-auto p-8 print:p-0">
        <div className="hidden print:hidden mb-6 flex gap-2">
          <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
          <Button variant="outline" asChild><Link href={`/app/video/shoots/${id}`}><ArrowLeft className="h-4 w-4 mr-1" />Back to shoot</Link></Button>
        </div>

        <header className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest">Call Sheet</p>
            <h1 className="text-2xl font-bold">{sheet.title}</h1>
            <p className="text-sm">{sheet.project.name} · {sheet.project.client.name}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">{fmtDate(sheet.date)}</p>
            <p>{sheet.startTime}–{sheet.endTime} ({sheet.timezone})</p>
            <p className="text-xs mt-1">{sheet.reference}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div>
            <h2 className="font-bold uppercase text-xs tracking-wider mb-1.5">Location</h2>
            <p>{sheet.address ?? 'TBC'}</p>
            {sheet.accessArrangements && <p className="mt-1 text-xs">Access: {sheet.accessArrangements}</p>}
          </div>
          <div>
            <h2 className="font-bold uppercase text-xs tracking-wider mb-1.5">Contacts</h2>
            <p>Client contact: {sheet.clientContact ?? sheet.project.client.contactName ?? '—'}</p>
            <p>Phone: {sheet.project.client.contactPhone ?? '—'}</p>
            <p>Shoot manager: {sheet.manager?.name ?? '—'}</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="font-bold uppercase text-xs tracking-wider mb-2">Crew</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {sheet.manager && <tr className="border-b"><td className="py-1.5 pr-4 font-semibold">{sheet.manager.name}</td><td className="text-muted">Shoot Manager</td></tr>}
              {sheet.assignments.filter(a => a.crewRole !== 'MANAGER').map(a => (
                <tr key={a.employee.name + a.crewRole} className="border-b">
                  <td className="py-1.5 pr-4 font-semibold">{a.employee.name}{a.employee.phone ? <span className="font-normal"> · {a.employee.phone}</span> : null}</td>
                  <td>{a.crewRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-6">
          <h2 className="font-bold uppercase text-xs tracking-wider mb-2">Shot list / planned deliverables</h2>
          {deliverables.length === 0 ? <p className="text-sm">No deliverables planned.</p> : (
            <ol className="text-sm list-decimal pl-5 space-y-1">
              {deliverables.map((d, i) => {
                let briefNote = ''
                try {
                  const b = d.briefVersions?.[0]
                  if (b) {
                    const content = JSON.parse(b.content) as Record<string, string>
                    briefNote = [content.keyMessage, content.hook].filter(Boolean).join(' — ')
                  }
                } catch { /* brief note optional */ }
                return (
                  <li key={i}>
                    <strong>{d.title}</strong> ({d.reference}) — {d.targetPlatform ?? 'TBC'} · {d.aspectRatio ?? 'TBC'}{d.targetDurationSec ? ` · ${d.targetDurationSec}s` : ''}
                    {briefNote && <span className="block text-xs pl-0.5">{briefNote}</span>}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {sheet.equipmentReservations.length > 0 && (
          <section className="mb-6">
            <h2 className="font-bold uppercase text-xs tracking-wider mb-2">Equipment</h2>
            <p className="text-sm">{sheet.equipmentReservations.map(r => r.item.name).join(' · ')}</p>
          </section>
        )}

        {sheet.callSheetNotes && (
          <section className="mb-6">
            <h2 className="font-bold uppercase text-xs tracking-wider mb-2">Production notes</h2>
            <p className="text-sm whitespace-pre-wrap">{sheet.callSheetNotes}</p>
          </section>
        )}

        <footer className="border-t pt-3 text-[11px] text-gray-500 flex justify-between">
          <span>AgencyOS Studio — generated call sheet</span>
          <span>Internal-only information is excluded by design</span>
        </footer>
      </div>
    </div>
  )
}
