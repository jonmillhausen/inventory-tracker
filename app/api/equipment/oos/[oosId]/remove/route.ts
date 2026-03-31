import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ oosId: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { oosId } = await params
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('equipment_oos')
    .select('quantity')
    .eq('id', oosId)
    .is('returned_at', null)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!existing) {
    return NextResponse.json({ error: 'OOS record not found' }, { status: 404 })
  }

  if (existing.quantity > 1) {
    const { error } = await supabase
      .from('equipment_oos')
      .update({ quantity: existing.quantity - 1 } as any)
      .eq('id', oosId)
      .is('returned_at', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: oosId, quantity: existing.quantity - 1 })
  }

  const { data, error } = await supabase
    .from('equipment_oos')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', oosId)
    .is('returned_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
