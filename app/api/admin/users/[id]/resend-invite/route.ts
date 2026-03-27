import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const CONFIRM_URL = 'https://inventory-tracker-drab-xi.vercel.app/auth/confirm'

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
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(user.email, {
    redirectTo: CONFIRM_URL,
  })

  if (inviteErr) {
    console.error('[resend-invite] inviteUserByEmail error:', inviteErr.message)

    // User already confirmed their account — they have a password, can log in normally.
    // Return 409 so the frontend can show a specific actionable message.
    if (
      inviteErr.message.toLowerCase().includes('already registered') ||
      inviteErr.message.toLowerCase().includes('already been registered') ||
      (inviteErr as { code?: string }).code === 'user_already_exists'
    ) {
      return NextResponse.json(
        { error: 'This user already has an active account. Use Send Password Reset instead.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: inviteErr.message }, { status: 400 })
  }

  console.log('[resend-invite] success for', user.email)
  return NextResponse.json({ ok: true })
}
