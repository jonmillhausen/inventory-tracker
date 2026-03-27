import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const CONFIRM_URL = 'https://inventory-tracker-drab-xi.vercel.app/auth/confirm'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  console.log('[send-password-reset] handler invoked')
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) {
    console.log('[send-password-reset] auth rejected')
    return auth
  }

  const { id } = await params
  console.log('[send-password-reset] authed as', auth.userId, '— target id:', id)
  const adminSupabase = createAdminClient()

  const { data: { user }, error: lookupErr } = await adminSupabase.auth.admin.getUserById(id)
  if (lookupErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (!user.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 400 })
  }

  console.log('[send-password-reset] calling generateLink recovery for', user.email)
  const { error: linkErr } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
    options: { redirectTo: CONFIRM_URL },
  })

  if (linkErr) {
    console.error('[send-password-reset] generateLink error:', linkErr.message)
    return NextResponse.json({ error: linkErr.message }, { status: 400 })
  }

  console.log('[send-password-reset] success for', user.email)
  return NextResponse.json({ ok: true })
}
