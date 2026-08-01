import { fetchAll } from '@/lib/supabase/fetchAll'
import { calculateAvailability } from '@/lib/utils/availability'
import type {
  Database,
  BookingStatus,
  BookingSource,
  EventType,
} from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

// PostgREST enforces a server-side max-rows cap (1000 on this project).  A
// request for a wider range still comes back truncated to the cap — which is
// exactly how 384 booking_items rows went missing from every aggregation.
const SERVER_MAX_ROWS = 1000

/**
 * Stands in for `supabase.from(t).select('*').range(from, to)`, reproducing
 * PostgREST's cap: never returns more than SERVER_MAX_ROWS rows, however wide
 * the requested range.
 */
function makeCappedTable<T>(rows: T[]) {
  const calls: Array<{ from: number; to: number }> = []
  const query = (from: number, to: number) => {
    calls.push({ from, to })
    const width = Math.min(to - from + 1, SERVER_MAX_ROWS)
    return Promise.resolve({ data: rows.slice(from, from + width), error: null })
  }
  return { query, calls }
}

const makeEquipment = (overrides: Partial<EquipmentRow> = {}): EquipmentRow => ({
  id: 'foam_machine',
  name: 'Foam Machine',
  total_qty: 3,
  out_of_service: 0,
  issue_flag: 0,
  is_active: true,
  custom_setup_min: null,
  custom_cleanup_min: null,
  categories: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeBooking = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: 'booking-1',
  zenbooker_job_id: 'zb-1',
  customer_name: 'Alice',
  event_date: '2026-08-01',
  end_date: null,
  start_time: '18:00',
  end_time: '19:30',
  chain: null,
  status: 'confirmed' as BookingStatus,
  event_type: 'coordinated' as EventType,
  source: 'webhook' as BookingSource,
  address: '123 Main St',
  notes: '',
  linked_booking_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeBookingItem = (overrides: Partial<BookingItemRow> = {}): BookingItemRow => ({
  id: 'bi-1',
  booking_id: 'booking-1',
  item_id: 'foam_machine',
  qty: 1,
  is_sub_item: false,
  parent_item_id: null,
  ...overrides,
})

describe('fetchAll', () => {
  it('pages past the 1000-row server cap and returns every row', async () => {
    // Live shape on 2026-08-01: booking_items held 1384 rows.
    const rows = Array.from({ length: 1384 }, (_, i) => ({ id: `row-${i}` }))
    const { query, calls } = makeCappedTable(rows)

    const { data, error } = await fetchAll(query)

    expect(error).toBeNull()
    expect(data).toHaveLength(1384)
    expect(data[0]).toEqual({ id: 'row-0' })
    expect(data[1383]).toEqual({ id: 'row-1383' })
    // Two full pages, then a short third page ends the loop.
    expect(calls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ])
  })

  it('a single unbounded read silently truncates — the regression this guards', async () => {
    const rows = Array.from({ length: 1384 }, (_, i) => ({ id: `row-${i}` }))
    const { query } = makeCappedTable(rows)

    const { data } = await query(0, 1_000_000)

    expect(data).toHaveLength(1000)
  })

  it('stops on a short final page without an extra request', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `row-${i}` }))
    const { query, calls } = makeCappedTable(rows)

    const { data } = await fetchAll(query)

    expect(data).toHaveLength(1500)
    expect(calls).toHaveLength(2)
  })

  it('makes exactly one extra request when the total is an exact multiple of the page size', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: `row-${i}` }))
    const { query, calls } = makeCappedTable(rows)

    const { data } = await fetchAll(query)

    expect(data).toHaveLength(2000)
    expect(calls).toHaveLength(3)
  })

  it('handles an empty table in one request', async () => {
    const { query, calls } = makeCappedTable([])

    const { data, error } = await fetchAll(query)

    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('surfaces an error from the first page and stops paging', async () => {
    const calls: number[] = []
    const query = (from: number) => {
      calls.push(from)
      return Promise.resolve({ data: null, error: { message: 'boom' } })
    }

    const { data, error } = await fetchAll(query)

    expect(error).toEqual({ message: 'boom' })
    expect(data).toEqual([])
    expect(calls).toEqual([0])
  })

  it('surfaces an error raised on a later page', async () => {
    const rows = Array.from({ length: 1384 }, (_, i) => ({ id: `row-${i}` }))
    const query = (from: number, to: number) => {
      if (from >= 1000) return Promise.resolve({ data: null, error: { message: 'late boom' } })
      const width = Math.min(to - from + 1, SERVER_MAX_ROWS)
      return Promise.resolve({ data: rows.slice(from, from + width), error: null })
    }

    const { error } = await fetchAll(query)

    expect(error).toEqual({ message: 'late boom' })
  })
})

describe('availability aggregation across the page boundary', () => {
  it('counts a booking whose items sit past row 1000', async () => {
    const date = '2026-08-01'
    const target = makeBooking({ id: 'chris-smith', chain: 'chain_1', event_date: date })

    // 1200 filler rows belonging to older bookings, then the target's item —
    // physical position 1201, well past the cap.  This mirrors Chris Smith's
    // rows landing at 1251-1253 in production.
    const filler = Array.from({ length: 1200 }, (_, i) =>
      makeBookingItem({ id: `bi-old-${i}`, booking_id: `old-${i}`, item_id: 'foam_machine' })
    )
    const allItems: BookingItemRow[] = [
      ...filler,
      makeBookingItem({ id: 'bi-target', booking_id: 'chris-smith', item_id: 'foam_machine', qty: 2 }),
    ]

    const equipment = [makeEquipment({ id: 'foam_machine', total_qty: 10 })]
    const { query } = makeCappedTable(allItems)

    const { data: pagedItems } = await fetchAll<BookingItemRow>(query)
    const rows = calculateAvailability(equipment, [], [target], pagedItems, date)

    const foam = rows.find(r => r.id === 'foam_machine')!
    expect(foam.total_booked).toBe(2)
    expect(foam.chain_qty['chain_1']).toBe(2)
    expect(foam.remaining).toBe(8)
  })

  it('loses that same booking when the fetch is truncated at 1000', async () => {
    const date = '2026-08-01'
    const target = makeBooking({ id: 'chris-smith', chain: 'chain_1', event_date: date })

    const filler = Array.from({ length: 1200 }, (_, i) =>
      makeBookingItem({ id: `bi-old-${i}`, booking_id: `old-${i}`, item_id: 'foam_machine' })
    )
    const allItems: BookingItemRow[] = [
      ...filler,
      makeBookingItem({ id: 'bi-target', booking_id: 'chris-smith', item_id: 'foam_machine', qty: 2 }),
    ]

    const equipment = [makeEquipment({ id: 'foam_machine', total_qty: 10 })]
    const { query } = makeCappedTable(allItems)

    // The pre-fix call shape: one unbounded read.
    const { data: truncated } = await query(0, 1_000_000)
    const rows = calculateAvailability(equipment, [], [target], truncated, date)

    const foam = rows.find(r => r.id === 'foam_machine')!
    expect(foam.total_booked).toBe(0)
    expect(foam.chain_qty['chain_1']).toBeUndefined()
  })
})
