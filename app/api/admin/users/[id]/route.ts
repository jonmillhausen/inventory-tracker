import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  if (id === auth.userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Delete profile row first (safe regardless of whether cascade is configured)
  await adminSupabase.from('users').delete().eq('id', id)

  // Delete auth user
  const { error: deleteErr } = await adminSupabase.auth.admin.deleteUser(id)
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
