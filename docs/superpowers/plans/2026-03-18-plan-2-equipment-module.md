# Wonderfly Inventory — Plan 2: Equipment Module

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Equipment and Availability tabs — real-time equipment inventory display, admin CRUD for the equipment catalog, issue flag reporting, out-of-service management, and date-based availability calculations.

**Architecture:** Server Components fetch initial data and pass it as `initialData` to Client Components (no loading flash). TanStack Query manages client-side cache. A `RealtimeSync` client component mounts once in the dashboard layout and invalidates query caches when Supabase broadcasts changes. All writes go through Next.js API route handlers that verify session and role server-side before touching Supabase. Availability is computed client-side via `useMemo` from the cached equipment + bookings data.

**Tech Stack:** Next.js 14 App Router, Supabase SSR, TanStack Query v5, shadcn/ui (Dialog, Table, Badge, Select, Input, Button), TypeScript

**This is Plan 2 of 4.** Plan 1 (Foundation) must be complete. Plans 3 and 4 build on this.

---

## File Map

### Pre-existing files from Plan 1 (already on main)

```
lib/auth/roles.ts              canAdmin(), canWrite(), canCreateIssueFlag(), canAssignChain(), canCheckPackingList()
lib/types/database.types.ts    Database, UserRole, and all other types
lib/supabase/client.ts         createBrowserClient()
lib/supabase/server.ts         createClient() (async, server-side)
app/(dashboard)/layout.tsx     Dashboard layout with QueryProvider + Sidebar + TopBar
```

These files must exist before Plan 2 begins. Plan 1 creates them.

### New files

```
lib/
  api/
    auth.ts                        API route helper — getSessionAndRole(request) → { user, role } | 401 response
  queries/
    equipment.ts                   useEquipment(), useEquipmentSubItems() — TanStack Query hooks
    bookings.ts                    useBookings() — fetches bookings + booking_items
  hooks/
    useRealtimeSync.ts             Supabase Realtime subscriptions → TanStack Query invalidations
  utils/
    availability.ts                calculateAvailability() — pure function, no side effects

app/api/
  equipment/
    route.ts                       GET (list all active), POST (create) — admin only
  equipment/[id]/
    route.ts                       PATCH (update), DELETE (deactivate) — admin only
  equipment/[id]/sub-items/
    route.ts                       POST (create sub-item) — admin only
  equipment/[id]/sub-items/[subId]/
    route.ts                       PATCH (update), DELETE (deactivate sub-item) — admin only
  issue-flags/
    route.ts                       POST (create flag) — admin/sales/staff
  issue-flags/[id]/
    route.ts                       PATCH (resolve: cleared | moved_to_oos) — admin/sales
  out-of-service/
    route.ts                       POST (create OOS entry) — admin only
  out-of-service/[id]/
    route.ts                       PATCH (mark returned) — admin only

app/(dashboard)/
  availability/
    AvailabilityClient.tsx         Client Component — date picker + availability table
  equipment/
    EquipmentClient.tsx            Client Component — equipment table + action buttons

components/
  providers/
    RealtimeSync.tsx               'use client' — mounts useRealtimeSync, renders nothing
  modals/
    EquipmentFormModal.tsx         Create/edit an equipment item (admin)
    SubItemFormModal.tsx           Create/edit a sub-item (admin)
    IssueFlagModal.tsx             Report an issue flag (admin/sales/staff)
    OOSModal.tsx                   Mark item out of service (admin)
    ResolveIssueFlagModal.tsx      Resolve a flag: cleared or moved_to_oos (admin/sales)

app/(dashboard)/settings/equipment/
  SettingsEquipmentClient.tsx      'use client' — admin catalog CRUD table + modals (receives initialData)

__tests__/
  lib/utils/
    availability.test.ts           Unit tests for calculateAvailability
  lib/api/
    auth.test.ts                   Unit tests for getSessionAndRole helper
```

### Modified files

```
app/(dashboard)/layout.tsx         Add <RealtimeSync /> inside QueryProvider
app/(dashboard)/availability/page.tsx    Replace placeholder — fetch initial data, render AvailabilityClient
app/(dashboard)/equipment/page.tsx       Replace placeholder — fetch initial data, render EquipmentClient
app/(dashboard)/settings/equipment/page.tsx  Replace placeholder — Server Component: auth check + initial data fetch, renders SettingsEquipmentClient
```

---

## Tasks

### Task 1: API Auth Helper (TDD)

**Files:**
- Create: `lib/api/auth.ts`
- Create: `__tests__/lib/api/auth.test.ts`

The `getSessionAndRole` helper is called at the top of every API route. It creates a Supabase server client, verifies the session, fetches the user's role, and returns either the data or a `NextResponse` with the appropriate error status. Because all API routes follow this pattern, centralising it prevents repetition and ensures consistent error handling.

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/api/auth.test.ts`:

```typescript
// These are unit tests for the role-gating logic only.
// They mock the Supabase client to avoid real network calls.

import { NextRequest } from 'next/server'

// We test the role-checking utility, not the full helper
// (the full helper requires Supabase which is hard to mock in unit tests).
// The helper's integration is verified by the API route tests.

import type { UserRole } from '@/lib/types/database.types'
import { roleAllows } from '@/lib/api/auth'

describe('roleAllows', () => {
  it('allows admin for admin-only routes', () => {
    expect(roleAllows('admin', ['admin'])).toBe(true)
  })

  it('rejects sales for admin-only routes', () => {
    expect(roleAllows('sales', ['admin'])).toBe(false)
  })

  it('allows admin and sales for write routes', () => {
    expect(roleAllows('admin', ['admin', 'sales'])).toBe(true)
    expect(roleAllows('sales', ['admin', 'sales'])).toBe(true)
  })

  it('rejects staff for write routes', () => {
    expect(roleAllows('staff', ['admin', 'sales'])).toBe(false)
  })

  it('allows admin/sales/staff for issue flag routes', () => {
    expect(roleAllows('admin', ['admin', 'sales', 'staff'])).toBe(true)
    expect(roleAllows('sales', ['admin', 'sales', 'staff'])).toBe(true)
    expect(roleAllows('staff', ['admin', 'sales', 'staff'])).toBe(true)
  })

  it('rejects readonly for issue flag routes', () => {
    expect(roleAllows('readonly', ['admin', 'sales', 'staff'])).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- __tests__/lib/api/auth.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/api/auth'`

- [ ] **Step 3: Implement `lib/api/auth.ts`**

Create `lib/api/auth.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database.types'

export type SessionAndRole = {
  userId: string
  role: UserRole
}

/** Pure role-gating utility — used in unit tests and route handlers. */
export function roleAllows(role: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role)
}

/**
 * Call at the top of every API route handler.
 * Returns { userId, role } on success, or a NextResponse (401/403) to return immediately.
 */
export async function getSessionAndRole(
  allowedRoles: UserRole[]
): Promise<SessionAndRole | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = profile.role as UserRole

  if (!roleAllows(role, allowedRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { userId: user.id, role }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- __tests__/lib/api/auth.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add lib/api/ __tests__/lib/api/
git commit -m "feat: add API auth helper with role-gating utility"
```

---

### Task 2: Availability Calculation (TDD)

**Files:**
- Create: `lib/utils/availability.ts`
- Create: `__tests__/lib/utils/availability.test.ts`

The availability calculation is pure business logic: given equipment, sub-items, bookings, and booking_items, compute how many units of each equipment item are available on a given date. This is the heart of the Availability tab.

A booking is "active" on a date if `event_date <= date <= (end_date ?? event_date)` and `status !== 'canceled'`. Available = `total_qty - out_of_service - sum(booking_items.qty for active bookings on that date)`. Result is clamped to 0 (can't show negative availability).

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/utils/availability.test.ts`:

```typescript
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
    const result = calculateAvailability(equipment, subItems, [], [], '2026-03-20')
    expect(result[0].sub_items).toHaveLength(1)
    expect(result[0].sub_items[0].available_qty).toBe(4)
  })

  it('ignores inactive sub-items', () => {
    const equipment = [makeEquipment({ id: 'parent', name: 'Parent', total_qty: 2 })]
    const subItems = [{
      id: 'sub1', parent_id: 'parent', name: 'Inactive Sub',
      total_qty: 4, out_of_service: 0, issue_flag: 0, is_active: false,
    }]
    const result = calculateAvailability(equipment, subItems, [], [], '2026-03-20')
    expect(result[0].sub_items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- __tests__/lib/utils/availability.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/utils/availability'`

- [ ] **Step 3: Implement `lib/utils/availability.ts`**

Create `lib/utils/availability.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- __tests__/lib/utils/availability.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 14 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add lib/utils/ __tests__/lib/utils/
git commit -m "feat: add availability calculation with tests"
```

---

### Task 3: TanStack Query Hooks

**Files:**
- Create: `lib/queries/equipment.ts`
- Create: `lib/queries/bookings.ts`

These hooks fetch data from Supabase client-side and integrate with TanStack Query caching. Server Components pass `initialData` so there's no loading state on first render. The hooks are also used by Realtime invalidations to refresh stale data.

- [ ] **Step 1: Create `lib/queries/equipment.ts`**

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export const EQUIPMENT_KEY = ['equipment'] as const

export function useEquipment(initialData?: EquipmentRow[]) {
  return useQuery({
    queryKey: EQUIPMENT_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('name')
      if (error) throw error
      return data as EquipmentRow[]
    },
    initialData,
  })
}

export const SUB_ITEMS_KEY = ['equipment_sub_items'] as const

export function useEquipmentSubItems(initialData?: SubItemRow[]) {
  return useQuery({
    queryKey: SUB_ITEMS_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_sub_items')
        .select('*')
        .order('name')
      if (error) throw error
      return data as SubItemRow[]
    },
    initialData,
  })
}

// --- Mutations ---

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { id: string; name: string; total_qty: number; custom_setup_min?: number | null; custom_cleanup_min?: number | null }) => {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; total_qty?: number; is_active?: boolean; custom_setup_min?: number | null; custom_cleanup_min?: number | null }) => {
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useDeactivateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useCreateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ parentId, ...body }: { parentId: string; id: string; name: string; total_qty: number }) => {
      const res = await fetch(`/api/equipment/${parentId}/sub-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useUpdateSubItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ parentId, subId, ...body }: { parentId: string; subId: string; name?: string; total_qty?: number; is_active?: boolean }) => {
      const res = await fetch(`/api/equipment/${parentId}/sub-items/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUB_ITEMS_KEY })
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEY })
    },
  })
}

export function useCreateIssueFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { item_id: string; item_type: 'equipment' | 'sub_item'; qty: number; note: string }) => {
      const res = await fetch('/api/issue-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useResolveIssueFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resolved_action }: { id: string; resolved_action: 'cleared' | 'moved_to_oos' }) => {
      const res = await fetch(`/api/issue-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved_action }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useCreateOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { item_id: string; item_type: 'equipment' | 'sub_item'; qty: number; note: string; return_date?: string | null }) => {
      const res = await fetch('/api/out-of-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}

export function useMarkOOSReturned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/out-of-service/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returned_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  })
}
```

- [ ] **Step 2: Create `lib/queries/bookings.ts`**

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export const BOOKINGS_KEY = ['bookings'] as const

export interface BookingsData {
  bookings: BookingRow[]
  bookingItems: BookingItemRow[]
}

export function useBookings(initialData?: BookingsData) {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async (): Promise<BookingsData> => {
      const supabase = createClient()
      const [{ data: bookings, error: bErr }, { data: bookingItems, error: biErr }] =
        await Promise.all([
          supabase.from('bookings').select('*').neq('status', 'canceled'),
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
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add lib/queries/
git commit -m "feat: add TanStack Query hooks for equipment and bookings"
```

---

### Task 4: Realtime Sync

**Files:**
- Create: `lib/hooks/useRealtimeSync.ts`
- Create: `components/providers/RealtimeSync.tsx`
- Modify: `app/(dashboard)/layout.tsx`

The Realtime hook subscribes to Supabase channels for all tables that change in real time. When any row changes, it invalidates the corresponding TanStack Query cache key. The hook is mounted once via a client component (`RealtimeSync`) placed inside the dashboard layout's `QueryProvider`.

- [ ] **Step 1: Create `lib/hooks/useRealtimeSync.ts`**

```typescript
'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { EQUIPMENT_KEY, SUB_ITEMS_KEY } from '@/lib/queries/equipment'
import { BOOKINGS_KEY } from '@/lib/queries/bookings'

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

    return () => {
      supabase.removeChannel(bookingsChannel)
      supabase.removeChannel(equipmentChannel)
      supabase.removeChannel(mappingsChannel)
    }
  }, [qc])
}
```

- [ ] **Step 2: Create `components/providers/RealtimeSync.tsx`**

```typescript
'use client'

import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync'

/** Mounts the Realtime subscriptions. Renders nothing — placed once in the dashboard layout. */
export function RealtimeSync() {
  useRealtimeSync()
  return null
}
```

- [ ] **Step 3: Add `<RealtimeSync />` to the dashboard layout**

Read `app/(dashboard)/layout.tsx`. Add the import and the component inside the `<QueryProvider>` wrapper, before the `<div className="flex h-screen...">`:

```typescript
// Add this import:
import { RealtimeSync } from '@/components/providers/RealtimeSync'

// Inside the return, after <QueryProvider>:
return (
  <QueryProvider>
    <RealtimeSync />
    <div className="flex h-screen overflow-hidden">
      ...
    </div>
  </QueryProvider>
)
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --no-coverage 2>&1 | tail -10
```

Expected: All tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add lib/hooks/ components/providers/RealtimeSync.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: add Realtime sync hook mounted in dashboard layout"
```

---

### Task 5: Equipment API Routes

**Files:**
- Create: `app/api/equipment/route.ts`
- Create: `app/api/equipment/[id]/route.ts`
- Create: `app/api/equipment/[id]/sub-items/route.ts`
- Create: `app/api/equipment/[id]/sub-items/[subId]/route.ts`

All equipment management routes are admin-only. They use `getSessionAndRole` to verify the session and role before touching Supabase.

- [ ] **Step 1: Create `app/api/equipment/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function GET() {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff', 'readonly'])
  if (auth instanceof NextResponse) return auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { id, name, total_qty, custom_setup_min = null, custom_cleanup_min = null } = body

  if (!id || !name || total_qty == null) {
    return NextResponse.json({ error: 'id, name, and total_qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .insert({ id, name, total_qty, custom_setup_min, custom_cleanup_min })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/equipment/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await request.json()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('equipment')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `app/api/equipment/[id]/sub-items/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id: parentId } = await params
  const body = await request.json()
  const { id, name, total_qty } = body

  if (!id || !name || total_qty == null) {
    return NextResponse.json({ error: 'id, name, and total_qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_sub_items')
    .insert({ id, parent_id: parentId, name, total_qty })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/equipment/[id]/sub-items/[subId]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const body = await request.json()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_sub_items')
    .update(body)
    .eq('id', subId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { subId } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from('equipment_sub_items')
    .update({ is_active: false })
    .eq('id', subId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add app/api/equipment/
git commit -m "feat: add equipment and sub-items API routes (admin)"
```

---

### Task 6: Issue Flag and OOS API Routes

**Files:**
- Create: `app/api/issue-flags/route.ts`
- Create: `app/api/issue-flags/[id]/route.ts`
- Create: `app/api/out-of-service/route.ts`
- Create: `app/api/out-of-service/[id]/route.ts`

Issue flags can be created by admin/sales/staff (on-site coordinators need to flag damaged equipment). Resolving a flag is admin/sales only. OOS management is admin only.

When resolving a flag as `moved_to_oos`, the route also creates an OOS entry — this keeps the two systems in sync.

- [ ] **Step 1: Create `app/api/issue-flags/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { item_id, item_type, qty, note } = body

  if (!item_id || !item_type || qty == null) {
    return NextResponse.json({ error: 'item_id, item_type, and qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('issue_flag_items')
    .insert({ item_id, item_type, qty, note: note ?? '' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/issue-flags/[id]/route.ts`**

When `resolved_action` is `moved_to_oos`, also create an OOS entry for the same quantity.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { resolved_action } = await request.json()

  if (resolved_action !== 'cleared' && resolved_action !== 'moved_to_oos') {
    return NextResponse.json({ error: 'resolved_action must be cleared or moved_to_oos' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch the flag to get item details (needed for OOS creation)
  const { data: flag, error: fetchError } = await supabase
    .from('issue_flag_items')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !flag) {
    return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('issue_flag_items')
    .update({ resolved_at: new Date().toISOString(), resolved_action })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If moving to OOS, create the OOS entry
  if (resolved_action === 'moved_to_oos') {
    const { error: oosError } = await supabase
      .from('out_of_service_items')
      .insert({
        item_id: flag.item_id,
        item_type: flag.item_type,
        qty: flag.qty,
        note: `Moved from issue flag: ${flag.note}`,
      })
    if (oosError) return NextResponse.json({ error: oosError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/api/out-of-service/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { item_id, item_type, qty, note, return_date = null } = body

  if (!item_id || !item_type || qty == null) {
    return NextResponse.json({ error: 'item_id, item_type, and qty are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('out_of_service_items')
    .insert({ item_id, item_type, qty, note: note ?? '', return_date })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/out-of-service/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('out_of_service_items')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add app/api/issue-flags/ app/api/out-of-service/
git commit -m "feat: add issue flag and out-of-service API routes"
```

---

### Task 7: Availability Tab

**Files:**
- Create: `app/(dashboard)/availability/AvailabilityClient.tsx`
- Modify: `app/(dashboard)/availability/page.tsx`

The Availability tab shows computed equipment availability for a selected date. The user picks a date; availability is recalculated client-side from cached data (no new API call needed). Color coding: green = available > 0, yellow = low, red = 0.

- [ ] **Step 1: Create `app/(dashboard)/availability/AvailabilityClient.tsx`**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { useBookings, type BookingsData } from '@/lib/queries/bookings'
import { calculateAvailability } from '@/lib/utils/availability'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialBookings: BookingsData
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function availabilityBadge(available: number, total: number) {
  if (available <= 0) return <Badge variant="destructive">0 / {total}</Badge>
  if (available <= Math.ceil(total * 0.3))
    return <Badge className="bg-yellow-500 text-white">{available} / {total}</Badge>
  return <Badge className="bg-green-600 text-white">{available} / {total}</Badge>
}

export function AvailabilityClient({ initialEquipment, initialSubItems, initialBookings }: Props) {
  const [selectedDate, setSelectedDate] = useState(today())

  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: bookingsData = initialBookings } = useBookings(initialBookings)

  const rows = useMemo(
    () => calculateAvailability(
      equipment,
      subItems,
      bookingsData.bookings,
      bookingsData.bookingItems,
      selectedDate
    ),
    [equipment, subItems, bookingsData, selectedDate]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Availability</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Equipment</th>
              <th className="px-4 py-3 font-medium text-center">Available / Total</th>
              <th className="px-4 py-3 font-medium text-center">OOS</th>
              <th className="px-4 py-3 font-medium text-center">Booked</th>
              <th className="px-4 py-3 font-medium text-center">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No active equipment
                </td>
              </tr>
            )}
            {rows.map(row => (
              <>
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-center">
                    {availabilityBadge(row.available_qty, row.total_qty)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{row.out_of_service || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{row.booked_qty || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {row.issue_flag > 0 ? (
                      <Badge variant="outline" className="text-yellow-700 border-yellow-400">
                        {row.issue_flag}
                      </Badge>
                    ) : '—'}
                  </td>
                </tr>
                {row.sub_items.map(sub => (
                  <tr key={sub.id} className="bg-gray-50/50 text-gray-600">
                    <td className="px-4 py-2 pl-8 text-xs">{sub.name}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {availabilityBadge(sub.available_qty, sub.total_qty)}
                    </td>
                    <td className="px-4 py-2 text-center text-xs">{sub.out_of_service || '—'}</td>
                    <td className="px-4 py-2 text-center text-xs">{sub.booked_qty || '—'}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {sub.issue_flag > 0 ? (
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-xs">
                          {sub.issue_flag}
                        </Badge>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `app/(dashboard)/availability/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { AvailabilityClient } from './AvailabilityClient'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export default async function AvailabilityPage() {
  const supabase = await createClient()

  const [
    { data: equipment },
    { data: subItems },
    { data: bookings },
    { data: bookingItems },
  ] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
    supabase.from('bookings').select('*').neq('status', 'canceled'),
    supabase.from('booking_items').select('*'),
  ])

  return (
    <AvailabilityClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
      initialBookings={{
        bookings: (bookings ?? []) as BookingRow[],
        bookingItems: (bookingItems ?? []) as BookingItemRow[],
      }}
    />
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add "app/(dashboard)/availability/"
git commit -m "feat: add Availability tab with date picker and computed availability table"
```

---

### Task 8: Equipment Tab

**Files:**
- Create: `app/(dashboard)/equipment/EquipmentClient.tsx`
- Modify: `app/(dashboard)/equipment/page.tsx`

The Equipment tab is the live inventory view — everyone can see equipment status (quantities, OOS, flags). Admins can mark OOS and resolve flags here. Admin/sales/staff can create issue flags. The admin-only catalog CRUD lives in `/settings/equipment`.

- [ ] **Step 1: Create `app/(dashboard)/equipment/EquipmentClient.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IssueFlagModal } from '@/components/modals/IssueFlagModal'
import { OOSModal } from '@/components/modals/OOSModal'
import { ResolveIssueFlagModal } from '@/components/modals/ResolveIssueFlagModal'
import { canAdmin, canCreateIssueFlag } from '@/lib/auth/roles'
import type { UserRole, Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

// Admin and sales can resolve issue flags (matches API route permission)
const canResolveFlag = (r: UserRole) => r === 'admin' || r === 'sales'

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  role: UserRole
}

export function EquipmentClient({ initialEquipment, initialSubItems, role }: Props) {
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)

  const [issueFlagTarget, setIssueFlagTarget] = useState<{ id: string; name: string; type: 'equipment' | 'sub_item' } | null>(null)
  const [oosTarget, setOosTarget] = useState<{ id: string; name: string; type: 'equipment' | 'sub_item' } | null>(null)
  const [resolveFlagItemId, setResolveFlagItemId] = useState<string | null>(null)

  const subsByParent = new Map<string, SubItemRow[]>()
  for (const s of subItems) {
    if (!s.is_active) continue
    const list = subsByParent.get(s.parent_id) ?? []
    list.push(s)
    subsByParent.set(s.parent_id, list)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Equipment</h1>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-center">Total</th>
              <th className="px-4 py-3 font-medium text-center">OOS</th>
              <th className="px-4 py-3 font-medium text-center">Flags</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {equipment.filter(e => e.is_active).map(e => (
              <>
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-center">{e.total_qty}</td>
                  <td className="px-4 py-3 text-center">
                    {e.out_of_service > 0 ? (
                      <Badge variant="destructive">{e.out_of_service}</Badge>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.issue_flag > 0 ? (
                      <button
                        onClick={() => canResolveFlag(role) ? setResolveFlagItemId(e.id) : undefined}
                        className="inline-flex"
                      >
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 cursor-pointer">
                          {e.issue_flag}
                        </Badge>
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canCreateIssueFlag(role) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIssueFlagTarget({ id: e.id, name: e.name, type: 'equipment' })}
                        >
                          Flag
                        </Button>
                      )}
                      {canAdmin(role) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOosTarget({ id: e.id, name: e.name, type: 'equipment' })}
                        >
                          OOS
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {(subsByParent.get(e.id) ?? []).map(s => (
                  <tr key={s.id} className="bg-gray-50/50 text-gray-600 text-xs">
                    <td className="px-4 py-2 pl-8">{s.name}</td>
                    <td className="px-4 py-2 text-center">{s.total_qty}</td>
                    <td className="px-4 py-2 text-center">
                      {s.out_of_service > 0 ? <Badge variant="destructive" className="text-xs">{s.out_of_service}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {s.issue_flag > 0 ? (
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-xs">{s.issue_flag}</Badge>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {canCreateIssueFlag(role) && (
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => setIssueFlagTarget({ id: s.id, name: s.name, type: 'sub_item' })}>
                            Flag
                          </Button>
                        )}
                        {canAdmin(role) && (
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => setOosTarget({ id: s.id, name: s.name, type: 'sub_item' })}>
                            OOS
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {issueFlagTarget && (
        <IssueFlagModal
          target={issueFlagTarget}
          onClose={() => setIssueFlagTarget(null)}
        />
      )}
      {oosTarget && (
        <OOSModal
          target={oosTarget}
          onClose={() => setOosTarget(null)}
        />
      )}
      {resolveFlagItemId && (
        <ResolveIssueFlagModal
          itemId={resolveFlagItemId}
          onClose={() => setResolveFlagItemId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace `app/(dashboard)/equipment/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EquipmentClient } from './EquipmentClient'
import type { Database, UserRole } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export default async function EquipmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()

  const [{ data: equipment }, { data: subItems }] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
  ])

  return (
    <EquipmentClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
      role={((profile as { role: string } | null)?.role ?? 'readonly') as UserRole}
    />
  )
}
```

Do NOT run TypeScript check or commit yet — the modal components (`IssueFlagModal`, `OOSModal`, `ResolveIssueFlagModal`) don't exist until Task 9. The commit for this task is deferred to Task 9 Step 6.

---

### Task 9: Action Modals

**Files:**
- Create: `components/modals/IssueFlagModal.tsx`
- Create: `components/modals/OOSModal.tsx`
- Create: `components/modals/ResolveIssueFlagModal.tsx`

These modals let users report issues, mark equipment OOS, and resolve flags. They use shadcn/ui Dialog and call TanStack Query mutations on submit.

- [ ] **Step 1: Create `components/modals/IssueFlagModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateIssueFlag } from '@/lib/queries/equipment'

interface Props {
  target: { id: string; name: string; type: 'equipment' | 'sub_item' }
  onClose: () => void
}

export function IssueFlagModal({ target, onClose }: Props) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useCreateIssueFlag()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mutation.mutateAsync({ item_id: target.id, item_type: target.type, qty, note })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flag')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Issue — {target.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Quantity affected</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Describe the issue"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Report Issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `components/modals/OOSModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateOOS } from '@/lib/queries/equipment'

interface Props {
  target: { id: string; name: string; type: 'equipment' | 'sub_item' }
  onClose: () => void
}

export function OOSModal({ target, onClose }: Props) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useCreateOOS()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mutation.mutateAsync({
        item_id: target.id,
        item_type: target.type,
        qty,
        note,
        return_date: returnDate || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create OOS entry')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Out of Service — {target.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Quantity</Label>
            <Input id="qty" type="number" min={1} value={qty}
              onChange={e => setQty(Number(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Reason</Label>
            <Input id="note" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Why is this item out of service?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return">Expected return date (optional)</Label>
            <Input id="return" type="date" value={returnDate}
              onChange={e => setReturnDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Mark OOS'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create `components/modals/ResolveIssueFlagModal.tsx`**

This modal fetches the open issue flags for an item and lets the admin resolve each one as "cleared" or "moved to OOS".

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useResolveIssueFlag } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type IssueFlagRow = Database['public']['Tables']['issue_flag_items']['Row']

interface Props {
  itemId: string
  onClose: () => void
}

export function ResolveIssueFlagModal({ itemId, onClose }: Props) {
  const [flags, setFlags] = useState<IssueFlagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mutation = useResolveIssueFlag()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('issue_flag_items')
      .select('*')
      .eq('item_id', itemId)
      .is('resolved_at', null)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFlags((data ?? []) as IssueFlagRow[])
        setLoading(false)
      })
  }, [itemId])

  async function resolve(flagId: string, action: 'cleared' | 'moved_to_oos') {
    try {
      await mutation.mutateAsync({ id: flagId, resolved_action: action })
      // Derive new length inside the updater to avoid stale closure on `flags`
      setFlags(prev => {
        const next = prev.filter(f => f.id !== flagId)
        if (next.length === 0) onClose()
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve flag')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Issue Flags</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-sm text-gray-500">Loading flags…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && flags.length === 0 && (
          <p className="text-sm text-gray-500">No open flags.</p>
        )}
        <div className="space-y-3">
          {flags.map(flag => (
            <div key={flag.id} className="border rounded p-3 space-y-2">
              <p className="text-sm">
                <span className="font-medium">{flag.qty} unit(s)</span>
                {flag.note && <span className="text-gray-500"> — {flag.note}</span>}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => resolve(flag.id, 'cleared')}
                  disabled={mutation.isPending}>
                  Clear
                </Button>
                <Button size="sm" variant="destructive"
                  onClick={() => resolve(flag.id, 'moved_to_oos')}
                  disabled={mutation.isPending}>
                  Move to OOS
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --no-coverage 2>&1 | tail -10
```

Expected: All 64 tests pass (44 from Plan 1 + 20 new from Plan 2).

- [ ] **Step 6: Commit** (includes Equipment Tab files from Task 8 + modals from Task 9)

```bash
cd /Users/jonmillhausen/inventory_tracker
git add components/modals/ "app/(dashboard)/equipment/"
git commit -m "feat: add Equipment tab with action modals (flag, OOS, resolve)"
```

---

### Task 10: Settings Equipment Page (Admin Catalog CRUD)

**Files:**
- Create: `components/modals/EquipmentFormModal.tsx`
- Create: `components/modals/SubItemFormModal.tsx`
- Modify: `app/(dashboard)/settings/equipment/page.tsx`

The Settings > Equipment page is admin-only and lets admins create/edit/deactivate equipment items and sub-items. It fetches data server-side for initial render and uses the existing mutations.

- [ ] **Step 1: Create `components/modals/EquipmentFormModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateEquipment, useUpdateEquipment } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  item?: EquipmentRow
  onClose: () => void
}

export function EquipmentFormModal({ item, onClose }: Props) {
  const isEdit = !!item
  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [totalQty, setTotalQty] = useState(item?.total_qty ?? 1)
  const [setupMin, setSetupMin] = useState<string>(item?.custom_setup_min?.toString() ?? '')
  const [cleanupMin, setCleanupMin] = useState<string>(item?.custom_cleanup_min?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateEquipment()
  const update = useUpdateEquipment()
  const isPending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: item.id,
          name,
          total_qty: totalQty,
          custom_setup_min: setupMin ? Number(setupMin) : null,
          custom_cleanup_min: cleanupMin ? Number(cleanupMin) : null,
        })
      } else {
        await create.mutateAsync({
          id: id.trim().toLowerCase().replace(/\s+/g, '_'),
          name,
          total_qty: totalQty,
          custom_setup_min: setupMin ? Number(setupMin) : null,
          custom_cleanup_min: cleanupMin ? Number(cleanupMin) : null,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">ID (slug)</Label>
              <Input id="id" value={id} onChange={e => setId(e.target.value)}
                placeholder="foam_machine" required />
              <p className="text-xs text-gray-500">Lowercase, underscores only. Cannot be changed later.</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Total Quantity</Label>
            <Input id="qty" type="number" min={0} value={totalQty}
              onChange={e => setTotalQty(Number(e.target.value))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="setup">Setup min (optional)</Label>
              <Input id="setup" type="number" min={0} value={setupMin}
                onChange={e => setSetupMin(e.target.value)} placeholder="45" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleanup">Cleanup min (optional)</Label>
              <Input id="cleanup" type="number" min={0} value={cleanupMin}
                onChange={e => setCleanupMin(e.target.value)} placeholder="45" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Equipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `components/modals/SubItemFormModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateSubItem, useUpdateSubItem } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  parentId: string
  parentName: string
  item?: SubItemRow
  onClose: () => void
}

export function SubItemFormModal({ parentId, parentName, item, onClose }: Props) {
  const isEdit = !!item
  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [totalQty, setTotalQty] = useState(item?.total_qty ?? 1)
  const [error, setError] = useState<string | null>(null)

  const create = useCreateSubItem()
  const update = useUpdateSubItem()
  const isPending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({ parentId, subId: item.id, name, total_qty: totalQty })
      } else {
        await create.mutateAsync({
          parentId,
          id: id.trim().toLowerCase().replace(/\s+/g, '_'),
          name,
          total_qty: totalQty,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Sub-Item — {parentName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">ID (slug)</Label>
              <Input id="id" value={id} onChange={e => setId(e.target.value)}
                placeholder="foam_machine_supplies" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Total Quantity</Label>
            <Input id="qty" type="number" min={0} value={totalQty}
              onChange={e => setTotalQty(Number(e.target.value))} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Sub-Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create `app/(dashboard)/settings/equipment/SettingsEquipmentClient.tsx`**

This is the `'use client'` component. It receives `initialEquipment` and `initialSubItems` from the Server Component page and passes them as `initialData` to TanStack Query (no loading flash on first render).

```typescript
'use client'

import { useState } from 'react'
import { useEquipment, useEquipmentSubItems, useDeactivateEquipment } from '@/lib/queries/equipment'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EquipmentFormModal } from '@/components/modals/EquipmentFormModal'
import { SubItemFormModal } from '@/components/modals/SubItemFormModal'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
}

export function SettingsEquipmentClient({ initialEquipment, initialSubItems }: Props) {
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const deactivate = useDeactivateEquipment()

  const [addEquipment, setAddEquipment] = useState(false)
  const [editItem, setEditItem] = useState<EquipmentRow | null>(null)
  const [addSubItem, setAddSubItem] = useState<{ parentId: string; parentName: string } | null>(null)
  const [editSubItem, setEditSubItem] = useState<{ item: SubItemRow; parentId: string; parentName: string } | null>(null)

  const subsByParent = new Map<string, SubItemRow[]>()
  for (const s of subItems) {
    const list = subsByParent.get(s.parent_id) ?? []
    list.push(s)
    subsByParent.set(s.parent_id, list)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Equipment Catalog</h1>
        <Button onClick={() => setAddEquipment(true)}>Add Equipment</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium text-center">Qty</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {equipment.map(e => (
              <>
                <tr key={e.id} className={!e.is_active ? 'opacity-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.id}</td>
                  <td className="px-4 py-3 text-center">{e.total_qty}</td>
                  <td className="px-4 py-3 text-center">
                    {e.is_active
                      ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditItem(e)}>Edit</Button>
                      <Button size="sm" variant="outline"
                        onClick={() => setAddSubItem({ parentId: e.id, parentName: e.name })}>
                        + Sub-item
                      </Button>
                      {e.is_active && (
                        <Button size="sm" variant="outline"
                          onClick={() => deactivate.mutate(e.id)}
                          disabled={deactivate.isPending}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {(subsByParent.get(e.id) ?? []).map(s => (
                  <tr key={s.id} className={`bg-gray-50/50 text-xs ${!s.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 pl-8 text-gray-700">{s.name}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono">{s.id}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{s.total_qty}</td>
                    <td className="px-4 py-2 text-center">
                      {s.is_active
                        ? <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>
                        : <Badge variant="outline" className="text-xs">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      <Button size="sm" variant="outline" className="h-6 text-xs"
                        onClick={() => setEditSubItem({ item: s, parentId: e.id, parentName: e.name })}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {addEquipment && <EquipmentFormModal onClose={() => setAddEquipment(false)} />}
      {editItem && <EquipmentFormModal item={editItem} onClose={() => setEditItem(null)} />}
      {addSubItem && (
        <SubItemFormModal
          parentId={addSubItem.parentId}
          parentName={addSubItem.parentName}
          onClose={() => setAddSubItem(null)}
        />
      )}
      {editSubItem && (
        <SubItemFormModal
          parentId={editSubItem.parentId}
          parentName={editSubItem.parentName}
          item={editSubItem.item}
          onClose={() => setEditSubItem(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Replace `app/(dashboard)/settings/equipment/page.tsx`** with a Server Component

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsEquipmentClient } from './SettingsEquipmentClient'
import type { Database, UserRole } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export default async function SettingsEquipmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()

  if ((profile?.role as UserRole) !== 'admin') redirect('/availability')

  const [{ data: equipment }, { data: subItems }] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
  ])

  return (
    <SettingsEquipmentClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
    />
  )
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --no-coverage 2>&1 | tail -10
```

Expected: All 64 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add components/modals/EquipmentFormModal.tsx components/modals/SubItemFormModal.tsx "app/(dashboard)/settings/equipment/"
git commit -m "feat: add Settings Equipment catalog CRUD page with modals"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npm test -- --no-coverage 2>&1 | tail -15
```

Expected: 64 tests across 4 suites, all PASS.

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/jonmillhausen/inventory_tracker && ~/.local/node/bin/npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Final commit**

```bash
cd /Users/jonmillhausen/inventory_tracker
git add -A
git commit -m "chore: Plan 2 complete — equipment module verified"
```

---

## What Comes Next

| Plan | Focus |
|---|---|
| Plan 3 | Bookings & Schedule: bookings list + CRUD form, schedule board (timeline view), chains tab (packing list display), packing list print route |
| Plan 4 | Webhook & Settings: Zenbooker webhook handler (full pipeline), service/chain mappings UI, user management, needs_review flow with batch re-process |
