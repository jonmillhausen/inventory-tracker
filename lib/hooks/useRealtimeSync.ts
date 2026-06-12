'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { EQUIPMENT_KEY, SUB_ITEMS_KEY, EQUIPMENT_OOS_SUMS_KEY, SUB_ITEM_OOS_SUMS_KEY } from '@/lib/queries/equipment'
import { BOOKINGS_KEY } from '@/lib/queries/bookings'
import { CHAINS_KEY } from '@/lib/queries/chains'

const SERVICE_MAPPINGS_KEY = ['service_mappings']

export function useRealtimeSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const bookingsChannel = supabase
      .channel('rt-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        qc.invalidateQueries({ queryKey: BOOKINGS_KEY })
      })
      .subscribe()

    const equipmentChannel = supabase
      .channel('rt-equipment')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_sub_items' }, () => {
        qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issue_flag_items' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      // P0-7: equipment_oos drives all OOS math (availability + equipment
      // pages); the legacy out_of_service_items subscription invalidated keys
      // for a table nothing reads.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_oos' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_SUMS_KEY })
        qc.invalidateQueries({ queryKey: SUB_ITEM_OOS_SUMS_KEY })
        qc.invalidateQueries({ queryKey: ['equipment_oos'], exact: false })
        qc.invalidateQueries({ queryKey: ['sub_item_oos'], exact: false })
      })
      .subscribe()

    const mappingsChannel = supabase
      .channel('rt-service-mappings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_mappings' }, () => {
        qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY })
      })
      .subscribe()

    const chainsChannel = supabase
      .channel('rt-chains')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chains' }, () => {
        qc.invalidateQueries({ queryKey: CHAINS_KEY })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(bookingsChannel)
      supabase.removeChannel(equipmentChannel)
      supabase.removeChannel(mappingsChannel)
      supabase.removeChannel(chainsChannel)
    }
  }, [qc])
}
