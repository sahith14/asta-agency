import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee, withApi, ok } from '@/lib/rbac'

/**
 * Reference data for the ticket create dialog (client + project selects).
 * Employees only — CLIENT accounts are rejected by requireEmployee.
 */
export const GET = withApi(async (_req: NextRequest) => {
  await requireEmployee()

  const [clients, projects] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } }),
    db.project.findMany({
      select: { id: true, name: true, clientId: true, status: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return ok({ clients, projects })
})
