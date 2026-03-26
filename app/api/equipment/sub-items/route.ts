import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

// POST /api/equipment/sub-items
// Creates a sub-item with multiple parent links in one request.
// Body: { id, name, total_qty, links: Array<{ parent_id: string; loadout_qty: number }> }
export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { id, name, total_qty, links } = body as {
    id: string
    name: string
    total_qty: number
    links: Array<{ parent_id: string; loadout_qty: number }>
  }

  if (!id || !name || total_qty == null) {
    return NextResponse.json({ error: 'id, name, and total_qty are required' }, { status: 400 })
  }

  const activeLinks = (links ?? []).filter(l => l.loadout_qty > 0)
  if (activeLinks.length === 0) {
    return NextResponse.json({ error: 'At least one parent with loadout_qty > 0 is required' }, { status: 400 })
  }

  // Use first active link as the fallback parent_id (non-null column)
  const fallbackParentId = activeLinks[0].parent_id

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment_sub_items')
    .insert({ id, parent_id: fallbackParentId, name, total_qty })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create all link rows
  const { error: linkErr } = await supabase
    .from('equipment_sub_item_links')
    .insert(activeLinks.map(l => ({ sub_item_id: id, parent_id: l.parent_id, loadout_qty: l.loadout_qty })))

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
