'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']
type OOSRow = Database['public']['Tables']['equipment_oos']['Row']

export const EQUIPMENT_KEY = ['equipment'] as const

export function useEquipment(initialData?: EquipmentRow[]) {
  return useQuery({
    queryKey: EQUIPMENT_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('name')
      if (error) throw error
      return data as EquipmentRow[]
    },
    initialData,
  })
}

export const SUB_ITEMS_KEY = ['equipment_sub_items'] as const

export function useEquipmentSubItems(initialData?: SubItemRow[]) {
  return useQuery({
    queryKey: SUB_ITEMS_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_sub_items')
        .select('*')
        .order('name')
      if (error) throw error
      return data as SubItemRow[]
    },
    initialData,
  })
}

export const SUB_ITEM_LINKS_KEY = ['equipment_sub_item_links'] as const
export const EQUIPMENT_OOS_KEY = (equipmentId: string) => ['equipment_oos', equipmentId] as const
export const EQUIPMENT_OOS_SUMS_KEY = ['equipment_oos_sums'] as const
export const SUB_ITEM_OOS_KEY = (subItemId: string) => ['sub_item_oos', subItemId] as const
export const SUB_ITEM_OOS_SUMS_KEY = ['sub_item_oos_sums'] as const

export function useSubItemLinks(initialData?: SubItemLinkRow[]) {
  return useQuery({
    queryKey: SUB_ITEM_LINKS_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_sub_item_links')
        .select('*')
      if (error) throw error
      return data as SubItemLinkRow[]
    },
    initialData,
  })
}

// --- Mutations ---

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { id: string; name: string; total_qty: number; custom_setup_min?: number | null; custom_cleanup_min?: number | null; categories?: string[] }) => {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; total_qty?: number; is_active?: boolean; custom_setup_min?: number | null; custom_cleanup_min?: number | null; categories?: string[] }) => {
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useReactivateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
    },
  })
}

export function useDeactivateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useReactivateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (subId: string) => {
      const res = await fetch(`/api/equipment/sub-items/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
    },
  })
}

export function useDeleteSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (subId: string) => {
      const res = await fetch(`/api/equipment/sub-items/${subId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
    },
  })
}

export function useDeactivateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ parentId, subId }: { parentId: string; subId: string }) => {
      const res = await fetch(`/api/equipment/${parentId}/sub-items/${subId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
    },
  })
}

export function useCreateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ parentId, ...body }: { parentId: string; id: string; name: string; total_qty: number; loadout_qty?: number }) => {
      const res = await fetch(`/api/equipment/${parentId}/sub-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useUpdateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ parentId, subId, ...body }: { parentId: string; subId: string; name?: string; total_qty?: number; is_active?: boolean; loadout_qty?: number }) => {
      const res = await fetch(`/api/equipment/${parentId}/sub-items/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useCreateSubItemBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      id: string
      name: string
      total_qty: number
      links: Array<{ parent_id: string; loadout_qty: number }>
    }) => {
      const res = await fetch('/api/equipment/sub-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useUpdateSubItemBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      subId: string
      name?: string
      total_qty?: number
      links: Array<{ parent_id: string; loadout_qty: number }>
    }) => {
      const { subId, ...rest } = body
      const res = await fetch(`/api/equipment/sub-items/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rest),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: SUB_ITEM_LINKS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useCreateIssueFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { item_id: string; item_type: 'equipment' | 'sub_item'; qty: number; note: string }) => {
      const res = await fetch('/api/issue-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useResolveIssueFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resolved_action }: { id: string; resolved_action: 'cleared' | 'moved_to_oos' }) => {
      const res = await fetch(`/api/issue-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved_action }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useCreateOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { item_id: string; item_type: 'equipment' | 'sub_item'; qty: number; note: string; return_date?: string | null }) => {
      const res = await fetch('/api/out-of-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useMarkOOSReturned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/out-of-service/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returned_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

// Fetch active OOS records for one equipment item (used by OOSDetailModal)
export function useEquipmentOOS(equipmentId: string) {
  return useQuery({
    queryKey: EQUIPMENT_OOS_KEY(equipmentId),
    queryFn: async (): Promise<OOSRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('*')
        .eq('equipment_id', equipmentId)
        .is('returned_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as OOSRow[]
    },
  })
}

// Fetch active OOS quantity sum per equipment_id (used in equipment table + availability)
export function useEquipmentOOSSums(initialData?: Record<string, number>) {
  return useQuery({
    queryKey: EQUIPMENT_OOS_SUMS_KEY,
    initialData,
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('equipment_id, quantity')
        .not('equipment_id', 'is', null)
        .is('returned_at', null)
      if (error) throw error
      const sums: Record<string, number> = {}
      for (const row of data ?? []) {
        if (row.equipment_id) {
          sums[row.equipment_id] = (sums[row.equipment_id] ?? 0) + row.quantity
        }
      }
      return sums
    },
  })
}

export function useMarkOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      equipmentId,
      quantity,
      issue_description,
      expected_return_date,
    }: {
      equipmentId: string
      quantity: number
      issue_description?: string | null
      expected_return_date?: string | null
    }) => {
      const res = await fetch(`/api/equipment/${equipmentId}/oos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, issue_description, expected_return_date }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { equipmentId }) => {
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_KEY(equipmentId) })
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_SUMS_KEY })
    },
  })
}

export function useReturnFromOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ equipmentId, oosId }: { equipmentId: string; oosId: string }) => {
      const res = await fetch(`/api/equipment/${equipmentId}/oos/${oosId}/return`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { equipmentId }) => {
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_KEY(equipmentId) })
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_SUMS_KEY })
    },
  })
}

export function useSubItemOOS(subItemId: string) {
  return useQuery({
    queryKey: SUB_ITEM_OOS_KEY(subItemId),
    queryFn: async (): Promise<OOSRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('*')
        .eq('sub_item_id', subItemId)
        .is('returned_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as OOSRow[]
    },
  })
}

export function useSubItemOOSSums() {
  return useQuery({
    queryKey: SUB_ITEM_OOS_SUMS_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('sub_item_id, quantity')
        .not('sub_item_id', 'is', null)
        .is('returned_at', null)
      if (error) throw error
      const sums: Record<string, number> = {}
      for (const row of data ?? []) {
        if (row.sub_item_id) {
          sums[row.sub_item_id] = (sums[row.sub_item_id] ?? 0) + row.quantity
        }
      }
      return sums
    },
  })
}

export function useMarkSubItemOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      subItemId,
      quantity,
      issue_description,
      expected_return_date,
    }: {
      subItemId: string
      quantity: number
      issue_description?: string | null
      expected_return_date?: string | null
    }) => {
      const res = await fetch(`/api/equipment/sub-items/${subItemId}/oos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, issue_description, expected_return_date }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { subItemId }) => {
      qc.invalidateQueries({ queryKey: SUB_ITEM_OOS_KEY(subItemId) })
      qc.invalidateQueries({ queryKey: SUB_ITEM_OOS_SUMS_KEY })
    },
  })
}

export function useReturnSubItemFromOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ subItemId, oosId }: { subItemId: string; oosId: string }) => {
      const res = await fetch(`/api/equipment/sub-items/${subItemId}/oos/${oosId}/return`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { subItemId }) => {
      qc.invalidateQueries({ queryKey: SUB_ITEM_OOS_KEY(subItemId) })
      qc.invalidateQueries({ queryKey: SUB_ITEM_OOS_SUMS_KEY })
    },
  })
}
