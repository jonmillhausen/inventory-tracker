import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'
import type { Database } from '@/lib/types/database.types'

type SubItemUpdate = Database['public']['Tables']['equipment_sub_items']['Update']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const body = await request.json() as SubItemUpdate

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_sub_items')
    .update(body)
    .eq('id', subId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('equipment_sub_items')
    .update({ is_active: false })
    .eq('id', subId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
