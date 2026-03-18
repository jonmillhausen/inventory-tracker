import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'
import type { ItemType } from '@/lib/types/database.types'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { resolved_action } = await request.json()

  if (resolved_action !== 'cleared' && resolved_action !== 'moved_to_oos') {
    return NextResponse.json({ error: 'resolved_action must be cleared or moved_to_oos' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch the flag to get item details (needed for OOS creation)
  const { data: flagRow, error: fetchError } = await supabase
    .from('issue_flag_items')
    .select('item_id, item_type, qty, note')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!flagRow) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
  }

  const flag = flagRow as {
    item_id: string
    item_type: ItemType
    qty: number
    note: string
  }

  const { data, error } = await supabase
    .from('issue_flag_items')
    .update({ resolved_at: new Date().toISOString(), resolved_action })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If moving to OOS, create the OOS entry
  if (resolved_action === 'moved_to_oos') {
    const { error: oosError } = await supabase
      .from('out_of_service_items')
      .insert({
        item_id: flag.item_id,
        item_type: flag.item_type,
        qty: flag.qty,
        note: `Moved from issue flag: ${flag.note}`,
      })
    if (oosError) return NextResponse.json({ error: oosError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
