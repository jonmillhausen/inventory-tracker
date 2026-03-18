# Wonderfly Inventory System — Production Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Source:** `wonderfly-v3.jsx` (single-file React prototype)

---

## Overview

A production inventory management system for Wonderfly, an events/entertainment equipment rental company. The app tracks equipment availability, manages bookings, assigns events to delivery chains, generates packing lists, and auto-imports bookings from Zenbooker via webhook.

The production system replaces a single-file React prototype backed by `window.storage` with a multi-user, real-time, cloud-backed application built on Next.js, Supabase, and Vercel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Data fetching | TanStack Query v5 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Deployment | Vercel (CI/CD from GitHub `main`) |
| Version control | GitHub |

---

## Architecture

```
GitHub → Vercel (CI/CD, preview deployments on PRs)
           │
    Next.js 14 App Router (TypeScript)
           │
    ┌──────┼──────────────────────┐
    │      │                      │
  Auth   Pages (Server +       /api/
(Supabase) Client Components)    │
    │      │                ┌─────┴──────────────────┐
    └──────┤                │                        │
           │     /api/webhooks/zenbooker   /api/packing-list/
           │     (Route Handler)           [token]/[chain]/[date]
           │           │                  (print-ready HTML)
           │     normalizes payload              │
           │     writes to Supabase              │
           │                                     │
        Supabase                                 │
    ┌──────┼──────────────────┐                  │
    │      │                  │◄─────────────────┘
   Auth   DB (Postgres)   Realtime
  (JWT)  (RLS enforced)   (subscriptions)
```

**API route structure** is organized as `/api/[domain]/[action]` to support future additions without restructuring. A planned `/api/travel-estimates` route will call the Google Maps Distance Matrix API for real-time travel time calculations on the Schedule Board — no structural changes needed when it's added.

---

## Roles & Permissions

| Feature | Admin | Sales | Staff | Read-only |
|---|---|---|---|---|
| View all tabs | ✓ | ✓ | ✓ | ✓ |
| Create/edit bookings | ✓ | ✓ | — | — |
| Cancel/delete bookings | ✓ | ✓ | — | — |
| Assign chain on booking | ✓ | ✓ | ✓ (chain field only) | — |
| Create issue flags | ✓ | ✓ | ✓ | — |
| Manage equipment | ✓ | — | — | — |
| Manage users | ✓ | — | — | — |
| Manage service/chain mappings | ✓ | — | — | — |
| Access settings | ✓ | — | — | — |
| Packing list checkboxes | ✓ | ✓ | ✓ | — |
| Date filtering | ✓ | ✓ | ✓ | ✓ |
| View webhook logs | ✓ | — | — | — |

Staff are part-time game coordinators who need to see their schedule, verify packing lists, and report damaged equipment on-site. They have read access to all dashboard tabs.

---

## Database Schema

### `users`
Extended profile for Supabase Auth users.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | FK → auth.users |
| `full_name` | text | |
| `role` | enum | `admin \| sales \| staff \| readonly` |
| `created_at` | timestamptz | |

### `equipment`

| Column | Type | Notes |
|---|---|---|
| `id` | text | Slug, e.g. `foam_machine` |
| `name` | text | |
| `total_qty` | int | |
| `out_of_service` | int | Count, derived from `out_of_service_items` |
| `issue_flag` | int | Count, derived from `issue_flag_items` |
| `is_active` | bool | |
| `custom_setup_min` | int | Nullable; defaults to 45 in app logic |
| `custom_cleanup_min` | int | Nullable; defaults to 45 in app logic |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `equipment_sub_items`

| Column | Type | Notes |
|---|---|---|
| `id` | text | Slug |
| `parent_id` | text | FK → equipment |
| `name` | text | |
| `total_qty` | int | |
| `out_of_service` | int | |
| `issue_flag` | int | |
| `is_active` | bool | |

### `issue_flag_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `item_id` | text | Equipment or sub-item id |
| `qty` | int | Number of units flagged in this entry |
| `note` | text | |
| `reported_at` | timestamptz | |
| `resolved_at` | timestamptz | Nullable |
| `resolved_action` | enum | `cleared \| moved_to_oos`; nullable |

**RLS:** Read access granted to all authenticated roles (required for Realtime broadcast to work cross-session — coordinator flags equipment on-site, admin/sales see count update in real time on the Availability and Equipment tabs).

### `out_of_service_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `item_id` | text | Equipment or sub-item id |
| `qty` | int | Number of units in this OOS entry |
| `note` | text | |
| `return_date` | date | Nullable |
| `created_at` | timestamptz | |
| `returned_at` | timestamptz | Nullable |

### `bookings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `zenbooker_job_id` | text | Unique; used for upsert idempotency |
| `customer_name` | text | |
| `event_date` | date | |
| `end_date` | date | Nullable; multi-day bookings |
| `start_time` | time | |
| `end_time` | time | |
| `chain` | text | FK → chains |
| `status` | enum | `confirmed \| canceled \| completed \| needs_review` |
| `event_type` | enum | `coordinated \| dropoff \| pickup \| willcall` |
| `source` | enum | `webhook \| manual` |
| `address` | text | |
| `notes` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

`UNIQUE (zenbooker_job_id)` — enables `ON CONFLICT (zenbooker_job_id) DO UPDATE` for idempotent upserts.

### `booking_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `booking_id` | uuid | FK → bookings |
| `item_id` | text | FK → equipment |
| `qty` | int | |
| `is_sub_item` | bool | |
| `parent_item_id` | text | Nullable FK → equipment; populated when is_sub_item = true |

### `chains`

| Column | Type | Notes |
|---|---|---|
| `id` | text | e.g. `chain_1` |
| `name` | text | e.g. `Chain #1` |
| `color` | text | Hex color |
| `is_active` | bool | |

### `chain_mappings`
Maps Zenbooker staff members to chains.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `zenbooker_staff_id` | text | |
| `zenbooker_staff_name` | text | For display |
| `chain_id` | text | FK → chains |
| `notes` | text | |

### `service_mappings`
Maps Zenbooker services and modifiers to inventory items. Bundles use multiple rows (one per modifier/game selection) under the same `zenbooker_service_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `zenbooker_service_id` | text | |
| `zenbooker_service_name` | text | For display |
| `zenbooker_modifier_id` | text | Nullable; null for standalone services |
| `zenbooker_modifier_name` | text | Nullable; for display |
| `item_id` | text | FK → equipment |
| `default_qty` | int | |
| `use_customer_qty` | bool | If true, pull qty from payload; if false, use default_qty |
| `notes` | text | |

### `webhook_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `received_at` | timestamptz | |
| `zenbooker_job_id` | text | |
| `action` | text | `job_created \| job_rescheduled \| job_cancelled \| service_order_edited \| recurring_booking_created \| recurring_booking_canceled \| unrecognized` |
| `raw_payload` | jsonb | Full Zenbooker payload |
| `result` | enum | `success \| error \| unmapped_service` |
| `result_detail` | text | Error message or unmapped service name |
| `booking_id` | uuid | Nullable FK → bookings |

---

## Zenbooker Webhook Processing

**Route:** `POST /api/webhooks/zenbooker`

### Security
- Shared secret verified via request header — returns 401 on mismatch
- Payload size check: reject anything over 1MB
- Timestamp check on payload (if Zenbooker provides one) to prevent replay attacks
- Missing `zenbooker_job_id`: log and return 400

### Processing Pipeline

```
1.  Verify shared secret → 401 if invalid
2.  Check payload size (<1MB) → 413 if exceeded
3.  Validate timestamp if present → 400 if stale
4.  Log raw payload to webhook_logs (received_at, raw_payload, action, zenbooker_job_id)
5.  Parse action type
6.  If unrecognized action → log result = error, result_detail = "unrecognized action: [value]", return 200
7.  Resolve chain: look up assigned staff in chain_mappings → get chain_id
8.  Resolve items (additive, not blocking):
      For each service/modifier in payload:
        a. Query service_mappings by (zenbooker_service_id, zenbooker_modifier_id)
        b. If use_customer_qty = true → pull qty from payload
           If use_customer_qty = false → use default_qty
        c. If no mapping found → add to unmapped list, continue processing other items
      Result: resolved_items[], unmapped_names[]
9.  Determine status:
      - unmapped_names.length > 0 → needs_review
      - else → confirmed (or canceled for cancellation actions)
10. Upsert booking ON CONFLICT (zenbooker_job_id) DO UPDATE
11. Delete existing booking_items for this booking_id, insert resolved_items (partial data preserved for needs_review)
12. Update webhook_logs: result, result_detail, booking_id
13. Return 200 (always for valid requests — prevents Zenbooker retries for non-transient issues)
```

### Per-Action Behavior

| Action | Behavior |
|---|---|
| `job_created` | Full pipeline |
| `job_rescheduled` | Full pipeline; upsert updates event_date, times, chain, address |
| `job_cancelled` | Upsert with status = canceled; no item processing |
| `service_order_edited` | Full pipeline; re-run mapping resolution on new service list; flip to needs_review if new unmapped service introduced even if original booking was confirmed |
| `recurring_booking_created` | Log to webhook_logs only; return 200 |
| `recurring_booking_canceled` | Log to webhook_logs only; return 200 |
| Unrecognized | Log result = error, return 200 |

**Note on recurring bookings:** Zenbooker generates individual `job_created` events for each occurrence, which the existing pipeline handles. Recurring-level events are logged for visibility. Confirm this behavior during testing.

### Error Handling

| Scenario | Response | Reason |
|---|---|---|
| Invalid shared secret | 401 | Reject unauthorized |
| Payload > 1MB | 413 | Protect processing time |
| Stale/invalid timestamp | 400 | Prevent replay attacks |
| Missing zenbooker_job_id | 400 | Malformed payload, safe to reject |
| Unmapped service | 200 | Not Zenbooker's fault; don't trigger retry |
| Unrecognized action | 200 | Future-proof against new Zenbooker event types |
| Unhandled exception | 500 | Upsert idempotency makes Zenbooker retry safe |

### Batch Re-process on New Mapping

When an admin saves a new service mapping:
1. Query all `needs_review` bookings
2. For each, fetch its `webhook_logs` raw_payload and re-run item resolution against current mappings
3. Bookings that fully resolve → update status to `confirmed`, replace `booking_items`
4. Still-unresolved bookings remain `needs_review`
5. Runs as a non-blocking background job — admin gets immediate UI feedback

---

## Frontend Structure

### Routes

```
/login                              Supabase Auth UI
/app/(dashboard)/
  page.tsx                          Redirects to /availability
  availability/                     Availability tab
  schedule/                         Schedule Board
  bookings/                         Bookings list
  chains/                           Chain Loading / packing lists
  equipment/                        Equipment management
  settings/                         Admin only
    mappings/service/               Service mappings CRUD (grouped by service)
    mappings/chain/                 Chain/staff mappings CRUD
    equipment/                      Equipment + sub-items CRUD
    users/                          User management + role assignment
    webhook-logs/                   Webhook activity log (not in main nav)

/api/
  webhooks/zenbooker                POST — Zenbooker webhook handler
  packing-list/[token]/[chain]/[date]  GET — Print-ready HTML (no auth, HMAC token)
  travel-estimates/                 (reserved, not yet built)
```

### Auth & Role Gating
- `middleware.ts` checks Supabase session on every request — unauthenticated → `/login`
- Each page checks role server-side; unauthorized roles receive a 403 page
- Staff: read access to all dashboard tabs; write access limited to packing list checkboxes, issue flag creation, chain field on bookings, and date filtering
- Read-only: all tabs visible, all write actions hidden/disabled

### Component Architecture
- `app/(dashboard)/layout.tsx` — sidebar nav + top bar (Server Component, renders role-appropriate nav items)
- Each tab: Server Component fetches initial data → passes as `initialData` to Client Component
- `useRealtimeSync` hook mounted once in dashboard layout — subscribes to all Realtime channels
- Modals in `/components/modals/`: booking form, equipment form, issue flags, OOS, mapping editor
- shadcn/ui components used: Table, Dialog, Select, Input, Button, Badge, Popover, Sheet (mobile sidebar)

### Service Mappings UI
- `/settings/mappings/service` groups rows by `zenbooker_service_id`
- Bundle services show modifier rows as children (expandable)
- Inline edit supports adding multiple modifier rows under a single service
- Flat standalone services appear as single rows

### Needs Review Flow
- Banner in Bookings tab: "X bookings need attention" when `needs_review` bookings exist
- Panel shows unmapped service name + raw webhook payload + inline button to create missing mapping
- On save, batch re-process triggers automatically (non-blocking)

---

## Real-time & State Management

### TanStack Query
- `QueryClientProvider` wraps the dashboard layout
- Server Components fetch initial data → passed as `initialData` — no loading flash on first render
- Query keys: `['bookings']`, `['bookings', date]`, `['equipment']`, `['service_mappings']`, `['webhook_logs']`

### `useRealtimeSync` Hook

```
Subscriptions → Query invalidations:
  bookings               → ['bookings']
  equipment              → ['equipment']
  equipment_sub_items    → ['equipment']
  service_mappings       → ['service_mappings']
  issue_flag_items       → ['equipment']   ← RLS must grant read to all roles
  out_of_service_items   → ['equipment']
```

All subscriptions cleaned up on unmount.

### Mutations
- All writes use TanStack Query `useMutation`
- On success → `invalidateQueries` for affected keys (handles the session that made the change, which won't receive its own Realtime event)
- Optimistic updates only for packing list checkboxes (ephemeral local state, not persisted)

### Local State (React `useState`, not TanStack Query)
- Selected date, active tab, expanded rows, open modals, search text, filter values
- Packing list checkbox state — ephemeral per session, intentionally not synced (staff check off their own lists independently)

### Availability Calculation
- Computed client-side via `useMemo` from cached `equipment` + `bookings` data
- No separate API endpoint needed

---

## Packing List Print Route

**Route:** `GET /api/packing-list/[token]/[chain]/[date]`

- **No auth required** — bookmarkable by staff on phones/tablets
- **Token:** HMAC derived from `server_secret + chain + date`; valid for the date in the URL ± 1 day (3-day window)
- **Content:** Server-side rendered HTML with `Content-Type: text/html`
- **Structure:** Parent equipment items with sub-items grouped underneath as collapsible "[Parent Name] Supplies" — matches the Chain Loading screen structure exactly
- Returns 403 for invalid/expired tokens

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Upsert on `zenbooker_job_id` | Idempotent webhook handling; safe for Zenbooker retries |
| Partial resolution for needs_review | Preserve resolved items for availability calculations while admin fixes missing mappings |
| Packing list checkboxes as local state | Two staff members checking off independently is correct behavior; sync would cause conflict |
| Staff read access to all tabs | Coordinators need schedule and availability visibility, not just their chain |
| RLS read grant on issue_flag_items for all roles | Required for Supabase Realtime to broadcast to all sessions; enables on-site issue reporting workflow |
| HMAC token with ±1 day window | Staff can bookmark print URLs; prevents indefinite access from old bookmarks |
| service_mappings in Realtime | Admin mapping updates propagate to all open sessions without refresh |
| source enum on bookings | Distinguishes webhook imports from manual entries for auditing and troubleshooting |
