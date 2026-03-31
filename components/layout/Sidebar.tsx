'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  Clock,
  Search,
  CheckSquare,
  Truck,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAdmin } from '@/lib/auth/roles'
import type { UserRole } from '@/lib/types/database.types'

const NAV_ITEMS = [
  { label: 'Availability',  href: '/availability', icon: CalendarDays },
  { label: 'Schedule',      href: '/schedule',      icon: Clock        },
  { label: 'Event Audit',  href: '/audit',         icon: Search       },
  { label: 'Chain Loading', href: '/chains',        icon: Truck        },
  { label: 'Equipment',     href: '/equipment',     icon: Package      },
  { label: 'Bookings',      href: '/bookings',      icon: CheckSquare  },
] as const

interface SidebarProps {
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  function linkClass(href: string) {
    const active = pathname.startsWith(href)
    return cn(
      'flex items-center rounded-md text-sm font-medium transition-colors py-2',
      collapsed ? 'justify-center px-0 w-full' : 'gap-2 px-3',
      active
        ? 'bg-gray-700 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    )
  }

  return (
    <nav
      className="relative flex flex-col shrink-0 h-full bg-gray-900 text-gray-100 gap-1 overflow-hidden transition-all duration-200 ease-in-out dark:border-r dark:border-gray-700"
      style={{ width: collapsed ? 56 : 224, padding: collapsed ? '16px 0' : 16 }}
    >
      {/* Logo */}
      <div
        className="mb-6 flex items-center"
        style={{ justifyContent: collapsed ? 'center' : 'flex-start', minHeight: 34 }}
      >
        {collapsed ? (
          <img src="/wonderfly-logo-icon.png" alt="Wonderfly" style={{ height: 32, width: 'auto' }} />
        ) : (
          <img src="/wonderfly-logo.png" alt="Wonderfly" style={{ height: 30, width: 'auto', paddingLeft: 4 }} />
        )}
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={linkClass(href)}
          title={collapsed ? label : undefined}
        >
          <Icon size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </Link>
      ))}

      {/* Settings (admin only) */}
      {canAdmin(role) && (
        <Link
          href="/settings"
          className={cn(linkClass('/settings'), 'mt-auto')}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">Settings</span>}
        </Link>
      )}

      {/* Collapse toggle — right edge, vertically centered */}
      <button
        onClick={() => setCollapsed(v => !v)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-l-full transition-colors"
        style={{ width: 18, height: 40, zIndex: 50 }}
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
      </button>
    </nav>
  )
}
