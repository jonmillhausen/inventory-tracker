'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export const BOOKINGS_KEY = ['bookings'] as const

export interface BookingsData {
  bookings: BookingRow[]
  bookingItems: BookingItemRow[]
}

export function useBookings(initialData?: BookingsData) {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async (): Promise<BookingsData> => {
      const supabase = createClient()
      const [{ data: bookings, error: bErr }, { data: bookingItems, error: biErr }] =
        await Promise.all([
          supabase.from('bookings').select('*').neq('status', 'canceled'),
          supabase.from('booking_items').select('*'),
        ])
      if (bErr) throw bErr
      if (biErr) throw biErr
      return {
        bookings: bookings as BookingRow[],
        bookingItems: bookingItems as BookingItemRow[],
      }
    },
    initialData,
  })
}
