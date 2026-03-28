# Equipment Out of Service Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple `out_of_service` integer column on the equipment table with a full `equipment_oos` records table, add a detail modal with add/return-to-service actions, and wire the new counts into both the equipment table UI and the availability calculation.

**Architecture:** New `equipment_oos` table tracks individual OOS incidents (quantity, description, expected return, returned_at). The equipment list fetches active OOS sums via a separate lightweight query keyed to `EQUIPMENT_OOS_SUMS_KEY` so both EquipmentClient and AvailabilityClient share cached data. `calculateAvailability()` accepts an optional `oosMap` parameter; when provided it replaces the legacy `e.out_of_service` integer.

**Tech Stack:** Next.js 16, Supabase (Postgres + RLS), React Query (`@tanstack/react-query`), Tailwind CSS, shadcn/base-ui components.

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Create | `supabase/migrations/021_equipment_oos.sql` | New table + RLS |
| Modify | `lib/types/database.types.ts` | Add `equipment_oos` table types |
| Create | `app/api/equipment/[id]/oos/route.ts` | POST new OOS record |
| Create | `app/api/equipment/[id]/oos/[oosId]/return/route.ts` | PATCH set `returned_at` |
| Modify | `lib/queries/equipment.ts` | Add `useEquipmentOOS`, `useEquipmentOOSSums`, `useMarkOOS`, `useReturnFromOOS` |
| Create | `components/modals/OOSDetailModal.tsx` | New full-featured modal |
| Modify | `app/(dashboard)/equipment/EquipmentClient.tsx` | Rename col, cell behavior, wire new modal, remove parent "Damaged" button |
| Modify | `lib/utils/availability.ts` | Accept `oosMap?: Map<string, number>` param |
| Modify | `app/(dashboard)/availability/AvailabilityClient.tsx` | Use `useEquipmentOOSSums`, pass to `calculateAvailability` |
| Modify | `__tests__/lib/utils/availability.test.ts` | Update/add test for `oosMap` param |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/021_equipment_oos.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add equipment_oos table for detailed out-of-service tracking.
-- Replaces the coarse integer out_of_service column on equipment for UI/availability purposes.
-- Active records = rows where returned_at IS NULL.

CREATE TABLE equipment_oos (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id         text        NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  quantity             int         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  issue_description    text,
  expected_return_date date,
  returned_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: matches the pattern used for out_of_service_items in 001_initial_schema.sql.
-- createClient() (server routes) uses the user JWT + get_my_role(), not the service role key.
ALTER TABLE equipment_oos ENABLE ROW LEVEL SECURITY;

CREATE POLICY oos_equipment_select ON equipment_oos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY oos_equipment_insert ON equipment_oos FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'staff'));

CREATE POLICY oos_equipment_update ON equipment_oos FOR UPDATE
  USING (get_my_role() IN ('admin', 'staff'));
```

> **Note for implementer:** Run this SQL in Supabase → SQL Editor. The `DEFAULT PRIVILEGES` grant from migration 002 already covers new tables, so no separate GRANT statement is needed.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/021_equipment_oos.sql
git commit -m "feat: add equipment_oos migration for detailed OOS tracking"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `lib/types/database.types.ts` — add `equipment_oos` table block

- [ ] **Step 1: Add the type block**

Insert after the closing `}` of the `out_of_service_items` table block (after line 143), before `bookings`:

```typescript
      equipment_oos: {
        Row: {
          id: string
          equipment_id: string
          quantity: number
          issue_description: string | null
          expected_return_date: string | null
          returned_at: string | null
          created_at: string
        }
        Insert: {
          equipment_id: string
          quantity?: number
          issue_description?: string | null
          expected_return_date?: string | null
          returned_at?: string | null
        }
        Update: Partial<{
          returned_at: string | null
        }>
        Relationships: []
      }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.types.ts
git commit -m "feat: add equipment_oos TypeScript types"
```

---

## Task 3: API Routes

**Files:**
- Create: `app/api/equipment/[id]/oos/route.ts`
- Create: `app/api/equipment/[id]/oos/[oosId]/return/route.ts`

Follow the pattern of existing routes: import `getSessionAndRole`, check auth, operate on the table, return JSON. Use `createClient` (not `createAdminClient`) — these are user-facing mutations that should go through RLS. Since RLS allows `service_role` writes and the server client uses the service role key... actually look at how other equipment routes do it (e.g. `app/api/equipment/route.ts` uses `createClient` from `@/lib/supabase/server`). Use the same pattern.

- [ ] **Step 1: Create POST route**

```typescript
// app/api/equipment/[id]/oos/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await request.json()
  const { quantity = 1, issue_description = null, expected_return_date = null } = body

  if (!quantity || quantity < 1) {
    return NextResponse.json({ error: 'quantity must be at least 1' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('equipment_oos')
    .insert({ equipment_id: id, quantity, issue_description, expected_return_date: expected_return_date || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create PATCH return route**

```typescript
// app/api/equipment/[id]/oos/[oosId]/return/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionAndRole } from '@/lib/api/auth'

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string; oosId: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'staff'])
  if (auth instanceof NextResponse) return auth

  const { oosId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment_oos')
    .update({ returned_at: new Date().toISOString() })
    .eq('id', oosId)
    .is('returned_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/equipment/[id]/oos/route.ts app/api/equipment/[id]/oos/[oosId]/return/route.ts
git commit -m "feat: add equipment OOS API routes (POST new record, PATCH return)"
```

---

## Task 4: Queries

**Files:**
- Modify: `lib/queries/equipment.ts` — add 4 new exports at the bottom

- [ ] **Step 1: Add type alias and query key constants**

After the existing type aliases at the top of the file (after line 9), add:

```typescript
type OOSRow = Database['public']['Tables']['equipment_oos']['Row']
```

After `export const SUB_ITEM_LINKS_KEY` (around line 47), add:

```typescript
export const EQUIPMENT_OOS_KEY = (equipmentId: string) => ['equipment_oos', equipmentId] as const
export const EQUIPMENT_OOS_SUMS_KEY = ['equipment_oos_sums'] as const
```

- [ ] **Step 2: Add the four new hooks at the bottom of the file**

```typescript
// Fetch active OOS records for one equipment item (used by OOSDetailModal)
export function useEquipmentOOS(equipmentId: string) {
  return useQuery({
    queryKey: EQUIPMENT_OOS_KEY(equipmentId),
    queryFn: async (): Promise<OOSRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('*')
        .eq('equipment_id', equipmentId)
        .is('returned_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Fetch active OOS quantity sum per equipment_id (used in equipment table + availability)
export function useEquipmentOOSSums() {
  return useQuery({
    queryKey: EQUIPMENT_OOS_SUMS_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('equipment_oos')
        .select('equipment_id, quantity')
        .is('returned_at', null)
      if (error) throw error
      const sums: Record<string, number> = {}
      for (const row of data ?? []) {
        sums[row.equipment_id] = (sums[row.equipment_id] ?? 0) + row.quantity
      }
      return sums
    },
  })
}

export function useMarkOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      equipmentId,
      quantity,
      issue_description,
      expected_return_date,
    }: {
      equipmentId: string
      quantity: number
      issue_description?: string | null
      expected_return_date?: string | null
    }) => {
      const res = await fetch(`/api/equipment/${equipmentId}/oos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, issue_description, expected_return_date }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { equipmentId }) => {
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_KEY(equipmentId) })
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_SUMS_KEY })
    },
  })
}

export function useReturnFromOOS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ equipmentId, oosId }: { equipmentId: string; oosId: string }) => {
      const res = await fetch(`/api/equipment/${equipmentId}/oos/${oosId}/return`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, { equipmentId }) => {
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_KEY(equipmentId) })
      qc.invalidateQueries({ queryKey: EQUIPMENT_OOS_SUMS_KEY })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/equipment.ts
git commit -m "feat: add useEquipmentOOS, useEquipmentOOSSums, useMarkOOS, useReturnFromOOS queries"
```

---

## Task 5: OOSDetailModal Component

**Files:**
- Create: `components/modals/OOSDetailModal.tsx`

The existing `OOSModal.tsx` is kept unchanged — it's still used for sub-item "Damaged" buttons. This is a new component specifically for parent equipment OOS management.

- [ ] **Step 1: Create the modal**

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEquipmentOOS, useMarkOOS, useReturnFromOOS } from '@/lib/queries/equipment'

interface Props {
  equipmentId: string
  equipmentName: string
  onClose: () => void
}

export function OOSDetailModal({ equipmentId, equipmentName, onClose }: Props) {
  const { data: records = [] } = useEquipmentOOS(equipmentId)
  const markOOS = useMarkOOS()
  const returnFromOOS = useReturnFromOOS()

  const [quantity, setQuantity] = useState(1)
  const [issueDescription, setIssueDescription] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activeCount = records.reduce((sum, r) => sum + r.quantity, 0)

  async function handleMarkOOS(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await markOOS.mutateAsync({
        equipmentId,
        quantity,
        issue_description: issueDescription || null,
        expected_return_date: expectedReturnDate || null,
      })
      setQuantity(1)
      setIssueDescription('')
      setExpectedReturnDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark out of service')
    }
  }

  async function handleReturn(oosId: string) {
    setError(null)
    try {
      await returnFromOOS.mutateAsync({ equipmentId, oosId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return from service')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{equipmentName} — Out of Service ({activeCount})</DialogTitle>
        </DialogHeader>

        {/* Add new OOS record */}
        <form onSubmit={handleMarkOOS} className="space-y-3 border-b dark:border-gray-700 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="oos-description">Issue Description</Label>
            <Input
              id="oos-description"
              value={issueDescription}
              onChange={e => setIssueDescription(e.target.value)}
              placeholder="Describe the issue..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="oos-qty">Quantity</Label>
              <Input
                id="oos-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oos-date">Expected Return</Label>
              <Input
                id="oos-date"
                type="date"
                value={expectedReturnDate}
                onChange={e => setExpectedReturnDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            disabled={markOOS.isPending}
          >
            {markOOS.isPending ? 'Saving…' : 'Mark Out of Service +'}
          </Button>
        </form>

        {/* Active OOS records */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {records.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">No detailed OOS records</p>
          ) : (
            records.map(record => (
              <div
                key={record.id}
                className="flex items-start justify-between gap-2 bg-pink-50 dark:bg-red-900/20 rounded-md p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {record.issue_description || 'No description'} — ×{record.quantity}
                  </p>
                  {record.expected_return_date && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Returns: {new Date(record.expected_return_date + 'T00:00:00').toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  onClick={() => handleReturn(record.id)}
                  disabled={returnFromOOS.isPending}
                >
                  ✓ Return to Service
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/modals/OOSDetailModal.tsx
git commit -m "feat: add OOSDetailModal with add form and return-to-service list"
```

---

## Task 6: EquipmentClient Updates

**Files:**
- Modify: `app/(dashboard)/equipment/EquipmentClient.tsx`

Changes:
1. Import `useEquipmentOOSSums` and `OOSDetailModal`
2. Add `const { data: oosSums = {} } = useEquipmentOOSSums()`
3. Rename `oosTarget` type to just `{ id: string; name: string }` (drop `type` field — `OOSDetailModal` is equipment-only)
4. Update filter label "Damaged Only" → "Out of Service Only"
5. Update `filteredEquipment` filter: `e.out_of_service >= 1` → `(oosSums[e.id] ?? 0) >= 1`
6. Update `subStatusByParent` `hasDamage`: keep using `sub.out_of_service` (sub-items not changing)
7. Rename column header `<X size={13}... /> Damaged` → `Out of Service`
8. Replace parent equipment OOS cell: show grayed "0" or clickable red count + always-visible "+" button
9. Remove parent "Damaged" action button (lines ~200–205) — the OOS cell replaces it
10. Replace `<OOSModal target={oosTarget} ...>` with `<OOSDetailModal equipmentId={oosTarget.id} equipmentName={oosTarget.name} ...>`

- [ ] **Step 1: Update imports (top of file)**

Change:
```typescript
import { useEquipment, useEquipmentSubItems, useSubItemLinks, useDeactivateEquipment } from '@/lib/queries/equipment'
```
To:
```typescript
import { useEquipment, useEquipmentSubItems, useSubItemLinks, useDeactivateEquipment, useEquipmentOOSSums } from '@/lib/queries/equipment'
```

Change:
```typescript
import { OOSModal } from '@/components/modals/OOSModal'
```
To:
```typescript
import { OOSModal } from '@/components/modals/OOSModal'
import { OOSDetailModal } from '@/components/modals/OOSDetailModal'
```

Keep the `X` icon in the lucide import — it is still used in the supplies toggle row (line ~230 in EquipmentClient.tsx: `<X size={14} className="text-red-400 mx-auto" />`). Only the column header usage is removed.

- [ ] **Step 2: Add OOS sums query inside the component**

After `const deactivate = useDeactivateEquipment()`, add:
```typescript
const { data: oosSums = {} } = useEquipmentOOSSums()
```

- [ ] **Step 3: Update filter label and condition**

Change the labels object:
```typescript
const labels = { all: 'All Equipment', damaged: 'Out of Service Only', flags: 'Flags Only' }
```

Change the filteredEquipment useMemo:
```typescript
if (equipmentFilter === 'damaged') return activeEquipment.filter(e => (oosSums[e.id] ?? 0) >= 1)
```

- [ ] **Step 4: Update column header**

Replace:
```tsx
<th className="px-4 py-3 font-medium text-center">
  <span className="inline-flex items-center gap-1 justify-center">
    <X size={13} className="text-red-500" />
    Damaged
  </span>
</th>
```
With:
```tsx
<th className="px-4 py-3 font-medium text-center">Out of Service</th>
```

- [ ] **Step 5: Update the parent equipment OOS cell**

Replace the current OOS cell (the `<td>` that shows `e.out_of_service`):
```tsx
<td className="px-4 py-3 text-center">
  {e.out_of_service > 0 ? (
    <Badge variant="destructive">{e.out_of_service}</Badge>
  ) : '—'}
</td>
```
With:
```tsx
<td className="px-4 py-3 text-center">
  <div className="inline-flex items-center gap-1.5">
    {(oosSums[e.id] ?? 0) > 0 ? (
      <button
        onClick={() => setOosTarget({ id: e.id, name: e.name })}
        className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
      >
        {oosSums[e.id]}
      </button>
    ) : (
      <span className="text-sm text-gray-300 dark:text-gray-600">0</span>
    )}
    <button
      onClick={() => setOosTarget({ id: e.id, name: e.name })}
      className="text-gray-400 hover:text-red-600 transition-colors"
      aria-label="Add out of service record"
    >
      <span className="text-base leading-none">+</span>
    </button>
  </div>
</td>
```

- [ ] **Step 6: Remove the parent "Damaged" action button**

Find and remove the parent equipment "Damaged" button (the `<Button>` with `onClick={() => setOosTarget(...)}`  inside `canAdmin(role)` for the parent row, approximately lines 200–205):
```tsx
<Button size="sm" variant="outline"
  onClick={() => setOosTarget({ id: e.id, name: e.name, type: 'equipment' })}>
  Damaged
</Button>
```
Delete these lines — the OOS cell "+" button now handles this.

- [ ] **Step 7: Update oosTarget type and modal at bottom**

The `oosTarget` state is typed as `{ id: string; name: string; type: 'equipment' | 'sub_item' } | null`. Change it to:
```typescript
const [oosTarget, setOosTarget] = useState<{ id: string; name: string; type?: 'equipment' | 'sub_item' } | null>(null)
```

Replace the modal render at the bottom:
```tsx
{oosTarget && (
  <OOSModal target={oosTarget} onClose={() => setOosTarget(null)} />
)}
```
With:
```tsx
{oosTarget && oosTarget.type === 'sub_item' ? (
  <OOSModal
    target={{ id: oosTarget.id, name: oosTarget.name, type: 'sub_item' }}
    onClose={() => setOosTarget(null)}
  />
) : oosTarget ? (
  <OOSDetailModal
    equipmentId={oosTarget.id}
    equipmentName={oosTarget.name}
    onClose={() => setOosTarget(null)}
  />
) : null}
```

The sub-item "Damaged" button (lines ~272-275) already has `type: 'sub_item'` in the `setOosTarget` call. Do NOT change it — it must remain exactly as:
```tsx
<Button size="sm" variant="outline" className="h-6 text-xs"
  onClick={() => setOosTarget({ id: sub.id, name: sub.name, type: 'sub_item' })}>
  Damaged
</Button>
```
This ensures the conditional in the modal render routes sub-item clicks to `OOSModal`, not `OOSDetailModal`.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add app/(dashboard)/equipment/EquipmentClient.tsx
git commit -m "feat: overhaul equipment OOS column — clickable count + detail modal"
```

---

## Task 7: Availability Calculation Update

**Files:**
- Modify: `lib/utils/availability.ts` — add optional `oosMap` param
- Modify: `app/(dashboard)/availability/AvailabilityClient.tsx` — fetch OOS sums and pass in
- Modify: `__tests__/lib/utils/availability.test.ts` — update `oosMap` test

- [ ] **Step 1: Add oosMap parameter to calculateAvailability**

Change the function signature (line 85):
```typescript
export function calculateAvailability(
  equipment: EquipmentRow[],
  subItems: SubItemRow[],
  bookings: BookingRow[],
  bookingItems: BookingItemRow[],
  date: string,
  oosMap?: Map<string, number>
): AvailabilityRow[] {
```

Replace the three lines starting at line 137 (the existing `const total_booked = ...` through `const available_qty = ...` block). The existing code is:
```typescript
      const total_booked = bookedByItemId.get(e.id) ?? 0
      const remaining = e.total_qty - e.out_of_service - total_booked
      const available_qty = Math.max(0, remaining)
```
Replace with:
```typescript
      const total_booked = bookedByItemId.get(e.id) ?? 0
      const oos = oosMap?.get(e.id) ?? e.out_of_service
      const remaining = e.total_qty - oos - total_booked
      const available_qty = Math.max(0, remaining)
```

In the return object (line ~181), change `out_of_service: e.out_of_service` to:
```typescript
      out_of_service: oos,
```

- [ ] **Step 2: Update AvailabilityClient to use OOS sums**

In `app/(dashboard)/availability/AvailabilityClient.tsx`:

Add import to the equipment queries import line:
```typescript
import { useEquipment, useEquipmentSubItems, useEquipmentOOSSums } from '@/lib/queries/equipment'
```

After the existing `useEquipment`/`useEquipmentSubItems` calls (around line 148), add:
```typescript
const { data: oosSumsRaw = {} } = useEquipmentOOSSums()
```

Build the Map in the `rows` useMemo (or create a separate memo):
```typescript
const oosMap = useMemo(
  () => new Map(Object.entries(oosSumsRaw)),
  [oosSumsRaw]
)

const rows = useMemo(
  () => calculateAvailability(
    equipment,
    subItems,
    bookingsData.bookings,
    bookingsData.bookingItems,
    selectedDate,
    oosMap
  ),
  [equipment, subItems, bookingsData, selectedDate, oosMap]
)
```

- [ ] **Step 3: Update the existing oosMap test and add a new one**

In `__tests__/lib/utils/availability.test.ts`, find the existing test "subtracts out_of_service from availability" (line 117). It currently passes `out_of_service: 2` in the equipment row. Add a second test below it:

```typescript
it('uses oosMap over out_of_service when provided', () => {
  // equipment row has out_of_service: 2, but oosMap says 3 are out
  const equipment = [makeEquipment({ total_qty: 5, out_of_service: 2 })]
  const oosMap = new Map([[equipment[0].id, 3]])
  const result = calculateAvailability(equipment, [], [], [], '2026-03-20', oosMap)
  expect(result[0].available_qty).toBe(2)       // 5 - 3
  expect(result[0].out_of_service).toBe(3)
})

it('falls back to out_of_service when oosMap not provided', () => {
  const equipment = [makeEquipment({ total_qty: 5, out_of_service: 2 })]
  const result = calculateAvailability(equipment, [], [], [], '2026-03-20')
  expect(result[0].available_qty).toBe(3)       // 5 - 2
})
```

- [ ] **Step 4: Run tests**

```bash
./node_modules/.bin/jest __tests__/lib/utils/availability.test.ts --no-coverage
```
Expected: all tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/availability.ts app/(dashboard)/availability/AvailabilityClient.tsx __tests__/lib/utils/availability.test.ts
git commit -m "feat: wire OOS sums from equipment_oos into availability calculation"
```

---

## Final Step

After all tasks complete:

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/jest --no-coverage
git push
```

Remind the user: **The SQL migration (`021_equipment_oos.sql`) must be run manually in Supabase → SQL Editor before the app will work with the new table.**
