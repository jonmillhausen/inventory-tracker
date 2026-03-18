import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // staff can assign chains (not just admin/sales)
  const auth = await getSessionAndRole(['admin', 'sales', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { chain } = body as { chain: string | null }

  const { data: booking, error } = await supabase
    .from('bookings')
    .update({ chain: chain ?? null })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(booking)
}
