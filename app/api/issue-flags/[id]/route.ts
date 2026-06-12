import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

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

  // Existence check so a bad id 404s instead of surfacing a PGRST116 500
  const { data: flagRow, error: fetchError } = await supabase
    .from('issue_flag_items')
    .select('id')
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

  const { data, error } = await supabase
    .from('issue_flag_items')
    .update({ resolved_at: new Date().toISOString(), resolved_action })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // P0-7: no second OOS write here. For moved_to_oos the caller
  // (ResolveIssueFlagModal) creates the real OOS record in equipment_oos via
  // useMarkOOS/useMarkSubItemOOS; the previous insert into the orphaned
  // out_of_service_items table double-counted into a table no screen reads.

  return NextResponse.json(data)
}
