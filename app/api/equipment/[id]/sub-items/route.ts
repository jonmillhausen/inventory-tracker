import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id: parentId } = await params
  const body = await request.json()
  const { id, name, total_qty, loadout_qty = 1 } = body

  if (!id || !name || total_qty == null) {
    return NextResponse.json({ error: 'id, name, and total_qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_sub_items')
    .insert({ id, parent_id: parentId, name, total_qty })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create the corresponding link row
  await supabase
    .from('equipment_sub_item_links')
    .insert({ sub_item_id: id, parent_id: parentId, loadout_qty })
    .select()

  return NextResponse.json(data, { status: 201 })
}
