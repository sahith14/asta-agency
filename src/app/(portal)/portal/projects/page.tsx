import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ProjectsClient } from './projects-client'

export default async function PortalProjectsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <ProjectsClient role={user.role} />
}
