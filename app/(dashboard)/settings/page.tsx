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

  const safeProfile = profile as { role: string } | null

  if (!safeProfile || !canAdmin(safeProfile.role as UserRole)) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500 mt-2">
          You don&apos;t have permission to access Settings.
        </p>
      </div>
    )
  }

  redirect('/settings/mappings/service')
}
