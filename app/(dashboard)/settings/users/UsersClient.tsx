'use client'

import { useState, useEffect } from 'react'
import { useUsers, useUpdateUserRole, useResendInvite, useDeleteUser } from '@/lib/queries/users'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { InviteUserModal } from '@/components/modals/InviteUserModal'
import { MoreHorizontal, Mail, Trash2 } from 'lucide-react'
import type { Database, UserRole } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-800' },
  sales: { label: 'Sales', className: 'bg-blue-100 text-blue-800' },
  staff: { label: 'Staff', className: 'bg-green-100 text-green-800' },
  readonly: { label: 'Read-only', className: 'bg-gray-100 text-gray-600' },
}

const VALID_ROLES: UserRole[] = ['admin', 'sales', 'staff', 'readonly']

interface Toast {
  type: 'success' | 'error'
  message: string
}

interface Props {
  initialUsers: UserRow[]
  currentUserId: string
}

export function UsersClient({ initialUsers, currentUserId }: Props) {
  const { data: users = [] } = useUsers(initialUsers)
  const updateRole = useUpdateUserRole()
  const resendInvite = useResendInvite()
  const deleteUser = useDeleteUser()

  const [showInvite, setShowInvite] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function handleResendInvite(user: UserRow) {
    resendInvite.mutate(user.id, {
      onSuccess: () => setToast({ type: 'success', message: `Login link sent to ${user.full_name}` }),
      onError: (err) => setToast({ type: 'error', message: err.message }),
    })
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return
    const name = deleteTarget.full_name
    deleteUser.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        setToast({ type: 'success', message: `${name} has been removed` })
      },
      onError: (err) => {
        setDeleteTarget(null)
        setToast({ type: 'error', message: err.message })
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">User Management</h1>
        <Button onClick={() => setShowInvite(true)}>Add User</Button>
      </div>

      <div className="border rounded-lg overflow-hidden dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Current Role</th>
              <th className="px-4 py-3 font-medium">Change Role</th>
              <th className="px-4 py-3 font-medium">Member Since</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {users.map(u => {
              const badge = ROLE_BADGE[u.role]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium dark:text-gray-100">
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
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                          aria-label="User actions"
                        >
                          <MoreHorizontal size={15} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleResendInvite(u)}
                            disabled={resendInvite.isPending}
                          >
                            <Mail size={14} />
                            Resend Invite
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 size={14} />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.full_name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
