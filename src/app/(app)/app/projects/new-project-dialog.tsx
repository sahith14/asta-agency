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
import { PROJECT_STATUSES } from '@/lib/constants'
import { humanizeStatus } from '@/lib/format'

type ClientOption = { id: string; name: string; status: string }
type DeveloperOption = { id: string; name: string; email: string }

export function NewProjectDialog({ clients, developers }: { clients: ClientOption[]; developers: DeveloperOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('DISCOVERY')
  const [clientId, setClientId] = useState<string>('')
  const [assignedToId, setAssignedToId] = useState<string>('NONE')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          name: form.get('name'),
          description: form.get('description') || null,
          packageType: form.get('packageType') || null,
          status,
          assignedToId: assignedToId === 'NONE' ? null : assignedToId,
          startDate: form.get('startDate') || null,
          targetLaunchDate: form.get('targetLaunchDate') || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not create project', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      toast({ title: 'Project created', description: `${data.project.name} was added.` })
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
          <Plus className="h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Set up a delivery project for a client.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId} required>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({humanizeStatus(c.status)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name *</Label>
            <Input id="project-name" name="name" required maxLength={160} className="h-11" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-package">Package type</Label>
              <Input id="project-package" name="packageType" maxLength={120} placeholder="e.g. Essential Website" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {humanizeStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assigned web developer</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Unassigned</SelectItem>
                {developers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Start date</Label>
              <Input id="project-start" name="startDate" type="date" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-launch">Target launch date</Label>
              <Input id="project-launch" name="targetLaunchDate" type="date" className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" name="description" rows={3} maxLength={5000} className="min-h-[44px]" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !clientId} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
