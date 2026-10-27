import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { MaintenanceClient } from './maintenance-client'

export default async function MaintenancePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      clientId: true,
      assignedToId: true,
      client: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })

  return <MaintenanceClient role={user.role} userId={user.id} projects={projects} />
}
