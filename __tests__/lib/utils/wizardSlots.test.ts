import {
  computeDay,
  expandLinkedSpans,
  resolveBufferMin,
  timeToMin,
  minToTime,
  isOosActiveOn,
  formatTime12,
  computeAvailabilityRanges,
  type WizardBooking,
  type WizardBookingItem,
  type WizardChain,
  type WizardOosRecord,
  type ComputeDayInput,
} from '@/lib/utils/wizardSlots'

const makeBooking = (o: Partial<WizardBooking> = {}): WizardBooking => ({
  id: 'b1',
  chain: 'chain-a',
  event_date: '2026-06-10',
  end_date: null,
  start_time: '14:00',
  end_time: '17:00',
  status: 'confirmed',
  event_type: 'coordinated',
  linked_booking_id: null,
  customer_name: 'Alice',
  ...o,
})

const makeItem = (o: Partial<WizardBookingItem> = {}): WizardBookingItem => ({
  booking_id: 'b1',
  item_id: 'bubble_ball',
  qty: 5,
  ...o,
})

const makeChain = (o: Partial<WizardChain> = {}): WizardChain => ({
  id: 'chain-a',
  name: 'Chain A',
  color: '#ff0000',
  ...o,
})

const baseInput = (o: Partial<ComputeDayInput> = {}): ComputeDayInput => ({
  date: '2026-06-10',
  itemId: 'bubble_ball',
  setupMin: 45,
  cleanupMin: 45,
  totalQty: 10,
  requestedQty: 5,
  durationMin: 90,
  preferredStart: undefined,
  activeOosCount: 0,
  bookings: [],
  bookingItems: [],
  chains: [makeChain()],
  ...o,
})

describe('timeToMin / minToTime', () => {
  it('converts HH:MM to minutes', () => {
    expect(timeToMin('00:00')).toBe(0)
    expect(timeToMin('08:30')).toBe(510)
    expect(timeToMin('14:00')).toBe(840)
    expect(timeToMin('23:59')).toBe(23 * 60 + 59)
  })

  it('converts minutes back to HH:MM', () => {
    expect(minToTime(0)).toBe('00:00')
    expect(minToTime(510)).toBe('08:30')
    expect(minToTime(840)).toBe('14:00')
  })

  it('wraps hours at 24', () => {
    expect(minToTime(24 * 60)).toBe('00:00')
    expect(minToTime(25 * 60 + 30)).toBe('01:30')
  })
})

describe('resolveBufferMin', () => {
  it('uses provided value when positive', () => {
    expect(resolveBufferMin(30)).toBe(30)
    expect(resolveBufferMin(60)).toBe(60)
  })
  it('falls back to 45 for null/undefined/0', () => {
    expect(resolveBufferMin(null)).toBe(45)
    expect(resolveBufferMin(undefined)).toBe(45)
    expect(resolveBufferMin(0)).toBe(45)
  })
})

describe('computeDay — empty day', () => {
  it('generates slots for every increment when no bookings exist', () => {
    const result = computeDay(baseInput())
    expect(result.date).toBe('2026-06-10')
    expect(result.available_inventory).toBe(10)
    expect(result.chains).toHaveLength(1)

    const slots = result.chains[0].slots
    // First feasible start: S - setupMin - travel >= 0 → S >= 45 + 30 = 75 → 01:15.
    // Iteration starts at DAY_START_MIN (480 = 08:00), so first candidate is 08:00.
    // occStart = 480 - 45 - 30 = 405 >= 0 ✓, occEnd = 480 + 90 + 45 + 30 = 645 <= 1440 ✓.
    // Last feasible start: S + 90 + 45 + 30 <= 24*60 → S <= 1275 = 21:15.
    // Snapped to 30-min from 08:00: last S = 21:00.
    expect(slots[0].start).toBe('08:00')
    expect(slots[slots.length - 1].start).toBe('21:00')
    // Every slot has score 0 (no other events to bump B/C, no preferred start)
    slots.forEach(s => {
      expect(s.score).toBe(0)
      expect(s.starred).toBe(false)
      expect(s.available_qty).toBe(5) // 10 - 5 requested
    })
  })

  it('returns no slots when inventory is zero', () => {
    const result = computeDay(baseInput({ activeOosCount: 10 }))
    expect(result.available_inventory).toBe(0)
    expect(result.chains).toEqual([])
  })

  it('returns no slots when requested qty exceeds inventory', () => {
    const result = computeDay(baseInput({ requestedQty: 20 }))
    // available_inventory = 10, but every slot needs 20 → all rejected
    expect(result.chains[0].slots).toHaveLength(0)
  })

  it('returns no slots when requested qty is zero or negative', () => {
    const zero = computeDay(baseInput({ requestedQty: 0 }))
    expect(zero.chains).toEqual([])
    const neg = computeDay(baseInput({ requestedQty: -3 }))
    expect(neg.chains).toEqual([])
  })
})

describe('computeDay — chain conflict', () => {
  it('rejects slots overlapping an existing event on the same chain', () => {
    const result = computeDay(baseInput({
      bookings: [makeBooking({ start_time: '14:00', end_time: '17:00' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'other_item' })],
    }))
    const slots = result.chains[0].slots
    // The existing booking's blocking window: 14:00-45-30=12:45 to 17:00+45+30=18:15
    // A candidate at 13:00 (occupied 11:45 to 16:15) overlaps → rejected
    expect(slots.find(s => s.start === '13:00')).toBeUndefined()
    // A candidate at 09:30 (occupied 08:15 to 11:45) does not overlap → present
    expect(slots.find(s => s.start === '09:30')).toBeDefined()
  })

  it('multi-day booking blocks all slots on the chain', () => {
    const result = computeDay(baseInput({
      bookings: [makeBooking({
        event_date: '2026-06-09',
        end_date: '2026-06-11',
      })],
    }))
    expect(result.chains[0].slots).toHaveLength(0)
  })
})

describe('computeDay — overnight bookings (audit P0-8c)', () => {
  it('end_time earlier than start_time still blocks the evening', () => {
    // 22:00–02:00 lock-in, end_date null (the webhook wrote these before the
    // fix). Pre-fix the blocking window inverted ({start: 1245, end: 225})
    // and overlapped nothing — every evening slot was offered on a fully
    // occupied chain.
    const result = computeDay(baseInput({
      bookings: [makeBooking({ start_time: '22:00', end_time: '02:00' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'other_item' })],
    }))
    const slots = result.chains[0].slots
    // Blocking window: 22:00−45−30 = 20:45 → 26:00+45+30 = 27:15.
    // Candidate occupied window = s−75 … s+90+75; conflict iff s+165 > 20:45.
    expect(slots.find(s => s.start === '20:00')).toBeUndefined()
    expect(slots.find(s => s.start === '18:30')).toBeUndefined()
    // 18:00 candidate ends exactly at the window start → no overlap → offered
    expect(slots.find(s => s.start === '18:00')).toBeDefined()
    expect(slots.find(s => s.start === '08:00')).toBeDefined()
  })
})

describe('expandLinkedSpans — dropoff→pickup spans (audit P0-8b)', () => {
  const dropoff = (o: Partial<WizardBooking> = {}) => makeBooking({
    id: 'drop1', event_type: 'dropoff', event_date: '2026-06-10',
    start_time: '10:00', end_time: '10:30', linked_booking_id: 'pick1', ...o,
  })
  const pickup = (o: Partial<WizardBooking> = {}) => makeBooking({
    id: 'pick1', event_type: 'pickup', event_date: '2026-06-13',
    start_time: '09:00', end_time: '09:30', linked_booking_id: 'drop1', ...o,
  })

  it('expands a dropoff to its linked pickup date', () => {
    const [d, p] = expandLinkedSpans([dropoff(), pickup()])
    expect(d.end_date).toBe('2026-06-13')
    // pickup itself is not expanded backwards (its link points at the dropoff)
    expect(p.end_date).toBeNull()
  })

  it('does not expand to a canceled pickup', () => {
    const [d] = expandLinkedSpans([dropoff(), pickup({ status: 'canceled' })])
    expect(d.end_date).toBeNull()
  })

  it('does not invert when the linked pickup is dated before the dropoff', () => {
    const [d] = expandLinkedSpans([dropoff(), pickup({ event_date: '2026-06-08' })])
    expect(d.end_date).toBeNull()
  })

  it('dropoff linked to later pickup consumes inventory on intermediate days', () => {
    // 10 of 10 cornhole dropped 6/10, picked up 6/13 — on 6/11 NOTHING is
    // available, on any chain. Pre-fix the wizard offered all 10.
    const bookings = expandLinkedSpans([
      dropoff({ chain: 'chain-a' }),
      pickup({ chain: 'chain-a' }),
    ])
    const result = computeDay(baseInput({
      date: '2026-06-11',
      itemId: 'cornhole',
      totalQty: 10,
      requestedQty: 1,
      bookings,
      bookingItems: [makeItem({ booking_id: 'drop1', item_id: 'cornhole', qty: 10 })],
      chains: [makeChain({ id: 'chain-a' }), makeChain({ id: 'chain-b', name: 'Chain B' })],
    }))
    // chain-a: full-day block from the spanned dropoff; chain-b: global
    // inventory check sees all 10 consumed during the spanned window.
    for (const chain of result.chains) {
      expect(chain.slots).toHaveLength(0)
    }
  })
})

describe('computeDay — global inventory cap', () => {
  it('rejects slot when other chains have consumed inventory in the window', () => {
    const result = computeDay(baseInput({
      requestedQty: 6,
      totalQty: 10,
      chains: [makeChain(), makeChain({ id: 'chain-b', name: 'B', color: '#0f0' })],
      bookings: [makeBooking({
        id: 'b-other',
        chain: 'chain-b',
        start_time: '14:00',
        end_time: '17:00',
      })],
      bookingItems: [makeItem({ booking_id: 'b-other', qty: 5 })],
    }))
    // chain-b already uses 5 of the item from 12:45-18:15; chain-a candidate at
    // 13:00 (occupied 11:45-16:15) would be 5+6=11 > 10 → rejected on chain-a
    const chainA = result.chains.find(c => c.chain_id === 'chain-a')!
    expect(chainA.slots.find(s => s.start === '13:00')).toBeUndefined()
    // Slot at 09:30 (occupied 08:15-11:45) doesn't overlap → allowed
    expect(chainA.slots.find(s => s.start === '09:30')).toBeDefined()
  })
})

describe('computeDay — scoring', () => {
  it('Criterion A: matches preferred start exactly', () => {
    const result = computeDay(baseInput({
      preferredStart: '14:00',
    }))
    const slot = result.chains[0].slots.find(s => s.start === '14:00')!
    expect(slot.criteria.a).toBe(true)
    expect(slot.score).toBe(1)
    // Score 1 < 2, even though A passed → not starred
    expect(slot.starred).toBe(false)
  })

  it('Criterion A override: non-matching slots get 0 stars even with score 2', () => {
    // Construct a slot with B+C true but A false
    const result = computeDay(baseInput({
      preferredStart: '12:00',
      bookings: [makeBooking({ start_time: '08:30', end_time: '09:30' })],
      bookingItems: [makeItem({ booking_id: 'b1', qty: 1 })],
    }))
    // Existing event window: 07:15 to 10:45 → next slot starts within 30min → B
    // Same item booked → C
    // But preferredStart is 12:00, candidate at 11:00 doesn't match A
    const slot = result.chains[0].slots.find(s => s.start === '12:30')
    expect(slot).toBeDefined()
    expect(slot!.criteria.a).toBe(false)
    expect(slot!.criteria.b).toBe(true)
    expect(slot!.criteria.c).toBe(true)
    expect(slot!.score).toBe(2)
    expect(slot!.starred).toBe(false)
  })

  it('Criterion B: tight scheduling within 30 min of an existing event', () => {
    const result = computeDay(baseInput({
      bookings: [makeBooking({ start_time: '08:30', end_time: '09:30' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'other_item' })],
    }))
    // Existing window: 08:30-45-30=07:15 to 09:30+45+30=10:45
    // Candidate at 11:00 (occ 09:45-13:15) → start 09:45 is within 30 min after 10:45? No, it's BEFORE.
    // Try: candidate at 12:00 (occ 10:45-14:15) → starts at 10:45 = exactly when prev ended → diff=0 → B passes
    const slot = result.chains[0].slots.find(s => s.start === '12:00')!
    expect(slot.criteria.b).toBe(true)
  })

  it('Criterion C: same equipment already booked on this chain', () => {
    const result = computeDay(baseInput({
      bookings: [makeBooking({ start_time: '08:00', end_time: '09:00' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'bubble_ball', qty: 2 })],
    }))
    // The existing booking is also bubble_ball → every non-conflicting slot has C true
    const slots = result.chains[0].slots
    expect(slots.length).toBeGreaterThan(0)
    slots.forEach(s => expect(s.criteria.c).toBe(true))
  })

  it('starred when score >= 2 with no preferred start', () => {
    // B + C both true → score 2 → starred
    const result = computeDay(baseInput({
      bookings: [makeBooking({ start_time: '08:00', end_time: '09:00' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'bubble_ball', qty: 2 })],
    }))
    // Existing window: 06:45-10:15
    // Slot at 11:00 (occ 09:45-13:15) — start 09:45 is BEFORE 10:15? Yes → conflict
    // Slot at 11:30 (occ 10:15-13:45) — start 10:15 = end of prev → diff 0 → B passes
    const slot = result.chains[0].slots.find(s => s.start === '11:30')!
    expect(slot.criteria.b).toBe(true)
    expect(slot.criteria.c).toBe(true)
    expect(slot.score).toBe(2)
    expect(slot.starred).toBe(true)
  })
})

describe('computeDay — output shape', () => {
  it('sorts slots starred-first, then score desc, then start asc', () => {
    const result = computeDay(baseInput({
      preferredStart: '15:00',
      bookings: [makeBooking({ start_time: '13:00', end_time: '14:00' })],
      bookingItems: [makeItem({ booking_id: 'b1', item_id: 'bubble_ball', qty: 2 })],
    }))
    const slots = result.chains[0].slots
    // Verify monotonic ordering on the sort keys
    for (let i = 1; i < slots.length; i++) {
      const prev = slots[i - 1]
      const cur = slots[i]
      if (prev.starred !== cur.starred) {
        expect(prev.starred).toBe(true)
      } else if (prev.score !== cur.score) {
        expect(prev.score).toBeGreaterThan(cur.score)
      } else {
        expect(prev.start <= cur.start).toBe(true)
      }
    }
  })

  it('includes existing_events sorted by start time', () => {
    const result = computeDay(baseInput({
      bookings: [
        makeBooking({ id: 'b2', start_time: '10:00', end_time: '11:00', customer_name: 'Bob' }),
        makeBooking({ id: 'b1', start_time: '08:00', end_time: '09:00', customer_name: 'Alice' }),
      ],
      bookingItems: [],
    }))
    const events = result.chains[0].existing_events
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ booking_id: 'b1', start: '08:00', end: '09:00', customer_name: 'Alice' })
    expect(events[1]).toEqual({ booking_id: 'b2', start: '10:00', end: '11:00', customer_name: 'Bob' })
  })
})

const makeOos = (o: Partial<WizardOosRecord> = {}): WizardOosRecord => ({
  quantity: 1,
  created_at: '2026-06-01T00:00:00Z',
  expected_return_date: null,
  returned_at: null,
  ...o,
})

describe('formatTime12', () => {
  it('formats midnight and noon correctly', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM')
    expect(formatTime12('12:00')).toBe('12:00 PM')
  })
  it('formats AM and PM hours', () => {
    expect(formatTime12('07:30')).toBe('7:30 AM')
    expect(formatTime12('16:00')).toBe('4:00 PM')
    expect(formatTime12('23:30')).toBe('11:30 PM')
  })
})

describe('computeAvailabilityRanges', () => {
  it('returns empty array for empty input', () => {
    expect(computeAvailabilityRanges([])).toEqual([])
  })
  it('collapses one contiguous run', () => {
    expect(computeAvailabilityRanges(['09:00', '09:30', '10:00'])).toEqual([
      { start: '09:00', end: '10:00' },
    ])
  })
  it('splits on a 60-min gap', () => {
    expect(computeAvailabilityRanges(['09:00', '09:30', '11:00'])).toEqual([
      { start: '09:00', end: '09:30' },
      { start: '11:00', end: '11:00' },
    ])
  })
  it('dedupes duplicate times', () => {
    expect(computeAvailabilityRanges(['10:00', '10:00', '10:30'])).toEqual([
      { start: '10:00', end: '10:30' },
    ])
  })
  it('handles unsorted input', () => {
    expect(computeAvailabilityRanges(['11:00', '09:00', '10:30', '10:00', '09:30'])).toEqual([
      { start: '09:00', end: '11:00' },
    ])
  })
})

describe('isOosActiveOn', () => {
  it('inactive when created after the date', () => {
    expect(isOosActiveOn(makeOos({ created_at: '2026-06-15T00:00:00Z' }), '2026-06-10')).toBe(false)
  })
  it('active when created on the date with no return info', () => {
    expect(isOosActiveOn(makeOos({ created_at: '2026-06-10T08:00:00Z' }), '2026-06-10')).toBe(true)
  })
  it('inactive once returned_at <= date (return-day same as date is back)', () => {
    expect(isOosActiveOn(makeOos({ returned_at: '2026-06-10T12:00:00Z' }), '2026-06-10')).toBe(false)
  })
  it('inactive when expected_return_date <= date', () => {
    expect(isOosActiveOn(makeOos({ expected_return_date: '2026-06-10' }), '2026-06-10')).toBe(false)
  })
  it('active when expected_return_date is strictly after date', () => {
    expect(isOosActiveOn(makeOos({ expected_return_date: '2026-06-11' }), '2026-06-10')).toBe(true)
  })
})
