// lib/utils/wizardSlots.ts

export const SLOT_INCREMENT_MIN = 30
export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 22 * 60
export const TRAVEL_BUFFER_MIN = 30
export const DEFAULT_DURATION_MIN = 90
export const DEFAULT_BUFFER_MIN = 45

export type WizardCriteria = { a: boolean; b: boolean; c: boolean }

export type WizardSlot = {
  start: string
  end: string
  score: 0 | 1 | 2 | 3
  criteria: WizardCriteria
  starred: boolean
  available_qty: number
}

export type WizardChainDay = {
  chain_id: string
  chain_name: string
  chain_color: string
  existing_events: { start: string; end: string; customer_name: string }[]
  slots: WizardSlot[]
}

export type WizardDay = {
  date: string
  available_inventory: number
  chains: WizardChainDay[]
}

export type WizardBooking = {
  id: string
  chain: string | null
  event_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  status: string
  event_type: string
  linked_booking_id: string | null
  customer_name: string
}

export type WizardBookingItem = {
  booking_id: string
  item_id: string
  qty: number
}

export type WizardChain = {
  id: string
  name: string
  color: string
}

export type ComputeDayInput = {
  date: string
  itemId: string
  setupMin: number
  cleanupMin: number
  totalQty: number
  requestedQty: number
  durationMin: number
  preferredStart?: string
  activeOosCount: number
  bookings: WizardBooking[]
  bookingItems: WizardBookingItem[]
  chains: WizardChain[]
}

export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Format an HH:MM (24h) string into 12-hour display form.
 * "16:00" → "4:00 PM"; "00:30" → "12:30 AM".
 */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Collapse a list of HH:MM slot start times (any order, possibly duplicated)
 * into an array of contiguous ranges based on `incrementMin` spacing.
 *
 * A range's `start`/`end` are both START times (event start times, not
 * occupied-window endpoints). A run of one slot returns `{start: t, end: t}`.
 *
 * Example: ['10:30','11:00','11:30','13:00'] with increment 30 →
 *   [{start:'10:30', end:'11:30'}, {start:'13:00', end:'13:00'}]
 */
export function computeAvailabilityRanges(
  starts: string[],
  incrementMin: number = SLOT_INCREMENT_MIN,
): Array<{ start: string; end: string }> {
  const unique = Array.from(new Set(starts)).sort()
  if (unique.length === 0) return []
  const ranges: Array<{ start: string; end: string }> = []
  let runStart = unique[0]
  let runLast = unique[0]
  for (let i = 1; i < unique.length; i++) {
    const cur = unique[i]
    if (timeToMin(cur) - timeToMin(runLast) === incrementMin) {
      runLast = cur
    } else {
      ranges.push({ start: runStart, end: runLast })
      runStart = cur
      runLast = cur
    }
  }
  ranges.push({ start: runStart, end: runLast })
  return ranges
}

export function resolveBufferMin(value: number | null | undefined): number {
  if (value === null || value === undefined || value === 0) return DEFAULT_BUFFER_MIN
  return value
}

export type WizardOosRecord = {
  quantity: number
  created_at: string                     // ISO timestamp
  expected_return_date: string | null    // ISO date
  returned_at: string | null             // ISO timestamp
}

/**
 * An OOS record is active on `date` (YYYY-MM-DD) iff it was created on or before
 * `date` and has not been returned, and the expected return date is strictly
 * after `date`. Boundaries are exclusive on the return side: a return scheduled
 * for `date` itself means the equipment is back that day → not OOS.
 */
export function isOosActiveOn(oos: WizardOosRecord, date: string): boolean {
  const created = oos.created_at.slice(0, 10)
  if (created > date) return false
  if (oos.returned_at && oos.returned_at.slice(0, 10) <= date) return false
  if (oos.expected_return_date && oos.expected_return_date <= date) return false
  return true
}

type Window = { start: number; end: number } // minutes from midnight

function bookingActiveOnDate(b: WizardBooking, date: string): boolean {
  if (b.status === 'canceled') return false
  if (b.event_date === date) return true
  if (b.end_date && b.event_date <= date && date <= b.end_date) return true
  return false
}

function isSameDayBooking(b: WizardBooking, date: string): boolean {
  if (b.event_date !== date) return false
  if (b.end_date && b.end_date !== date) return false
  return true
}

function bookingBlockingWindow(
  b: WizardBooking,
  date: string,
  setupMin: number,
  cleanupMin: number,
): Window | null {
  if (!bookingActiveOnDate(b, date)) return null
  if (!isSameDayBooking(b, date)) {
    // multi-day or paired: blocks the full day
    return { start: 0, end: 24 * 60 }
  }
  if (!b.start_time || !b.end_time) {
    // no time → treat as full day to be safe
    return { start: 0, end: 24 * 60 }
  }
  const s = timeToMin(b.start_time) - setupMin - TRAVEL_BUFFER_MIN
  const e = timeToMin(b.end_time) + cleanupMin + TRAVEL_BUFFER_MIN
  return { start: s, end: e }
}

function windowsOverlap(a: Window, b: Window): boolean {
  return a.start < b.end && b.start < a.end
}

export function computeDay(input: ComputeDayInput): WizardDay {
  const {
    date, itemId, setupMin, cleanupMin, totalQty, requestedQty,
    durationMin, preferredStart, activeOosCount,
    bookings, bookingItems, chains,
  } = input

  const availableInventory = totalQty - activeOosCount
  if (availableInventory <= 0 || requestedQty <= 0) {
    return { date, available_inventory: availableInventory, chains: [] }
  }

  // Pre-filter bookings active on this date and compute their blocking windows.
  const activeBookings = bookings.filter(b => bookingActiveOnDate(b, date))
  const blockingWindows = new Map<string, Window>()
  for (const b of activeBookings) {
    const w = bookingBlockingWindow(b, date, setupMin, cleanupMin)
    if (w) blockingWindows.set(b.id, w)
  }

  // Index booking_items by booking_id, filtered to the requested item.
  const itemQtyByBooking = new Map<string, number>()
  for (const bi of bookingItems) {
    if (bi.item_id !== itemId) continue
    itemQtyByBooking.set(bi.booking_id, (itemQtyByBooking.get(bi.booking_id) ?? 0) + bi.qty)
  }

  const preferredStartMin = preferredStart ? timeToMin(preferredStart) : null

  const chainsOut: WizardChainDay[] = []

  for (const chain of chains) {
    const chainBookings = activeBookings.filter(b => b.chain === chain.id)
    const chainSlots: WizardSlot[] = []

    // Existing events for popup display (same-day only, with times)
    const existingEvents = chainBookings
      .filter(b => isSameDayBooking(b, date) && b.start_time && b.end_time)
      .map(b => ({
        start: b.start_time!,
        end: b.end_time!,
        customer_name: b.customer_name,
      }))
      .sort((x, y) => x.start.localeCompare(y.start))

    // Generate candidate slots
    for (let s = DAY_START_MIN; s <= DAY_END_MIN; s += SLOT_INCREMENT_MIN) {
      const occStart = s - setupMin - TRAVEL_BUFFER_MIN
      const occEnd = s + durationMin + cleanupMin + TRAVEL_BUFFER_MIN
      // Window must fit within the day
      if (occStart < 0 || occEnd > 24 * 60) continue

      const candidateWindow: Window = { start: occStart, end: occEnd }

      // Step 1: per-chain conflict check
      let conflict = false
      for (const bk of chainBookings) {
        const w = blockingWindows.get(bk.id)
        if (w && windowsOverlap(candidateWindow, w)) { conflict = true; break }
      }
      if (conflict) continue

      // Step 2: global inventory check across ALL chains during candidate's occupied window
      let globalBooked = 0
      for (const b of activeBookings) {
        const qty = itemQtyByBooking.get(b.id) ?? 0
        if (qty === 0) continue
        const w = blockingWindows.get(b.id)
        if (w && windowsOverlap(candidateWindow, w)) {
          globalBooked += qty
        }
      }
      if (globalBooked + requestedQty > availableInventory) continue

      // Step 3: score
      // Criterion A: only if user provided preferred start
      const a = preferredStartMin !== null ? s === preferredStartMin : false

      // Criterion B: tight scheduling — within 30 min of existing event window edge on this chain
      let criterionB = false
      for (const bk of chainBookings) {
        const w = blockingWindows.get(bk.id)
        if (!w) continue
        const startsRightAfter = candidateWindow.start - w.end >= 0 && candidateWindow.start - w.end <= 30
        const endsRightBefore = w.start - candidateWindow.end >= 0 && w.start - candidateWindow.end <= 30
        if (startsRightAfter || endsRightBefore) { criterionB = true; break }
      }

      // Criterion C: chain already has a booking with the same item today
      let c = false
      for (const bk of chainBookings) {
        if ((itemQtyByBooking.get(bk.id) ?? 0) > 0) { c = true; break }
      }

      // Score: count true criteria. A is only counted if preferredStartMin was provided.
      let score = 0
      if (preferredStartMin !== null && a) score += 1
      if (criterionB) score += 1
      if (c) score += 1

      // Starred: score >= 2 AND (if preferred start given, A passed)
      let starred = score >= 2
      if (preferredStartMin !== null && !a) starred = false

      chainSlots.push({
        start: minToTime(s),
        end: minToTime(s + durationMin),
        score: score as 0 | 1 | 2 | 3,
        criteria: { a, b: criterionB, c },
        starred,
        available_qty: availableInventory - globalBooked - requestedQty,
      })
    }

    // Sort: starred first, then score desc, then start asc
    chainSlots.sort((x, y) => {
      if (x.starred !== y.starred) return x.starred ? -1 : 1
      if (x.score !== y.score) return y.score - x.score
      return x.start.localeCompare(y.start)
    })

    chainsOut.push({
      chain_id: chain.id,
      chain_name: chain.name,
      chain_color: chain.color,
      existing_events: existingEvents,
      slots: chainSlots,
    })
  }

  return { date, available_inventory: availableInventory, chains: chainsOut }
}
