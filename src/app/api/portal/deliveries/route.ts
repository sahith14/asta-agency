import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireClientUser, json } from '@/lib/auth'

// GET /api/portal/deliveries — approved final deliveries with authorized download references
export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const deliveries = await db.videoDeliverable.findMany({
    where: { project: { clientId: user.clientId! }, status: 'DELIVERED' },
    include: { project: { select: { name: true, reference: true } } },
    orderBy: { deliveredAt: 'desc' },
  })
  return json({
    deliveries: deliveries.map(d => ({
      id: d.id, reference: d.reference, title: d.title,
      project: d.project, deliveredAt: d.deliveredAt,
      deliveryReference: d.deliveryReference,
      platform: d.targetPlatform, aspectRatio: d.aspectRatio,
    })),
  })
}
