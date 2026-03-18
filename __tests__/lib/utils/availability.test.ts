import { calculateAvailability, isBookingActiveOnDate } from '@/lib/utils/availability'
import type {
  Database,
  BookingStatus,
  BookingSource,
  EventType,
} from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

const makeEquipment = (overrides: Partial<EquipmentRow> = {}): EquipmentRow => ({
  id: 'foam_machine',
  name: 'Foam Machine',
  total_qty: 3,
  out_of_service: 0,
  issue_flag: 0,
  is_active: true,
  custom_setup_min: null,
  custom_cleanup_min: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeBooking = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: 'booking-1',
  zenbooker_job_id: 'zb-1',
  customer_name: 'Alice',
  event_date: '2026-03-20',
  end_date: null,
  start_time: '14:00',
  end_time: '17:00',
  chain: null,
  status: 'confirmed' as BookingStatus,
  event_type: 'coordinated' as EventType,
  source: 'webhook' as BookingSource,
  address: '123 Main St',
  notes: '',
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

describe('isBookingActiveOnDate', () => {
  it('single-day booking: active on its date', () => {
    const b = makeBooking({ event_date: '2026-03-20', end_date: null })
    expect(isBookingActiveOnDate(b, '2026-03-20')).toBe(true)
  })

  it('single-day booking: inactive on other dates', () => {
    const b = makeBooking({ event_date: '2026-03-20', end_date: null })
    expect(isBookingActiveOnDate(b, '2026-03-21')).toBe(false)
    expect(isBookingActiveOnDate(b, '2026-03-19')).toBe(false)
  })

  it('multi-day booking: active on start, middle, and end dates', () => {
    const b = makeBooking({ event_date: '2026-03-20', end_date: '2026-03-22' })
    expect(isBookingActiveOnDate(b, '2026-03-20')).toBe(true)
    expect(isBookingActiveOnDate(b, '2026-03-21')).toBe(true)
    expect(isBookingActiveOnDate(b, '2026-03-22')).toBe(true)
  })

  it('multi-day booking: inactive outside range', () => {
    const b = makeBooking({ event_date: '2026-03-20', end_date: '2026-03-22' })
    expect(isBookingActiveOnDate(b, '2026-03-19')).toBe(false)
    expect(isBookingActiveOnDate(b, '2026-03-23')).toBe(false)
  })

  it('canceled bookings are never active', () => {
    const b = makeBooking({ event_date: '2026-03-20', end_date: null, status: 'canceled' })
    expect(isBookingActiveOnDate(b, '2026-03-20')).toBe(false)
  })
})

describe('calculateAvailability', () => {
  it('no bookings — full availability', () => {
    const equipment = [makeEquipment({ total_qty: 3 })]
    const result = calculateAvailability(equipment, [], [], [], '2026-03-20')
    expect(result).toHaveLength(1)
    expect(result[0].available_qty).toBe(3)
    expect(result[0].booked_qty).toBe(0)
  })

  it('subtracts booked quantity on matching date', () => {
    const equipment = [makeEquipment({ total_qty: 3 })]
    const bookings = [makeBooking({ event_date: '2026-03-20' })]
    const items = [makeBookingItem({ qty: 2 })]
    const result = calculateAvailability(equipment, [], bookings, items, '2026-03-20')
    expect(result[0].booked_qty).toBe(2)
    expect(result[0].available_qty).toBe(1)
  })

  it('ignores bookings on other dates', () => {
    const equipment = [makeEquipment({ total_qty: 3 })]
    const bookings = [makeBooking({ event_date: '2026-03-21' })]
    const items = [makeBookingItem({ qty: 2 })]
    const result = calculateAvailability(equipment, [], bookings, items, '2026-03-20')
    expect(result[0].booked_qty).toBe(0)
    expect(result[0].available_qty).toBe(3)
  })

  it('subtracts out_of_service from availability', () => {
    const equipment = [makeEquipment({ total_qty: 5, out_of_service: 2 })]
    const result = calculateAvailability(equipment, [], [], [], '2026-03-20')
    expect(result[0].available_qty).toBe(3)
  })

  it('availability is clamped to 0 when over-booked', () => {
    const equipment = [makeEquipment({ total_qty: 1 })]
    const bookings = [makeBooking()]
    const items = [makeBookingItem({ qty: 3 })]
    const result = calculateAvailability(equipment, [], bookings, items, '2026-03-20')
    expect(result[0].available_qty).toBe(0)
  })

  it('excludes inactive equipment', () => {
    const equipment = [makeEquipment({ is_active: false })]
    const result = calculateAvailability(equipment, [], [], [], '2026-03-20')
    expect(result).toHaveLength(0)
  })

  it('combines bookings across multiple bookings for same item', () => {
    const equipment = [makeEquipment({ total_qty: 5 })]
    const bookings = [
      makeBooking({ id: 'b1', zenbooker_job_id: 'z1' }),
      makeBooking({ id: 'b2', zenbooker_job_id: 'z2' }),
    ]
    const items = [
      makeBookingItem({ id: 'bi1', booking_id: 'b1', qty: 2 }),
      makeBookingItem({ id: 'bi2', booking_id: 'b2', qty: 1 }),
    ]
    const result = calculateAvailability(equipment, [], bookings, items, '2026-03-20')
    expect(result[0].booked_qty).toBe(3)
    expect(result[0].available_qty).toBe(2)
  })

  it('includes sub-items grouped under parent', () => {
    const equipment = [makeEquipment({ id: 'parent', name: 'Parent', total_qty: 2 })]
    const subItems = [{
      id: 'sub1', parent_id: 'parent', name: 'Sub Item',
      total_qty: 4, out_of_service: 0, issue_flag: 0, is_active: true,
    }]
    const result = calculateAvailability(equipment, subItems as any, [], [], '2026-03-20')
    expect(result[0].sub_items).toHaveLength(1)
    expect(result[0].sub_items[0].available_qty).toBe(4)
  })

  it('ignores inactive sub-items', () => {
    const equipment = [makeEquipment({ id: 'parent', name: 'Parent', total_qty: 2 })]
    const subItems = [{
      id: 'sub1', parent_id: 'parent', name: 'Inactive Sub',
      total_qty: 4, out_of_service: 0, issue_flag: 0, is_active: false,
    }]
    const result = calculateAvailability(equipment, subItems as any, [], [], '2026-03-20')
    expect(result[0].sub_items).toHaveLength(0)
  })
})
