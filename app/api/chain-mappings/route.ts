import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chain_mappings')
    .select('*')
    .order('zenbooker_staff_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { zenbooker_staff_id, zenbooker_staff_name, chain_id, notes = '' } =
    body as Record<string, unknown>

  if (!zenbooker_staff_id || typeof zenbooker_staff_id !== 'string')
    return NextResponse.json({ error: 'zenbooker_staff_id required' }, { status: 400 })
  if (!chain_id || typeof chain_id !== 'string')
    return NextResponse.json({ error: 'chain_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('chain_mappings')
    .insert({
      zenbooker_staff_id: zenbooker_staff_id as string,
      zenbooker_staff_name: (zenbooker_staff_name as string) || zenbooker_staff_id as string,
      chain_id: chain_id as string,
      notes: (notes as string) || '',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Duplicate — this staff member is already mapped' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
