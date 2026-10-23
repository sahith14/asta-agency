import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'
import { detectConflicts } from '@/lib/shoot-conflicts'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const shoot = await db.shootSession.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, reference: true, client: { select: { id: true, name: true, contactName: true, contactPhone: true } } } },
      manager: { select: { id: true, name: true } },
      assignments: { include: { employee: { select: { id: true, name: true, phone: true } } } },
      deliverableLinks: { include: { deliverable: { select: { id: true, title: true, reference: true, status: true, targetPlatform: true, aspectRatio: true, targetDurationSec: true, briefVersions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } },
      equipmentReservations: { include: { item: { select: { id: true, name: true, category: true, status: true } } } },
    },
  })
  if (!shoot) return jsonError('Shoot not found', 404)
  const assignedOnly = ['VIDEOGRAPHER', 'VIDEO_EDITOR', 'WEB_DEVELOPER'].includes(user.role)
  if (assignedOnly) {
    const assigned = shoot.assignments.some(a => a.employeeId === user.userId)
    const manages = shoot.managerId === user.userId
    const shootsDeliverables = shoot.deliverableLinks.some(l => l.deliverable && false)
    const linkedDeliverables = await db.videoDeliverable.count({ where: { projectId: shoot.projectId, OR: [{ editorId: user.userId }, { videographerId: user.userId }] } })
    if (!assigned && !manages && !shootsDeliverables && linkedDeliverables === 0) return jsonError('You do not have access to this shoot', 403)
  }
  return json({ shoot })
}

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  date: z.string().datetime().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  address: z.string().max(400).optional(),
  locationNotes: z.string().max(1000).optional(),
  clientContact: z.string().max(120).optional(),
  accessArrangements: z.string().max(1000).optional(),
  callSheetNotes: z.string().max(2000).optional(),
  transportNotes: z.string().max(1000).optional(),
  budgetedTravelCost: z.number().min(0).max(100000).optional(),
  actualCost: z.number().min(0).max(100000).optional(),
  deliverableIds: z.array(z.string()).max(50).optional(),
  videographerIds: z.array(z.string()).max(10).optional(),
  assistantIds: z.array(z.string()).max(10).optional(),
  equipmentItemIds: z.array(z.string()).max(30).optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'shoots.manage')) return jsonError('You do not have permission to update shoots', 403)
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, updateSchema)
  if (vErr) return vErr

  const shoot = await db.shootSession.findUnique({ where: { id } })
  if (!shoot) return jsonError('Shoot not found', 404)
  if (['COMPLETED', 'CANCELLED'].includes(shoot.status)) return jsonError(`Cannot edit a ${shoot.status.toLowerCase()} shoot`, 422)

  const dateChanged = data.date && new Date(data.date).getTime() !== shoot.date.getTime()
  const timeChanged = (data.startTime && data.startTime !== shoot.startTime) || (data.endTime && data.endTime !== shoot.endTime)
  const rescheduled = dateChanged || timeChanged

  if (rescheduled && !data.callSheetNotes && !shoot.rescheduleReason) {
    // reschedule reason required below via dedicated flow; here allow but flag
  }

  const conflicts = rescheduled || data.videographerIds || data.equipmentItemIds
    ? await detectConflicts({
        date: data.date ? new Date(data.date) : shoot.date,
        startTime: data.startTime ?? shoot.startTime,
        endTime: data.endTime ?? shoot.endTime,
        videographerIds: data.videographerIds ?? (await db.shootAssignment.findMany({ where: { sessionId: id, crewRole: 'VIDEOGRAPHER' } })).map(a => a.employeeId),
        equipmentItemIds: data.equipmentItemIds ?? (await db.equipmentReservation.findMany({ where: { sessionId: id } })).map(r => r.itemId),
        excludeSessionId: id,
      })
    : []

  await db.$transaction(async (tx) => {
    await tx.shootSession.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.date ? { date: new Date(data.date) } : {}),
        ...(data.startTime ? { startTime: data.startTime } : {}),
        ...(data.endTime ? { endTime: data.endTime } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.locationNotes !== undefined ? { locationNotes: data.locationNotes } : {}),
        ...(data.clientContact !== undefined ? { clientContact: data.clientContact } : {}),
        ...(data.accessArrangements !== undefined ? { accessArrangements: data.accessArrangements } : {}),
        ...(data.callSheetNotes !== undefined ? { callSheetNotes: data.callSheetNotes } : {}),
        ...(data.transportNotes !== undefined ? { transportNotes: data.transportNotes } : {}),
        ...(data.budgetedTravelCost !== undefined ? { budgetedTravelCost: data.budgetedTravelCost } : {}),
        ...(data.actualCost !== undefined ? { actualCost: data.actualCost } : {}),
        ...(rescheduled ? { status: 'SCHEDULED' as const } : {}),
      },
    })
    if (data.videographerIds || data.assistantIds) {
      await tx.shootAssignment.deleteMany({ where: { sessionId: id, crewRole: { in: ['VIDEOGRAPHER', 'ASSISTANT'] } } })
      for (const empId of data.videographerIds ?? []) await tx.shootAssignment.create({ data: { sessionId: id, employeeId: empId, crewRole: 'VIDEOGRAPHER' } })
      for (const empId of data.assistantIds ?? []) await tx.shootAssignment.create({ data: { sessionId: id, employeeId: empId, crewRole: 'ASSISTANT' } })
    }
    if (data.deliverableIds) {
      await tx.shootDeliverable.deleteMany({ where: { sessionId: id } })
      for (const dId of data.deliverableIds) {
        const d = await tx.videoDeliverable.findUnique({ where: { id: dId } })
        if (!d || d.projectId !== shoot.projectId) continue
        await tx.shootDeliverable.create({ data: { sessionId: id, deliverableId: dId } })
        if (['PLANNED'].includes(d.status)) await tx.videoDeliverable.update({ where: { id: dId }, data: { status: 'SCHEDULED', plannedShootDate: data.date ? new Date(data.date) : shoot.date } })
      }
    }
    if (data.equipmentItemIds) {
      await tx.equipmentReservation.deleteMany({ where: { sessionId: id } })
      const shootDate = data.date ? new Date(data.date) : shoot.date
      const dayStart = new Date(shootDate); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(shootDate); dayEnd.setHours(23, 59, 59, 999)
      for (const eId of data.equipmentItemIds) {
        await tx.equipmentReservation.create({ data: { itemId: eId, sessionId: id, startAt: dayStart, endAt: dayEnd } })
      }
    }
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SHOOT_UPDATED', 'ShootSession', id, `Updated shoot ${shoot.title}${rescheduled ? ' (rescheduled)' : ''}`)

  if (rescheduled) {
    const assignments = await db.shootAssignment.findMany({ where: { sessionId: id }, select: { employeeId: true } })
    for (const a of assignments) {
      if (a.employeeId !== user.userId) await notify('EMPLOYEE', a.employeeId, 'SHOOT_RESCHEDULED', `Shoot rescheduled: ${shoot.title}`, `New time: ${shoot.date.toISOString().slice(0, 10)} ${data.startTime ?? shoot.startTime}`, `/app/video/shoots/${id}`)
    }
    const project = await db.project.findUnique({ where: { id: shoot.projectId }, select: { clientId: true } })
    if (project) {
      const portalUsers = await db.clientUser.findMany({ where: { clientId: project.clientId, isActive: true }, select: { id: true } })
      for (const pu of portalUsers) await notify('CLIENT_USER', pu.id, 'SHOOT_RESCHEDULED', `Shoot rescheduled: ${shoot.title}`, undefined, '/portal')
    }
  }

  return json({ ok: true, conflicts })
}

const statusSchema = z.object({
  action: z.enum(['complete', 'cancel']),
  completionNotes: z.string().max(4000).optional(),
  incidentNotes: z.string().max(4000).optional(),
  attendanceNotes: z.string().max(4000).optional(),
  actualCost: z.number().min(0).max(100000).optional(),
  reason: z.string().min(1, 'A reason is required').max(2000).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const { id } = await ctx.params
  const { data, error: vErr } = await parseBody(req, statusSchema)
  if (vErr) return vErr

  const shoot = await db.shootSession.findUnique({ where: { id }, include: { assignments: true, deliverableLinks: true } })
  if (!shoot) return jsonError('Shoot not found', 404)

  if (data.action === 'complete') {
    if (!can(user, 'shoots.markComplete') && shoot.managerId !== user.userId) return jsonError('You do not have permission to complete this shoot', 403)
    if (shoot.status === 'COMPLETED') return jsonError('Shoot is already completed', 422)
    if (shoot.status === 'CANCELLED') return jsonError('Cannot complete a cancelled shoot', 422)
    await db.shootSession.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completionNotes: data.completionNotes,
        incidentNotes: data.incidentNotes,
        attendanceNotes: data.attendanceNotes,
        actualCost: data.actualCost,
      },
    })
    await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SHOOT_COMPLETED', 'ShootSession', id, `Completed shoot ${shoot.title} (manual completion — never automatic)`)
    return json({ ok: true })
  }

  // cancel
  if (!can(user, 'shoots.manage')) return jsonError('You do not have permission to cancel this shoot', 403)
  if (!data.reason) return jsonError('A cancellation reason is required', 400)
  if (shoot.status === 'CANCELLED') return jsonError('Shoot is already cancelled', 422)
  await db.shootSession.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: data.reason } })
  await db.videoDeliverable.updateMany({ where: { id: { in: shoot.deliverableLinks.map(l => l.deliverableId) }, status: 'SCHEDULED' }, data: { status: 'PLANNED' } })
  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SHOOT_CANCELLED', 'ShootSession', id, `Cancelled shoot ${shoot.title}: ${data.reason.slice(0, 100)}`)
  const assignments = await db.shootAssignment.findMany({ where: { sessionId: id }, select: { employeeId: true } })
  for (const a of assignments) {
    if (a.employeeId !== user.userId) await notify('EMPLOYEE', a.employeeId, 'SHOOT_CANCELLED', `Shoot cancelled: ${shoot.title}`, data.reason, `/app/video/shoots/${id}`)
  }
  return json({ ok: true })
}
