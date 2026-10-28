import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireStaff, audit, notify, makeReference, json, jsonError } from '@/lib/auth'
import { can, parseBody } from '@/lib/rbac'
import { detectConflicts } from '@/lib/shoot-conflicts'



const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(160),
  date: z.string().datetime(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be HH:mm'),
  timezone: z.string().max(60).default('Europe/London'),
  address: z.string().max(400).optional(),
  locationNotes: z.string().max(1000).optional(),
  managerId: z.string().optional(),
  clientContact: z.string().max(120).optional(),
  accessArrangements: z.string().max(1000).optional(),
  callSheetNotes: z.string().max(2000).optional(),
  transportNotes: z.string().max(1000).optional(),
  budgetedTravelCost: z.number().min(0).max(100000).optional(),
  deliverableIds: z.array(z.string()).max(50).default([]),
  videographerIds: z.array(z.string()).max(10).default([]),
  assistantIds: z.array(z.string()).max(10).default([]),
  equipmentItemIds: z.array(z.string()).max(30).default([]),
})

export async function GET(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const projectId = url.searchParams.get('projectId')

  const assignedOnly = ['VIDEOGRAPHER', 'VIDEO_EDITOR', 'WEB_DEVELOPER'].includes(user.role)
  const where = {
    ...(projectId ? { projectId } : {}),
    ...(from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : {}),
    ...(assignedOnly ? { assignments: { some: { employeeId: user.userId } } } : {}),
  }
  const shoots = await db.shootSession.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, reference: true, client: { select: { name: true } } } },
      manager: { select: { id: true, name: true } },
      assignments: { include: { employee: { select: { id: true, name: true } } } },
      deliverableLinks: { include: { deliverable: { select: { id: true, title: true, reference: true, status: true } } } },
      equipmentReservations: { include: { item: { select: { id: true, name: true } } } },
    },
    orderBy: { date: 'asc' },
  })
  return json({ shoots })
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireStaff(req)
  if (error) return error
  if (!can(user, 'shoots.manage')) return jsonError('You do not have permission to schedule shoots', 403)
  const { data, error: vErr } = await parseBody(req, createSchema)
  if (vErr) return vErr

  const project = await db.project.findUnique({ where: { id: data.projectId }, include: { videoProject: true } })
  if (!project || !project.videoProject) return jsonError('Video project not found', 404)

  const allCrew = [...data.videographerIds, ...data.assistantIds]
  if (data.managerId && !allCrew.includes(data.managerId)) allCrew.push(data.managerId)
  for (const empId of allCrew) {
    const emp = await db.employee.findUnique({ where: { id: empId } })
    if (!emp || !emp.isActive) return jsonError('Assigned crew member not found', 404)
  }
  for (const dId of data.deliverableIds) {
    const d = await db.videoDeliverable.findUnique({ where: { id: dId } })
    if (!d || d.projectId !== data.projectId) return jsonError('Planned deliverable does not belong to this project', 400)
  }
  for (const eId of data.equipmentItemIds) {
    const item = await db.equipmentItem.findUnique({ where: { id: eId } })
    if (!item || item.status === 'RETIRED') return jsonError('Equipment item not found or retired', 404)
  }

  const conflicts = await detectConflicts({
    date: new Date(data.date), startTime: data.startTime, endTime: data.endTime,
    videographerIds: data.videographerIds, equipmentItemIds: data.equipmentItemIds,
  })

  const date = new Date(data.date)
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)

  const shoot = await db.$transaction(async (tx) => {
    const s = await tx.shootSession.create({
      data: {
        reference: makeReference('SH'),
        projectId: data.projectId,
        title: data.title,
        date, startTime: data.startTime, endTime: data.endTime, timezone: data.timezone,
        address: data.address, locationNotes: data.locationNotes,
        managerId: data.managerId, clientContact: data.clientContact,
        accessArrangements: data.accessArrangements,
        callSheetNotes: data.callSheetNotes, transportNotes: data.transportNotes,
        budgetedTravelCost: data.budgetedTravelCost,
        status: 'SCHEDULED',
      },
    })
    for (const empId of data.videographerIds) await tx.shootAssignment.create({ data: { sessionId: s.id, employeeId: empId, crewRole: 'VIDEOGRAPHER' } })
    for (const empId of data.assistantIds) await tx.shootAssignment.create({ data: { sessionId: s.id, employeeId: empId, crewRole: 'ASSISTANT' } })
    if (data.managerId) await tx.shootAssignment.create({ data: { sessionId: s.id, employeeId: data.managerId, crewRole: 'MANAGER' } })
    for (const dId of data.deliverableIds) {
      await tx.shootDeliverable.create({ data: { sessionId: s.id, deliverableId: dId } })
      await tx.videoDeliverable.update({ where: { id: dId }, data: { status: 'SCHEDULED', plannedShootDate: date } })
    }
    for (const eId of data.equipmentItemIds) {
      await tx.equipmentReservation.create({ data: { itemId: eId, sessionId: s.id, startAt: dayStart, endAt: dayEnd } })
    }
    return s
  })

  await audit({ userType: 'EMPLOYEE', userId: user.userId, name: user.name }, 'SHOOT_CREATED', 'ShootSession', shoot.id, `Scheduled shoot ${shoot.title} (${shoot.reference}) on ${shoot.date.toISOString().slice(0, 10)}`)

  const link = `/app/video/shoots/${shoot.id}`
  for (const empId of allCrew) {
    if (empId !== user.userId) await notify('EMPLOYEE', empId, 'SHOOT_SCHEDULED', `Shoot scheduled: ${shoot.title}`, `${shoot.date.toISOString().slice(0, 10)} ${data.startTime}–${data.endTime}${data.address ? ` @ ${data.address}` : ''}`, link)
  }
  const portalUsers = await db.clientUser.findMany({ where: { clientId: project.clientId, isActive: true }, select: { id: true } })
  for (const pu of portalUsers) {
    await notify('CLIENT_USER', pu.id, 'SHOOT_SCHEDULED', `Shoot scheduled: ${shoot.title}`, `${shoot.date.toISOString().slice(0, 10)} ${data.startTime}${data.address ? ` @ ${data.address}` : ''}`, '/portal')
  }

  return json({ shoot, conflicts }, 201)
}
