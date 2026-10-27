import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { TicketsClient } from './tickets-client'

export default async function TicketsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const [clients, projects] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.project.findMany({ select: { id: true, name: true, clientId: true }, orderBy: { name: 'asc' } }),
  ])

  return <TicketsClient role={user.role} clients={clients} projects={projects} />
}
