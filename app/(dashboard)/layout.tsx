import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { RealtimeSync } from '@/components/providers/RealtimeSync'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import type { UserRole } from '@/lib/types/database.types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (!user) {
    console.log('[layout] getUser failed — error:', userError?.message ?? 'no error, session missing')
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user!.id)
    .single()

  if (!profile) {
    console.log('[layout] profile query failed — userId:', user!.id, '| error:', profileError?.message ?? 'no row')
    // User authenticated but no profile row — sign out and redirect
    redirect('/login')
  }

  return (
    <QueryProvider>
      <RealtimeSync />
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={(profile as { full_name: string; role: string }).role as UserRole} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar userName={(profile as { full_name: string; role: string }).full_name} />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </QueryProvider>
  )
}
