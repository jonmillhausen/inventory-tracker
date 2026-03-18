'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { canAdmin } from '@/lib/auth/roles'
import type { UserRole } from '@/lib/types/database.types'

const NAV_ITEMS = [
  { label: 'Availability', href: '/availability' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Bookings', href: '/bookings' },
  { label: 'Chain Loading', href: '/chains' },
  { label: 'Equipment', href: '/equipment' },
] as const

interface SidebarProps {
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()

  function navClass(href: string) {
    return cn(
      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
      pathname.startsWith(href)
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    )
  }

  return (
    <nav className="flex flex-col w-56 shrink-0 h-full bg-gray-900 text-gray-100 p-4 gap-1">
      <div className="text-lg font-bold mb-6 px-2">Wonderfly</div>
      {NAV_ITEMS.map(({ label, href }) => (
        <Link key={href} href={href} className={navClass(href)}>
          {label}
        </Link>
      ))}
      {canAdmin(role) && (
        <Link href="/settings" className={cn(navClass('/settings'), 'mt-auto')}>
          Settings
        </Link>
      )}
    </nav>
  )
}
