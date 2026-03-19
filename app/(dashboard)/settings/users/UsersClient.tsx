'use client'

import { useState } from 'react'
import { useUsers, useUpdateUserRole } from '@/lib/queries/users'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InviteUserModal } from '@/components/modals/InviteUserModal'
import type { Database, UserRole } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-800' },
  sales: { label: 'Sales', className: 'bg-blue-100 text-blue-800' },
  staff: { label: 'Staff', className: 'bg-green-100 text-green-800' },
  readonly: { label: 'Read-only', className: 'bg-gray-100 text-gray-600' },
}

const VALID_ROLES: UserRole[] = ['admin', 'sales', 'staff', 'readonly']

interface Props {
  initialUsers: UserRow[]
  currentUserId: string
}

export function UsersClient({ initialUsers, currentUserId }: Props) {
  const { data: users = [] } = useUsers(initialUsers)
  const updateRole = useUpdateUserRole()
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">User Management</h1>
        <Button onClick={() => setShowInvite(true)}>Add User</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Current Role</th>
              <th className="px-4 py-3 font-medium">Change Role</th>
              <th className="px-4 py-3 font-medium">Member Since</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => {
              const badge = ROLE_BADGE[u.role]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {u.full_name}
                    {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-gray-400">Cannot change own role</span>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={role => updateRole.mutate({ id: u.id, role: role as UserRole })}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALID_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{ROLE_BADGE[r].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
