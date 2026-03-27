import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  console.log('[delete-user] handler invoked')
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) {
    console.log('[delete-user] auth rejected')
    return auth
  }

  const { id } = await params
  console.log('[delete-user] authed as', auth.userId, '— target id:', id)

  if (id === auth.userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Delete profile row first (safe regardless of whether cascade is configured)
  const { error: profileErr } = await adminSupabase.from('users').delete().eq('id', id)
  console.log('[delete-user] profile delete result:', profileErr ? profileErr.message : 'ok')

  // Delete auth user
  const { error: deleteErr } = await adminSupabase.auth.admin.deleteUser(id)
  if (deleteErr) {
    console.error('[delete-user] auth.admin.deleteUser error:', deleteErr.message)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  console.log('[delete-user] success for id', id)
  return new NextResponse(null, { status: 204 })
}
