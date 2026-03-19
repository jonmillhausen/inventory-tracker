'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { label: 'Equipment', href: '/settings/equipment' },
  { label: 'Service Mappings', href: '/settings/mappings/service' },
  { label: 'Chain Mappings', href: '/settings/mappings/chain' },
  { label: 'Users', href: '/settings/users' },
  { label: 'Webhook Logs', href: '/settings/webhook-logs' },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b mb-6">
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            pathname.startsWith(tab.href)
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
