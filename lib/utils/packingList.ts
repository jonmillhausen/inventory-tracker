import type { Database } from '@/lib/types/database.types'
import { isBookingActiveOnDate } from '@/lib/utils/availability'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']
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

// Tier multipliers for sub-item quantities based on parent equipment name slug.
// Tier 1 (per 10): floor(qty/10), min 1
// Tier 2 (per 20): floor(qty/20), min 1
// Tier 3 (default): qty as-is
const TIER1_SLUGS = new Set(['bubble_ball', 'elite_laser_tag', 'arrow_tag'])
const TIER2_SLUGS = new Set(['gel_tag', 'laser_tag_lite'])

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function getEffectiveParentQty(itemName: string, qty: number): number {
  if (qty <= 0) return 0
  const slug = slugify(itemName)
  if (TIER1_SLUGS.has(slug)) return Math.max(1, Math.floor(qty / 10))
  if (TIER2_SLUGS.has(slug)) return Math.max(1, Math.floor(qty / 20))
  return qty
}

export function calculatePackingList(
  bookings: BookingRow[],
  bookingItems: BookingItemRow[],
  equipment: EquipmentRow[],
  subItems: SubItemRow[],
  subItemLinks: SubItemLinkRow[],
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

  // Step 3: Filter to parent equipment items only (sub-items are derived from links)
  const activeItems = bookingItems.filter(bi => allActiveIds.has(bi.booking_id) && !bi.is_sub_item)

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

  // Step 5: Collect all parent item IDs with non-zero qty
  const allItemIds = new Set([...dropQtyMap.keys(), ...coordQtyMap.keys()])

  // Step 6: Build equipment lookup
  const equipmentMap = new Map(equipment.map(e => [e.id, e]))

  // Step 7: Assemble parent item rows
  const rows: PackingListRow[] = []
  for (const itemId of allItemIds) {
    const dropQty = dropQtyMap.get(itemId) ?? 0
    const coordQty = coordQtyMap.get(itemId) ?? 0
    const qty = dropQty + coordQty
    if (qty <= 0) continue
    const name = equipmentMap.get(itemId)?.name ?? itemId
    rows.push({ itemId, name, qty, isSubItem: false, parentItemId: null })
  }

  // Step 8: Derive sub-items from equipment_sub_item_links.
  //
  // For each link (parent → sub, loadout_qty):
  //   drop contribution  = parentDropQty  × loadout_qty  (summed across all linked parents)
  //   coord contribution = parentCoordQty × loadout_qty  (max across all linked parents)
  //
  // The primary parent for display grouping is the first contributing parent encountered.
  const subDropQtyMap = new Map<string, number>()
  const subCoordQtyMap = new Map<string, number>()
  const subPrimaryParentMap = new Map<string, string>()

  for (const link of subItemLinks) {
    const parentDropQty = dropQtyMap.get(link.parent_id) ?? 0
    const parentCoordQty = coordQtyMap.get(link.parent_id) ?? 0
    const parentName = equipmentMap.get(link.parent_id)?.name ?? ''

    const dropContrib = getEffectiveParentQty(parentName, parentDropQty) * link.loadout_qty
    const coordContrib = getEffectiveParentQty(parentName, parentCoordQty) * link.loadout_qty

    if (dropContrib > 0) {
      subDropQtyMap.set(link.sub_item_id, (subDropQtyMap.get(link.sub_item_id) ?? 0) + dropContrib)
      if (!subPrimaryParentMap.has(link.sub_item_id)) {
        subPrimaryParentMap.set(link.sub_item_id, link.parent_id)
      }
    }
    if (coordContrib > 0) {
      const existing = subCoordQtyMap.get(link.sub_item_id) ?? 0
      if (coordContrib > existing) {
        subCoordQtyMap.set(link.sub_item_id, coordContrib)
      }
      if (!subPrimaryParentMap.has(link.sub_item_id)) {
        subPrimaryParentMap.set(link.sub_item_id, link.parent_id)
      }
    }
  }

  const subItemMap = new Map(subItems.map(s => [s.id, s]))
  const allSubItemIds = new Set([...subDropQtyMap.keys(), ...subCoordQtyMap.keys()])

  for (const subItemId of allSubItemIds) {
    const sub = subItemMap.get(subItemId)
    if (!sub || !sub.is_active) continue
    const qty = (subDropQtyMap.get(subItemId) ?? 0) + (subCoordQtyMap.get(subItemId) ?? 0)
    if (qty <= 0) continue
    const parentItemId = subPrimaryParentMap.get(subItemId) ?? null
    rows.push({ itemId: subItemId, name: sub.name, qty, isSubItem: true, parentItemId })
  }

  // Step 9: Sort by name
  rows.sort((a, b) => a.name.localeCompare(b.name))

  return rows
}
