import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireClientUser, json } from '@/lib/auth'

// GET /api/portal/invoices — client's own invoices only
export async function GET(req: NextRequest) {
  const { user, error } = await requireClientUser(req)
  if (error) return error
  const invoices = await db.invoice.findMany({
    where: { clientId: user.clientId! },
    include: { project: { select: { name: true, reference: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return json({ invoices })
}
