import { NextRequest } from 'next/server'
import { getAuthUser, json, jsonError } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return jsonError('Authentication required', 401)
  return json({
    user: {
      name: user.name, email: user.email, role: user.role,
      userType: user.userType, clientId: user.clientId, mustChangePassword: user.mustChangePassword,
    },
  })
}
