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
  const { error } = await supabase
    .from('equipment')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
