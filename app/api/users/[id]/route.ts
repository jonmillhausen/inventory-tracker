import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

const VALID_ROLES = ['admin', 'sales', 'staff', 'readonly'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  if (id === auth.userId)
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })

  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role } = body as Record<string, unknown>
  if (!role || !VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
    return NextResponse.json({ error: 'role must be one of: admin, sales, staff, readonly' }, { status: 400 })

  const { data, error } = await supabase
    .from('users')
    .update({ role: role as typeof VALID_ROLES[number] })
    .eq('id', id)
    .select()
    .single()

  if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
