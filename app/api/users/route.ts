import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const VALID_ROLES = ['admin', 'sales', 'staff', 'readonly'] as const

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, full_name, role } = body as Record<string, unknown>

  if (!email || typeof email !== 'string')
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  if (!full_name || typeof full_name !== 'string' || !full_name.trim())
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  if (!role || !VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
    return NextResponse.json({ error: 'role must be one of: admin, sales, staff, readonly' }, { status: 400 })

  const adminSupabase = createAdminClient()

  // Invite creates the auth user and sends an email with a set-password link
  const { data: { user }, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    { data: { full_name: full_name.trim() } }
  )

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 400 })
  if (!user) return NextResponse.json({ error: 'Failed to create auth user' }, { status: 500 })

  // Insert profile row — use admin client to bypass RLS
  const { data, error: profileError } = await adminSupabase
    .from('users')
    .insert({ id: user.id, full_name: full_name.trim(), role: role as typeof VALID_ROLES[number] })
    .select()
    .single()

  if (profileError) {
    // Rollback: remove the auth user so it doesn't become an orphan
    await adminSupabase.auth.admin.deleteUser(user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
