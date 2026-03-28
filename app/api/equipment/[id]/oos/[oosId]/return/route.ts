import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string; oosId: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { oosId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment_oos')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', oosId)
    .is('returned_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
