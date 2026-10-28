import { db } from '@/lib/db'

/** Flags conflicts: crew double-booking, overlapping equipment reservations, impossible ranges. Non-blocking (flagged to caller). */
export async function detectConflicts(input: { date: Date; startTime: string; endTime: string; videographerIds: string[]; equipmentItemIds: string[]; excludeSessionId?: string }): Promise<string[]> {
  const conflicts: string[] = []
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
  const start = toMin(input.startTime)
  const end = toMin(input.endTime)
  if (Number.isNaN(start) || Number.isNaN(end)) { conflicts.push('Invalid time format (use HH:mm)'); return conflicts }
  if (end <= start) conflicts.push('End time must be after start time')

  const dayStart = new Date(input.date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(input.date); dayEnd.setHours(23, 59, 59, 999)

  if (input.videographerIds.length) {
    const sessions = await db.shootSession.findMany({
      where: {
        id: input.excludeSessionId ? { not: input.excludeSessionId } : undefined,
        status: { in: ['PLANNED', 'SCHEDULED'] },
        date: { gte: dayStart, lte: dayEnd },
        assignments: { some: { employeeId: { in: input.videographerIds } } },
      },
      include: { assignments: { select: { employeeId: true } } },
    })
    for (const s of sessions) {
      const sStart = toMin(s.startTime), sEnd = toMin(s.endTime)
      if (start < sEnd && sStart < end) {
        const employees = await db.employee.findMany({ where: { id: { in: s.assignments.map(a => a.employeeId).filter(id => input.videographerIds.includes(id)) } }, select: { name: true } })
        if (employees.length) conflicts.push(`Crew conflict: ${employees.map(e => e.name).join(', ')} is assigned to "${s.title}" (${s.startTime}–${s.endTime} on ${s.date.toISOString().slice(0, 10)})`)
      }
    }
  }

  if (input.equipmentItemIds.length) {
    const items = await db.equipmentReservation.findMany({
      where: {
        itemId: { in: input.equipmentItemIds },
        ...(input.excludeSessionId ? { sessionId: { not: input.excludeSessionId } } : {}),
        startAt: { lte: dayEnd },
        endAt: { gte: dayStart },
      },
      include: { item: { select: { name: true } } },
    })
    for (const r of items) {
      const rStart = r.startAt.getHours() * 60 + r.startAt.getMinutes()
      const rEnd = r.endAt.getHours() * 60 + r.endAt.getMinutes()
      if (start < rEnd && rStart < end) conflicts.push(`Equipment conflict: ${r.item.name} is already reserved ${r.startAt.toISOString().slice(0, 16).replace('T', ' ')}–${r.endAt.toISOString().slice(11, 16)}`)
    }
  }
  return conflicts
}
