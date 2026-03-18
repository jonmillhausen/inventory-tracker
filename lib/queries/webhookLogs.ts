'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']

export const WEBHOOK_LOGS_KEY = ['webhook_logs'] as const

export function useWebhookLogs(initialData?: WebhookLogRow[]) {
  return useQuery({
    queryKey: WEBHOOK_LOGS_KEY,
    queryFn: async (): Promise<WebhookLogRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as WebhookLogRow[]
    },
    initialData,
  })
}

export function useWebhookLogForBooking(bookingId: string | null) {
  return useQuery({
    queryKey: [...WEBHOOK_LOGS_KEY, 'booking', bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<WebhookLogRow | null> => {
      if (!bookingId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('booking_id', bookingId)
        .order('received_at', { ascending: false })
        .limit(1)
        .single()
      if (error?.code === 'PGRST116') return null
      if (error) throw error
      return data as WebhookLogRow
    },
  })
}
