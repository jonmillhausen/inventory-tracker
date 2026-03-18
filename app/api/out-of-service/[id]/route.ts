import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('out_of_service_items')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
