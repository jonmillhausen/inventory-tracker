import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  console.log('[resend-invite] handler invoked')
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) {
    console.log('[resend-invite] auth rejected')
    return auth
  }

  const { id } = await params
  console.log('[resend-invite] authed as', auth.userId, '— target id:', id)
  const adminSupabase = createAdminClient()

  // Look up the user's email from Supabase Auth
  const { data: { user }, error: lookupErr } = await adminSupabase.auth.admin.getUserById(id)
  if (lookupErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (!user.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 400 })
  }

  console.log('[resend-invite] calling inviteUserByEmail for', user.email)
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(user.email)
  if (inviteErr) {
    console.error('[resend-invite] inviteUserByEmail error:', inviteErr.message)
    return NextResponse.json({ error: inviteErr.message }, { status: 400 })
  }

  console.log('[resend-invite] success for', user.email)
  return NextResponse.json({ ok: true })
}
