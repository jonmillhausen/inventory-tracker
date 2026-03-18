'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export const BOOKINGS_KEY = ['bookings'] as const

export interface BookingsData {
  bookings: BookingRow[]
  bookingItems: BookingItemRow[]
}

// NOTE: The canceled filter has been intentionally removed.
// calculateAvailability() already excludes canceled bookings via isBookingActiveOnDate().
// The Bookings tab needs to display canceled bookings (with visual dimming).
export function useBookings(initialData?: BookingsData) {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async (): Promise<BookingsData> => {
      const supabase = createClient()
      const [{ data: bookings, error: bErr }, { data: bookingItems, error: biErr }] =
        await Promise.all([
          supabase.from('bookings').select('*').order('event_date', { ascending: false }),
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

export interface BookingItemInput {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export interface CreateBookingInput {
  customer_name: string
  event_date: string
  end_date?: string | null
  start_time: string
  end_time: string
  address: string
  event_type: string
  chain?: string | null
  notes?: string
  items: BookingItemInput[]
}

export interface UpdateBookingInput {
  id: string
  customer_name?: string
  event_date?: string
  end_date?: string | null
  start_time?: string
  end_time?: string
  address?: string
  event_type?: string
  chain?: string | null
  status?: string
  notes?: string
  items?: BookingItemInput[]
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateBookingInput) => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateBookingInput) => {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useDeleteBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useAssignChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, chain }: { id: string; chain: string | null }) => {
      const res = await fetch(`/api/bookings/${id}/assign-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}
