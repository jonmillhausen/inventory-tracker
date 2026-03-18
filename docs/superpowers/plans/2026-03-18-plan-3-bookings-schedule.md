# Wonderfly Inventory — Plan 3: Bookings & Schedule

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Bookings CRUD, Schedule Board, and Chain Loading (packing list) features.

**Architecture:** Server Components fetch initial data → pass as `initialData` to Client Components (no loading flash). TanStack Query manages client-side cache. Booking CRUD goes through API routes with role enforcement. Packing list is a pure function computed client-side and printed via an HMAC-token-gated public route.

**Tech Stack:** Next.js 14 App Router, Supabase SSR, TanStack Query v5, shadcn/ui (Dialog, Table, Badge, Select, Input, Button), TypeScript

**This is Plan 3 of 4.** Plans 1 and 2 must be complete. Plan 4 builds on this.

---

## Pre-existing files from Plans 1 & 2

These files already exist on `main` and must not be recreated:

```
lib/api/auth.ts                   roleAllows(), getSessionAndRole(allowedRoles)
lib/supabase/server.ts            createClient() (async, server-side)
lib/supabase/client.ts            createBrowserClient()
lib/auth/roles.ts                 canWrite(), canAdmin(), canAssignChain(), canCreateIssueFlag(), canCheckPackingList()
lib/types/database.types.ts       Database, UserRole, BookingStatus, EventType, BookingSource, ItemType
lib/queries/bookings.ts           useBookings(initialData?), BOOKINGS_KEY — currently filters canceled (will change in Task 2)
lib/queries/equipment.ts          useEquipment, useEquipmentSubItems, EQUIPMENT_KEY, SUB_ITEMS_KEY + all mutations
lib/hooks/useRealtimeSync.ts      Realtime subscriptions → TanStack Query invalidations
lib/utils/availability.ts         isBookingActiveOnDate(), calculateAvailability()
app/(dashboard)/layout.tsx        QueryProvider + RealtimeSync + Sidebar + TopBar
components/providers/RealtimeSync.tsx    Thin wrapper calling useRealtimeSync()
components/modals/IssueFlagModal.tsx
components/modals/OOSModal.tsx
components/modals/ResolveIssueFlagModal.tsx
components/modals/EquipmentFormModal.tsx
components/modals/SubItemFormModal.tsx
app/(dashboard)/bookings/page.tsx   placeholder
app/(dashboard)/schedule/page.tsx   placeholder
app/(dashboard)/chains/page.tsx     placeholder
```

---

## File Map

### New files

```
lib/utils/packingList.ts
lib/supabase/service-role.ts               Service role Supabase client (bypasses RLS; used only in unauthenticated routes)
lib/queries/chains.ts
app/api/bookings/route.ts
app/api/bookings/[id]/route.ts
app/api/bookings/[id]/assign-chain/route.ts
app/api/packing-list/token/route.ts
app/api/packing-list/[token]/[chain]/[date]/route.ts
app/(dashboard)/bookings/BookingsClient.tsx
app/(dashboard)/schedule/ScheduleClient.tsx
app/(dashboard)/chains/ChainsClient.tsx
components/modals/BookingFormModal.tsx
__tests__/lib/utils/packingList.test.ts
```

### Modified files

```
lib/queries/bookings.ts              Remove canceled filter; add useCreateBooking, useUpdateBooking, useDeleteBooking, useAssignChain
lib/hooks/useRealtimeSync.ts         Add chains table subscription
app/(dashboard)/bookings/page.tsx    Replace placeholder with full server component
app/(dashboard)/schedule/page.tsx    Replace placeholder with full server component
app/(dashboard)/chains/page.tsx      Replace placeholder with full server component
```

---

## Environment Variable Requirement

Before the print route works, `.env.local` must contain:

```
PACKING_LIST_SECRET=<random hex string>
```

Generate a suitable secret with:

```bash
openssl rand -hex 32
```

This secret is used to sign and verify HMAC tokens for the public packing list print route. Without it the route will use an empty string as the secret, which is a security vulnerability — always set this before deploying.

---

## FK Cascade Note

The `booking_items` table has a foreign key to `bookings`. The migration SQL (from the spec) includes `ON DELETE CASCADE` on this FK, so deleting a booking automatically deletes its booking_items. If for any reason cascade was not applied, the `DELETE /api/bookings/[id]` route must manually delete booking_items first before deleting the booking. The plan's implementation deletes booking_items first as a safety measure in case cascade is absent.

---

## useBookings Filter Change Rationale

`lib/queries/bookings.ts` currently has `.neq('status', 'canceled')` in the query. This filter must be removed in Task 2 so that:

1. The Bookings tab can display canceled bookings (with visual dimming).
2. The packing list and schedule board can confidently filter using `isBookingActiveOnDate`, which already excludes canceled bookings (`const INACTIVE_STATUSES: BookingStatus[] = ['canceled']`).

The availability tab (Plan 2) is unaffected because `calculateAvailability` calls `isBookingActiveOnDate` internally — canceled bookings are already excluded there regardless of what `useBookings` returns.

---

## Task 1: Packing List Calculation (TDD)

**Create test file first, then implementation.**

- [ ] 1.1 Create `__tests__/lib/utils/packingList.test.ts`
- [ ] 1.1b Run tests to verify they are RED: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --testPathPattern=packingList`
  - Expected: tests FAIL (Cannot find module '@/lib/utils/packingList' or similar)
- [ ] 1.2 Create `lib/utils/packingList.ts`
- [ ] 1.3 Run tests: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --testPathPattern=packingList`
- [ ] 1.4 Verify all tests pass, fix any failures
- [ ] 1.5 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 1.6 Commit: `git commit -m "feat: add calculatePackingList utility with full TDD test suite"`

### `__tests__/lib/utils/packingList.test.ts`

```typescript
import { calculatePackingList } from '@/lib/utils/packingList'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

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
    const result = calculatePackingList([], [], [BASE_EQUIPMENT], [BASE_SUB_ITEM], 'chain_1', '2026-04-01')
    expect(result).toEqual([])
  })

  test('single dropoff event sums items', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_type: 'dropoff' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
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
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(5)
  })

  test('two coordinated events for same item use max (2,3=3)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'coordinated' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'coordinated' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(3)
  })

  test('willcall is treated same as dropoff (additive)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'willcall' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'willcall' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(4)
  })

  test('pickup is treated same as coordinated (max)', () => {
    const b1: BookingRow = { ...BASE_BOOKING, id: 'b1', event_type: 'pickup' }
    const b2: BookingRow = { ...BASE_BOOKING, id: 'b2', event_type: 'pickup' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 1, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b2', item_id: 'eq1', qty: 4, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([b1, b2], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
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
    const result = calculatePackingList([drop1, drop2, coord1, coord2], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(9)
  })

  test('ignores bookings for a different chain', () => {
    const booking: BookingRow = { ...BASE_BOOKING, chain: 'chain_2' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('ignores canceled bookings', () => {
    const booking: BookingRow = { ...BASE_BOOKING, status: 'canceled' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('ignores bookings outside selected date range', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_date: '2026-04-10', end_date: null }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 3, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })

  test('includes booking when date falls within multi-day range', () => {
    const booking: BookingRow = { ...BASE_BOOKING, event_date: '2026-03-30', end_date: '2026-04-03' }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 2, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result[0].qty).toBe(2)
  })

  test('results sorted by name', () => {
    const eq2: EquipmentRow = { ...BASE_EQUIPMENT, id: 'eq2', name: 'Archery Set' }
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 1, is_sub_item: false, parent_item_id: null },
      { id: 'bi2', booking_id: 'b1', item_id: 'eq2', qty: 1, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT, eq2], [], 'chain_1', '2026-04-01')
    expect(result[0].name).toBe('Archery Set')
    expect(result[1].name).toBe('Bounce House')
  })

  test('sub-items included with parentItemId set', () => {
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'sub1', qty: 2, is_sub_item: true, parent_item_id: 'eq1' },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [BASE_SUB_ITEM], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ itemId: 'sub1', name: 'Blower', qty: 2, isSubItem: true, parentItemId: 'eq1' })
  })

  test('items with qty 0 are excluded from results', () => {
    const booking: BookingRow = { ...BASE_BOOKING }
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'eq1', qty: 0, is_sub_item: false, parent_item_id: null },
    ]
    const result = calculatePackingList([booking], items, [BASE_EQUIPMENT], [], 'chain_1', '2026-04-01')
    expect(result).toHaveLength(0)
  })
})
```

### `lib/utils/packingList.ts`

```typescript
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
```

---

## Task 2: Update Bookings Hook + Add Chain Hook + Mutations

- [ ] 2.1 Update `lib/queries/bookings.ts` — remove canceled filter, add mutations
- [ ] 2.2 Create `lib/queries/chains.ts`
- [ ] 2.3 Update `lib/hooks/useRealtimeSync.ts` — add chains subscription
- [ ] 2.4 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 2.5 Commit: `git commit -m "feat: update bookings hook (remove canceled filter), add booking mutations, add chains hook"`

### `lib/queries/bookings.ts` (complete replacement)

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export const BOOKINGS_KEY = ['bookings'] as const

export interface BookingsData {
  bookings: BookingRow[]
  bookingItems: BookingItemRow[]
}

// NOTE: The canceled filter has been intentionally removed.
// calculateAvailability() already excludes canceled bookings via isBookingActiveOnDate().
// The Bookings tab needs to display canceled bookings (with visual dimming).
export function useBookings(initialData?: BookingsData) {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async (): Promise<BookingsData> => {
      const supabase = createClient()
      const [{ data: bookings, error: bErr }, { data: bookingItems, error: biErr }] =
        await Promise.all([
          supabase.from('bookings').select('*').order('event_date', { ascending: false }),
          supabase.from('booking_items').select('*'),
        ])
      if (bErr) throw bErr
      if (biErr) throw biErr
      return {
        bookings: bookings as BookingRow[],
        bookingItems: bookingItems as BookingItemRow[],
      }
    },
    initialData,
  })
}

export interface BookingItemInput {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export interface CreateBookingInput {
  customer_name: string
  event_date: string
  end_date?: string | null
  start_time: string
  end_time: string
  address: string
  event_type: string
  chain?: string | null
  notes?: string
  items: BookingItemInput[]
}

export interface UpdateBookingInput {
  id: string
  customer_name?: string
  event_date?: string
  end_date?: string | null
  start_time?: string
  end_time?: string
  address?: string
  event_type?: string
  chain?: string | null
  status?: string
  notes?: string
  items?: BookingItemInput[]
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateBookingInput) => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateBookingInput) => {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useDeleteBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}

export function useAssignChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, chain }: { id: string; chain: string | null }) => {
      const res = await fetch(`/api/bookings/${id}/assign-chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
  })
}
```

### `lib/queries/chains.ts` (new file)

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type ChainRow = Database['public']['Tables']['chains']['Row']

export const CHAINS_KEY = ['chains'] as const

export function useChains(initialData?: ChainRow[]) {
  return useQuery({
    queryKey: CHAINS_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('chains')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as ChainRow[]
    },
    initialData,
  })
}
```

### `lib/hooks/useRealtimeSync.ts` (complete replacement)

```typescript
'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { EQUIPMENT_KEY, SUB_ITEMS_KEY } from '@/lib/queries/equipment'
import { BOOKINGS_KEY } from '@/lib/queries/bookings'
import { CHAINS_KEY } from '@/lib/queries/chains'

const SERVICE_MAPPINGS_KEY = ['service_mappings']

export function useRealtimeSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const bookingsChannel = supabase
      .channel('rt-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        qc.invalidateQueries({ queryKey: BOOKINGS_KEY })
      })
      .subscribe()

    const equipmentChannel = supabase
      .channel('rt-equipment')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_sub_items' }, () => {
        qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issue_flag_items' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'out_of_service_items' }, () => {
        qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
      })
      .subscribe()

    const mappingsChannel = supabase
      .channel('rt-service-mappings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_mappings' }, () => {
        qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY })
      })
      .subscribe()

    const chainsChannel = supabase
      .channel('rt-chains')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chains' }, () => {
        qc.invalidateQueries({ queryKey: CHAINS_KEY })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(bookingsChannel)
      supabase.removeChannel(equipmentChannel)
      supabase.removeChannel(mappingsChannel)
      supabase.removeChannel(chainsChannel)
    }
  }, [qc])
}
```

---

## Task 3: Bookings API Routes

- [ ] 3.1 Create `app/api/bookings/route.ts`
- [ ] 3.2 Create `app/api/bookings/[id]/route.ts`
- [ ] 3.3 Create `app/api/bookings/[id]/assign-chain/route.ts`
- [ ] 3.4 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 3.5 Commit: `git commit -m "feat: add bookings API routes (CRUD + assign-chain)"`

### `app/api/bookings/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    customer_name,
    event_date,
    end_date = null,
    start_time,
    end_time,
    address,
    event_type,
    chain = null,
    notes = '',
    items = [],
  } = body as Record<string, unknown>

  // Validate required fields
  if (!customer_name || typeof customer_name !== 'string') {
    return NextResponse.json({ error: 'customer_name is required' }, { status: 400 })
  }
  if (!event_date || typeof event_date !== 'string') {
    return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
  }
  if (!start_time || typeof start_time !== 'string') {
    return NextResponse.json({ error: 'start_time is required' }, { status: 400 })
  }
  if (!end_time || typeof end_time !== 'string') {
    return NextResponse.json({ error: 'end_time is required' }, { status: 400 })
  }
  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }
  if (!event_type || typeof event_type !== 'string') {
    return NextResponse.json({ error: 'event_type is required' }, { status: 400 })
  }

  // Insert booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      customer_name: customer_name as string,
      event_date: event_date as string,
      end_date: end_date as string | null,
      start_time: start_time as string,
      end_time: end_time as string,
      address: address as string,
      event_type: event_type as 'coordinated' | 'dropoff' | 'pickup' | 'willcall',
      chain: chain as string | null,
      notes: (notes as string) || '',
      status: 'confirmed',
      source: 'manual',
      zenbooker_job_id: null, // manual bookings have no Zenbooker ID; null satisfies UNIQUE (multiple nulls allowed in Postgres)
    })
    .select()
    .single()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  // Batch insert booking_items (only items with qty > 0)
  const validItems = (items as Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }>)
    .filter(item => item.qty > 0)

  if (validItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('booking_items')
      .insert(
        validItems.map(item => ({
          booking_id: booking.id,
          item_id: item.item_id,
          qty: item.qty,
          is_sub_item: item.is_sub_item,
          parent_item_id: item.parent_item_id ?? null,
        }))
      )
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  return NextResponse.json(booking, { status: 201 })
}
```

### `app/api/bookings/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    items,
    customer_name,
    event_date,
    end_date,
    start_time,
    end_time,
    address,
    event_type,
    chain,
    status,
    notes,
  } = body as Record<string, unknown>

  // Build update object from provided fields only
  const updateFields: Record<string, unknown> = {}
  if (customer_name !== undefined) updateFields.customer_name = customer_name
  if (event_date !== undefined) updateFields.event_date = event_date
  if (end_date !== undefined) updateFields.end_date = end_date
  if (start_time !== undefined) updateFields.start_time = start_time
  if (end_time !== undefined) updateFields.end_time = end_time
  if (address !== undefined) updateFields.address = address
  if (event_type !== undefined) updateFields.event_type = event_type
  if (chain !== undefined) updateFields.chain = chain
  if (status !== undefined) updateFields.status = status
  if (notes !== undefined) updateFields.notes = notes

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update(updateFields)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // If items provided, replace booking_items
  if (Array.isArray(items)) {
    // Delete existing booking_items
    const { error: deleteError } = await supabase
      .from('booking_items')
      .delete()
      .eq('booking_id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Re-insert new booking_items (only qty > 0)
    const validItems = (items as Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }>)
      .filter(item => item.qty > 0)

    if (validItems.length > 0) {
      const { error: insertError } = await supabase
        .from('booking_items')
        .insert(
          validItems.map(item => ({
            booking_id: id,
            item_id: item.item_id,
            qty: item.qty,
            is_sub_item: item.is_sub_item,
            parent_item_id: item.parent_item_id ?? null,
          }))
        )
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  }

  // Return updated booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  return NextResponse.json(booking)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  // Delete booking_items first (safety in case no CASCADE on FK)
  const { error: itemsError } = await supabase
    .from('booking_items')
    .delete()
    .eq('booking_id', id)

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Delete booking
  const { error: bookingError } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
```

### `app/api/bookings/[id]/assign-chain/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // staff can assign chains (not just admin/sales)
  const auth = await getSessionAndRole(['admin', 'sales', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { chain } = body as { chain: string | null }

  const { data: booking, error } = await supabase
    .from('bookings')
    .update({ chain: chain ?? null })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(booking)
}
```

---

## Task 4: Packing List Routes

- [ ] 4.1 Create `lib/supabase/service-role.ts`
- [ ] 4.2 Create `app/api/packing-list/token/route.ts`
- [ ] 4.3 Create `app/api/packing-list/[token]/[chain]/[date]/route.ts`
- [ ] 4.4 Verify `PACKING_LIST_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are in `.env.local` (add them if missing)
- [ ] 4.5 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 4.6 Commit: `git commit -m "feat: add packing list HMAC token route and public print route"`

**Note:** The middleware at `lib/supabase/middleware.ts` already lists `/api/packing-list` as a public path. Verify this is in place before testing the print route without auth.

### `app/api/packing-list/token/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff', 'readonly'])
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { chain, date, end_date } = body as { chain?: string; date?: string; end_date?: string | null }

  if (!chain || !date) {
    return NextResponse.json({ error: 'chain and date are required' }, { status: 400 })
  }

  // end_date defaults to date (for single-day events)
  const effectiveEndDate = end_date || date

  // HMAC signs chain + event_date + end_date per spec
  const token = createHmac('sha256', process.env.PACKING_LIST_SECRET || '')
    .update(`${chain}:${date}:${effectiveEndDate}`)
    .digest('hex')

  // end_date included in URL so print route can reconstruct HMAC and validate window
  const url = `/api/packing-list/${token}/${encodeURIComponent(chain)}/${date}?end_date=${effectiveEndDate}`

  return NextResponse.json({ url })
}
```

### `lib/supabase/service-role.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

// Bypasses RLS — only use in server-side routes that do their own authorization.
// SUPABASE_SERVICE_ROLE_KEY must never be exposed to the client.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

**Environment variable:** `SUPABASE_SERVICE_ROLE_KEY` must be in `.env.local`. Find it in the Supabase project dashboard under Settings → API → service_role secret key.

---

### `app/api/packing-list/[token]/[chain]/[date]/route.ts`

```typescript
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { calculatePackingList } from '@/lib/utils/packingList'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; chain: string; date: string }> }
) {
  const { token, chain: encodedChain, date } = await params
  const chain = decodeURIComponent(encodedChain)

  // end_date from query string (set by token generation route); defaults to date for single-day events
  const { searchParams } = new URL(request.url)
  const end_date = searchParams.get('end_date') || date

  // Validate HMAC token (must match the formula used in token generation)
  const expected = createHmac('sha256', process.env.PACKING_LIST_SECRET || '')
    .update(`${chain}:${date}:${end_date}`)
    .digest('hex')

  const tokenBuf = Buffer.from(token, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokensMatch =
    tokenBuf.length === expectedBuf.length &&
    timingSafeEqual(tokenBuf, expectedBuf)

  if (!tokensMatch) {
    return new Response('Forbidden', { status: 403 })
  }

  // Validity window check: valid from (event_date - 1 day) through (end_date + 1 day)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const windowStart = new Date(date + 'T00:00:00Z')
  windowStart.setUTCDate(windowStart.getUTCDate() - 1)
  const windowEnd = new Date(end_date + 'T00:00:00Z')
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1)

  if (today < windowStart || today > windowEnd) {
    return new Response('Forbidden', { status: 403 })
  }

  // Service role client bypasses RLS — this route is unauthenticated (token-gated)
  const supabase = createServiceRoleClient()

  // Fetch all data needed for packing list
  const [
    { data: bookings, error: bErr },
    { data: bookingItems, error: biErr },
    { data: equipment, error: eErr },
    { data: subItems, error: sErr },
    { data: chains, error: cErr },
  ] = await Promise.all([
    supabase.from('bookings').select('*'),
    supabase.from('booking_items').select('*'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_items').select('*').eq('is_active', true).order('name'),
    supabase.from('chains').select('*').eq('id', chain).single(),
  ])

  if (bErr || biErr || eErr || sErr) {
    return new Response('Internal Server Error', { status: 500 })
  }

  const chainName = cErr || !chains ? chain : chains.name

  const rows = calculatePackingList(
    bookings as BookingRow[],
    bookingItems as BookingItemRow[],
    equipment as EquipmentRow[],
    subItems as SubItemRow[],
    chain,
    date
  )

  const parentItems = rows.filter(r => !r.isSubItem)
  const subItemRows = rows.filter(r => r.isSubItem)

  // Get the chain bookings active on this date (for the events table)
  const { isBookingActiveOnDate } = await import('@/lib/utils/availability')
  const chainBookings = (bookings as BookingRow[])
    .filter(b => b.chain === chain && isBookingActiveOnDate(b, date))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  // Format date for display
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const parentTableRows = parentItems
    .map(item => `<tr><td class="check"></td><td>${escapeHtml(item.name)}</td><td>${item.qty}</td></tr>`)
    .join('\n')

  const subItemTableRows = subItemRows
    .map(item => `<tr><td class="check"></td><td>${escapeHtml(item.name)}</td><td>${item.qty}</td></tr>`)
    .join('\n')

  const eventTableRows = chainBookings
    .map(b => `<tr><td>${escapeHtml(b.customer_name)}</td><td>${b.start_time}–${b.end_time}</td><td>${b.event_type}</td><td>${escapeHtml(b.address)}</td></tr>`)
    .join('\n')

  const subItemSection = subItemRows.length > 0
    ? `
  <h2>Support Equipment</h2>
  <table>
    <tr><th class="check">✓</th><th>Item</th><th>Qty</th></tr>
    ${subItemTableRows}
  </table>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(chainName)} Packing List — ${escapeHtml(date)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    h1, h2 { margin-bottom: 8px; }
    .check { width: 24px; text-align: center; }
    @media print {
      body { padding: 10px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(chainName)} Packing List</h1>
  <p>${escapeHtml(formattedDate)}</p>

  <h2>Equipment</h2>
  ${parentItems.length > 0
    ? `<table>
    <tr><th class="check">✓</th><th>Equipment</th><th>Qty</th></tr>
    ${parentTableRows}
  </table>`
    : '<p>No equipment for this chain on this date.</p>'}
  ${subItemSection}

  <h2>Events (${chainBookings.length})</h2>
  ${chainBookings.length > 0
    ? `<table>
    <tr><th>Customer</th><th>Time</th><th>Type</th><th>Address</th></tr>
    ${eventTableRows}
  </table>`
    : '<p>No events for this chain on this date.</p>'}
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

---

## Task 5: BookingFormModal

- [ ] 5.1 Create `components/modals/BookingFormModal.tsx`
- [ ] 5.2 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 5.3 Commit: `git commit -m "feat: add BookingFormModal for create/edit bookings"`

### `components/modals/BookingFormModal.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateBooking, useUpdateBooking } from '@/lib/queries/bookings'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { useChains } from '@/lib/queries/chains'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export interface BookingItemWithName extends BookingItemRow {
  name: string
}

interface Props {
  booking?: BookingRow & { items: BookingItemWithName[] }
  onClose: () => void
}

interface ItemQty {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export function BookingFormModal({ booking, onClose }: Props) {
  const isEdit = !!booking

  const { data: equipment = [] } = useEquipment()
  const { data: subItems = [] } = useEquipmentSubItems()
  const { data: chains = [] } = useChains()

  const createBooking = useCreateBooking()
  const updateBooking = useUpdateBooking()

  const [customerName, setCustomerName] = useState(booking?.customer_name ?? '')
  const [eventDate, setEventDate] = useState(booking?.event_date ?? '')
  const [endDate, setEndDate] = useState(booking?.end_date ?? '')
  const [startTime, setStartTime] = useState(booking?.start_time ?? '')
  const [endTime, setEndTime] = useState(booking?.end_time ?? '')
  const [address, setAddress] = useState(booking?.address ?? '')
  const [eventType, setEventType] = useState<string>(booking?.event_type ?? 'dropoff')
  const [chain, setChain] = useState<string>(booking?.chain ?? '')
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  // Build initial item qty map from existing booking items
  const [itemQtyMap, setItemQtyMap] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>()
    if (booking?.items) {
      for (const item of booking.items) {
        map.set(item.item_id, item.qty)
      }
    }
    return map
  })

  const activeEquipment = equipment.filter(e => e.is_active)

  // Group sub-items by parent
  const subsByParent = new Map<string, SubItemRow[]>()
  for (const sub of subItems) {
    if (!sub.is_active) continue
    const list = subsByParent.get(sub.parent_id) ?? []
    list.push(sub)
    subsByParent.set(sub.parent_id, list)
  }

  function setItemQty(itemId: string, qty: number) {
    setItemQtyMap(prev => {
      const next = new Map(prev)
      if (qty <= 0) {
        next.delete(itemId)
      } else {
        next.set(itemId, qty)
      }
      return next
    })
  }

  function buildItemsPayload(): ItemQty[] {
    const items: ItemQty[] = []
    for (const eq of activeEquipment) {
      const qty = itemQtyMap.get(eq.id) ?? 0
      if (qty > 0) {
        items.push({ item_id: eq.id, qty, is_sub_item: false, parent_item_id: null })
      }
      for (const sub of subsByParent.get(eq.id) ?? []) {
        const subQty = itemQtyMap.get(sub.id) ?? 0
        if (subQty > 0) {
          items.push({ item_id: sub.id, qty: subQty, is_sub_item: true, parent_item_id: eq.id })
        }
      }
    }
    return items
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const payload = {
      customer_name: customerName.trim(),
      event_date: eventDate,
      end_date: endDate || null,
      start_time: startTime,
      end_time: endTime,
      address: address.trim(),
      event_type: eventType,
      chain: chain || null,
      notes: notes.trim(),
      items: buildItemsPayload(),
    }

    try {
      if (isEdit && booking) {
        await updateBooking.mutateAsync({ id: booking.id, ...payload })
      } else {
        await createBooking.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const isPending = createBooking.isPending || updateBooking.isPending

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Booking' : 'New Booking'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Customer Name */}
          <div className="space-y-1">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="eventDate">Event Date *</Label>
              <Input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End Date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Times row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="startTime">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endTime">End Time *</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label htmlFor="address">Address *</Label>
            <Input
              id="address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          {/* Event Type + Chain row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Event Type *</Label>
              <Select value={eventType} onValueChange={setEventType} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coordinated">Coordinated</SelectItem>
                  <SelectItem value="dropoff">Drop-off</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="willcall">Will Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chain</Label>
              <Select value={chain} onValueChange={setChain} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {chains.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Equipment Section */}
          {activeEquipment.length > 0 && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Equipment</Label>
              <div className="border rounded-md divide-y">
                {activeEquipment.map(eq => {
                  const childSubs = subsByParent.get(eq.id) ?? []
                  return (
                    <div key={eq.id}>
                      {/* Parent equipment row */}
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-medium">{eq.name}</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-20 h-8 text-center"
                          value={itemQtyMap.get(eq.id) ?? 0}
                          onChange={e => setItemQty(eq.id, Number(e.target.value))}
                          disabled={isPending}
                        />
                      </div>
                      {/* Sub-items indented */}
                      {childSubs.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between px-3 py-2 pl-8 bg-gray-50">
                          <span className="text-sm text-gray-600">{sub.name}</span>
                          <Input
                            type="number"
                            min={0}
                            className="w-20 h-8 text-center"
                            value={itemQtyMap.get(sub.id) ?? 0}
                            onChange={e => setItemQty(sub.id, Number(e.target.value))}
                            disabled={isPending}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Task 6: Bookings Tab

- [ ] 6.1 Replace `app/(dashboard)/bookings/page.tsx`
- [ ] 6.2 Create `app/(dashboard)/bookings/BookingsClient.tsx`
- [ ] 6.3 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 6.4 Commit: `git commit -m "feat: implement Bookings tab with CRUD, filters, and status badges"`

### `app/(dashboard)/bookings/page.tsx` (replaces placeholder)

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BookingsClient } from './BookingsClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'
import type { UserRole } from '@/lib/types/database.types'

type ChainRow = Database['public']['Tables']['chains']['Row']

export default async function BookingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const [
    { data: bookings },
    { data: bookingItems },
    { data: chains },
  ] = await Promise.all([
    supabase.from('bookings').select('*').order('event_date', { ascending: false }),
    supabase.from('booking_items').select('*'),
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: bookings ?? [],
    bookingItems: bookingItems ?? [],
  }

  return (
    <BookingsClient
      initialData={initialData}
      initialChains={(chains ?? []) as ChainRow[]}
      role={profile.role as UserRole}
    />
  )
}
```

### `app/(dashboard)/bookings/BookingsClient.tsx`

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useBookings, useDeleteBooking, useUpdateBooking, useAssignChain } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { canWrite, canAssignChain } from '@/lib/auth/roles'
import { BookingFormModal } from '@/components/modals/BookingFormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { Database, UserRole } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'
import type { BookingItemWithName } from '@/components/modals/BookingFormModal'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']
type BookingStatus = Database['public']['Enums']['booking_status']
type EventType = Database['public']['Enums']['event_type']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
  role: UserRole
}

const STATUS_BADGE: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  needs_review: { label: 'Needs Review', className: 'bg-yellow-100 text-yellow-800' },
  canceled: { label: 'Canceled', className: 'bg-gray-100 text-gray-600' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800' },
}

export function BookingsClient({ initialData, initialChains, role }: Props) {
  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)
  const deleteBooking = useDeleteBooking()
  const updateBooking = useUpdateBooking()
  const assignChain = useAssignChain()

  const [showCreate, setShowCreate] = useState(false)
  const [editBooking, setEditBooking] = useState<(BookingRow & { items: BookingItemWithName[] }) | null>(null)
  const [assigningChainForId, setAssigningChainForId] = useState<string | null>(null)

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterEventType, setFilterEventType] = useState<string>('all')

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // Build chain lookup
  const chainMap = new Map(chains.map(c => [c.id, c]))

  // Build booking items lookup by booking_id
  const itemsByBookingId = useMemo(() => {
    const map = new Map<string, BookingItemRow[]>()
    for (const item of bookingItems) {
      const list = map.get(item.booking_id) ?? []
      list.push(item)
      map.set(item.booking_id, list)
    }
    return map
  }, [bookingItems])

  // Filtered bookings
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (filterDate && b.event_date !== filterDate) return false
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      if (filterEventType !== 'all' && b.event_type !== filterEventType) return false
      return true
    })
  }, [bookings, filterDate, filterStatus, filterEventType])

  function openEdit(booking: BookingRow) {
    const items = (itemsByBookingId.get(booking.id) ?? []).map(bi => ({
      ...bi,
      name: bi.item_id, // name will be resolved by the modal via equipment hook
    }))
    setEditBooking({ ...booking, items })
  }

  async function handleCancel(booking: BookingRow) {
    if (!window.confirm(`Cancel booking for ${booking.customer_name}?`)) return
    try {
      await updateBooking.mutateAsync({ id: booking.id, status: 'canceled' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel booking')
    }
  }

  async function handleDelete(booking: BookingRow) {
    if (!window.confirm(`Permanently delete booking for ${booking.customer_name}? This cannot be undone.`)) return
    try {
      await deleteBooking.mutateAsync(booking.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete booking')
    }
  }

  async function handleAssignChain(bookingId: string, chainId: string | null) {
    try {
      await assignChain.mutateAsync({ id: bookingId, chain: chainId })
      setAssigningChainForId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign chain')
    }
  }

  function formatTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        {canWrite(role) && (
          <Button onClick={() => setShowCreate(true)}>+ Add Booking</Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          type="date"
          className="w-44"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          placeholder="Filter by date"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEventType} onValueChange={setFilterEventType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Event Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="coordinated">Coordinated</SelectItem>
            <SelectItem value="dropoff">Drop-off</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
            <SelectItem value="willcall">Will Call</SelectItem>
          </SelectContent>
        </Select>
        {(filterDate || filterStatus !== 'all' || filterEventType !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterDate('')
            setFilterStatus('all')
            setFilterEventType('all')
          }}>
            Clear filters
          </Button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-3 py-2 font-medium">Customer</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Chain</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">No bookings found</td>
              </tr>
            )}
            {filtered.map(booking => {
              const isCanceled = booking.status === 'canceled'
              const chain = booking.chain ? chainMap.get(booking.chain) : null
              const badge = STATUS_BADGE[booking.status]

              return (
                <tr
                  key={booking.id}
                  className={`border-b hover:bg-gray-50 ${isCanceled ? 'opacity-50' : ''}`}
                >
                  <td className="px-3 py-2 font-medium">{booking.customer_name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {booking.event_date}
                    {booking.end_date && ` – ${booking.end_date}`}
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                  </td>
                  <td className="px-3 py-2">
                    {assigningChainForId === booking.id ? (
                      <div className="flex items-center gap-1">
                        <Select
                          value={booking.chain ?? ''}
                          onValueChange={val => handleAssignChain(booking.id, val || null)}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {chains.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1 text-xs"
                          onClick={() => setAssigningChainForId(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : chain ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: chain.color + '22', color: chain.color }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: chain.color }}
                        />
                        {chain.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{booking.event_type}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {canWrite(role) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEdit(booking)}
                          >
                            Edit
                          </Button>
                          {!isCanceled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700"
                              onClick={() => handleCancel(booking)}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(booking)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {canAssignChain(role) && !canWrite(role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setAssigningChainForId(
                            assigningChainForId === booking.id ? null : booking.id
                          )}
                        >
                          Assign Chain
                        </Button>
                      )}
                      {canWrite(role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700"
                          onClick={() => setAssigningChainForId(
                            assigningChainForId === booking.id ? null : booking.id
                          )}
                        >
                          Chain
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreate && (
        <BookingFormModal onClose={() => setShowCreate(false)} />
      )}
      {editBooking && (
        <BookingFormModal
          booking={editBooking}
          onClose={() => setEditBooking(null)}
        />
      )}
    </div>
  )
}
```

---

## Task 7: Schedule Board

- [ ] 7.1 Replace `app/(dashboard)/schedule/page.tsx`
- [ ] 7.2 Create `app/(dashboard)/schedule/ScheduleClient.tsx`
- [ ] 7.3 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 7.4 Commit: `git commit -m "feat: implement Schedule Board with time-grid layout"`

### `app/(dashboard)/schedule/page.tsx` (replaces placeholder)

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ScheduleClient } from './ScheduleClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']

export default async function SchedulePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: bookings },
    { data: bookingItems },
    { data: chains },
  ] = await Promise.all([
    supabase.from('bookings').select('*').order('event_date', { ascending: false }),
    supabase.from('booking_items').select('*'),
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: bookings ?? [],
    bookingItems: bookingItems ?? [],
  }

  return (
    <ScheduleClient
      initialData={initialData}
      initialChains={(chains ?? []) as ChainRow[]}
    />
  )
}
```

### `app/(dashboard)/schedule/ScheduleClient.tsx`

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
}

const START_MIN = 7 * 60   // 420 — 7:00am
const END_MIN = 22 * 60    // 1320 — 10:00pm
const RANGE = END_MIN - START_MIN  // 900

function timeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function getLeft(startTime: string): string {
  const min = Math.max(timeToMin(startTime), START_MIN)
  return `${((min - START_MIN) / RANGE) * 100}%`
}

function getWidth(startTime: string, endTime: string): string {
  const start = Math.max(timeToMin(startTime), START_MIN)
  const end = Math.min(timeToMin(endTime), END_MIN)
  return `${(Math.max(0, end - start) / RANGE) * 100}%`
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 7 through 22

export function ScheduleClient({ initialData, initialChains }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)

  const bookings = data?.bookings ?? []

  // Active, non-canceled bookings for selected date
  const activeBookings = useMemo(() => {
    return bookings.filter(b => isBookingActiveOnDate(b, selectedDate))
  }, [bookings, selectedDate])

  // Build rows: one per active chain + unassigned
  interface ScheduleRow {
    id: string
    name: string
    color: string
    bookings: BookingRow[]
  }

  const rows: ScheduleRow[] = useMemo(() => {
    const chainRows: ScheduleRow[] = chains.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      bookings: activeBookings.filter(b => b.chain === c.id),
    }))

    const unassigned = activeBookings.filter(b => !b.chain)
    if (unassigned.length > 0) {
      chainRows.push({
        id: '__unassigned__',
        name: 'Unassigned',
        color: '#9ca3af',
        bookings: unassigned,
      })
    }

    return chainRows.filter(r => r.bookings.length > 0 || chains.find(c => c.id === r.id))
  }, [chains, activeBookings])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule Board</h1>
        <div className="flex items-center gap-2">
          <Label htmlFor="schedDate" className="text-sm font-medium">Date</Label>
          <Input
            id="schedDate"
            type="date"
            className="w-44"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="text-sm text-gray-500">
        {activeBookings.length} event{activeBookings.length !== 1 ? 's' : ''} on{' '}
        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        })}
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <div style={{ minWidth: '900px' }}>
          {/* Time header */}
          <div className="flex border-b">
            <div className="flex-none w-32" />
            <div className="flex flex-1">
              {HOURS.map(h => (
                <div
                  key={h}
                  className="flex-1 text-xs text-center text-gray-400 py-1 border-l"
                >
                  {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                </div>
              ))}
            </div>
          </div>

          {/* Chain rows */}
          {rows.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No events scheduled for this date
            </div>
          ) : (
            rows.map(row => (
              <div key={row.id} className="flex border-b last:border-b-0 hover:bg-gray-50">
                {/* Chain label */}
                <div
                  className="flex-none w-32 px-3 py-2 flex items-center text-sm font-medium truncate"
                  style={{ color: row.color }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 flex-none"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate">{row.name}</span>
                </div>

                {/* Timeline area */}
                <div className="relative flex-1 h-14 border-l">
                  {/* Hour grid lines */}
                  {HOURS.slice(1).map(h => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 border-l border-gray-100"
                      style={{ left: `${((h * 60 - START_MIN) / RANGE) * 100}%` }}
                    />
                  ))}

                  {/* Booking cards */}
                  {row.bookings.map(booking => (
                    <div
                      key={booking.id}
                      className="absolute top-1 bottom-1 rounded text-xs text-white px-1 overflow-hidden flex items-center cursor-default select-none shadow-sm"
                      style={{
                        left: getLeft(booking.start_time),
                        width: getWidth(booking.start_time, booking.end_time),
                        backgroundColor: row.color,
                        minWidth: '4px',
                      }}
                      title={`${booking.customer_name}\n${formatTime12(booking.start_time)}–${formatTime12(booking.end_time)}\n${booking.event_type}\n${booking.address}`}
                    >
                      <span className="truncate">
                        {booking.customer_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      {chains.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chains.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Task 8: Chains Tab + Packing List UI

- [ ] 8.1 Replace `app/(dashboard)/chains/page.tsx`
- [ ] 8.2 Create `app/(dashboard)/chains/ChainsClient.tsx`
- [ ] 8.3 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
- [ ] 8.4 Commit: `git commit -m "feat: implement Chains tab with packing list and print functionality"`

### `app/(dashboard)/chains/page.tsx` (replaces placeholder)

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChainsClient } from './ChainsClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export default async function ChainsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: chains },
    { data: bookings },
    { data: bookingItems },
    { data: equipment },
    { data: subItems },
  ] = await Promise.all([
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
    supabase.from('bookings').select('*'),
    supabase.from('booking_items').select('*'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_items').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: bookings ?? [],
    bookingItems: bookingItems ?? [],
  }

  return (
    <ChainsClient
      initialChains={(chains ?? []) as ChainRow[]}
      initialData={initialData}
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
    />
  )
}
```

### `app/(dashboard)/chains/ChainsClient.tsx`

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { calculatePackingList } from '@/lib/utils/packingList'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  initialChains: ChainRow[]
  initialData: BookingsData
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
}

export function ChainsClient({ initialChains, initialData, initialEquipment, initialSubItems }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const { data: chains = [] } = useChains(initialChains)
  const { data } = useBookings(initialData)
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)

  const [selectedChain, setSelectedChain] = useState<string>(() => initialChains[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(today)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [printError, setPrintError] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // Packing list for selected chain + date
  const packingList = useMemo(() => {
    if (!selectedChain) return []
    return calculatePackingList(bookings, bookingItems, equipment, subItems, selectedChain, selectedDate)
  }, [bookings, bookingItems, equipment, subItems, selectedChain, selectedDate])

  // Count events for selected chain + date
  const eventCount = useMemo(() => {
    return bookings.filter(b => b.chain === selectedChain && isBookingActiveOnDate(b, selectedDate)).length
  }, [bookings, selectedChain, selectedDate])

  const parentItems = packingList.filter(r => !r.isSubItem)
  const subItemRows = packingList.filter(r => r.isSubItem)

  function toggleCheck(itemId: string) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  async function handlePrint() {
    if (!selectedChain || !selectedDate) return
    setPrintError(null)
    setIsPrinting(true)
    try {
      const res = await fetch('/api/packing-list/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: selectedChain, date: selectedDate }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Failed to generate print link')
    } finally {
      setIsPrinting(false)
    }
  }

  const selectedChainData = chains.find(c => c.id === selectedChain)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chain Loading</h1>
        <Button onClick={handlePrint} disabled={!selectedChain || isPrinting} variant="outline">
          {isPrinting ? 'Generating…' : '🖨 Print Packing List'}
        </Button>
      </div>

      {printError && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {printError}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label>Chain</Label>
          <div className="flex gap-2 flex-wrap">
            {chains.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedChain(c.id)
                  setCheckedItems(new Set())
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedChain === c.id
                    ? 'text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedChain === c.id ? { backgroundColor: c.color } : {}}
              >
                {c.name}
              </button>
            ))}
            {chains.length === 0 && (
              <span className="text-sm text-gray-400">No active chains configured</span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plDate">Date</Label>
          <Input
            id="plDate"
            type="date"
            className="w-44"
            value={selectedDate}
            onChange={e => {
              setSelectedDate(e.target.value)
              setCheckedItems(new Set())
            }}
          />
        </div>
      </div>

      {/* Summary */}
      {selectedChain && (
        <div className="text-sm text-gray-500">
          <span
            className="font-medium"
            style={{ color: selectedChainData?.color }}
          >
            {selectedChainData?.name}
          </span>
          {' '}— {eventCount} event{eventCount !== 1 ? 's' : ''} on {selectedDate}
          {packingList.length === 0 && eventCount === 0 && (
            <span className="ml-2 text-gray-400">(no equipment to pack)</span>
          )}
        </div>
      )}

      {/* Packing list table */}
      {packingList.length > 0 ? (
        <div className="space-y-4">
          {parentItems.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-2">Equipment</h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="w-10 px-3 py-2 text-center font-medium">✓</th>
                      <th className="text-left px-3 py-2 font-medium">Equipment</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parentItems.map(item => (
                      <tr
                        key={item.itemId}
                        className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${checkedItems.has(item.itemId) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleCheck(item.itemId)}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checkedItems.has(item.itemId)}
                            onChange={() => toggleCheck(item.itemId)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className={`px-3 py-2 ${checkedItems.has(item.itemId) ? 'line-through text-gray-400' : ''}`}>
                          {item.name}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-medium ${checkedItems.has(item.itemId) ? 'text-gray-400' : ''}`}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subItemRows.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-2">Support Equipment</h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="w-10 px-3 py-2 text-center font-medium">✓</th>
                      <th className="text-left px-3 py-2 font-medium">Item</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subItemRows.map(item => (
                      <tr
                        key={item.itemId}
                        className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${checkedItems.has(item.itemId) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleCheck(item.itemId)}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checkedItems.has(item.itemId)}
                            onChange={() => toggleCheck(item.itemId)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className={`px-3 py-2 ${checkedItems.has(item.itemId) ? 'line-through text-gray-400' : ''}`}>
                          {item.name}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-medium ${checkedItems.has(item.itemId) ? 'text-gray-400' : ''}`}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reset checkboxes */}
          {checkedItems.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCheckedItems(new Set())}>
              Clear all checks ({checkedItems.size})
            </Button>
          )}
        </div>
      ) : selectedChain ? (
        <div className="py-12 text-center text-gray-400 border rounded-md">
          No equipment to pack for {selectedChainData?.name} on {selectedDate}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400 border rounded-md">
          Select a chain to view the packing list
        </div>
      )}
    </div>
  )
}
```

---

## Task 9: Final Verification

- [ ] 9.1 Run full test suite: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test`
  - Expected: all existing tests pass + new packingList tests pass (14 new tests)
- [ ] 9.2 Run TypeScript check: `cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit`
  - Expected: zero errors
- [ ] 9.3 Verify `.env.local` has `PACKING_LIST_SECRET` set
- [ ] 9.4 Commit any remaining changes: `git commit -m "chore: Plan 3 complete — bookings & schedule verified"`

### Expected test output (Task 9.1)

```
PASS  __tests__/lib/utils/packingList.test.ts
  calculatePackingList
    ✓ empty bookings returns empty result
    ✓ single dropoff event sums items
    ✓ two dropoff events for same item are additive (2+3=5)
    ✓ two coordinated events for same item use max (2,3=3)
    ✓ willcall is treated same as dropoff (additive)
    ✓ pickup is treated same as coordinated (max)
    ✓ mix of dropoff + coordinated: drop_sum + coord_max
    ✓ ignores bookings for a different chain
    ✓ ignores canceled bookings
    ✓ ignores bookings outside selected date range
    ✓ includes booking when date falls within multi-day range
    ✓ results sorted by name
    ✓ sub-items included with parentItemId set
    ✓ items with qty 0 are excluded from results

Test Suites: X passed, X total
Tests:       XX passed, XX total
```

### Expected TypeScript output (Task 9.2)

```
(no output — zero errors)
```

---

## Summary of What Plan 3 Builds

| File | Purpose |
|------|---------|
| `lib/utils/packingList.ts` | Pure function: drop-sum + coord-max packing list algorithm |
| `lib/queries/chains.ts` | TanStack Query hook for chains table |
| `lib/queries/bookings.ts` (modified) | Remove canceled filter; add 4 mutation hooks |
| `lib/hooks/useRealtimeSync.ts` (modified) | Add chains table realtime subscription |
| `app/api/bookings/route.ts` | POST: create booking + items (admin/sales) |
| `app/api/bookings/[id]/route.ts` | PATCH: update booking; DELETE: hard delete (admin/sales) |
| `app/api/bookings/[id]/assign-chain/route.ts` | POST: assign chain field only (admin/sales/staff) |
| `app/api/packing-list/token/route.ts` | POST: generate HMAC token → print URL (any auth) |
| `app/api/packing-list/[token]/[chain]/[date]/route.ts` | GET: validate token, compute packing list, return HTML (public) |
| `components/modals/BookingFormModal.tsx` | Create/edit booking with equipment qty pickers |
| `app/(dashboard)/bookings/page.tsx` + `BookingsClient.tsx` | Full CRUD list with filters + status badges |
| `app/(dashboard)/schedule/page.tsx` + `ScheduleClient.tsx` | Time-grid board with booking cards positioned by CSS % |
| `app/(dashboard)/chains/page.tsx` + `ChainsClient.tsx` | Packing list viewer with checkboxes + print button |
| `__tests__/lib/utils/packingList.test.ts` | 14 tests covering all packing list edge cases |
