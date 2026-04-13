import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET() {
  const supabase = createServiceRoleClient()

  const [eqRes, subRes, linkRes] = await Promise.all([
    supabase
      .from('equipment')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('equipment_sub_items')
      .select('id, parent_id, name, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('equipment_sub_item_links')
      .select('id, sub_item_id, parent_id, loadout_qty'),
  ])

  if (eqRes.error || subRes.error || linkRes.error) {
    return NextResponse.json(
      { error: 'Failed to load equipment data' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    equipment: eqRes.data,
    subItems: subRes.data,
    subItemLinks: linkRes.data,
  })
}
