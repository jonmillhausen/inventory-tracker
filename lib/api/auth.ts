import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database.types'

export type SessionAndRole = {
  userId: string
  role: UserRole
}

/** Pure role-gating utility — used in unit tests and route handlers. */
export function roleAllows(role: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role)
}

/**
 * Call at the top of every API route handler.
 * Returns { userId, role } on success, or a NextResponse (401/403) to return immediately.
 */
export async function getSessionAndRole(
  allowedRoles: UserRole[]
): Promise<SessionAndRole | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role } = profile

  if (!roleAllows(role, allowedRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { userId: user.id, role }
}
