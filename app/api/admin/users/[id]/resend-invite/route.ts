import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const adminSupabase = createAdminClient()

  // Look up the user's email from Supabase Auth
  const { data: { user }, error: lookupErr } = await adminSupabase.auth.admin.getUserById(id)
  if (lookupErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (!user.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 400 })
  }

  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(user.email)
  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
