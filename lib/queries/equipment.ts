'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

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

export function useDeactivateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
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
