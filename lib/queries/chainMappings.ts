'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

export const CHAIN_MAPPINGS_KEY = ['chain_mappings'] as const

export function useChainMappings(initialData?: ChainMappingRow[]) {
  return useQuery({
    queryKey: CHAIN_MAPPINGS_KEY,
    queryFn: async (): Promise<ChainMappingRow[]> => {
      const res = await fetch('/api/chain-mappings')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export interface ChainMappingInput {
  zenbooker_staff_id: string
  zenbooker_staff_name: string
  chain_id: string
  notes?: string
}

export function useCreateChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ChainMappingInput) => {
      const res = await fetch('/api/chain-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}

export function useUpdateChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<ChainMappingInput> & { id: string }) => {
      const res = await fetch(`/api/chain-mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}

export function useDeleteChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chain-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}
