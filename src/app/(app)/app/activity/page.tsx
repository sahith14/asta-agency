import { requirePageUser } from '../_lib'
import { ActivityClient } from './activity-client'

export default async function ActivityPage() {
  // Employees only; clients never reach the internal dashboard (defense in depth).
  await requirePageUser()
  return <ActivityClient />
}
