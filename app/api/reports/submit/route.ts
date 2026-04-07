import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ItemType, Database } from '@/lib/types/database.types'

type ReportRow = Database['public']['Tables']['equipment_reports']['Row']

export async function POST(request: Request) {
  const body = await request.json()
  const { staff_name, equipment_id, sub_item_id, report_type, quantity, note } = body

  if (!staff_name || !equipment_id || !report_type) {
    return NextResponse.json(
      { error: 'staff_name, equipment_id, and report_type are required' },
      { status: 400 }
    )
  }

  if (!['damaged', 'missing'].includes(report_type)) {
    return NextResponse.json({ error: 'report_type must be damaged or missing' }, { status: 400 })
  }

  const qty = quantity ?? 1
  if (qty < 1) {
    return NextResponse.json({ error: 'quantity must be at least 1' }, { status: 400 })
  }

  // Use service role client to bypass RLS for both insert and flag creation
  const supabase = createServiceRoleClient()

  // 1. Insert the report row
  const { data: reportData, error: reportError } = await supabase
    .from('equipment_reports')
    .insert({
      staff_name,
      equipment_id,
      sub_item_id: sub_item_id || null,
      report_type,
      quantity: qty,
      note: note || null,
    })
    .select()
    .single()

  const report = reportData as ReportRow

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  // 2. Create an issue flag on the equipment/sub-item
  const item_id = sub_item_id || equipment_id
  const item_type: ItemType = sub_item_id ? 'sub_item' : 'equipment'

  const { error: flagError } = await supabase
    .from('issue_flag_items')
    .insert({
      item_id,
      item_type,
      qty,
      note: note || `${report_type === 'missing' ? 'Missing' : 'Damaged'} — reported by ${staff_name}`,
    })

  if (flagError) {
    // Report was created but flag failed — return partial success
    return NextResponse.json(
      { ...report, flag_created: false, flag_error: flagError.message },
      { status: 201 }
    )
  }

  // 3. Mark flag_created = true on the report
  await supabase
    .from('equipment_reports')
    .update({ flag_created: true })
    .eq('id', report.id)

  return NextResponse.json({ ...report, flag_created: true }, { status: 201 })
}
