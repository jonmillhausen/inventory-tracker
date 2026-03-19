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

  const { chain_id, zenbooker_staff_name, notes } = body as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof chain_id === 'string') update.chain_id = chain_id
  if (typeof zenbooker_staff_name === 'string') update.zenbooker_staff_name = zenbooker_staff_name
  if (typeof notes === 'string') update.notes = notes

  const { data, error } = await supabase
    .from('chain_mappings')
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
  const { error } = await supabase.from('chain_mappings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
