import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ subId: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const body = await request.json()
  const { quantity = 1, issue_description = null, expected_return_date = null } = body

  if (!quantity || quantity < 1) {
    return NextResponse.json({ error: 'quantity must be at least 1' }, { status: 400 })
  }

  const supabase = await createClient()
  const rows = Array.from({ length: quantity }, () => ({
    sub_item_id: subId,
    quantity: 1,
    issue_description,
    expected_return_date: expected_return_date || null,
  }))
  const { data, error } = await supabase
    .from('equipment_oos')
    .insert(rows)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
