import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

// PATCH /api/equipment/sub-items/[subId]
// Updates a sub-item's name/total_qty and bulk-upserts/deletes all parent links.
// Body: { name?, total_qty?, links: Array<{ parent_id: string; loadout_qty: number }> }
// A link with loadout_qty = 0 means "remove this link".
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ subId: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const body = await request.json()
  const { name, total_qty, links } = body as {
    name?: string
    total_qty?: number
    links?: Array<{ parent_id: string; loadout_qty: number }>
  }

  const supabase = await createClient()

  // Update sub-item fields if provided
  const updateFields: Record<string, unknown> = {}
  if (name !== undefined) updateFields.name = name
  if (total_qty !== undefined) updateFields.total_qty = total_qty

  if (Object.keys(updateFields).length > 0) {
    const { error } = await supabase
      .from('equipment_sub_items')
      .update(updateFields)
      .eq('id', subId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bulk-manage links
  if (links && links.length > 0) {
    const toUpsert = links.filter(l => l.loadout_qty > 0)
    const toDelete = links.filter(l => l.loadout_qty === 0).map(l => l.parent_id)

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('equipment_sub_item_links')
        .upsert(
          toUpsert.map(l => ({ sub_item_id: subId, parent_id: l.parent_id, loadout_qty: l.loadout_qty })),
          { onConflict: 'sub_item_id,parent_id' }
        )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const parentId of toDelete) {
      await supabase
        .from('equipment_sub_item_links')
        .delete()
        .eq('sub_item_id', subId)
        .eq('parent_id', parentId)
    }
  }

  const { data, error } = await supabase
    .from('equipment_sub_items')
    .select()
    .eq('id', subId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
