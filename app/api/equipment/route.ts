import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function GET() {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff', 'readonly'])
  if (auth instanceof NextResponse) return auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { id, name, total_qty, custom_setup_min = null, custom_cleanup_min = null, categories = [] } = body

  if (!id || !name || total_qty == null) {
    return NextResponse.json({ error: 'id, name, and total_qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .insert({ id, name, total_qty, custom_setup_min, custom_cleanup_min, categories })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
