import type { Database } from '@/lib/types/database.types'
import { isBookingActiveOnDate } from '@/lib/utils/availability'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type EventType = Database['public']['Enums']['event_type']

export interface PackingListRow {
  itemId: string
  name: string
  qty: number
  isSubItem: boolean
  parentItemId: string | null
}

const DROP_TYPES: EventType[] = ['dropoff', 'willcall']
const COORD_TYPES: EventType[] = ['coordinated', 'pickup']

export function calculatePackingList(
  bookings: BookingRow[],
  bookingItems: BookingItemRow[],
  equipment: EquipmentRow[],
  subItems: SubItemRow[],
  chain: string,
  date: string
): PackingListRow[] {
  // Step 1: Filter to active bookings for the target chain and date
  const activeBookings = bookings.filter(
    b => b.chain === chain && isBookingActiveOnDate(b, date)
  )

  // Step 2: Separate into drops and coords
  const dropIds = new Set(activeBookings.filter(b => DROP_TYPES.includes(b.event_type)).map(b => b.id))
  const coordIds = new Set(activeBookings.filter(b => COORD_TYPES.includes(b.event_type)).map(b => b.id))
  const allActiveIds = new Set(activeBookings.map(b => b.id))

  // Step 3: Filter booking_items to active bookings only
  const activeItems = bookingItems.filter(bi => allActiveIds.has(bi.booking_id))

  // Step 4: Per item_id — compute dropQty (sum) and coordQty (max)
  const dropQtyMap = new Map<string, number>()
  const coordQtyMap = new Map<string, number>()

  for (const bi of activeItems) {
    if (dropIds.has(bi.booking_id)) {
      dropQtyMap.set(bi.item_id, (dropQtyMap.get(bi.item_id) ?? 0) + bi.qty)
    }
    if (coordIds.has(bi.booking_id)) {
      const existing = coordQtyMap.get(bi.item_id) ?? 0
      coordQtyMap.set(bi.item_id, Math.max(existing, bi.qty))
    }
  }

  // Step 5: Collect all item IDs that appear in any active booking
  const allItemIds = new Set([...dropQtyMap.keys(), ...coordQtyMap.keys()])

  // Step 6: Build name lookup maps
  const equipmentMap = new Map(equipment.map(e => [e.id, e.name]))
  const subItemMap = new Map(subItems.map(s => [s.id, s.name]))

  // Step 7: Build a map of sub-item → parent_item_id from bookingItems
  const parentMap = new Map<string, string | null>()
  const isSubMap = new Map<string, boolean>()
  for (const bi of bookingItems) {
    parentMap.set(bi.item_id, bi.parent_item_id)
    isSubMap.set(bi.item_id, bi.is_sub_item)
  }

  // Step 8: Assemble results
  const rows: PackingListRow[] = []
  for (const itemId of allItemIds) {
    const dropQty = dropQtyMap.get(itemId) ?? 0
    const coordQty = coordQtyMap.get(itemId) ?? 0
    const qty = dropQty + coordQty
    if (qty <= 0) continue

    const name = equipmentMap.get(itemId) ?? subItemMap.get(itemId) ?? itemId
    const isSubItem = isSubMap.get(itemId) ?? false
    const parentItemId = parentMap.get(itemId) ?? null

    rows.push({ itemId, name, qty, isSubItem, parentItemId })
  }

  // Step 9: Sort by name
  rows.sort((a, b) => a.name.localeCompare(b.name))

  return rows
}
