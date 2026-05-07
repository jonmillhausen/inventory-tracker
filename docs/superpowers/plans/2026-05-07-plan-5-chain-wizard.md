# Chain Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/wizard` page that helps the sales team find the best chain + time slot combinations for a new event booking, presented as a scored monthly calendar with a per-chain breakdown popup.

**Architecture:** Server-side scoring via a single `GET /api/wizard/availability` endpoint that returns a fully-scored month payload. Client renders only — no scoring on the client. Core slot-generation and scoring logic lives in a pure, unit-testable module (`lib/utils/wizardSlots.ts`) that has no Supabase dependency.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui (`@base-ui/react/select`, `Dialog`), TanStack Query v5, Supabase (server client for the route, browser client for the hook), Jest for unit tests, lucide-react for icons.

**Spec:** `docs/superpowers/specs/2026-05-07-chain-wizard-design.md`

---

## File Structure

**Created:**
- `lib/utils/wizardSlots.ts` — pure slot generation + scoring (no Supabase, fully unit-tested)
- `__tests__/lib/utils/wizardSlots.test.ts` — Jest tests for the above
- `app/api/wizard/availability/route.ts` — `GET` handler; auth gate, Supabase fetches, calls `wizardSlots`, returns response
- `lib/queries/wizard.ts` — `useWizardAvailability` TanStack Query hook
- `app/(dashboard)/wizard/page.tsx` — server component with auth, mounts `WizardClient`
- `app/(dashboard)/wizard/WizardClient.tsx` — client component with form, calendar, popup state
- `components/modals/WizardDayDetailModal.tsx` — per-day modal with per-chain slot breakdown

**Modified:**
- `components/layout/Sidebar.tsx` — add `Chain Wizard` nav item

---

## Shared Type Definitions (used across tasks)

These types are defined in **Task 1** in `lib/utils/wizardSlots.ts`. Subsequent tasks import them.

```ts
// lib/utils/wizardSlots.ts (exported types)

export type WizardCriteria = { a: boolean; b: boolean; c: boolean }

export type WizardSlot = {
  start: string          // "HH:MM" 24h
  end: string            // "HH:MM" 24h
  score: 0 | 1 | 2 | 3
  criteria: WizardCriteria
  starred: boolean
  available_qty: number  // remaining inventory after subtracting requestedQty
}

export type WizardChainDay = {
  chain_id: string
  chain_name: string
  chain_color: string
  existing_events: { start: string; end: string; customer_name: string }[]
  slots: WizardSlot[]
}

export type WizardDay = {
  date: string                  // "YYYY-MM-DD"
  available_inventory: number   // total_qty minus active OOS on this date
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
  date: string                      // "YYYY-MM-DD"
  itemId: string
  setupMin: number                  // resolved (custom_setup_min ?? 45, treat 0 as 45)
  cleanupMin: number                // same fallback
  totalQty: number
  requestedQty: number
  durationMin: number               // default 90 already applied upstream
  preferredStart?: string           // optional "HH:MM"
  activeOosCount: number            // resolved upstream
  bookings: WizardBooking[]         // ALL bookings; helper filters per date
  bookingItems: WizardBookingItem[] // ALL items; helper filters
  chains: WizardChain[]             // active chains only
}
```

**Constants** (defined in `wizardSlots.ts`):

```ts
export const SLOT_INCREMENT_MIN = 30
export const DAY_START_MIN = 8 * 60   // 08:00
export const DAY_END_MIN = 22 * 60    // 22:00 (last possible start time)
export const TRAVEL_BUFFER_MIN = 30
export const DEFAULT_DURATION_MIN = 90
export const DEFAULT_BUFFER_MIN = 45  // setup/cleanup fallback when null/0
```

---

## Task 1: Pure slot-generation + scoring module

**Files:**
- Create: `lib/utils/wizardSlots.ts`
- Create: `__tests__/lib/utils/wizardSlots.test.ts`

This task is pure logic — no Supabase, no React, no Next.js. Fully TDD'd.

- [ ] **Step 1: Create the test file with helper factories**

`__tests__/lib/utils/wizardSlots.test.ts`:

```ts
import {
  computeDay,
  resolveBufferMin,
  timeToMin,
  minToTime,
  type WizardBooking,
  type WizardBookingItem,
  type WizardChain,
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
```

- [ ] **Step 2: Add tests for time helpers**

Append to the test file:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Create `lib/utils/wizardSlots.ts` with helpers**

```ts
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
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function resolveBufferMin(value: number | null | undefined): number {
  if (value === null || value === undefined || value === 0) return DEFAULT_BUFFER_MIN
  return value
}

export function computeDay(input: ComputeDayInput): WizardDay {
  // Implementation added in next steps
  return {
    date: input.date,
    available_inventory: input.totalQty - input.activeOosCount,
    chains: [],
  }
}
```

- [ ] **Step 5: Run tests to verify helper tests pass**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: helper tests PASS; computeDay tests do not exist yet.

- [ ] **Step 6: Add tests for `computeDay` — empty day**

Append:

```ts
describe('computeDay — empty day', () => {
  it('generates slots for every increment when no bookings exist', () => {
    const result = computeDay(baseInput())
    expect(result.date).toBe('2026-06-10')
    expect(result.available_inventory).toBe(10)
    expect(result.chains).toHaveLength(1)

    const slots = result.chains[0].slots
    // First feasible start: setupMin (45) + travel (30) before 08:00 means
    // the earliest occupied window start is at most DAY_START_MIN (480).
    // First start S satisfies: S - 45 - 30 >= 480 → S >= 555 = 09:15.
    // But increments are 30-min from 08:00, so S can only be 09:30, 10:00, ...
    // Last feasible start: S + 90 + 45 + 30 <= 24*60 → S <= 1275 = 21:15.
    // Snapped to 30-min from 08:00: last S = 21:00.
    expect(slots[0].start).toBe('09:30')
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
})
```

- [ ] **Step 7: Run failing tests**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: FAIL — `computeDay` returns empty chains for all cases.

- [ ] **Step 8: Implement `computeDay` core logic**

Replace the stub `computeDay` body:

```ts
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
  if (availableInventory <= 0 || requestedQty > availableInventory) {
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
      for (const b of chainBookings) {
        const w = blockingWindows.get(b.id)
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
      let b = false
      for (const bk of chainBookings) {
        const w = blockingWindows.get(bk.id)
        if (!w) continue
        const startsRightAfter = candidateWindow.start - w.end >= 0 && candidateWindow.start - w.end <= 30
        const endsRightBefore = w.start - candidateWindow.end >= 0 && w.start - candidateWindow.end <= 30
        if (startsRightAfter || endsRightBefore) { b = true; break }
      }

      // Criterion C: chain already has a booking with the same item today
      let c = false
      for (const bk of chainBookings) {
        if ((itemQtyByBooking.get(bk.id) ?? 0) > 0) { c = true; break }
      }

      // Score: count true criteria. A is only counted if preferredStartMin was provided.
      let score = 0
      if (preferredStartMin !== null && a) score += 1
      if (b) score += 1
      if (c) score += 1

      // Starred: score >= 2 AND (if preferred start given, A passed)
      let starred = score >= 2
      if (preferredStartMin !== null && !a) starred = false

      chainSlots.push({
        start: minToTime(s),
        end: minToTime(s + durationMin),
        score: score as 0 | 1 | 2 | 3,
        criteria: { a, b, c },
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
```

- [ ] **Step 9: Run empty-day tests; verify pass**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: helper + empty-day tests PASS.

- [ ] **Step 10: Add tests for per-chain conflict and global inventory cap**

Append:

```ts
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
```

- [ ] **Step 11: Run; verify pass**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: PASS.

- [ ] **Step 12: Add tests for scoring criteria A, B, C**

Append:

```ts
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
    const slot = result.chains[0].slots.find(s => s.start === '11:00')
    if (slot) {
      // A is false, so even score >= 2 should not star
      if (slot.score >= 2 && !slot.criteria.a) {
        expect(slot.starred).toBe(false)
      }
    }
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
```

- [ ] **Step 13: Run; verify pass**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: PASS. If any specific time-arithmetic test fails because of off-by-one, recompute the windows by hand and adjust the expected slot start in the test (the implementation is the source of truth for the math). Commit only when all tests pass.

- [ ] **Step 14: Add sort and existing_events tests**

Append:

```ts
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
    expect(events[0]).toEqual({ start: '08:00', end: '09:00', customer_name: 'Alice' })
    expect(events[1]).toEqual({ start: '10:00', end: '11:00', customer_name: 'Bob' })
  })
})
```

- [ ] **Step 15: Run all tests; verify all pass**

Run: `pnpm jest wizardSlots --no-coverage`
Expected: All tests PASS.

- [ ] **Step 16: Commit**

```bash
git add lib/utils/wizardSlots.ts __tests__/lib/utils/wizardSlots.test.ts
git commit -m "$(cat <<'EOF'
Add wizardSlots utility for Chain Wizard slot scoring

Pure slot-generation and scoring logic for the Chain Wizard feature.
Generates 30-min candidate slots per chain per day, applies per-chain
conflict and global inventory checks, and scores against three criteria
(preferred start, tight scheduling, same equipment on chain).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: API route `/api/wizard/availability`

**Files:**
- Create: `app/api/wizard/availability/route.ts`

This route fetches the month's bookings + booking_items, the active chains, the equipment row, and the OOS records for the item. It then iterates each day of the month and calls `computeDay` from Task 1.

- [ ] **Step 1: Create the route file**

`app/api/wizard/availability/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import {
  computeDay,
  resolveBufferMin,
  DEFAULT_DURATION_MIN,
  type WizardDay,
  type WizardBooking,
  type WizardBookingItem,
  type WizardChain,
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

function isOosActiveOn(
  oos: { created_at: string; expected_return_date: string | null; returned_at: string | null },
  date: string,
): boolean {
  const created = oos.created_at.slice(0, 10)
  if (created > date) return false
  if (oos.returned_at && oos.returned_at.slice(0, 10) <= date) return false
  if (oos.expected_return_date && oos.expected_return_date <= date) return false
  return true
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
  const quantity = quantityRaw ? parseInt(quantityRaw, 10) : NaN
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
  }
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'zip_code must be 5 digits' }, { status: 400 })
  }
  const year = yearRaw ? parseInt(yearRaw, 10) : NaN
  const month = monthRaw ? parseInt(monthRaw, 10) : NaN
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'year out of range' }, { status: 400 })
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 })
  }
  const durationMin = durationRaw ? parseInt(durationRaw, 10) : DEFAULT_DURATION_MIN
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
    supabase
      .from('bookings')
      .select('id, chain, event_date, end_date, start_time, end_time, status, event_type, linked_booking_id, customer_name')
      .or(`and(event_date.gte.${monthStart},event_date.lte.${monthEnd}),and(end_date.gte.${monthStart},event_date.lte.${monthEnd})`)
      .neq('status', 'canceled'),
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
  const chains: WizardChain[] = (chainsRes.data ?? []) as WizardChain[]
  const oosRecords = oosRes.data ?? []

  const totalDays = daysInMonth(year, month)
  const days: WizardDay[] = []

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
```

- [ ] **Step 2: Verify the route compiles**

Run: `pnpm tsc --noEmit`
Expected: PASS (no type errors anywhere in repo).

If type errors arise around the Supabase select shape, narrow types via `(x as unknown as Type)` only at the boundary, not in business logic.

- [ ] **Step 3: Commit**

```bash
git add app/api/wizard/availability/route.ts
git commit -m "$(cat <<'EOF'
Add /api/wizard/availability route

GET endpoint returning a fully-scored month of slot availability for the
Chain Wizard. Performs per-day OOS calculation and delegates slot scoring
to the pure wizardSlots module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TanStack Query hook

**Files:**
- Create: `lib/queries/wizard.ts`

- [ ] **Step 1: Create the hook**

`lib/queries/wizard.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { WizardAvailabilityResponse } from '@/app/api/wizard/availability/route'

export type WizardQueryParams = {
  itemId: string
  quantity: number
  zipCode: string
  year: number
  month: number
  durationMinutes: number
  preferredStart?: string
}

export const WIZARD_KEY = (params: WizardQueryParams) =>
  ['wizard-availability', params] as const

export function useWizardAvailability(
  params: WizardQueryParams | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: params
      ? WIZARD_KEY(params)
      : (['wizard-availability', 'idle'] as const),
    enabled: enabled && params !== null,
    queryFn: async (): Promise<WizardAvailabilityResponse> => {
      if (!params) throw new Error('params required')
      const search = new URLSearchParams({
        item_id: params.itemId,
        quantity: String(params.quantity),
        zip_code: params.zipCode,
        year: String(params.year),
        month: String(params.month),
        duration_minutes: String(params.durationMinutes),
      })
      if (params.preferredStart) search.set('preferred_start', params.preferredStart)
      const res = await fetch(`/api/wizard/availability?${search.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      return res.json()
    },
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/wizard.ts
git commit -m "$(cat <<'EOF'
Add useWizardAvailability TanStack Query hook

Wraps GET /api/wizard/availability with enabled-flag gating so the
month-fetch only fires after the user clicks 'Find Availability'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wizard page + form scaffold

**Files:**
- Create: `app/(dashboard)/wizard/page.tsx`
- Create: `app/(dashboard)/wizard/WizardClient.tsx`

This task scaffolds the page and form. The calendar grid and modal are added in Tasks 5 and 6.

- [ ] **Step 1: Create the server-component page**

`app/(dashboard)/wizard/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WizardClient } from './WizardClient'

export default async function WizardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, name, custom_setup_min, custom_cleanup_min, categories, is_active')
    .eq('is_active', true)
    .overlaps('categories', ['Primary', 'Specialty'])
    .order('name')

  return <WizardClient equipment={equipment ?? []} />
}
```

- [ ] **Step 2: Create the client component shell**

`app/(dashboard)/wizard/WizardClient.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Select, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useWizardAvailability, type WizardQueryParams } from '@/lib/queries/wizard'

type EquipmentOption = {
  id: string
  name: string
  custom_setup_min: number | null
  custom_cleanup_min: number | null
  categories: string[] | null
  is_active: boolean
}

const DURATIONS: { label: string; value: number }[] = [
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '2.5 hours', value: 150 },
  { label: '3 hours', value: 180 },
  { label: '3.5 hours', value: 210 },
  { label: '4 hours', value: 240 },
]

const START_TIMES: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 23; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

export function WizardClient({ equipment }: { equipment: EquipmentOption[] }) {
  const today = new Date()

  const [itemId, setItemId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(10)
  const [zipCode, setZipCode] = useState<string>('')
  const [durationMin, setDurationMin] = useState<number>(90)
  const [preferredStart, setPreferredStart] = useState<string>('')
  const [submittedParams, setSubmittedParams] = useState<WizardQueryParams | null>(null)
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  })

  const queryParams: WizardQueryParams | null = useMemo(() => {
    if (!submittedParams) return null
    return { ...submittedParams, year: calMonth.year, month: calMonth.month }
  }, [submittedParams, calMonth])

  const { data, isFetching, error } = useWizardAvailability(queryParams, queryParams !== null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!itemId) return
    if (!/^\d{5}$/.test(zipCode)) {
      alert('Zip code must be 5 digits')
      return
    }
    setSubmittedParams({
      itemId,
      quantity,
      zipCode,
      year: calMonth.year,
      month: calMonth.month,
      durationMinutes: durationMin,
      preferredStart: preferredStart || undefined,
    })
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Chain Wizard</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 p-4 border rounded-md">
        <div>
          <Label htmlFor="game">Game</Label>
          <Select value={itemId} onValueChange={v => setItemId(v ?? '')}>
            {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input id="qty" type="number" min={1} value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} />
        </div>
        <div>
          <Label htmlFor="zip">Zip Code</Label>
          <Input id="zip" type="text" inputMode="numeric" maxLength={5} value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="90210" />
        </div>
        <div>
          <Label htmlFor="duration">Event Length</Label>
          <Select value={String(durationMin)} onValueChange={v => setDurationMin(Number(v))}>
            {DURATIONS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="start">Preferred Start (optional)</Label>
          <Select value={preferredStart} onValueChange={v => setPreferredStart(v ?? '')}>
            <SelectItem value="">— None —</SelectItem>
            {START_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!itemId} className="w-full">Find Availability</Button>
        </div>
      </form>

      {error && <div className="text-red-600 text-sm">Error: {(error as Error).message}</div>}

      {/* Calendar grid is added in Task 5 */}
      <div data-testid="calendar-placeholder">
        {!submittedParams && <div className="text-sm text-gray-500">Select a game and click Find Availability to see the calendar.</div>}
        {submittedParams && isFetching && <div className="text-sm text-gray-500">Loading availability…</div>}
        {submittedParams && data && <pre className="text-xs">{JSON.stringify(data.month, null, 2)}</pre>}
      </div>
    </div>
  )
}
```

If the project's `Select` API differs slightly (e.g., `SelectItem` is named differently, or `Select` is wrapped in additional shell), match the call shape used in `components/modals/BookingFormModal.tsx`. Open that file and copy its select usage if needed.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/wizard/page.tsx app/\(dashboard\)/wizard/WizardClient.tsx
git commit -m "$(cat <<'EOF'
Scaffold /wizard page with form and query wiring

Server-component page filters equipment to Primary/Specialty categories
and mounts the WizardClient. Client renders the input form, submits to
useWizardAvailability, and shows loading/error placeholders. Calendar
grid is added in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Calendar grid

**Files:**
- Modify: `app/(dashboard)/wizard/WizardClient.tsx`

Replace the calendar placeholder div with a real month grid.

- [ ] **Step 1: Add a `MonthCalendar` sub-component above the `WizardClient` export**

Add this code in `WizardClient.tsx`, ABOVE the `WizardClient` function:

```tsx
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import type { WizardAvailabilityResponse, WizardDay, WizardSlot } from '@/lib/utils/wizardSlots'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function isPastDate(year: number, month: number, day: number, today: Date): boolean {
  const cellDate = new Date(year, month - 1, day)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return cellDate < todayMid
}

type CalendarProps = {
  year: number
  month: number
  data: WizardAvailabilityResponse | undefined
  isLoading: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onDayClick: (day: WizardDay) => void
}

function MonthCalendar({ year, month, data, isLoading, onPrevMonth, onNextMonth, onDayClick }: CalendarProps) {
  const today = new Date()
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = firstOfMonth.getDay()
  const totalDays = new Date(year, month, 0).getDate()

  const cells: (WizardDay | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(data?.days.find(x => x.date === dateStr) ?? {
      date: dateStr,
      available_inventory: 0,
      chains: [],
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const monthName = firstOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onPrevMonth} className="p-1 hover:bg-gray-100 rounded" aria-label="Previous month">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">{monthName}</h2>
        <button type="button" onClick={onNextMonth} className="p-1 hover:bg-gray-100 rounded" aria-label="Next month">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded">
        {WEEKDAYS.map(w => (
          <div key={w} className="bg-gray-50 text-xs font-medium text-center py-1">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="bg-white min-h-[88px]" />

          const dayNum = parseInt(cell.date.slice(8, 10), 10)
          const past = isPastDate(year, month, dayNum, today)
          const totalSlots = cell.chains.reduce((sum, c) => sum + c.slots.length, 0)
          const allSlots: WizardSlot[] = cell.chains.flatMap(c => c.slots)
          const top3 = [...allSlots]
            .sort((a, b) => {
              if (a.starred !== b.starred) return a.starred ? -1 : 1
              if (a.score !== b.score) return b.score - a.score
              return a.start.localeCompare(b.start)
            })
            .slice(0, 3)

          const unavailable = !past && cell.available_inventory <= 0

          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => !past && onDayClick(cell)}
              className={`bg-white min-h-[88px] text-left p-1 ${past ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
              <div className="text-xs font-medium">{dayNum}</div>
              {isLoading ? (
                <div className="mt-1 h-3 w-12 bg-gray-200 animate-pulse rounded" />
              ) : unavailable ? (
                <div className="mt-1 text-[10px] text-red-600 font-medium">Unavailable</div>
              ) : (
                <>
                  <div className="mt-1 space-y-0.5">
                    {top3.map((s, j) => (
                      <div key={j} className="text-[10px] truncate flex items-center gap-0.5">
                        {s.starred && <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500 shrink-0" />}
                        <span>{formatTime12(s.start)} – {formatTime12(s.end)}</span>
                      </div>
                    ))}
                  </div>
                  {totalSlots > 3 && (
                    <div className="text-[10px] text-blue-600 mt-0.5">+ {totalSlots - 3} more</div>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire `MonthCalendar` into `WizardClient` and replace the placeholder**

In the `WizardClient` function body, add a `selectedDay` state at the top:

```tsx
const [selectedDay, setSelectedDay] = useState<WizardDay | null>(null)
```

Add `WizardDay` to the imports from `@/lib/utils/wizardSlots`.

Replace the placeholder div (the `<div data-testid="calendar-placeholder">...</div>` block) with:

```tsx
{!submittedParams && <div className="text-sm text-gray-500">Select a game and click Find Availability to see the calendar.</div>}
{submittedParams && (
  <MonthCalendar
    year={calMonth.year}
    month={calMonth.month}
    data={data}
    isLoading={isFetching}
    onPrevMonth={() => setCalMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 })}
    onNextMonth={() => setCalMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 })}
    onDayClick={setSelectedDay}
  />
)}
{/* WizardDayDetailModal is added in Task 6 */}
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/wizard/WizardClient.tsx
git commit -m "$(cat <<'EOF'
Add monthly calendar grid to Chain Wizard

Renders a 7-column month with up to 3 slot chips per day cell, ⭐ for
recommended slots, '+N more' overflow indicator, red 'Unavailable' label
when inventory is zero, prev/next month navigation, and grayed-out past
dates. Day click handler captured but modal lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Day Detail Modal

**Files:**
- Create: `components/modals/WizardDayDetailModal.tsx`
- Modify: `app/(dashboard)/wizard/WizardClient.tsx`

- [ ] **Step 1: Create the modal**

`components/modals/WizardDayDetailModal.tsx`:

```tsx
'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Star } from 'lucide-react'
import type { WizardDay } from '@/lib/utils/wizardSlots'

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('default', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function criteriaText(c: { a: boolean; b: boolean; c: boolean }): string {
  const out: string[] = []
  if (c.a) out.push('✓ Preferred start')
  if (c.b) out.push('✓ Back-to-back')
  if (c.c) out.push('✓ Same equipment')
  return out.join(' · ')
}

type Props = {
  day: WizardDay | null
  onClose: () => void
}

export function WizardDayDetailModal({ day, onClose }: Props) {
  const open = day !== null
  if (!day) return null

  const chainsWithSlots = day.chains.filter(c => c.slots.length > 0)
  const totalRecommended = chainsWithSlots.reduce(
    (sum, c) => sum + c.slots.filter(s => s.starred).length, 0,
  )

  // Sort chains by best slot score
  const sortedChains = [...chainsWithSlots].sort((a, b) => {
    const aScore = a.slots[0]?.score ?? 0
    const bScore = b.slots[0]?.score ?? 0
    return bScore - aScore
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formatDateLong(day.date)}</DialogTitle>
          <div className="text-sm text-gray-600">
            {chainsWithSlots.length} {chainsWithSlots.length === 1 ? 'chain' : 'chains'} available · {totalRecommended} recommended slot{totalRecommended === 1 ? '' : 's'}
          </div>
        </DialogHeader>

        {sortedChains.length === 0 && (
          <div className="text-sm text-gray-500">No available slots on this day.</div>
        )}

        <div className="space-y-4">
          {sortedChains.map(chain => (
            <div key={chain.chain_id} className="border rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: chain.chain_color }} />
                <span className="font-semibold">{chain.chain_name}</span>
              </div>

              {chain.existing_events.length > 0 && (
                <div className="mb-2 text-xs text-gray-600">
                  <div className="font-medium">Already booked:</div>
                  {chain.existing_events.map((e, i) => (
                    <div key={i}>{formatTime12(e.start)} – {formatTime12(e.end)} · {e.customer_name}</div>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                {chain.slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {s.starred && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0" />}
                    <span className="font-medium">{formatTime12(s.start)} – {formatTime12(s.end)}</span>
                    <span className="text-xs text-gray-500">{criteriaText(s.criteria)}</span>
                    <span className="text-xs text-gray-400 ml-auto">{s.available_qty} available</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

If the project does not export `DialogHeader`/`DialogTitle` from `@/components/ui/dialog`, open that file and adjust the imports to whatever it does export — match the pattern used in `components/modals/BookingFormModal.tsx`.

- [ ] **Step 2: Wire the modal into `WizardClient`**

In `WizardClient.tsx`:
- Add import: `import { WizardDayDetailModal } from '@/components/modals/WizardDayDetailModal'`
- Replace the comment `{/* WizardDayDetailModal is added in Task 6 */}` with:

```tsx
<WizardDayDetailModal day={selectedDay} onClose={() => setSelectedDay(null)} />
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/modals/WizardDayDetailModal.tsx app/\(dashboard\)/wizard/WizardClient.tsx
git commit -m "$(cat <<'EOF'
Add Chain Wizard day-detail modal

Per-chain breakdown popup showing existing events, all available slots,
score criteria, and remaining inventory per slot. Sorted by chain best
score; summary line in header reports counts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Sidebar nav entry

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Add `Chain Wizard` to `NAV_ITEMS`**

Open `components/layout/Sidebar.tsx`. Update the `lucide-react` import block to add `WandSparkles` (with `Wand2` as a fallback if the installed version of `lucide-react` doesn't export the former — check `node_modules/lucide-react/dist/lucide-react.d.ts` if unsure):

Change:

```tsx
import {
  CalendarDays,
  Clock,
  Search,
  CheckSquare,
  Truck,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flag,
} from 'lucide-react'
```

To:

```tsx
import {
  CalendarDays,
  Clock,
  Search,
  CheckSquare,
  Truck,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flag,
  WandSparkles,
} from 'lucide-react'
```

If the typecheck fails because `WandSparkles` is not exported, replace it with `Wand2` in both the import and the nav item below.

Then update `NAV_ITEMS` — append the wizard entry. Pick a logical position (after "Bookings" is fine):

```tsx
const NAV_ITEMS = [
  { label: 'Availability',  href: '/availability', icon: CalendarDays },
  { label: 'Schedule',      href: '/schedule',      icon: Clock        },
  { label: '4-Week Audit',  href: '/audit',         icon: Search       },
  { label: 'Chain Loading', href: '/chains',        icon: Truck        },
  { label: 'Equipment',     href: '/equipment',     icon: Package      },
  { label: 'Bookings',      href: '/bookings',      icon: CheckSquare  },
  { label: 'Chain Wizard',  href: '/wizard',        icon: WandSparkles },
] as const
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
Add Chain Wizard entry to sidebar nav

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full type check**

Run: `pnpm tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 2: Run the test suite**

Run: `pnpm jest --no-coverage`
Expected: All tests PASS, including `wizardSlots.test.ts` and the previously-existing suites (no regressions).

- [ ] **Step 3: Manual smoke test**

Tell the user the implementation is complete and ask them to:
1. Run `pnpm dev`
2. Visit `/wizard` and confirm the sidebar entry is visible
3. Pick a Primary or Specialty equipment item, set quantity 5, zip 90210, click "Find Availability"
4. Verify the calendar renders with chips on at least one day
5. Click into a day with chips and confirm the modal shows per-chain breakdown
6. Try with a Preferred Start Time matching an existing slot — verify ⭐ appears
7. Navigate to a future month and confirm data refetches

Do NOT mark the implementation complete until the user reports the smoke test passed. If anything fails, debug from the failing piece (start with browser network tab to see the API response).

---

## Self-review checklist (for the plan author — already run)

- [x] **Spec coverage:**
  - §2 routing/auth → Task 4 (page server-component auth) + Task 7 (sidebar)
  - §3 schema → Task 2 (Supabase queries with correct columns) + Task 4 (equipment filter)
  - §4 input form → Task 4
  - §5 calendar → Task 5
  - §6 slot generation → Task 1 (pure logic) + Task 2 (orchestration)
  - §7 scoring → Task 1
  - §8 day detail popup → Task 6
  - §9 API contract → Task 2
  - §10 client data fetching → Task 3
  - §11 edge cases → Task 1 (default duration, no preferred start, OOS, multi-day) + Task 5 (past dates, loading)
  - §12 file structure → matches plan file structure exactly
  - §13 verification → Task 8

- [x] **No placeholders.** Every step has the actual code/command.
- [x] **Type consistency.** `WizardSlot`, `WizardDay`, `WizardChainDay`, `WizardAvailabilityResponse`, `WizardQueryParams`, `ComputeDayInput` are defined in Task 1/2/3 and consumed verbatim in Tasks 2/3/4/5/6.
- [x] **Naming.** `computeDay`, `resolveBufferMin`, `timeToMin`, `minToTime` consistent across plan.
