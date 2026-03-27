'use client'

import { useRouter } from 'next/navigation'
import { Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/providers/ThemeProvider'

interface TopBarProps {
  userName: string
}

export function TopBar({ userName }: TopBarProps) {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-12 shrink-0 border-b bg-white dark:bg-gray-900 dark:border-gray-700 flex items-center justify-between px-4">
      <div />
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-300">{userName}</span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
