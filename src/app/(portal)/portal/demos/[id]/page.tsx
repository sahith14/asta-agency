import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { DemoDetailClient } from './demo-detail-client'

export default async function PortalDemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <DemoDetailClient demoId={id} role={user.role} />
}
