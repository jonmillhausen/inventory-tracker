import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ImportClient } from './ImportClient'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  return <ImportClient />
}
