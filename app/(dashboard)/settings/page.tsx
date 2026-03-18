import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAdmin } from '@/lib/auth/roles'
import type { UserRole } from '@/lib/types/database.types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!profile || !canAdmin((profile as { role: string }).role as UserRole)) {
    redirect('/availability')
  }

  redirect('/settings/mappings/service')
}
