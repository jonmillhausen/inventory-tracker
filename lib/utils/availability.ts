import type { Database, BookingStatus } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

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
  booked_qty: number
  available_qty: number
  sub_items: AvailabilitySubRow[]
}

const INACTIVE_STATUSES: BookingStatus[] = ['canceled']

export function isBookingActiveOnDate(booking: BookingRow, date: string): boolean {
  if (INACTIVE_STATUSES.includes(booking.status)) return false
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
  const activeBookingIds = new Set(
    bookings.filter(b => isBookingActiveOnDate(b, date)).map(b => b.id)
  )

  // Sum booked qty per item_id across all active bookings
  const bookedByItemId = new Map<string, number>()
  for (const item of bookingItems) {
    if (activeBookingIds.has(item.booking_id)) {
      bookedByItemId.set(item.item_id, (bookedByItemId.get(item.item_id) ?? 0) + item.qty)
    }
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
      const booked = bookedByItemId.get(e.id) ?? 0
      const available = Math.max(0, e.total_qty - e.out_of_service - booked)

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
        booked_qty: booked,
        available_qty: available,
        sub_items,
      }
    })
}
