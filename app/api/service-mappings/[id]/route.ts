import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { item_id, default_qty, use_customer_qty, notes,
    zenbooker_service_name, zenbooker_modifier_name } = body as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if (typeof item_id === 'string') update.item_id = item_id
  if (typeof default_qty === 'number') update.default_qty = default_qty
  if (typeof use_customer_qty === 'boolean') update.use_customer_qty = use_customer_qty
  if (typeof notes === 'string') update.notes = notes
  if (typeof zenbooker_service_name === 'string') update.zenbooker_service_name = zenbooker_service_name
  if (typeof zenbooker_modifier_name === 'string' || zenbooker_modifier_name === null)
    update.zenbooker_modifier_name = zenbooker_modifier_name

  const { data, error } = await supabase
    .from('service_mappings')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { id } = await params

  const { error } = await supabase.from('service_mappings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
