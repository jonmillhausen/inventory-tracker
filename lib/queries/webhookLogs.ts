'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']
type WebhookResultEnum = Database['public']['Enums']['webhook_result']

export const WEBHOOK_LOGS_KEY = ['webhook_logs'] as const

export type WebhookResultFilter = NonNullable<WebhookResultEnum> | 'all'

// Filter is applied server-side so "latest 200" means the latest 200 OF THAT
// RESULT — unmapped/error rows no longer scroll out of a global 200-row
// window within days (audit P0-1).
export function useWebhookLogs(initialData?: WebhookLogRow[], resultFilter: WebhookResultFilter = 'all') {
  return useQuery({
    queryKey: [...WEBHOOK_LOGS_KEY, resultFilter],
    queryFn: async (): Promise<WebhookLogRow[]> => {
      const supabase = createClient()
      let query = supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200)
      if (resultFilter !== 'all') {
        query = query.eq('result', resultFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return data as WebhookLogRow[]
    },
    initialData: resultFilter === 'all' ? initialData : undefined,
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
