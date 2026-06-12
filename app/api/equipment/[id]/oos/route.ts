import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await request.json()
  const { quantity = 1, issue_description = null, expected_return_date = null } = body

  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
  }

  // P0-7: ONE row with quantity N — same insert pattern as the sub-item route.
  // Partial returns are handled by the decrement endpoint.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_oos')
    .insert({
      equipment_id: id,
      quantity,
      issue_description,
      expected_return_date: expected_return_date || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
