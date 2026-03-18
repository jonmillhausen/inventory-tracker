'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type ChainRow = Database['public']['Tables']['chains']['Row']

export const CHAINS_KEY = ['chains'] as const

export function useChains(initialData?: ChainRow[]) {
  return useQuery({
    queryKey: CHAINS_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('chains')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as ChainRow[]
    },
    initialData,
  })
}
