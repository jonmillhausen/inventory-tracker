import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
