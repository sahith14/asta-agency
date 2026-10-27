import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ProjectDetailClient } from './project-detail-client'

export default async function PortalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <ProjectDetailClient projectId={id} role={user.role} />
}
