import { calculatePackingList } from '@/lib/utils/packingList'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

const BASE_BOOKING: BookingRow = {
  id: 'b1',
  zenbooker_job_id: 'job1',
  customer_name: 'Alice',
  event_date: '2026-04-01',
  end_date: null,
  start_time: '10:00',
  end_time: '14:00',
  chain: 'chain_1',
  status: 'confirmed',
  event_type: 'dropoff',
  source: 'manual',
  address: '123 Main St',
  notes: '',
  linked_booking_id: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
}

const BASE_EQUIPMENT: EquipmentRow = {
  id: 'eq1',
  name: 'Bounce House',
  total_qty: 5,
  out_of_service: 0,
  issue_flag: 0,
  is_active: true,
  custom_setup_min: null,
  custom_cleanup_min: null,
  categories: [],
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
}

const BASE_SUB_ITEM: SubItemRow = {
  id: 'sub1',
  parent_id: 'eq1',
  name: 'Blower',
  total_qty: 5,
  out_of_service: 0,
  issue_flag: 0,
  is_active: true,
}

describe('calculatePackingList', () => {
  test('empty bookings returns empty result', () => {
    const result = calculatePackingList([], [], [BASE_EQUIPMENT], [BASE_SUB_ITEM], [], 'chain_1', '2026-04-01')
    expect(result).toEqual([])
  })

  test('single dropoff event sums items', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ itemId: 'eq1', name: 'Bounce House', qty: 3, isSubItem: false, parentItemId: null })
  })

  test('two dropoff events for same item are additive (2+3=5)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'dropoff' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(5)
  })

  test('two coordinated events for same item use max (2,3=3)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'coordinated' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'coordinated' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(3)
  })

  test('willcall is treated same as dropoff (additive)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'willcall' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'willcall' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(4)
  })

  test('pickup is treated same as coordinated (max)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'pickup' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'pickup' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 1, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 4, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(4)
  })

  test('mix of dropoff + coordinated: drop_sum + coord_max', () => {
    const drop1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'dropoff' }
    const drop2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'dropoff' }
    const coord1: BookingRow = { ...BASE_BOOKING, id: 'b3', event_type: 'coordinated' }
    const coord2: BookingRow = { ...BASE_BOOKING, id: 'b4', event_type: 'coordinated' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
      { id: 'bi3', booking_id: 'b3', item_id: 'eq1', qty: 1, is_sub_item: false, parent_item_id: null },
      { id: 'bi4', booking_id: 'b4', item_id: 'eq1', qty: 4, is_sub_item: false, parent_item_id: null },
    ]
    // dropSum = 2+3=5, coordMax = max(1,4)=4, total = 9
    const result = calculatePackingList([drop1, drop2, coord1, coord2], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(9)
  })

  test('ignores bookings for a different chain', () => {
    const booking: BookingRow = { ...BASE_BOOKING, chain: 'chain_2' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('ignores canceled bookings', () => {
    const booking: BookingRow = { ...BASE_BOOKING, status: 'canceled' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('ignores bookings outside selected date range', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_date: '2026-04-10', end_date: null }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('includes booking when date falls within multi-day range', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_date: '2026-03-30', end_date: '2026-04-03' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(2)
  })

  test('results sorted by name', () => {
    const eq2: EquipmentRow = { ...BASE_EQUIPMENT, id: 'eq2', name: 'Archery Set' }
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 1, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b1', item_id: 'eq2', qty: 1, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT, eq2], [], [], 'chain_1', '2026-04-01')
    expect(result[0].name).toBe('Archery Set')
    expect(result[1].name).toBe('Bounce House')
  })

  test('sub-items derived from links with loadout_qty=1', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
    ]
    const links: SubItemLinkRow[] = [
      { id: 'lnk1', sub_item_id: 'sub1', parent_id: 'eq1', loadout_qty: 1 },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [BASE_SUB_ITEM], links, 'chain_1', '2026-04-01')
    const sub = result.find(r => r.itemId === 'sub1')
    expect(sub).toMatchObject({ itemId: 'sub1', name: 'Blower', qty: 2, isSubItem: true, parentItemId: 'eq1' })
  })

  test('sub-item loadout_qty multiplies parent quantity', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const links: SubItemLinkRow[] = [
      { id: 'lnk1', sub_item_id: 'sub1', parent_id: 'eq1', loadout_qty: 2 },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [BASE_SUB_ITEM], links, 'chain_1', '2026-04-01')
    const sub = result.find(r => r.itemId === 'sub1')
    expect(sub?.qty).toBe(6)
  })

  test('sub-item linked to multiple parents accumulates across parents', () => {
    const eq2: EquipmentRow = { ...BASE_EQUIPMENT, id: 'eq2', name: 'Water Slide' }
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'dropoff' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq2', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const links: SubItemLinkRow[] = [
      { id: 'lnk1', sub_item_id: 'sub1', parent_id: 'eq1', loadout_qty: 1 },
      { id: 'lnk2', sub_item_id: 'sub1', parent_id: 'eq2', loadout_qty: 1 },
    ]
    // drop: 2×1 + 3×1 = 5
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT, eq2], [BASE_SUB_ITEM], links, 'chain_1', '2026-04-01')
    const sub = result.find(r => r.itemId === 'sub1')
    expect(sub?.qty).toBe(5)
  })

  test('items with qty 0 are excluded from results', () => {
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 0, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('items with negative qty are excluded from results', () => {
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: -1, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })
})
