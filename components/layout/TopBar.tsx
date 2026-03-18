'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  userName: string
}

export function TopBar({ userName }: TopBarProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-12 shrink-0 border-b bg-white flex items-center justify-between px-4">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{userName}</span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
