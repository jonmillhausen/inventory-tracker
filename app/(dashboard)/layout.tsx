import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { RealtimeSync } from '@/components/providers/RealtimeSync'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
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
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role, theme')
    .eq('id', user!.id)
    .single()

  if (!profile) {
    // User authenticated but no profile row — sign out and redirect
    redirect('/login')
  }

  const p = profile as { full_name: string; role: string; theme?: string }

  return (
    <QueryProvider>
      <RealtimeSync />
      <ThemeProvider initialTheme={(p.theme === 'dark' ? 'dark' : 'light')}>
        <div className="flex h-screen overflow-hidden dark:bg-gray-900">
          <Sidebar role={p.role as UserRole} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar userName={p.full_name} />
            <main className="flex-1 overflow-auto p-6 dark:bg-gray-900 dark:text-gray-100">{children}</main>
          </div>
        </div>
      </ThemeProvider>
    </QueryProvider>
  )
}
