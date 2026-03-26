import type { Database, BookingStatus } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export type AvailabilityStatus = 'available' | 'low' | 'critical' | 'sold_out' | 'overbooked'

export interface AvailabilitySubRow {
  id: string
  name: string
  total_qty: number
  out_of_service: number
  issue_flag: number
  booked_qty: number
  available_qty: number
}

export interface AvailabilityRow {
  id: string
  name: string
  total_qty: number
  out_of_service: number
  issue_flag: number
  booked_qty: number       // backward compat (= total_booked)
  available_qty: number    // Math.max(0, remaining) for backward compat
  chain_qty: Record<string, number>  // per-chain booked qty, key = chain name
  total_booked: number     // sum across all chains
  remaining: number        // total_qty - out_of_service - total_booked (can be negative)
  status: AvailabilityStatus
  sub_items: AvailabilitySubRow[]
}

export type ChainBooking = {
  id: string
  customer_name: string
  address: string
  start_time: string | null
  end_time: string | null
  zenbooker_job_id: string | null
  items: Array<{ item_id: string; qty: number }>
}

const INACTIVE_STATUSES: BookingStatus[] = ['canceled']

// PICKUP event types — the far end of a linked drop-off/pickup span.
const PICKUP_EVENT_TYPES = new Set<string>(['pickup', 'arena_pickup'])

/**
 * Returns true if the booking should count against availability on the given
 * date (YYYY-MM-DD).
 *
 * When a bookingsById map is provided, drop-off bookings that are linked to a
 * pickup/arena_pickup booking have their effective date range extended from
 * their own event_date through the linked pickup's event_date.  This ensures
 * that equipment loaned for a multi-day period (e.g. drop-off 4/1, pickup 4/3)
 * is correctly shown as blocked on the intermediate day 4/2.
 *
 * Time-precision note: edge days (drop-off day and pickup day) are treated as
 * fully blocked.  Sub-day time-window checking would require a queryTime
 * parameter and is a future enhancement.
 */
export function isBookingActiveOnDate(
  booking: BookingRow,
  date: string,
  bookingsById?: Map<string, BookingRow>,
): boolean {
  if (INACTIVE_STATUSES.includes(booking.status)) return false
  if (!booking.event_date) return false

  // If this booking is linked to a pickup, span the active range to the
  // pickup's event_date so intermediate days are correctly blocked.
  if (booking.linked_booking_id && bookingsById) {
    const linked = bookingsById.get(booking.linked_booking_id)
    if (linked?.event_date && PICKUP_EVENT_TYPES.has(linked.event_type)) {
      return booking.event_date <= date && date <= linked.event_date
    }
  }

  const end = booking.end_date ?? booking.event_date
  return booking.event_date <= date && date <= end
}

export function calculateAvailability(
  equipment: EquipmentRow[],
  subItems: SubItemRow[],
  bookings: BookingRow[],
  bookingItems: BookingItemRow[],
  date: string
): AvailabilityRow[] {
  const bookingsById = new Map(bookings.map(b => [b.id, b]))

  // Build map from booking.id → booking.chain for active bookings
  const bookingChain = new Map<string, string | null>()
  for (const b of bookings) {
    if (isBookingActiveOnDate(b, date, bookingsById)) {
      bookingChain.set(b.id, b.chain)
    }
  }

  const activeBookingIds = new Set(bookingChain.keys())

  // Sum booked qty per item_id across all active bookings (overall)
  const bookedByItemId = new Map<string, number>()
  // Per-chain booked qty: item_id → (chainName → qty)
  const chainQtyByItemId = new Map<string, Map<string, number>>()

  for (const item of bookingItems) {
    if (!activeBookingIds.has(item.booking_id)) continue

    // Overall
    bookedByItemId.set(item.item_id, (bookedByItemId.get(item.item_id) ?? 0) + item.qty)

    // Per-chain
    const chainName = bookingChain.get(item.booking_id)
    const key = chainName ?? 'Unassigned'
    if (!chainQtyByItemId.has(item.item_id)) {
      chainQtyByItemId.set(item.item_id, new Map())
    }
    const chainMap = chainQtyByItemId.get(item.item_id)!
    chainMap.set(key, (chainMap.get(key) ?? 0) + item.qty)
  }

  // Group active sub-items by parent
  const subsByParent = new Map<string, SubItemRow[]>()
  for (const sub of subItems) {
    if (!sub.is_active) continue
    const list = subsByParent.get(sub.parent_id) ?? []
    list.push(sub)
    subsByParent.set(sub.parent_id, list)
  }

  return equipment
    .filter(e => e.is_active)
    .map(e => {
      const total_booked = bookedByItemId.get(e.id) ?? 0
      const remaining = e.total_qty - e.out_of_service - total_booked
      const available_qty = Math.max(0, remaining)

      // Build chain_qty record
      const chainMap = chainQtyByItemId.get(e.id)
      const chain_qty: Record<string, number> = {}
      if (chainMap) {
        for (const [k, v] of chainMap) {
          chain_qty[k] = v
        }
      }

      // Status
      let status: AvailabilityStatus
      if (remaining < 0) {
        status = 'overbooked'
      } else if (remaining === 0) {
        status = 'sold_out'
      } else if (e.total_qty > 0 && remaining / e.total_qty <= 0.1) {
        status = 'critical'
      } else if (e.total_qty > 0 && remaining / e.total_qty <= 0.3) {
        status = 'low'
      } else {
        status = 'available'
      }

      const sub_items = (subsByParent.get(e.id) ?? []).map(s => {
        const subBooked = bookedByItemId.get(s.id) ?? 0
        return {
          id: s.id,
          name: s.name,
          total_qty: s.total_qty,
          out_of_service: s.out_of_service,
          issue_flag: s.issue_flag,
          booked_qty: subBooked,
          available_qty: Math.max(0, s.total_qty - s.out_of_service - subBooked),
        }
      })

      return {
        id: e.id,
        name: e.name,
        total_qty: e.total_qty,
        out_of_service: e.out_of_service,
        issue_flag: e.issue_flag,
        booked_qty: total_booked,
        available_qty,
        chain_qty,
        total_booked,
        remaining,
        status,
        sub_items,
      }
    })
}

// Returns min start_time / max end_time for each chain on the given date
export function computeChainTimes(
  bookings: BookingRow[],
  date: string
): Record<string, { start: string; end: string }> {
  const result: Record<string, { start: string; end: string }> = {}
  const bookingsById = new Map(bookings.map(b => [b.id, b]))

  for (const b of bookings) {
    if (!isBookingActiveOnDate(b, date, bookingsById)) continue
    if (!b.chain || b.chain === 'Unassigned') continue

    if (!result[b.chain]) {
      result[b.chain] = { start: b.start_time ?? '', end: b.end_time ?? '' }
    } else {
      if (b.start_time && b.start_time < result[b.chain].start) result[b.chain].start = b.start_time
      if (b.end_time && b.end_time > result[b.chain].end) result[b.chain].end = b.end_time
    }
  }

  return result
}

// Returns aggregate stats for the stat cards
export function computeStats(
  rows: AvailabilityRow[],
  bookings: BookingRow[],
  date: string
): { events: number; chains: number; soldOut: number; overbooked: number; low: number } {
  const bookingsById = new Map(bookings.map(b => [b.id, b]))
  const activeBookings = bookings.filter(b => isBookingActiveOnDate(b, date, bookingsById))
  const events = activeBookings.length

  const chainNames = new Set<string>()
  for (const b of activeBookings) {
    if (b.chain && b.chain !== 'Unassigned') {
      chainNames.add(b.chain)
    }
  }
  const chains = chainNames.size

  const soldOut = rows.filter(r => r.status === 'sold_out').length
  const overbooked = rows.filter(r => r.status === 'overbooked').length
  const low = rows.filter(r => r.status === 'low' || r.status === 'critical').length

  return { events, chains, soldOut, overbooked, low }
}

// Returns bookings for a given chain on a date (for chain popup)
export function getChainBookings(
  bookings: BookingRow[],
  bookingItems: BookingItemRow[],
  date: string,
  chain: string  // 'Unassigned' means chain IS null
): ChainBooking[] {
  const bookingsById = new Map(bookings.map(b => [b.id, b]))
  const filtered = bookings.filter(b => {
    if (!isBookingActiveOnDate(b, date, bookingsById)) return false
    if (chain === 'Unassigned') {
      return b.chain === null || b.chain === 'Unassigned'
    }
    return b.chain === chain
  })

  const bookingItemsByBookingId = new Map<string, Array<{ item_id: string; qty: number }>>()
  for (const item of bookingItems) {
    if (!bookingItemsByBookingId.has(item.booking_id)) {
      bookingItemsByBookingId.set(item.booking_id, [])
    }
    bookingItemsByBookingId.get(item.booking_id)!.push({ item_id: item.item_id, qty: item.qty })
  }

  return filtered
    .map(b => ({
      id: b.id,
      customer_name: b.customer_name,
      address: b.address,
      start_time: b.start_time,
      end_time: b.end_time,
      zenbooker_job_id: b.zenbooker_job_id ?? null,
      items: bookingItemsByBookingId.get(b.id) ?? [],
    }))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
}
