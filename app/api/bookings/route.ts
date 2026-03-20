import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    customer_name,
    event_date,
    end_date = null,
    start_time,
    end_time,
    address,
    event_type,
    chain = null,
    notes = '',
    items = [],
  } = body as Record<string, unknown>

  // Validate required fields
  if (!customer_name || typeof customer_name !== 'string') {
    return NextResponse.json({ error: 'customer_name is required' }, { status: 400 })
  }
  if (!event_date || typeof event_date !== 'string') {
    return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
  }
  if (!start_time || typeof start_time !== 'string') {
    return NextResponse.json({ error: 'start_time is required' }, { status: 400 })
  }
  if (!end_time || typeof end_time !== 'string') {
    return NextResponse.json({ error: 'end_time is required' }, { status: 400 })
  }
  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }
  const VALID_EVENT_TYPES = ['coordinated', 'dropoff', 'pickup', 'willcall', 'arena_pickup']
  if (!event_type || typeof event_type !== 'string' || !VALID_EVENT_TYPES.includes(event_type)) {
    return NextResponse.json({ error: 'event_type must be one of: coordinated, dropoff, pickup, willcall, arena_pickup' }, { status: 400 })
  }

  // Insert booking
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      customer_name: customer_name as string,
      event_date: event_date as string,
      end_date: end_date as string | null,
      start_time: start_time as string,
      end_time: end_time as string,
      address: address as string,
      event_type: event_type as 'coordinated' | 'dropoff' | 'pickup' | 'willcall',
      chain: chain as string | null,
      notes: (notes as string) || '',
      status: 'confirmed',
      source: 'manual',
      zenbooker_job_id: null, // manual bookings have no Zenbooker ID; null satisfies UNIQUE (multiple nulls allowed in Postgres)
    })
    .select()
    .single()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  const booking = bookingData as BookingRow

  // Batch insert booking_items (only items with qty > 0)
  const validItems = (items as Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }>)
    .filter(item => item.qty > 0)

  if (validItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('booking_items')
      .insert(
        validItems.map(item => ({
          booking_id: booking.id,
          item_id: item.item_id,
          qty: item.qty,
          is_sub_item: item.is_sub_item,
          parent_item_id: item.parent_item_id ?? null,
        }))
      )
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  return NextResponse.json(booking, { status: 201 })
}
