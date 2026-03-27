import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/profile — update the authenticated user's own profile fields.
// Currently supports: theme ('light' | 'dark')
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { theme } = body as Record<string, unknown>
  if (theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'theme must be "light" or "dark"' }, { status: 400 })
  }

  const { error } = await supabase
    .from('users')
    .update({ theme })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
