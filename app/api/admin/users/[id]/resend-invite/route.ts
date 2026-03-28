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

    const isAlreadyRegistered =
      inviteErr.message.toLowerCase().includes('already registered') ||
      inviteErr.message.toLowerCase().includes('already been registered') ||
      (inviteErr as { code?: string }).code === 'user_already_exists'

    if (isAlreadyRegistered) {
      // Re-fetch to check confirmation status — inviteUserByEmail throws "already registered"
      // for ANY existing auth record, confirmed or not.
      const { data: { user: freshUser } } = await adminSupabase.auth.admin.getUserById(id)

      if (freshUser && !freshUser.confirmed_at) {
        // Unconfirmed — send a fresh invite link via generateLink
        console.log('[resend-invite] unconfirmed user, generating fresh invite link for', user.email)
        const { error: genErr } = await adminSupabase.auth.admin.generateLink({
          type: 'invite',
          email: user.email,
          options: { redirectTo: CONFIRM_URL },
        })
        if (genErr) {
          console.error('[resend-invite] generateLink error:', genErr.message)
          return NextResponse.json({ error: genErr.message }, { status: 400 })
        }
        console.log('[resend-invite] fresh invite sent for', user.email)
        return NextResponse.json({ ok: true })
      }

      // Confirmed — they have an active account, password reset is the right action
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
