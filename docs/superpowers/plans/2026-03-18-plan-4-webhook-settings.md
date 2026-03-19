# Webhook Handler & Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Zenbooker webhook handler (13-step pipeline), service/chain mapping CRUD UIs, user management, needs_review detail panel, and webhook logs page.

**Architecture:** Webhook processing logic is extracted into a pure `resolveWebhookItems` function (unit-testable) called by both the webhook handler and the batch-reprocess job. Settings pages follow the established pattern (Server Component fetches initial data → passes to Client Component). Batch reprocess fires-and-forgets after a new service mapping is saved.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (server-role client for webhook route), TanStack Query v5, shadcn/ui, Node.js `crypto` for HMAC (already used in packing-list token route).

---

## File Map

**New files:**

| File | Responsibility |
|---|---|
| `lib/utils/webhookProcessor.ts` | Pure resolver: maps Zenbooker services → equipment items, staff → chain. No DB calls. |
| `__tests__/lib/utils/webhookProcessor.test.ts` | Unit tests for resolver (9 cases) |
| `app/api/webhooks/zenbooker/route.ts` | POST — 13-step pipeline using service-role client |
| `app/api/service-mappings/route.ts` | GET (list), POST (create + trigger reprocess) — admin only |
| `app/api/service-mappings/[id]/route.ts` | PATCH, DELETE — admin only |
| `app/api/chain-mappings/route.ts` | GET (list), POST (create) — admin only |
| `app/api/chain-mappings/[id]/route.ts` | PATCH, DELETE — admin only |
| `app/api/users/route.ts` | GET (list) — admin only |
| `app/api/users/[id]/route.ts` | PATCH (role update) — admin only |
| `lib/queries/serviceMappings.ts` | TanStack Query hooks: `useServiceMappings`, `useCreateServiceMapping`, `useUpdateServiceMapping`, `useDeleteServiceMapping` |
| `lib/queries/chainMappings.ts` | TanStack Query hooks: `useChainMappings`, `useCreateChainMapping`, `useUpdateChainMapping`, `useDeleteChainMapping` |
| `lib/queries/webhookLogs.ts` | TanStack Query hooks: `useWebhookLogs`, `useWebhookLogForBooking` |
| `lib/queries/users.ts` | TanStack Query hooks: `useUsers`, `useUpdateUserRole` |
| `components/modals/ServiceMappingFormModal.tsx` | Create/edit modal for service_mappings rows |
| `components/modals/ChainMappingFormModal.tsx` | Create/edit modal for chain_mappings rows |
| `app/(dashboard)/settings/mappings/service/ServiceMappingsClient.tsx` | Client component for service mappings UI |
| `app/(dashboard)/settings/mappings/chain/ChainMappingsClient.tsx` | Client component for chain mappings UI |
| `app/(dashboard)/settings/users/UsersClient.tsx` | Client component for user management |
| `app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx` | Client component for webhook logs |

**Modified files:**

| File | Change |
|---|---|
| `app/(dashboard)/settings/mappings/service/page.tsx` | Replace placeholder with Server Component that fetches + renders `ServiceMappingsClient` |
| `app/(dashboard)/settings/mappings/chain/page.tsx` | Replace placeholder with Server Component |
| `app/(dashboard)/settings/users/page.tsx` | Replace placeholder with Server Component |
| `app/(dashboard)/settings/webhook-logs/page.tsx` | Replace placeholder with Server Component |
| `app/(dashboard)/bookings/BookingsClient.tsx` | Add needs_review detail panel (shows unmapped services + raw payload + "Create Mapping" button) |

---

## Task 1: Webhook Item Resolver Utility (TDD)

**Files:**
- Create: `lib/utils/webhookProcessor.ts`
- Create: `__tests__/lib/utils/webhookProcessor.test.ts`

### Zenbooker Payload Shape

The plan assumes this shape (verify against real webhooks during testing — adjust types if needed):

```typescript
// lib/utils/webhookProcessor.ts
export interface ZenbookerService {
  service_id: string
  service_name: string
  qty?: number // customer-provided qty
  modifier?: {
    modifier_id: string
    modifier_name: string
  }
}

export interface ZenbookerPayload {
  action: string
  timestamp?: number // Unix epoch seconds — may not be present
  job_id: string
  customer_name: string
  address: string
  date: string // "YYYY-MM-DD"
  end_date?: string // "YYYY-MM-DD", multi-day
  start_time: string // "HH:MM" or "HH:MM:SS"
  end_time: string
  assigned_staff?: Array<{ staff_id: string; staff_name: string }>
  services?: ZenbookerService[]
}
```

### Resolver Implementation

```typescript
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

export interface ResolvedItem {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export interface WebhookResolution {
  chainId: string | null
  resolvedItems: ResolvedItem[]
  unmappedNames: string[]
}

/**
 * Pure function — no DB calls.
 * Takes payload fields + current mapping tables; returns resolved items, chain, and unmapped names.
 */
export function resolveWebhookItems(
  services: ZenbookerService[],
  assignedStaff: Array<{ staff_id: string; staff_name: string }>,
  serviceMappings: ServiceMappingRow[],
  chainMappings: ChainMappingRow[],
): WebhookResolution {
  // Resolve chain: first staff member with a mapping wins
  let chainId: string | null = null
  for (const staff of assignedStaff) {
    const cm = chainMappings.find(m => m.zenbooker_staff_id === staff.staff_id)
    if (cm) { chainId = cm.chain_id; break }
  }

  const resolvedItems: ResolvedItem[] = []
  const unmappedNames: string[] = []

  for (const svc of services) {
    // Find mapping: match (service_id, modifier_id) or standalone (service_id, modifier IS NULL)
    const modId = svc.modifier?.modifier_id ?? null
    const sm = serviceMappings.find(m =>
      m.zenbooker_service_id === svc.service_id &&
      (modId === null ? m.zenbooker_modifier_id === null : m.zenbooker_modifier_id === modId)
    )

    if (!sm) {
      const label = svc.modifier
        ? `${svc.service_name} / ${svc.modifier.modifier_name}`
        : svc.service_name
      unmappedNames.push(label)
      continue
    }

    const qty = sm.use_customer_qty ? (svc.qty ?? sm.default_qty) : sm.default_qty
    resolvedItems.push({
      item_id: sm.item_id,
      qty,
      is_sub_item: false,
      parent_item_id: null,
    })
  }

  return { chainId, resolvedItems, unmappedNames }
}
```

- [ ] **Step 1.1: Write the failing tests**

```typescript
// __tests__/lib/utils/webhookProcessor.test.ts
import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerService } from '@/lib/utils/webhookProcessor'

// Test data helpers
const makeServiceMapping = (overrides = {}) => ({
  id: 'sm1',
  zenbooker_service_id: 'svc1',
  zenbooker_service_name: 'Foam Party',
  zenbooker_modifier_id: null,
  zenbooker_modifier_name: null,
  item_id: 'foam_machine',
  default_qty: 1,
  use_customer_qty: false,
  notes: '',
  ...overrides,
})

const makeChainMapping = (overrides = {}) => ({
  id: 'cm1',
  zenbooker_staff_id: 'staff1',
  zenbooker_staff_name: 'Alice',
  chain_id: 'chain_1',
  notes: '',
  ...overrides,
})

describe('resolveWebhookItems', () => {
  it('returns empty resolution for no services and no staff', () => {
    const result = resolveWebhookItems([], [], [], [])
    expect(result).toEqual({ chainId: null, resolvedItems: [], unmappedNames: [] })
  })

  it('resolves a standalone service with default_qty', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toEqual([{ item_id: 'foam_machine', qty: 1, is_sub_item: false, parent_item_id: null }])
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('uses customer qty when use_customer_qty = true', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party', qty: 3 }
    const sm = makeServiceMapping({ use_customer_qty: true, default_qty: 1 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(3)
  })

  it('falls back to default_qty when use_customer_qty = true but qty not in payload', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party' } // no qty
    const sm = makeServiceMapping({ use_customer_qty: true, default_qty: 2 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(2)
  })

  it('adds unmapped service name when no mapping found', () => {
    const svc: ZenbookerService = { service_id: 'unknown', service_name: 'Mystery Service' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toHaveLength(0)
    expect(result.unmappedNames).toEqual(['Mystery Service'])
  })

  it('resolves a bundle service with modifier', () => {
    const svc: ZenbookerService = {
      service_id: 'svc2',
      service_name: 'Game Bundle',
      modifier: { modifier_id: 'mod1', modifier_name: 'Laser Tag' },
    }
    const sm = makeServiceMapping({
      id: 'sm2',
      zenbooker_service_id: 'svc2',
      zenbooker_modifier_id: 'mod1',
      zenbooker_modifier_name: 'Laser Tag',
      item_id: 'laser_tag',
    })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].item_id).toBe('laser_tag')
  })

  it('does not match modifier row for standalone service (modifier_id = null vs non-null)', () => {
    const svc: ZenbookerService = { service_id: 'svc2', service_name: 'Game Bundle' } // standalone, no modifier
    const sm = makeServiceMapping({
      zenbooker_service_id: 'svc2',
      zenbooker_modifier_id: 'mod1', // this mapping requires a modifier
    })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.unmappedNames).toEqual(['Game Bundle'])
  })

  it('resolves chain from assigned staff', () => {
    const result = resolveWebhookItems(
      [],
      [{ staff_id: 'staff1', staff_name: 'Alice' }],
      [],
      [makeChainMapping()]
    )
    expect(result.chainId).toBe('chain_1')
  })

  it('returns chainId = null when staff not in chain_mappings', () => {
    const result = resolveWebhookItems(
      [],
      [{ staff_id: 'unknown_staff', staff_name: 'Bob' }],
      [],
      [makeChainMapping()]
    )
    expect(result.chainId).toBeNull()
  })

  it('handles mix of mapped and unmapped services — partial resolution', () => {
    const services: ZenbookerService[] = [
      { service_id: 'svc1', service_name: 'Foam Party' },
      { service_id: 'unknown', service_name: 'New Service' },
    ]
    const result = resolveWebhookItems([...services], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toHaveLength(1)
    expect(result.unmappedNames).toEqual(['New Service'])
  })
})
```

- [ ] **Step 1.2: Run tests — verify RED**

```bash
cd /Users/jonmillhausen/inventory_tracker
npx jest __tests__/lib/utils/webhookProcessor.test.ts --no-coverage
```

Expected: All 9 tests FAIL with "Cannot find module '@/lib/utils/webhookProcessor'"

- [ ] **Step 1.3: Write the implementation**

Create `lib/utils/webhookProcessor.ts` with the full content shown in the "Resolver Implementation" section above.

- [ ] **Step 1.4: Run tests — verify GREEN**

```bash
npx jest __tests__/lib/utils/webhookProcessor.test.ts --no-coverage
```

Expected: 9/9 PASS

- [ ] **Step 1.5: Run full test suite — verify no regressions**

```bash
npx jest --no-coverage
```

Expected: All tests pass (was 79 before this plan).

- [ ] **Step 1.6: Commit**

```bash
git add lib/utils/webhookProcessor.ts __tests__/lib/utils/webhookProcessor.test.ts
git commit -m "feat: add pure webhook item resolver utility with 9 tests"
```

---

## Task 2: Zenbooker Webhook Handler

**Files:**
- Create: `app/api/webhooks/zenbooker/route.ts`

No unit tests for the route handler itself (integration-tested manually with real or mocked webhook payloads). The resolver logic is already tested in Task 1.

### Implementation

```typescript
// app/api/webhooks/zenbooker/route.ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerPayload } from '@/lib/utils/webhookProcessor'

const PROCESSABLE_ACTIONS = new Set([
  'job_created',
  'job_rescheduled',
  'job_cancelled',
  'service_order_edited',
])

const SKIPPABLE_ACTIONS = new Set([
  'recurring_booking_created',
  'recurring_booking_canceled',
])

export async function POST(request: Request) {
  // Step 1: Verify shared secret
  const secret = request.headers.get('x-zenbooker-secret') // adjust header name to match real Zenbooker docs
  if (!secret || secret !== process.env.ZENBOOKER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Step 2: Payload size check (<1MB)
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // Step 3: Parse payload
  let payload: ZenbookerPayload
  try {
    payload = await request.json() as ZenbookerPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Step 3b: Timestamp check (if present, reject if > 5 minutes old)
  if (payload.timestamp) {
    const ageSec = Math.floor(Date.now() / 1000) - payload.timestamp
    if (ageSec > 300 || ageSec < -300) {
      return NextResponse.json({ error: 'Stale timestamp' }, { status: 400 })
    }
  }

  // Step 4: Missing job_id check
  if (!payload.job_id || typeof payload.job_id !== 'string') {
    return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const action = payload.action ?? 'unknown'

  // Step 4: Log raw payload to webhook_logs
  const { data: logRow, error: logErr } = await supabase
    .from('webhook_logs')
    .insert({
      received_at: new Date().toISOString(),
      zenbooker_job_id: payload.job_id,
      action,
      raw_payload: payload as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (logErr || !logRow) {
    // Log failure is not a client error — return 500 so Zenbooker retries
    return NextResponse.json({ error: 'Log write failed' }, { status: 500 })
  }

  const logId = logRow.id

  // Step 5 & 6: Handle skippable and unrecognized actions
  if (SKIPPABLE_ACTIONS.has(action)) {
    await supabase
      .from('webhook_logs')
      .update({ result: 'skipped', result_detail: `recurring booking: skipped` })
      .eq('id', logId)
    return NextResponse.json({ ok: true })
  }

  if (!PROCESSABLE_ACTIONS.has(action)) {
    await supabase
      .from('webhook_logs')
      .update({ result: 'skipped', result_detail: `unrecognized action: ${action}` })
      .eq('id', logId)
    return NextResponse.json({ ok: true })
  }

  try {
    // Step 7 & 8: Fetch mappings and resolve
    const [{ data: serviceMappings }, { data: chainMappings }] = await Promise.all([
      supabase.from('service_mappings').select('*'),
      supabase.from('chain_mappings').select('*'),
    ])

    const services = payload.services ?? []
    const assignedStaff = payload.assigned_staff ?? []

    // Step 9: Determine status
    let status: 'confirmed' | 'canceled' | 'needs_review'
    let chainId: string | null = null
    let resolvedItems: Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }> = []
    let unmappedNames: string[] = []
    let resultDetail: string | null = null

    if (action === 'job_cancelled') {
      status = 'canceled'
    } else {
      const resolution = resolveWebhookItems(
        services,
        assignedStaff,
        serviceMappings ?? [],
        chainMappings ?? [],
      )
      chainId = resolution.chainId
      resolvedItems = resolution.resolvedItems
      unmappedNames = resolution.unmappedNames
      status = unmappedNames.length > 0 ? 'needs_review' : 'confirmed'
      if (unmappedNames.length > 0) {
        resultDetail = unmappedNames.join(', ')
      }
    }

    // Parse date/time from payload
    const eventDate = payload.date
    const endDate = payload.end_date ?? null
    const startTime = payload.start_time
    const endTime = payload.end_time

    // Step 10: Upsert booking
    const { data: booking, error: upsertErr } = await supabase
      .from('bookings')
      .upsert(
        {
          zenbooker_job_id: payload.job_id,
          customer_name: payload.customer_name,
          address: payload.address,
          event_date: eventDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          chain: chainId,
          status,
          event_type: 'dropoff', // default; may be overridable in future via mapping
          source: 'webhook',
          notes: '',
        },
        { onConflict: 'zenbooker_job_id' }
      )
      .select('id')
      .single()

    if (upsertErr || !booking) {
      await supabase
        .from('webhook_logs')
        .update({ result: 'error', result_detail: upsertErr?.message ?? 'upsert failed' })
        .eq('id', logId)
      return NextResponse.json({ error: 'Upsert failed' }, { status: 500 })
    }

    const bookingId = booking.id

    // Step 11: Replace booking_items (skip for cancellations)
    if (action !== 'job_cancelled') {
      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
      if (resolvedItems.length > 0) {
        await supabase.from('booking_items').insert(
          resolvedItems.map(item => ({ ...item, booking_id: bookingId }))
        )
      }
    }

    // Step 12: Update webhook log with result
    const webhookResult = unmappedNames.length > 0 ? 'unmapped_service' : 'success'
    await supabase
      .from('webhook_logs')
      .update({ result: webhookResult, result_detail: resultDetail, booking_id: bookingId })
      .eq('id', logId)

    // Step 13: Return 200
    return NextResponse.json({ ok: true })

  } catch (err) {
    // Unhandled exception → 500 so Zenbooker retries (upsert is idempotent)
    await supabase
      .from('webhook_logs')
      .update({ result: 'error', result_detail: String(err) })
      .eq('id', logId)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 2.1: Write the webhook handler**

Create `app/api/webhooks/zenbooker/route.ts` with the content above.

- [ ] **Step 2.2: Add env var**

Add `ZENBOOKER_WEBHOOK_SECRET=` to `.env.local` (fill in actual secret from Zenbooker dashboard).

Also add to `.env.local.example` if one exists, or document in CLAUDE.md.

- [ ] **Step 2.3: Run full test suite — verify no regressions**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 2.4: Commit**

```bash
git add app/api/webhooks/zenbooker/route.ts
git commit -m "feat: add Zenbooker webhook handler (13-step pipeline)"
```

---

## Task 3: Service Mappings API + Batch Reprocess

**Files:**
- Create: `app/api/service-mappings/route.ts`
- Create: `app/api/service-mappings/[id]/route.ts`

The batch reprocess fires-and-forgets after a new service mapping is saved (non-blocking).

### Batch Reprocess Helper

```typescript
// In app/api/service-mappings/route.ts

import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'

async function batchReprocess(supabase: Awaited<ReturnType<typeof createClient>>) {
  // 1. Get all needs_review bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, zenbooker_job_id')
    .eq('status', 'needs_review')
    .not('zenbooker_job_id', 'is', null)

  if (!bookings?.length) return

  // 2. Get current mappings
  const [{ data: serviceMappings }, { data: chainMappings }] = await Promise.all([
    supabase.from('service_mappings').select('*'),
    supabase.from('chain_mappings').select('*'),
  ])

  for (const booking of bookings) {
    // 3. Get most recent webhook log for this booking
    const { data: log } = await supabase
      .from('webhook_logs')
      .select('raw_payload')
      .eq('booking_id', booking.id)
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    if (!log?.raw_payload) continue

    const payload = log.raw_payload as Record<string, unknown>
    const services = (payload.services ?? []) as Parameters<typeof resolveWebhookItems>[0]
    const assignedStaff = (payload.assigned_staff ?? []) as Parameters<typeof resolveWebhookItems>[1]

    const { resolvedItems, unmappedNames } = resolveWebhookItems(
      services,
      assignedStaff,
      serviceMappings ?? [],
      chainMappings ?? [],
    )

    if (unmappedNames.length > 0) continue // still unresolved

    // 4. Fully resolved → update status + replace items
    await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', booking.id)

    await supabase.from('booking_items').delete().eq('booking_id', booking.id)
    if (resolvedItems.length > 0) {
      await supabase.from('booking_items').insert(
        resolvedItems.map(item => ({ ...item, booking_id: booking.id }))
      )
    }
  }
}
```

### GET + POST Route

```typescript
// app/api/service-mappings/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_mappings')
    .select('*')
    .order('zenbooker_service_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { zenbooker_service_id, zenbooker_service_name, zenbooker_modifier_id = null,
    zenbooker_modifier_name = null, item_id, default_qty, use_customer_qty, notes = '' } =
    body as Record<string, unknown>

  if (!zenbooker_service_id || typeof zenbooker_service_id !== 'string')
    return NextResponse.json({ error: 'zenbooker_service_id required' }, { status: 400 })
  if (!item_id || typeof item_id !== 'string')
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  if (typeof default_qty !== 'number' || default_qty < 0)
    return NextResponse.json({ error: 'default_qty must be a non-negative number' }, { status: 400 })
  if (typeof use_customer_qty !== 'boolean')
    return NextResponse.json({ error: 'use_customer_qty must be boolean' }, { status: 400 })

  const { data, error } = await supabase
    .from('service_mappings')
    .insert({
      zenbooker_service_id: zenbooker_service_id as string,
      zenbooker_service_name: (zenbooker_service_name as string) || zenbooker_service_id as string,
      zenbooker_modifier_id: zenbooker_modifier_id as string | null,
      zenbooker_modifier_name: zenbooker_modifier_name as string | null,
      item_id: item_id as string,
      default_qty: default_qty as number,
      use_customer_qty: use_customer_qty as boolean,
      notes: (notes as string) || '',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') // unique constraint violation
      return NextResponse.json({ error: 'Duplicate mapping — this service/modifier is already mapped' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Trigger batch reprocess (non-blocking fire-and-forget)
  void batchReprocess(supabase)

  return NextResponse.json(data, { status: 201 })
}
```

### PATCH + DELETE Route

```typescript
// app/api/service-mappings/[id]/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { item_id, default_qty, use_customer_qty, notes,
    zenbooker_service_name, zenbooker_modifier_name } = body as Record<string, unknown>

  const update: Record<string, unknown> = {}
  if (typeof item_id === 'string') update.item_id = item_id
  if (typeof default_qty === 'number') update.default_qty = default_qty
  if (typeof use_customer_qty === 'boolean') update.use_customer_qty = use_customer_qty
  if (typeof notes === 'string') update.notes = notes
  if (typeof zenbooker_service_name === 'string') update.zenbooker_service_name = zenbooker_service_name
  if (typeof zenbooker_modifier_name === 'string' || zenbooker_modifier_name === null)
    update.zenbooker_modifier_name = zenbooker_modifier_name

  const { data, error } = await supabase
    .from('service_mappings')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  const { error } = await supabase.from('service_mappings').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 3.1: Create `app/api/service-mappings/route.ts`**

Full content as shown above (GET + POST + batchReprocess).

- [ ] **Step 3.2: Create `app/api/service-mappings/[id]/route.ts`**

Full content as shown above (PATCH + DELETE).

- [ ] **Step 3.3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3.4: Commit**

```bash
git add app/api/service-mappings/route.ts "app/api/service-mappings/[id]/route.ts"
git commit -m "feat: add service-mappings API with batch reprocess on new mapping"
```

---

## Task 4: Chain Mappings & Users API Routes

**Files:**
- Create: `app/api/chain-mappings/route.ts`
- Create: `app/api/chain-mappings/[id]/route.ts`
- Create: `app/api/users/route.ts`
- Create: `app/api/users/[id]/route.ts`

### Chain Mappings GET + POST

```typescript
// app/api/chain-mappings/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chain_mappings')
    .select('*')
    .order('zenbooker_staff_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { zenbooker_staff_id, zenbooker_staff_name, chain_id, notes = '' } =
    body as Record<string, unknown>

  if (!zenbooker_staff_id || typeof zenbooker_staff_id !== 'string')
    return NextResponse.json({ error: 'zenbooker_staff_id required' }, { status: 400 })
  if (!chain_id || typeof chain_id !== 'string')
    return NextResponse.json({ error: 'chain_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('chain_mappings')
    .insert({
      zenbooker_staff_id: zenbooker_staff_id as string,
      zenbooker_staff_name: (zenbooker_staff_name as string) || zenbooker_staff_id as string,
      chain_id: chain_id as string,
      notes: (notes as string) || '',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Duplicate — this staff member is already mapped' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
```

### Chain Mappings PATCH + DELETE

```typescript
// app/api/chain-mappings/[id]/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { chain_id, zenbooker_staff_name, notes } = body as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof chain_id === 'string') update.chain_id = chain_id
  if (typeof zenbooker_staff_name === 'string') update.zenbooker_staff_name = zenbooker_staff_name
  if (typeof notes === 'string') update.notes = notes

  const { data, error } = await supabase
    .from('chain_mappings')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { error } = await supabase.from('chain_mappings').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}
```

### Users GET + PATCH (role update)

```typescript
// app/api/users/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

```typescript
// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

const VALID_ROLES = ['admin', 'sales', 'staff', 'readonly'] as const

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  // Admin cannot demote themselves
  if (params.id === auth.userId)
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })

  const supabase = await createClient()

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { role } = body as Record<string, unknown>
  if (!role || !VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
    return NextResponse.json({ error: 'role must be one of: admin, sales, staff, readonly' }, { status: 400 })

  const { data, error } = await supabase
    .from('users')
    .update({ role: role as typeof VALID_ROLES[number] })
    .eq('id', params.id)
    .select()
    .single()

  if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4.1: Create all 4 API route files** (chain-mappings GET+POST, chain-mappings PATCH+DELETE, users GET, users PATCH)

- [ ] **Step 4.2: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4.3: Commit**

```bash
git add app/api/chain-mappings/route.ts "app/api/chain-mappings/[id]/route.ts" app/api/users/route.ts "app/api/users/[id]/route.ts"
git commit -m "feat: add chain-mappings and users API routes"
```

---

## Task 5: TanStack Query Hooks

**Files:**
- Create: `lib/queries/serviceMappings.ts`
- Create: `lib/queries/chainMappings.ts`
- Create: `lib/queries/webhookLogs.ts`
- Create: `lib/queries/users.ts`

### Service Mappings Hooks

```typescript
// lib/queries/serviceMappings.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']

export const SERVICE_MAPPINGS_KEY = ['service_mappings'] as const

export function useServiceMappings(initialData?: ServiceMappingRow[]) {
  return useQuery({
    queryKey: SERVICE_MAPPINGS_KEY,
    queryFn: async (): Promise<ServiceMappingRow[]> => {
      const res = await fetch('/api/service-mappings')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export interface CreateServiceMappingInput {
  zenbooker_service_id: string
  zenbooker_service_name: string
  zenbooker_modifier_id?: string | null
  zenbooker_modifier_name?: string | null
  item_id: string
  default_qty: number
  use_customer_qty: boolean
  notes?: string
}

export function useCreateServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateServiceMappingInput) => {
      const res = await fetch('/api/service-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}

export function useUpdateServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<CreateServiceMappingInput> & { id: string }) => {
      const res = await fetch(`/api/service-mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}

export function useDeleteServiceMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICE_MAPPINGS_KEY }),
  })
}
```

### Chain Mappings Hooks

```typescript
// lib/queries/chainMappings.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

export const CHAIN_MAPPINGS_KEY = ['chain_mappings'] as const

export function useChainMappings(initialData?: ChainMappingRow[]) {
  return useQuery({
    queryKey: CHAIN_MAPPINGS_KEY,
    queryFn: async (): Promise<ChainMappingRow[]> => {
      const res = await fetch('/api/chain-mappings')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export interface ChainMappingInput {
  zenbooker_staff_id: string
  zenbooker_staff_name: string
  chain_id: string
  notes?: string
}

export function useCreateChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ChainMappingInput) => {
      const res = await fetch('/api/chain-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}

export function useUpdateChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<ChainMappingInput> & { id: string }) => {
      const res = await fetch(`/api/chain-mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}

export function useDeleteChainMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chain-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAIN_MAPPINGS_KEY }),
  })
}
```

### Webhook Logs Hooks

```typescript
// lib/queries/webhookLogs.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']

export const WEBHOOK_LOGS_KEY = ['webhook_logs'] as const

export function useWebhookLogs(initialData?: WebhookLogRow[]) {
  return useQuery({
    queryKey: WEBHOOK_LOGS_KEY,
    queryFn: async (): Promise<WebhookLogRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as WebhookLogRow[]
    },
    initialData,
  })
}

export function useWebhookLogForBooking(bookingId: string | null) {
  return useQuery({
    queryKey: [...WEBHOOK_LOGS_KEY, 'booking', bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<WebhookLogRow | null> => {
      if (!bookingId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('booking_id', bookingId)
        .order('received_at', { ascending: false })
        .limit(1)
        .single()
      if (error?.code === 'PGRST116') return null
      if (error) throw error
      return data as WebhookLogRow
    },
  })
}
```

### Users Hooks

```typescript
// lib/queries/users.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database, UserRole } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

export const USERS_KEY = ['users'] as const

export function useUsers(initialData?: UserRow[]) {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async (): Promise<UserRow[]> => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    initialData,
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
```

- [ ] **Step 5.1: Create all 4 query hook files**

- [ ] **Step 5.2: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5.3: Commit**

```bash
git add lib/queries/serviceMappings.ts lib/queries/chainMappings.ts lib/queries/webhookLogs.ts lib/queries/users.ts
git commit -m "feat: add TanStack Query hooks for service/chain mappings, users, webhook logs"
```

---

## Task 6: Service Mappings CRUD UI

**Files:**
- Create: `components/modals/ServiceMappingFormModal.tsx`
- Create: `app/(dashboard)/settings/mappings/service/ServiceMappingsClient.tsx`
- Modify: `app/(dashboard)/settings/mappings/service/page.tsx`

The UI groups service_mappings rows by `zenbooker_service_id`. Standalone services (no modifier) appear as single rows. Bundle services (modifier rows) show as expandable parent/children. The modal handles both create and edit.

### Modal

```typescript
// components/modals/ServiceMappingFormModal.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateServiceMapping, useUpdateServiceMapping } from '@/lib/queries/serviceMappings'
import { useEquipment } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  mapping?: ServiceMappingRow // if provided = edit mode
  prefillServiceId?: string // for "create modifier row" under existing service
  prefillServiceName?: string
  equipment: EquipmentRow[]
  onClose: () => void
}

export function ServiceMappingFormModal({ mapping, prefillServiceId, prefillServiceName, equipment, onClose }: Props) {
  const create = useCreateServiceMapping()
  const update = useUpdateServiceMapping()

  const [serviceId, setServiceId] = useState(mapping?.zenbooker_service_id ?? prefillServiceId ?? '')
  const [serviceName, setServiceName] = useState(mapping?.zenbooker_service_name ?? prefillServiceName ?? '')
  const [modifierId, setModifierId] = useState(mapping?.zenbooker_modifier_id ?? '')
  const [modifierName, setModifierName] = useState(mapping?.zenbooker_modifier_name ?? '')
  const [itemId, setItemId] = useState(mapping?.item_id ?? '')
  const [defaultQty, setDefaultQty] = useState(String(mapping?.default_qty ?? 1))
  const [useCustomerQty, setUseCustomerQty] = useState(mapping?.use_customer_qty ?? false)
  const [notes, setNotes] = useState(mapping?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!mapping

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const body = {
        zenbooker_service_id: serviceId.trim(),
        zenbooker_service_name: serviceName.trim() || serviceId.trim(),
        zenbooker_modifier_id: modifierId.trim() || null,
        zenbooker_modifier_name: modifierName.trim() || null,
        item_id: itemId,
        default_qty: parseInt(defaultQty, 10),
        use_customer_qty: useCustomerQty,
        notes: notes.trim(),
      }
      if (isEdit) {
        await update.mutateAsync({ id: mapping.id, ...body })
      } else {
        await create.mutateAsync(body)
      }
      onClose()
    } catch (err) {
      setError(String(err))
    }
  }

  const activeEquipment = equipment.filter(e => e.is_active)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service Mapping' : 'Add Service Mapping'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Zenbooker Service ID</label>
            <Input value={serviceId} onChange={e => setServiceId(e.target.value)} required
              placeholder="e.g. svc_foam_party" disabled={isEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Service Name (display)</label>
            <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Foam Party" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Modifier ID (leave blank for standalone)</label>
            <Input value={modifierId} onChange={e => setModifierId(e.target.value)}
              placeholder="e.g. mod_laser_tag" disabled={isEdit} />
          </div>
          {modifierId && (
            <div>
              <label className="block text-sm font-medium mb-1">Modifier Name (display)</label>
              <Input value={modifierName} onChange={e => setModifierName(e.target.value)} placeholder="Laser Tag" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Equipment Item</label>
            <Select value={itemId} onValueChange={setItemId} required>
              <SelectTrigger><SelectValue placeholder="Select equipment..." /></SelectTrigger>
              <SelectContent>
                {activeEquipment.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Default Qty</label>
              <Input type="number" min="0" value={defaultQty} onChange={e => setDefaultQty(e.target.value)} required />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useCustomerQty}
                  onChange={e => setUseCustomerQty(e.target.checked)}
                  className="w-4 h-4" />
                <span className="text-sm">Use customer qty</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEdit ? 'Save Changes' : 'Add Mapping'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### ServiceMappingsClient

```typescript
// app/(dashboard)/settings/mappings/service/ServiceMappingsClient.tsx
'use client'

import React, { useState } from 'react'
import { useServiceMappings, useDeleteServiceMapping } from '@/lib/queries/serviceMappings'
import { useEquipment } from '@/lib/queries/equipment'
import { ServiceMappingFormModal } from '@/components/modals/ServiceMappingFormModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  initialMappings: ServiceMappingRow[]
  initialEquipment: EquipmentRow[]
}

export function ServiceMappingsClient({ initialMappings, initialEquipment }: Props) {
  const { data: mappings = [] } = useServiceMappings(initialMappings)
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const deleteMapping = useDeleteServiceMapping()

  const [showCreate, setShowCreate] = useState(false)
  const [editMapping, setEditMapping] = useState<ServiceMappingRow | null>(null)
  const [addModifierFor, setAddModifierFor] = useState<{ serviceId: string; serviceName: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const equipById = new Map(equipment.map(e => [e.id, e]))

  // Group by service_id
  const groups = new Map<string, { name: string; rows: ServiceMappingRow[] }>()
  for (const m of mappings) {
    const existing = groups.get(m.zenbooker_service_id)
    if (existing) {
      existing.rows.push(m)
    } else {
      groups.set(m.zenbooker_service_id, { name: m.zenbooker_service_name, rows: [m] })
    }
  }

  const toggleExpand = (serviceId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Service Mappings</h1>
        <Button onClick={() => setShowCreate(true)}>Add Mapping</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Zenbooker Service</th>
              <th className="px-4 py-3 font-medium">Modifier</th>
              <th className="px-4 py-3 font-medium">Maps To</th>
              <th className="px-4 py-3 font-medium text-center">Qty</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...groups.entries()].map(([serviceId, group]) => {
              const isBundle = group.rows.some(r => r.zenbooker_modifier_id !== null)
              const isOpen = expanded.has(serviceId)

              if (!isBundle) {
                const row = group.rows[0]
                return (
                  <tr key={serviceId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{group.name}</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3">{equipById.get(row.item_id)?.name ?? row.item_id}</td>
                    <td className="px-4 py-3 text-center">
                      {row.use_customer_qty
                        ? <Badge className="bg-blue-100 text-blue-800">Customer</Badge>
                        : row.default_qty}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditMapping(row)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteMapping.mutate(row.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <React.Fragment key={serviceId}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(serviceId)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {isOpen ? '▾' : '▸'} {group.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 italic text-xs">Bundle — {group.rows.length} modifiers</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline"
                        onClick={e => { e.stopPropagation(); setAddModifierFor({ serviceId, serviceName: group.name }) }}>
                        + Modifier
                      </Button>
                    </td>
                  </tr>
                  {isOpen && group.rows.map(row => (
                    <tr key={row.id} className="bg-gray-50/50 text-xs">
                      <td className="px-4 py-2 pl-8 text-gray-500">{group.name}</td>
                      <td className="px-4 py-2 text-gray-700">{row.zenbooker_modifier_name}</td>
                      <td className="px-4 py-2">{equipById.get(row.item_id)?.name ?? row.item_id}</td>
                      <td className="px-4 py-2 text-center">
                        {row.use_customer_qty
                          ? <Badge className="bg-blue-100 text-blue-800 text-xs">Customer</Badge>
                          : row.default_qty}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditMapping(row)}>Edit</Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => deleteMapping.mutate(row.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            {groups.size === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No service mappings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <ServiceMappingFormModal equipment={equipment} onClose={() => setShowCreate(false)} />
      )}
      {editMapping && (
        <ServiceMappingFormModal mapping={editMapping} equipment={equipment} onClose={() => setEditMapping(null)} />
      )}
      {addModifierFor && (
        <ServiceMappingFormModal
          prefillServiceId={addModifierFor.serviceId}
          prefillServiceName={addModifierFor.serviceName}
          equipment={equipment}
          onClose={() => setAddModifierFor(null)}
        />
      )}
    </div>
  )
}
```

### Server Page

```typescript
// app/(dashboard)/settings/mappings/service/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ServiceMappingsClient } from './ServiceMappingsClient'

export default async function ServiceMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappings }, { data: equipment }] = await Promise.all([
    supabase.from('service_mappings').select('*').order('zenbooker_service_name'),
    supabase.from('equipment').select('*').order('name'),
  ])

  return (
    <ServiceMappingsClient
      initialMappings={mappings ?? []}
      initialEquipment={equipment ?? []}
    />
  )
}
```

- [ ] **Step 6.1: Create `components/modals/ServiceMappingFormModal.tsx`**
- [ ] **Step 6.2: Create `app/(dashboard)/settings/mappings/service/ServiceMappingsClient.tsx`**
- [ ] **Step 6.3: Replace `app/(dashboard)/settings/mappings/service/page.tsx`**
- [ ] **Step 6.4: Run full test suite**

```bash
npx jest --no-coverage
```

- [ ] **Step 6.5: Commit**

```bash
git add components/modals/ServiceMappingFormModal.tsx \
  "app/(dashboard)/settings/mappings/service/ServiceMappingsClient.tsx" \
  "app/(dashboard)/settings/mappings/service/page.tsx"
git commit -m "feat: add service mappings CRUD UI with bundle grouping"
```

---

## Task 7: Chain Mappings CRUD UI

**Files:**
- Create: `components/modals/ChainMappingFormModal.tsx`
- Create: `app/(dashboard)/settings/mappings/chain/ChainMappingsClient.tsx`
- Modify: `app/(dashboard)/settings/mappings/chain/page.tsx`

### Modal

```typescript
// components/modals/ChainMappingFormModal.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateChainMapping, useUpdateChainMapping } from '@/lib/queries/chainMappings'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  mapping?: ChainMappingRow
  chains: ChainRow[]
  onClose: () => void
}

export function ChainMappingFormModal({ mapping, chains, onClose }: Props) {
  const create = useCreateChainMapping()
  const update = useUpdateChainMapping()

  const [staffId, setStaffId] = useState(mapping?.zenbooker_staff_id ?? '')
  const [staffName, setStaffName] = useState(mapping?.zenbooker_staff_name ?? '')
  const [chainId, setChainId] = useState(mapping?.chain_id ?? '')
  const [notes, setNotes] = useState(mapping?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!mapping

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const body = {
        zenbooker_staff_id: staffId.trim(),
        zenbooker_staff_name: staffName.trim() || staffId.trim(),
        chain_id: chainId,
        notes: notes.trim(),
      }
      if (isEdit) await update.mutateAsync({ id: mapping.id, ...body })
      else await create.mutateAsync(body)
      onClose()
    } catch (err) {
      setError(String(err))
    }
  }

  const activeChains = chains.filter(c => c.is_active)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Chain Mapping' : 'Add Chain Mapping'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Zenbooker Staff ID</label>
            <Input value={staffId} onChange={e => setStaffId(e.target.value)} required
              placeholder="e.g. staff_alice" disabled={isEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Staff Name (display)</label>
            <Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Alice Smith" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Chain</label>
            <Select value={chainId} onValueChange={setChainId} required>
              <SelectTrigger><SelectValue placeholder="Select chain..." /></SelectTrigger>
              <SelectContent>
                {activeChains.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEdit ? 'Save Changes' : 'Add Mapping'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### ChainMappingsClient

```typescript
// app/(dashboard)/settings/mappings/chain/ChainMappingsClient.tsx
'use client'

import { useState } from 'react'
import { useChainMappings, useDeleteChainMapping } from '@/lib/queries/chainMappings'
import { useChains } from '@/lib/queries/chains'
import { ChainMappingFormModal } from '@/components/modals/ChainMappingFormModal'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  initialMappings: ChainMappingRow[]
  initialChains: ChainRow[]
}

export function ChainMappingsClient({ initialMappings, initialChains }: Props) {
  const { data: mappings = [] } = useChainMappings(initialMappings)
  const { data: chains = [] } = useChains(initialChains)
  const deleteMapping = useDeleteChainMapping()

  const [showCreate, setShowCreate] = useState(false)
  const [editMapping, setEditMapping] = useState<ChainMappingRow | null>(null)

  const chainById = new Map(chains.map(c => [c.id, c]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chain Mappings</h1>
        <Button onClick={() => setShowCreate(true)}>Add Mapping</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Staff Name</th>
              <th className="px-4 py-3 font-medium">Staff ID</th>
              <th className="px-4 py-3 font-medium">Assigned Chain</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map(m => {
              const chain = chainById.get(m.chain_id)
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{m.zenbooker_staff_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.zenbooker_staff_id}</td>
                  <td className="px-4 py-3">
                    {chain ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: chain.color }} />
                        {chain.name}
                      </span>
                    ) : m.chain_id}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditMapping(m)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => deleteMapping.mutate(m.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {mappings.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No chain mappings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <ChainMappingFormModal chains={chains} onClose={() => setShowCreate(false)} />}
      {editMapping && (
        <ChainMappingFormModal mapping={editMapping} chains={chains} onClose={() => setEditMapping(null)} />
      )}
    </div>
  )
}
```

### Server Page

```typescript
// app/(dashboard)/settings/mappings/chain/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChainMappingsClient } from './ChainMappingsClient'

export default async function ChainMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappings }, { data: chains }] = await Promise.all([
    supabase.from('chain_mappings').select('*').order('zenbooker_staff_name'),
    supabase.from('chains').select('*').order('name'),
  ])

  return (
    <ChainMappingsClient
      initialMappings={mappings ?? []}
      initialChains={chains ?? []}
    />
  )
}
```

- [ ] **Step 7.1: Create `components/modals/ChainMappingFormModal.tsx`**
- [ ] **Step 7.2: Create `app/(dashboard)/settings/mappings/chain/ChainMappingsClient.tsx`**
- [ ] **Step 7.3: Replace `app/(dashboard)/settings/mappings/chain/page.tsx`**
- [ ] **Step 7.4: Run full test suite**

```bash
npx jest --no-coverage
```

- [ ] **Step 7.5: Commit**

```bash
git add components/modals/ChainMappingFormModal.tsx \
  "app/(dashboard)/settings/mappings/chain/ChainMappingsClient.tsx" \
  "app/(dashboard)/settings/mappings/chain/page.tsx"
git commit -m "feat: add chain mappings CRUD UI"
```

---

## Task 8: Needs Review Detail Panel in Bookings Tab

**Files:**
- Modify: `app/(dashboard)/bookings/BookingsClient.tsx`

The Bookings tab already shows a "X bookings need attention" banner (from Plan 3). This task adds the detail panel — shown when user clicks "Review" on a `needs_review` booking. The panel fetches the most recent webhook log for that booking and displays unmapped service names + raw payload + a "Create Mapping" button.

The panel uses `useWebhookLogForBooking(bookingId)` and opens `ServiceMappingFormModal` when "Create Mapping" is clicked.

Add to `BookingsClient.tsx`:

1. Import `useWebhookLogForBooking` from `lib/queries/webhookLogs`
2. Import `ServiceMappingFormModal` from `components/modals/ServiceMappingFormModal`
3. Import `useEquipment` from `lib/queries/equipment`
4. Add state: `reviewingBookingId: string | null`
5. Add `NeedsReviewPanel` inline component (or inline JSX) that appears when `reviewingBookingId` is set

```typescript
// Add to BookingsClient.tsx — imports
import { useWebhookLogForBooking } from '@/lib/queries/webhookLogs'
import { ServiceMappingFormModal } from '@/components/modals/ServiceMappingFormModal'
import { useEquipment } from '@/lib/queries/equipment'

// Add to BookingsClient component state
const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null)
const [createMappingPreset, setCreateMappingPreset] = useState<{ serviceId: string; serviceName: string } | null>(null)
const { data: allEquipment = [] } = useEquipment()

// NeedsReviewPanel as a sub-component (defined outside BookingsClient to avoid closure issues):
function NeedsReviewPanel({ bookingId, onClose, onCreateMapping }: {
  bookingId: string
  onClose: () => void
  onCreateMapping: (serviceId: string, serviceName: string) => void
}) {
  const { data: log, isLoading } = useWebhookLogForBooking(bookingId)
  const [showPayload, setShowPayload] = useState(false)

  const unmappedNames = log?.result_detail
    ? log.result_detail.split(', ').filter(Boolean)
    : []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Needs Review</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {isLoading && <p className="text-gray-500 text-sm">Loading webhook details...</p>}
        {!isLoading && !log && (
          <p className="text-gray-500 text-sm">No webhook log found for this booking. It may have been created manually or the log was not captured.</p>
        )}
        {log && (
          <div className="space-y-4">
            {unmappedNames.length > 0 && (
              <div>
                <p className="text-sm font-medium text-yellow-800 mb-2">Unmapped Zenbooker Services:</p>
                <ul className="space-y-1">
                  {unmappedNames.map(name => (
                    <li key={name} className="flex items-center justify-between bg-yellow-50 rounded px-3 py-1.5">
                      <span className="text-sm">{name}</span>
                      <button
                        onClick={() => onCreateMapping('', name)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Create Mapping
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <button
                onClick={() => setShowPayload(p => !p)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                {showPayload ? 'Hide' : 'Show'} Raw Payload
              </button>
              {showPayload && (
                <pre className="mt-2 bg-gray-50 rounded p-3 text-xs overflow-auto max-h-64">
                  {JSON.stringify(log.raw_payload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

Add "Review" button to the booking row's action buttons (only for `needs_review` bookings, for admin/sales), and render the panel + optional `ServiceMappingFormModal`:

```typescript
// In the booking row action buttons:
{booking.status === 'needs_review' && canWrite(role) && (
  <Button size="sm" variant="outline"
    className="text-yellow-700 border-yellow-300"
    onClick={() => setReviewingBookingId(booking.id)}>
    Review
  </Button>
)}

// At the bottom of BookingsClient JSX:
{reviewingBookingId && (
  <NeedsReviewPanel
    bookingId={reviewingBookingId}
    onClose={() => setReviewingBookingId(null)}
    onCreateMapping={(serviceId, serviceName) => {
      setCreateMappingPreset({ serviceId, serviceName })
      setReviewingBookingId(null)
    }}
  />
)}
{createMappingPreset && (
  <ServiceMappingFormModal
    prefillServiceId={createMappingPreset.serviceId}
    prefillServiceName={createMappingPreset.serviceName}
    equipment={allEquipment}
    onClose={() => setCreateMappingPreset(null)}
  />
)}
```

- [ ] **Step 8.1: Read `app/(dashboard)/bookings/BookingsClient.tsx` in full** to understand its current structure before editing.

- [ ] **Step 8.2: Add `NeedsReviewPanel` sub-component and required state/imports to `BookingsClient.tsx`**

Place `NeedsReviewPanel` as a module-level function above `BookingsClient` (not inside it) to keep it stable across renders.

- [ ] **Step 8.3: Add "Review" button to booking rows and panel rendering**

- [ ] **Step 8.4: Run full test suite**

```bash
npx jest --no-coverage
```

- [ ] **Step 8.5: Commit**

```bash
git add "app/(dashboard)/bookings/BookingsClient.tsx"
git commit -m "feat: add needs_review detail panel with raw payload and Create Mapping shortcut"
```

---

## Task 9: Users Management UI

**Files:**
- Create: `app/(dashboard)/settings/users/UsersClient.tsx`
- Modify: `app/(dashboard)/settings/users/page.tsx`

### UsersClient

```typescript
// app/(dashboard)/settings/users/UsersClient.tsx
'use client'

import { useUsers, useUpdateUserRole } from '@/lib/queries/users'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { Database, UserRole } from '@/lib/types/database.types'

type UserRow = Database['public']['Tables']['users']['Row']

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-800' },
  sales: { label: 'Sales', className: 'bg-blue-100 text-blue-800' },
  staff: { label: 'Staff', className: 'bg-green-100 text-green-800' },
  readonly: { label: 'Read-only', className: 'bg-gray-100 text-gray-600' },
}

const VALID_ROLES: UserRole[] = ['admin', 'sales', 'staff', 'readonly']

interface Props {
  initialUsers: UserRow[]
  currentUserId: string
}

export function UsersClient({ initialUsers, currentUserId }: Props) {
  const { data: users = [] } = useUsers(initialUsers)
  const updateRole = useUpdateUserRole()

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">User Management</h1>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Current Role</th>
              <th className="px-4 py-3 font-medium">Change Role</th>
              <th className="px-4 py-3 font-medium">Member Since</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => {
              const badge = ROLE_BADGE[u.role]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {u.full_name}
                    {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-gray-400">Cannot change own role</span>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={role => updateRole.mutate({ id: u.id, role: role as UserRole })}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALID_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{ROLE_BADGE[r].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### Server Page

```typescript
// app/(dashboard)/settings/users/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const { data: users } = await supabase.from('users').select('*').order('full_name')

  return <UsersClient initialUsers={users ?? []} currentUserId={user.id} />
}
```

- [ ] **Step 9.1: Create `app/(dashboard)/settings/users/UsersClient.tsx`**
- [ ] **Step 9.2: Replace `app/(dashboard)/settings/users/page.tsx`**
- [ ] **Step 9.3: Run full test suite**

```bash
npx jest --no-coverage
```

- [ ] **Step 9.4: Commit**

```bash
git add "app/(dashboard)/settings/users/UsersClient.tsx" "app/(dashboard)/settings/users/page.tsx"
git commit -m "feat: add user management UI with role selector"
```

---

## Task 10: Webhook Logs UI

**Files:**
- Create: `app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx`
- Modify: `app/(dashboard)/settings/webhook-logs/page.tsx`

No Realtime subscription for webhook logs — low-frequency diagnostic screen. A manual refetch button is provided.

### WebhookLogsClient

```typescript
// app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx
'use client'

import { useState } from 'react'
import { useWebhookLogs } from '@/lib/queries/webhookLogs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database, WebhookResult } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']

const RESULT_BADGE: Record<NonNullable<WebhookResult>, { label: string; className: string }> = {
  success: { label: 'Success', className: 'bg-green-100 text-green-800' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800' },
  unmapped_service: { label: 'Unmapped', className: 'bg-yellow-100 text-yellow-800' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-600' },
}

interface Props {
  initialLogs: WebhookLogRow[]
}

export function WebhookLogsClient({ initialLogs }: Props) {
  const { data: logs = [], refetch, isFetching } = useWebhookLogs(initialLogs)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Webhook Logs</h1>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Job ID</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 font-medium">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map(log => {
              const badge = log.result ? RESULT_BADGE[log.result] : null
              return (
                <>
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(log.received_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{log.zenbooker_job_id}</td>
                    <td className="px-4 py-3 text-xs font-mono">{log.action}</td>
                    <td className="px-4 py-3">
                      {badge ? (
                        <Badge className={badge.className}>{badge.label}</Badge>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {log.result_detail || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        {expandedId === log.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-payload`}>
                      <td colSpan={6} className="px-4 py-3 bg-gray-50">
                        <pre className="text-xs overflow-auto max-h-64">
                          {JSON.stringify(log.raw_payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No webhook logs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### Server Page

```typescript
// app/(dashboard)/settings/webhook-logs/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WebhookLogsClient } from './WebhookLogsClient'

export default async function WebhookLogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const { data: logs } = await supabase
    .from('webhook_logs')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(200)

  return <WebhookLogsClient initialLogs={logs ?? []} />
}
```

- [ ] **Step 10.1: Create `app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx`**
- [ ] **Step 10.2: Replace `app/(dashboard)/settings/webhook-logs/page.tsx`**
- [ ] **Step 10.3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 10.4: Commit**

```bash
git add "app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx" "app/(dashboard)/settings/webhook-logs/page.tsx"
git commit -m "feat: add webhook logs UI with payload inspector and refresh button"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
npx jest --no-coverage
```

Expected: All tests pass (was 79 before this plan; now 88 with the 9 new webhookProcessor tests).

- [ ] **TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No type errors.
