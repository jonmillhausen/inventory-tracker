import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsersClient } from './UsersClient'
import type { Database } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const { data: usersData } = await supabase.from('users').select('*').order('full_name')
  const users = (usersData ?? []) as UserRow[]

  return <UsersClient initialUsers={users} currentUserId={user.id} />
}
