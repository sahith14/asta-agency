'use client'

import { useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatDateTime, relativeTime } from '@/lib/format'
import { ROLE_LABELS, type Role } from '@/lib/constants'

type CommentRow = {
  id: string
  body: string
  createdAt: string
  author: { id: string; name: string; role: string }
}

/** Per-task comment thread (employees only — the API enforces the same RBAC as tasks). */
export function TaskCommentsDialog({ taskId, taskTitle, initialCount }: { taskId: string; taskTitle: string; initialCount: number }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<CommentRow[] | null>(null)
  const [count, setCount] = useState(initialCount)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/tasks/${taskId}/comments`, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not load comments')
    setComments(data.comments)
    setCount(data.comments.length)
  }

  async function onOpenChange(o: boolean) {
    setOpen(o)
    if (o && comments === null) {
      try {
        await load()
      } catch (err) {
        toast({ title: 'Could not load comments', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
        setComments([])
      }
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not add comment', description: data.error ?? 'Something went wrong', variant: 'destructive' })
        return
      }
      setComments((prev) => [...(prev ?? []), data.comment])
      setCount((c) => c + 1)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => void onOpenChange(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px]">
          <MessageSquare className="h-4 w-4" />
          Comments{count > 0 ? ` (${count})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comments — {taskTitle}</DialogTitle>
          <DialogDescription>Internal discussion. Visible to the founder, managers and the assigned developer.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {comments === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
            </p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Start the discussion below.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author.name}</span>
                  {' · '}
                  {ROLE_LABELS[c.author.role as Role] ?? c.author.role}
                  {' · '}
                  {formatDateTime(c.createdAt)} ({relativeTime(c.createdAt)})
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="mt-2 items-end gap-2 sm:items-end">
          <form onSubmit={submit} className="flex w-full flex-1 flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Write a comment…"
              aria-label="New comment"
              className="min-h-[44px]"
            />
            <Button type="submit" disabled={busy || !draft.trim()} className="min-h-[44px] w-full sm:w-auto sm:self-end">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Add comment
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
