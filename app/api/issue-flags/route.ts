import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { item_id, item_type, qty, note } = body

  if (!item_id || !item_type || qty == null) {
    return NextResponse.json({ error: 'item_id, item_type, and qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('issue_flag_items')
    .insert({ item_id, item_type, qty, note: note ?? '' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
