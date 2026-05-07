import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import {
  computeDay,
  resolveBufferMin,
  isOosActiveOn,
  DEFAULT_DURATION_MIN,
  type WizardDay,
  type WizardBooking,
  type WizardBookingItem,
  type WizardChain,
  type WizardOosRecord,
} from '@/lib/utils/wizardSlots'

export type WizardAvailabilityResponse = {
  item: {
    id: string
    name: string
    setup_min: number
    cleanup_min: number
    total_qty: number
  }
  month: { year: number; month: number }
  days: WizardDay[]
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function parseStrictInt(s: string | null | undefined): number {
  if (s === null || s === undefined || !/^\d+$/.test(s)) return NaN
  return parseInt(s, 10)
}

export async function GET(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const url = new URL(request.url)
  const itemId = url.searchParams.get('item_id')
  const quantityRaw = url.searchParams.get('quantity')
  const zip = url.searchParams.get('zip_code') ?? ''
  const yearRaw = url.searchParams.get('year')
  const monthRaw = url.searchParams.get('month')
  const durationRaw = url.searchParams.get('duration_minutes')
  const preferredStart = url.searchParams.get('preferred_start') ?? undefined

  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  const quantity = parseStrictInt(quantityRaw)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
  }
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'zip_code must be 5 digits' }, { status: 400 })
  }
  const year = parseStrictInt(yearRaw)
  const month = parseStrictInt(monthRaw)
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'year out of range' }, { status: 400 })
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 })
  }
  const durationMin = durationRaw ? parseStrictInt(durationRaw) : DEFAULT_DURATION_MIN
  if (!Number.isInteger(durationMin) || durationMin < 30 || durationMin > 480) {
    return NextResponse.json({ error: 'duration_minutes out of range' }, { status: 400 })
  }
  if (preferredStart && !/^\d{2}:\d{2}$/.test(preferredStart)) {
    return NextResponse.json({ error: 'preferred_start must be HH:MM' }, { status: 400 })
  }

  const supabase = await createClient()
  const monthStart = toIsoDate(year, month, 1)
  const monthEnd = toIsoDate(year, month, daysInMonth(year, month))

  const [equipmentRes, bookingsRes, bookingItemsRes, chainsRes, oosRes] = await Promise.all([
    supabase.from('equipment').select('id, name, total_qty, custom_setup_min, custom_cleanup_min').eq('id', itemId).single(),
    // Captures every booking that overlaps the requested month:
    //   • event_date within the month                                 (branch 1)
    //   • end_date within or after monthStart, event_date <= monthEnd (branch 2 — multi-day spanning)
    // Limitation: linked drop-off/pickup pairs (separate rows, end_date null on each)
    // where one half lies outside the month are not joined here. Wizard accuracy
    // at month boundaries for those bookings is approximate.
    supabase
      .from('bookings')
      .select('id, chain, event_date, end_date, start_time, end_time, status, event_type, linked_booking_id, customer_name')
      .or(`and(event_date.gte.${monthStart},event_date.lte.${monthEnd}),and(end_date.gte.${monthStart},event_date.lte.${monthEnd})`)
      .neq('status', 'canceled'),
    // Fetched globally for itemId; bookings outside the month are filtered out
    // at scoring time via activeBookings. Acceptable at current data volumes.
    supabase.from('booking_items').select('booking_id, item_id, qty').eq('item_id', itemId),
    supabase.from('chains').select('id, name, color').eq('is_active', true).order('name'),
    supabase.from('equipment_oos').select('quantity, created_at, expected_return_date, returned_at').eq('equipment_id', itemId),
  ])

  if (equipmentRes.error || !equipmentRes.data) {
    return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
  }
  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 })
  if (bookingItemsRes.error) return NextResponse.json({ error: bookingItemsRes.error.message }, { status: 500 })
  if (chainsRes.error) return NextResponse.json({ error: chainsRes.error.message }, { status: 500 })
  if (oosRes.error) return NextResponse.json({ error: oosRes.error.message }, { status: 500 })

  const equipment = equipmentRes.data
  const setupMin = resolveBufferMin(equipment.custom_setup_min)
  const cleanupMin = resolveBufferMin(equipment.custom_cleanup_min)

  const bookings: WizardBooking[] = (bookingsRes.data ?? []) as WizardBooking[]
  const bookingItems: WizardBookingItem[] = (bookingItemsRes.data ?? []).map(bi => ({
    booking_id: bi.booking_id,
    item_id: bi.item_id,
    qty: bi.qty,
  }))
  const chains: WizardChain[] = ((chainsRes.data ?? []) as WizardChain[])
    .filter(c => c.name.trim().toLowerCase() !== 'arena pickup')
  const oosRecords: WizardOosRecord[] = (oosRes.data ?? []) as WizardOosRecord[]

  const totalDays = daysInMonth(year, month)
  const days: WizardDay[] = []

  // duration_minutes here represents the EVENT TIME ONLY. computeDay adds
  // setupMin + TRAVEL_BUFFER_MIN before and cleanupMin + TRAVEL_BUFFER_MIN
  // after to derive the occupied window for conflict and inventory checks.
  // The UI displays event start/end only — never the full occupied window.
  for (let d = 1; d <= totalDays; d++) {
    const date = toIsoDate(year, month, d)
    const activeOosCount = oosRecords
      .filter(o => isOosActiveOn(o, date))
      .reduce((sum, o) => sum + o.quantity, 0)

    days.push(computeDay({
      date,
      itemId,
      setupMin,
      cleanupMin,
      totalQty: equipment.total_qty,
      requestedQty: quantity,
      durationMin,
      preferredStart,
      activeOosCount,
      bookings,
      bookingItems,
      chains,
    }))
  }

  const response: WizardAvailabilityResponse = {
    item: {
      id: equipment.id,
      name: equipment.name,
      setup_min: setupMin,
      cleanup_min: cleanupMin,
      total_qty: equipment.total_qty,
    },
    month: { year, month },
    days,
  }

  return NextResponse.json(response)
}
