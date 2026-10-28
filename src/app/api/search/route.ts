import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireStaff, json, jsonError } from '@/lib/auth'
import { isGlobalReader } from '@/lib/rbac'

// GET /api/search?q=... — role-scoped global search across clients, projects, tasks, deliverables, shoots
export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return json({ results: [] })
  if (q.length > 100) return jsonError('Search query too long', 400)

  const globalReader = isGlobalReader(user.role)
  const results: Array<{ type: string; id: string; title: string; subtitle: string; href: string }> = []

  const clients = globalReader || ['SUPPORT_FINANCE'].includes(user.role)
    ? await db.client.findMany({ where: { isActive: true, OR: [{ name: { contains: q } }, { contactName: { contains: q } }] }, take: 5 })
    : []
  for (const c of clients) results.push({ type: 'Client', id: c.id, title: c.name, subtitle: c.businessCategory, href: `/app/clients/${c.id}` })

  const projectWhere = {
    OR: [{ name: { contains: q } }, { reference: { contains: q } }],
    ...(globalReader ? {} : {
      OR: [
        { managerId: user.userId },
        { deliverables: { some: { OR: [{ editorId: user.userId }, { videographerId: user.userId }] } } },
        { tasks: { some: { assigneeId: user.userId } } },
      ],
    }),
  }
  const projects = await db.project.findMany({ where: projectWhere, include: { client: { select: { name: true } } }, take: 6 })
  for (const p of projects) results.push({ type: 'Project', id: p.id, title: p.name, subtitle: `${p.reference} · ${p.client.name}`, href: `/app/projects/${p.id}` })

  const deliverables = await db.videoDeliverable.findMany({
    where: {
      OR: [{ title: { contains: q } }, { reference: { contains: q } }],
      ...(globalReader ? {} : { OR: [{ editorId: user.userId }, { videographerId: user.userId }] }),
    },
    include: { project: { select: { name: true } } },
    take: 6,
  })
  for (const d of deliverables) results.push({ type: 'Deliverable', id: d.id, title: d.title, subtitle: `${d.reference} · ${d.project.name}`, href: `/app/video/deliverables/${d.id}` })

  const tasks = await db.task.findMany({
    where: {
      title: { contains: q },
      ...(globalReader ? {} : { assigneeId: user.userId }),
    },
    take: 5,
  })
  for (const t of tasks) results.push({ type: 'Task', id: t.id, title: t.title, subtitle: t.status, href: '/app/tasks' })

  return json({ results })
}
