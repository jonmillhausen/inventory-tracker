import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'
import type { Database } from '@/lib/types/database.types'

type EquipmentUpdate = Database['public']['Tables']['equipment']['Update']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await request.json()
  const { name, total_qty, is_active, custom_setup_min, custom_cleanup_min, categories } = body

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .update({ name, total_qty, is_active, custom_setup_min, custom_cleanup_min, ...(categories !== undefined ? { categories } : {}) })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  const { data: linkRows, error: linkError } = await supabase
    .from('equipment_sub_item_links')
    .select('sub_item_id')
    .eq('parent_id', id)

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  const subItemIds = Array.from(new Set((linkRows ?? []).map(row => row.sub_item_id)))

  if (subItemIds.length > 0) {
    const { data: remainingLinks, error: remainingError } = await supabase
      .from('equipment_sub_item_links')
      .select('sub_item_id,parent_id')
      .in('sub_item_id', subItemIds)
      .neq('parent_id', id)

    if (remainingError) return NextResponse.json({ error: remainingError.message }, { status: 500 })

    const fallbackParentBySubItem = new Map<string, string>()
    for (const link of remainingLinks ?? []) {
      if (!fallbackParentBySubItem.has(link.sub_item_id)) {
        fallbackParentBySubItem.set(link.sub_item_id, link.parent_id)
      }
    }

    for (const [subItemId, fallbackParentId] of fallbackParentBySubItem) {
      const { error: updateParentError } = await supabase
        .from('equipment_sub_items')
        .update({ parent_id: fallbackParentId } as any)
        .eq('id', subItemId)
      if (updateParentError) return NextResponse.json({ error: updateParentError.message }, { status: 500 })
    }
  }

  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
