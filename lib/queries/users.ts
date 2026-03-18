'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database, UserRole } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

export const USERS_KEY = ['users'] as const

export function useUsers(initialData?: UserRow[]) {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async (): Promise<UserRow[]> => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
