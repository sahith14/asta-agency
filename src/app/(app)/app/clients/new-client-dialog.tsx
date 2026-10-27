'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus } from 'lucide-react'
import { CLIENT_STATUSES } from '@/lib/constants'
import { humanizeStatus } from '@/lib/format'

export function NewClientDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('ACTIVE')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          contactName: form.get('contactName'),
          email: form.get('email'),
          phone: form.get('phone') || null,
          address: form.get('address') || null,
          industry: form.get('industry') || null,
          status,
          internalNotes: form.get('internalNotes') || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not create client', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Client created', description: `${data.client.name} was added.` })
      setOpen(false)
      router.refresh()
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-[44px]">
          <Plus className="h-4 w-4" /> New client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>Add a client business to the agency portfolio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Name *</Label>
            <Input id="client-name" name="name" required maxLength={160} className="h-11" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-contact">Contact name *</Label>
              <Input id="client-contact" name="contactName" required maxLength={120} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email *</Label>
              <Input id="client-email" name="email" type="email" required maxLength={180} className="h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Phone</Label>
              <Input id="client-phone" name="phone" maxLength={40} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-industry">Industry</Label>
              <Input id="client-industry" name="industry" maxLength={120} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-address">Address</Label>
            <Input id="client-address" name="address" maxLength={500} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanizeStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Internal notes</Label>
            <Textarea id="client-notes" name="internalNotes" rows={3} maxLength={5000} className="min-h-[44px]" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
