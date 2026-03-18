'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']

export const SERVICE_MAPPINGS_KEY = ['service_mappings'] as const

export function useServiceMappings(initialData?: ServiceMappingRow[]) {
  return useQuery({
    queryKey: SERVICE_MAPPINGS_KEY,
    queryFn: async (): Promise<ServiceMappingRow[]> => {
      const res = await fetch('/api/service-mappings')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export interface CreateServiceMappingInput {
  zenbooker_service_id: string
  zenbooker_service_name: string
  zenbooker_modifier_id?: string | null
  zenbooker_modifier_name?: string | null
  item_id: string
  default_qty: number
  use_customer_qty: boolean
  notes?: string
}

export function useCreateServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateServiceMappingInput) => {
      const res = await fetch('/api/service-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}

export function useUpdateServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<CreateServiceMappingInput> & { id: string }) => {
      const res = await fetch(`/api/service-mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}

export function useDeleteServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}
