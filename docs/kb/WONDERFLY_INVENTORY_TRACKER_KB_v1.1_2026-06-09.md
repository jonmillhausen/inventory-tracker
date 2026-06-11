# Wonderfly Inventory Tracker — Knowledge Base
**Document ID:** WONDERFLY_INVENTORY_TRACKER_KB  
**Version:** 1.1  
**Date:** 2026-06-09  
**Status:** Current  
**Supersedes:** WONDERFLY_INVENTORY_TRACKER_KB_v1.0_2026-06-09.md  
**Sessions covered:** Session 1 (2026-03-19) + Session 2 (2026-03-27) + Session 3 (2026-05-07 through 2026-06-09)

---

## HOW TO USE THIS DOCUMENT

This is the canonical reference for the Wonderfly Inventory Tracker app. Upload it to the **Wonderfly Inventory Tracker Claude Project** knowledge base. Remove all older versions so only this file is active.

**Naming convention for future versions:**
`WONDERFLY_INVENTORY_TRACKER_KB_v[X.X]_[YYYY-MM-DD].md`

**When to create a new version:** After any session that adds pages, runs migrations, changes service mappings, modifies schema, adds chains or equipment, or makes significant logic/infrastructure changes.

**How to start a new session:** Paste or reference this document at the start of the chat and say: *"Use the knowledge base document WONDERFLY_INVENTORY_TRACKER_KB as full context before responding."*

---

## 1. SYSTEM OVERVIEW

**Company:** Wonderfly Games LLC (Wonderfly Events LLC), Arbutus, MD  
**Business:** Mobile event/party game rental delivery — Bubble Ball, Laser Tag, Arrow Tag, Foam Parties, Obstacle Courses, Warped Wall, Hamster Ball Track, Lawn Games, and more for private events, corporate outings, school functions.  
**Scale:** Up to 8 vehicle chains daily, ~500 events/year, operating within ~50 miles of Arbutus, MD.

**App purpose:** Centralize booking data, equipment inventory, and chain scheduling to reduce manual coordination overhead for the operations and sales teams.

**Live URL:** https://inventory-tracker-drab-xi.vercel.app  
**Custom domain (planned):** games.wonderflyhq.com  
**GitHub:** jonmillhausen/inventory-tracker  
**Owner:** Jon Millhausen (jon@wonderflyhq.com), admin  
**Admin UUID:** 84503801-9194-47ea-9c40-d3e71e203934

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query (React Query) v5 |
| UI components | shadcn/ui, lucide-react |
| Testing | Jest (146 tests as of v1.1) |
| Booking source | Zenbooker (webhooks + bulk import API) |

---

## 3. REPOSITORY STRUCTURE

```
app/
  (dashboard)/          # All authenticated pages
    availability/       # Availability page
    schedule/           # Schedule Board
    audit/              # 4-Week Audit (was 2-Week Audit, extended to 28 days)
    chains/             # Chain Loading (packing lists)
    wizard/             # Chain Wizard (sales tool)
    equipment/          # Equipment management
      reports/          # Equipment Flags (damage/missing reports)
    bookings/           # Bookings list
    pricing/            # Event Pricing Calculator
  api/
    bookings/
    chain-loading/overrides/
    import/zenbooker/   # Bulk import endpoint
    packing-list/[token]/[chain]/[date]/  # Token-auth print endpoint
    reports/submit/     # Equipment flags submit
    reports/equipment/  # Public equipment list (service role, bypasses RLS)
    travel-estimates/   # Google Maps Distance Matrix proxy
    webhooks/zenbooker/ # Live webhook receiver
    wizard/availability/ # Chain Wizard scoring API
  report/               # Public damage/missing report form (no auth required)
components/
  layout/
    Sidebar.tsx         # Main nav (NAV_ITEMS array)
  modals/
    WizardDayDetailModal.tsx
lib/
  queries/              # React Query hooks (bookings, equipment, wizard, etc.)
  supabase/             # client.ts, server.ts, service-role.ts, middleware.ts
  types/                # database.types.ts, shared types
  utils/
    availability.ts     # Core availability calculation + isBookingActiveOnDate
    packingList.ts      # Packing list calculation (coordinated vs dropoff logic)
    webhookProcessor.ts # Zenbooker webhook → booking_items resolver
    wizardSlots.ts      # Chain Wizard slot generation and scoring
supabase/migrations/    # 001–032 applied
__tests__/              # Jest suite
docs/superpowers/
  specs/                # Design specs (Chain Wizard spec etc.)
  plans/                # Implementation plans
```

---

## 4. DATABASE SCHEMA

**Supabase Project ID:** vznunpigjpfszntnexvd

### equipment
Primary equipment inventory.

| Column | Type | Notes |
|---|---|---|
| id | text (PK) | slug, e.g. `elite_laser_tag` |
| name | text | Display name |
| total_qty | int | Total units owned |
| out_of_service | int | Trigger-maintained counter |
| is_active | bool | False = hidden everywhere |
| categories | text[] | Array: Primary/Specialty/Lawn Games/Add-Ons |
| custom_setup_min | int nullable | Setup time override; null → use 45 min fallback |
| custom_cleanup_min | int nullable | Cleanup time override; null → use 45 min fallback |
| issue_flag | int | Count of open flag reports |

### equipment_sub_items
Sub-items that load alongside parent equipment.

| Column | Type | Notes |
|---|---|---|
| id | text (PK) | slug |
| parent_id | text NOT NULL | FK → equipment.id (primary parent) |
| name | text | |
| total_qty | int | |
| is_active | bool | |

### equipment_sub_item_links
Many-to-many: one sub-item can attach to multiple parents with different loadout quantities.

| Column | Notes |
|---|---|
| sub_item_id | FK → equipment_sub_items.id |
| parent_id | FK → equipment.id |
| loadout_qty | int, units per parent set |

### equipment_oos
Out-of-service incident tracking (one row per incident).

| Column | Notes |
|---|---|
| equipment_id | FK → equipment.id |
| quantity | int |
| created_at | timestamptz |
| expected_return_date | date nullable |
| returned_at | timestamptz nullable |

### equipment_reports
Public damage/missing report submissions.

| Column | Notes |
|---|---|
| staff_name | text |
| equipment_id | FK → equipment.id |
| sub_item_id | FK nullable |
| report_type | 'damaged' or 'missing' |
| quantity | int |
| note | text nullable |
| flag_created | bool |

RLS: public INSERT, authenticated-only SELECT.

### chains
| Column | Notes |
|---|---|
| id | text PK (e.g. `chain_1`) |
| name | text |
| color | hex string |
| is_active | bool |

**Active chains (as of v1.1):**

| Chain | Color | Notes |
|---|---|---|
| Chain #1 | #38b6ff | |
| Chain #2 | #f9232d | |
| Chain #3 | #7ed957 | |
| Chain #4 | #ffde59 | |
| Chain #5 | #8c52ff | |
| Chain #6 | #ff914d | |
| Chain #7 | #ff66c4 | Added Session 3 |
| Arena Pickup | #000000 | No overlap warnings |
| Chain #8 | #5ce1e6 | **DEACTIVATED** — removed from all pages |

### chain_mappings
Maps Zenbooker provider IDs to chain IDs.

| Zenbooker Staff ID | Staff Name | Chain |
|---|---|---|
| 1749646392064x427167298665840640 | Chain 1 (A) | chain_1 |
| 1749646439666x121019036700770300 | Chain 2 (A) | chain_2 |
| 1749646228248x485309126063685600 | Chain 3 (B) | chain_3 |
| 1749646186356x200303008244563970 | Chain 4 (B) | chain_4 |
| 1749646151100x619729387136221200 | Chain 5 (Custom) | chain_5 |
| 1749646088642x801952846222196700 | Chain 6 (Custom) | chain_6 |
| (chain_7 provider ID) | Chain 7 | chain_7 |
| 1780411998988x788923203686760400 | Arena Pickup | arena_pickup |

### bookings
One row per Zenbooker job.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| zenbooker_job_id | text | Zenbooker's `data.id` |
| customer_name | text | |
| event_date | date nullable | Local date in ET |
| end_date | date nullable | For multi-day / overnight |
| start_time | time nullable | Local time in ET |
| end_time | time nullable | Local time in ET |
| chain | text | FK → chains.id |
| status | text | 'confirmed', 'needs_review', 'canceled' |
| event_type | enum | 'coordinated', 'dropoff', 'pickup', 'arena_pickup', 'willcall' |
| address | text | |
| linked_booking_id | uuid nullable | Paired dropoff↔pickup booking |

### booking_items
| Column | Notes |
|---|---|
| booking_id | FK → bookings.id |
| item_id | FK → equipment.id |
| qty | int |
| is_sub_item | bool |
| parent_item_id | text nullable |

### service_mappings
Maps Zenbooker service option IDs → equipment with quantity logic.

| Column | Notes |
|---|---|
| zenbooker_service_id | Zenbooker service ID |
| zenbooker_modifier_id | Option ID; NULL = base mapping |
| zenbooker_modifier_name | Text label (for name-match fallback) |
| zenbooker_service_name | Service name for name-match |
| item_id | FK → equipment.id; NULL = is_skip |
| default_qty | int |
| use_customer_qty | bool — true = use payload qty, false = use default_qty |
| is_skip | bool — silently consume option, produce no equipment |

**Unique index:** `(zenbooker_service_id, COALESCE(modifier_id,''), COALESCE(item_id,''))` — prevents duplicate rows.

### chain_loading_overrides
Per-chain, per-date sub-item quantity overrides entered on Chain Loading page.

### chain_loading_notes
Per-chain, per-date notes for items and chain-level "Additional Details" text.

### webhook_logs
All incoming Zenbooker payloads for debugging. Columns include `zenbooker_job_id`, `action`, `result`, `result_detail`, `raw_payload`, `received_at`.

---

## 5. EQUIPMENT INVENTORY (Current — 31 items)

| ID | Name | Total Qty | Category |
|---|---|---|---|
| bubbleball | Bubble Ball | 40 | Primary |
| elite_laser_tag | Elite Laser Tag | 28 | Primary |
| laser_tag_lite | Laser Tag Lite | 20 | Primary |
| arrow_tag | Arrow Tag | 26 | Primary |
| geltag | Gel Tag | 20 | Primary |
| foam_machine | Foam Machine | 4 | Primary |
| gametruck_foam_machine | GameTruck Foam Machine | 1 | Primary |
| dropoff_foam_machine | Drop-off Foam Machine | 1 | Primary |
| hamster_ball_track | Hamster Ball Track | 2 | Primary |
| warped_wall | Warped Wall | 1 | Primary |
| obstacles_only | Obstacles Only | 1 | Primary |
| dart_board | Dart Board | 1 | Specialty |
| hoverball | Hoverball | 2 | Specialty |
| battleputt | Battleputt | 5 | Lawn Games |
| disc_golf | Disc Golf | 5 | Lawn Games |
| cornhole | Cornhole | 10 | Lawn Games |
| deluxe_cornhole | Deluxe Cornhole | 5 | Lawn Games |
| yard_pong | Yard Pong | 5 | Lawn Games |
| mega_chess | Mega Chess | 1 | Lawn Games |
| mega_checkers | Mega Checkers | 1 | Lawn Games |
| mega_jenga | Mega Jenga | 3 | Lawn Games |
| jenga | Jenga | 10 | Lawn Games |
| connect_4 | Connect 4 | 10 | Lawn Games |
| horseshoes | Horseshoes | 3 | Lawn Games |
| bucket_golf | Bucket Golf | 2 | Lawn Games |
| gaga_pit | Gaga Ball Pit | 1 | Specialty |
| promo_supplies | Promo Supplies | 1 | Add-Ons |
| water_tag | Water Tag | 20 | Primary |
| water_guns | Water Guns | 20 | Primary |
| generator | Generator | 2 | Add-Ons |
| bluetooth_speaker | Bluetooth Speaker | 4 | Add-Ons |

Sub-items: 69 active sub-items with full parent links as of v1.1 (replaced placeholder sub-items).

---

## 6. PAGES & FEATURES

### Availability (`/availability`)
Equipment inventory vs. bookings by date. Columns are active chains + Unassigned. Shows total inventory, per-chain bookings, remaining count. OOS popover, category filters, "Show Booked Only" toggle, chain popup with booking details.

**Overnight cutoff rule:** If `end_date` is next day AND end time (including cleanup) is before 4am, the booking only appears on `event_date`, not `end_date`. Implemented in `lib/utils/availability.ts` → `isBookingActiveOnDate()`.

**Arena Pickup column:** Rendered in same style as regular chains. No overlap detection for this column.

### Schedule Board (`/schedule`)
Visual timeline per chain per day. Includes:
- Setup/cleanup visualization as dashed blocks
- Travel time via Google Maps Distance Matrix API (`/api/travel-estimates`)
- Travel estimate tool with address input, Swap Direction button, start/end address display
- Overlap detection (excludes Arena Pickup chain)
- Event click popup showing equipment, customer, address

**Home base for travel:** 4811 Benson Ave, Arbutus, MD 21227  
**Travel routing:** first event from home base, between events address-to-address, last event back to home base. Falls back to 30min if no API key. Caches results in-memory.

### 4-Week Audit (`/audit`)
28-day calendar grid (extended from original 14-day). Shows chain booking counts, overlap/overbooked/unassigned flags. Overlap detection excludes Arena Pickup chain. Date numbers displayed with black background / white text in top-left corner of each cell.

### Chain Loading (`/chains`)
Per-chain packing list for a selected date. Features:
- Sub-item expansion with editable quantity overrides (saved to `chain_loading_overrides`)
- Per-item and chain-level notes with Save buttons (saved to `chain_loading_notes`)
- "Additional Details" textarea above Events section
- Print view via token-authenticated server URL `/api/packing-list/[token]/[chain]/[date]`
- Print view shows equipment table with per-event columns, notes, signature line
- HMAC token: `PACKING_LIST_HMAC_SECRET ?? PACKING_LIST_SECRET`

### Chain Wizard (`/wizard`)
Sales tool for finding optimal available time slots.

**Inputs:** Game (Primary/Specialty equipment only), Quantity, Zip Code, Event Length (optional), Preferred Start Time (optional)

**Output:** Monthly calendar showing starred ⭐ recommended slots (score ≥ 2) as individual chips; other available times shown as ranges (not individual 30-min slots). Day click → per-chain popup with starred slots at top, divider, then available ranges. Arena Pickup chain excluded.

**Scoring (0–3):**
- A: Preferred start time match (if provided; non-match = 0 stars regardless of other score)
- B: Tight scheduling (back-to-back within 30 min of existing event)
- C: Same equipment already on chain that day

**Slot window:** `S - setupMin - 30min travel` to `S + duration + cleanupMin + 30min travel`. Setup/cleanup from `equipment.custom_setup_min/custom_cleanup_min`, fallback 45 min.

### Equipment (`/equipment`)
Equipment list with OOS tracking, flagging, category filters, sub-item tree view (collapsed by default). Sub-menu: Equipment Flags.

**Equipment Flags (`/equipment/reports`):** Dashboard of all damage/missing reports. "Open Form" button → public `/report` page.

### Public Report Form (`/report`)
No-auth QR-accessible form. Loads equipment list via service role (bypasses RLS). On submit: creates `equipment_reports` row, increments `issue_flag` on equipment, inserts `issue_flag_items`.

Public URL: `https://inventory-tracker-drab-xi.vercel.app/report`

### Bookings (`/bookings`)
Full booking list with search and filters.

### Pricing Calculator (`/pricing`)
Minimum event price calculator. Features: Lead Coordinator + Coordinator staff types with separate hourly rates, multi-vehicle (personal/company with individual mileage/fuel calculations), configurable rates and targets.

**Formula:** `minPrice = (totalWages + mileageReimbursement) / staffCostTarget%`  
Fuel cost for company vehicles is excluded from the staff cost target calculation.

---

## 7. ZENBOOKER INTEGRATION

### Webhook Pipeline
**URL format:** `https://inventory-tracker-drab-xi.vercel.app/api/webhooks/zenbooker?secret=[ZENBOOKER_WEBHOOK_SECRET]`  
**Secret verification:** URL query param (Zenbooker does not support header-based secrets)  
**API version:** v3 (2025-09-01)

**Subscribed events:** `job.created`, `job.rescheduled`, `job.canceled`, `job.assigned`, `job.completed`, `job.started`, `service_order.edited`, `recurring_booking.created`, `recurring_booking.canceled`

### Webhook Payload Key Fields (v3)
```
data.id                          → zenbooker_job_id
data.customer.name               → customer_name
data.start_date                  → event_date (parse in data.timezone)
data.end_date                    → end_date
data.time_slot.start_time        → start_time
data.time_slot.end_time          → end_time (null → calc from start + estimated_duration_seconds)
data.service_address.formatted   → address
data.timezone                    → "America/New_York" etc.
data.assigned_providers[0].id    → matched against chain_mappings.zenbooker_staff_id
data.services[].service_id       → matched against service_mappings
data.service_fields[].selected_options[].id  → modifier_id match (v3)
data.pricing_summary[]           → fallback for v1/bulk import
data.canceled                    → boolean
data.job_number
data.job_notes[].text
```

### Bulk Import
Route: `/api/import/zenbooker`  
Uses Zenbooker REST API v1 with cursor-based pagination. Re-fetches all jobs and reprocesses. Run after mapping fixes to correct historical bookings. Accessible from Settings page (admin only).

**410 bookings imported** as of Session 2; ongoing as new bookings are added.

### Service Mapping Resolution (4-tier in webhookProcessor.ts)

1. **Modifier ID match** — `option.id` → `zenbooker_modifier_id` exact lookup in service_mappings
2. **Name-match fallback** — `normalizeForMatch(option.text)` substring-matched against `zenbooker_modifier_name`. BBCode tags (`[b]`, `[/b]`) stripped before matching.
3. **Base mapping** — service_id + modifier_id IS NULL (for services without modifiers, e.g. Foam Party base)
4. **Silently skip** — unmatched options produce no equipment (not flagged as errors)

**Key guards:**
- `use_customer_qty=true`: use payload qty (e.g. customer chose 16 bubble balls)
- `use_customer_qty=false`: use `default_qty` (e.g. "Laser Tag (10 blasters)" always = 10 regardless of payload qty=1)
- `is_skip=true`: meta options (booking method, duration, group size) silently consumed
- **Pre-pass guard:** base mappings don't fire for items already covered by modifier match (prevents double-count e.g. "Book Online Today" + "20x Bubble Balls" → only 20, not 21)
- **Deduplication:** `deduplicateItems()` before insert; unique index on service_mappings prevents duplicate rows
- **Duplicate modifier rows:** `seen = new Set<string>()` per option prevents same item_id being pushed twice

### v1 Import Parser (parseV1Job in import route)
Used for bulk import (pricing_summary only, no service_fields).
- Bubble Ball qty: parsed from descriptions like "16x Bubble Balls" or old format "10 Bubbles"
- Elite Laser Tag: detected by `tl.includes('elite laser tag') || tl.includes('advanced laser tag')`
- Youth Laser Tag: detected → laser_tag_lite
- GameTruck Laser Tag: service name contains "gametruck" → laser_tag_lite, default qty 20

### Event Type Rules
| Type | Condition |
|---|---|
| coordinated | Default for all staff-led events |
| dropoff | Lawn Games/Foam Drop-Off with "Standard Delivery" or "Priority Delivery" modifier |
| pickup | Customer name = "Wonderfly Games Pickup" OR service name contains "Pickup" |
| arena_pickup | Modifier = "Customer Pickup (Save on delivery)" OR service name contains "Pick-up at Wonderfly Arena" / "Return to Wonderfly Arena" |
| willcall | Will Call chain bookings |

**Special customer name rules:**
- `"Wonderfly Games Pickup"` → event_type=pickup, no equipment
- `"Wonderfly Arena Return"` → event_type=arena_pickup, no equipment
- `"Wonderfly - Timonium"` / `"Wonderfly - Arbutus"` → normal coordinated (internal arena block)
- `"Wonderfly Promo Event"` → coordinated with promo_supplies equipment

### Admin Skip Patterns (silently ignored in import)
Booking adj, Large Van Unavailable, Late Night Surcharge, Setup fee, Generator (standalone service), Set Up/Break Down, foam solution variants, Pick-up travel fee, Refund of, in credit, Additional X minutes, Staff to run, Event Staffing, Event Details, BRING (prefix), ABA Autism Event, Holiday surcharge, Full Game Setup, Table plus table cover, Detailed late night pick-up

### Known Service IDs
| Service | ID |
|---|---|
| Bubble Ball | 1747439051481x330563883501879300 |
| Elite Laser Tag ("Laser Tag") | 1747883952074x309158420488483400 |
| Arrow Tag | 1749600355935x288401408375236200 |
| Obstacle Course | 1749611522093x499322152628127740 |
| Lawn Games | 1751332967401x820543194421858200 |
| Foam Party - Staff Coordinated | 1747519305540x667111821234667500 |
| Party Pack Bundle | 1771765253169x998239150834291000 |
| 2-Game Party Bundle | 1771172713172x484717009863034240 |
| 3-Game Party Bundle | 1771390362580x452699813533756540 |
| Backyard Classic | 1771193436147x922879636265914600 |
| Gaga Ball Pit | 1779135222412x556660967984274000 |
| Gel Blaster | 1779144002752x492273329001131600 |

**Bundle quantity change (Migration 030):** 2-Game, 3-Game, and Backyard Classic changed from fixed qty (10) to customer-selected qty (min 10) for Laser Tag, Bubble Ball, Arrow Tag. `use_customer_qty` flipped to true for these rows.

---

## 8. PACKING LIST LOGIC

### Coordinated vs Drop-off
- **Coordinated events:** MAX quantities across bookings on same chain (equipment reused event-to-event)
- **Drop-off events:** SUM quantities (equipment left at location, accumulates on truck)

### Sub-Item Tiered Multipliers
```typescript
// Tier 1 — Bubble Ball, Elite Laser Tag, Arrow Tag
// Multiplier = max(1, floor(qty / 10))
// 1–19 units → ×1 set, 20–29 → ×2, 30–39 → ×3

// Tier 2 — Gel Tag, Laser Tag Lite
// Multiplier = max(1, floor(qty / 20))
// 1–39 units → ×1 set, 40–59 → ×2

// Tier 3 — All other equipment
// Multiplier = qty booked
```

---

## 9. DROP-OFF / PICKUP LINKING SYSTEM

When a pickup booking (customer = "Wonderfly Games Pickup") is imported:
1. Extract customer name from service name (everything before "Pickup"/"Pick-up")
2. Find most recent active drop-off booking at same address for that customer
3. Set `linked_booking_id` bidirectionally on both bookings
4. If already linked → flag new pickup as needs_review

**Equipment availability spanning:** Drop-off equipment counted as booked from drop-off `start_time` through linked pickup's `end_time` (precise datetime, not full-day blocking).

**Naming convention (required in Zenbooker):**
- ✓ "Melissa Brill Lawn Game Pickup"
- ✓ "Obi Ndukwe Lawn Games Pick-Up"

---

## 10. MIGRATIONS APPLIED (001–032)

| Migration | Description |
|---|---|
| 001 | Initial schema (bookings, equipment, chains, service_mappings, webhook_logs) |
| 002 | Grant permissions |
| 003 | Nullable booking times |
| 004 | Nullable booking date |
| 005 | Add arena_pickup event type |
| 006 | service_mappings allow multi-item per modifier |
| 007 | Add missing service mappings |
| 008 | service_mappings is_skip column |
| 009 | Party Pack Bundle mappings |
| 010 | equipment_sub_item_links junction table |
| 011 | equipment categories column |
| 012 | v1 service ID base mappings (Bubble Ball, Elite Laser Tag) |
| 013 | laser_tag_lite, gaga_pit, promo_supplies equipment + mappings |
| 014 | linked_booking_id on bookings |
| 015 | water_tag, water_guns, arena laser tag mappings |
| 016 | generator, bluetooth_speaker equipment + mappings |
| 017 | Mixed service name mappings (hoverball, jenga, connect_4, etc.) |
| 018 | GameTruck laser tag → laser_tag_lite mapping |
| 019 | Big Bash Bundle Package mapping (is_skip base) |
| 020 | users.theme column for dark mode |
| 021 | equipment_oos table |
| 022 | equipment_oos sub-item support |
| 023 | Service mappings dedup (data fix) |
| 024–025 | Chain loading support |
| 026 | chain_loading_overrides + chain_loading_notes tables; chain_loading_notes_item_type_check constraint includes 'chain' |
| 027 | equipment_reports table (public insert RLS) |
| 028 | Generator add-on mappings for all services, bundle fix, unique index |
| 029 | Comprehensive bundle audit (17 rows, base mapping pre-pass guard) |
| 030 | New services: Youth Laser Tag, Gaga Ball Pit, Gel Blaster; bundle qty_selector flip |
| 031 | Add Chain #7 |
| 032 | Arena Pickup chain provider mapping (1780411998988x788923203686760400); Chain #8 deactivated |

---

## 11. KEY BUSINESS RULES & TECHNICAL DECISIONS

- **Overnight cutoff:** Events ending before 4am on the following day only count against availability on `event_date`
- **Arena Pickup:** No overlap warnings on Schedule or 4-Week Audit; renders in gray "Arena Pickups" column on Schedule
- **Full Obstacle Course = 2 items:** Maps to both `warped_wall` (qty 1) AND `obstacles_only` (qty 1)
- **Coordinated wins:** If ANY service on a booking is coordinated, entire booking is coordinated
- **Webhook over middleware:** Direct Zenbooker → Vercel API → Supabase (no Zapier/Make)
- **Secret via URL param:** Zenbooker doesn't support header-based webhook secrets
- **Service mappings in DB:** Configurable by admins, not hardcoded (~200+ rows)
- **ThemeProvider:** Dark mode via `dark` class on `<html>` element; per-user DB persistence (`users.theme`)
- **Google Fonts:** DM Sans + JetBrains Mono loaded as `<link>` tags in `app/layout.tsx` (Pricing Calculator uses literal font family names in inline styles, incompatible with next/font hashing)
- **Pricing Calculator styling:** All inline styles (dark theme #0d0e12), NOT Tailwind — preserve as-is

---

## 12. ENVIRONMENT VARIABLES (Vercel)

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Service role key (bypasses RLS) |
| ZENBOOKER_WEBHOOK_SECRET | Shared secret for webhook URL query param |
| ZENBOOKER_API_KEY | API key for Zenbooker REST API (bulk import) |
| GOOGLE_MAPS_API_KEY | Distance Matrix API for travel time estimates |
| PACKING_LIST_HMAC_SECRET | Token signing for print packing list URLs |
| NEXT_PUBLIC_SITE_URL | Site URL for auth redirects |

---

## 13. INFRASTRUCTURE & FUTURE PLANS

- **Supabase project:** vznunpigjpfszntnexvd (Inventory Tracker / Games Zenbooker data)
- **Other Supabase projects:** ijwawlysvcayqkrdcxfp (GM Dashboard / Arena Tripleseat), gchydwesoubmjctwswkq (Marketing Agents)
- **Domain plan:** Migrating to `games.wonderflyhq.com`; shared auth cookie domain `.wonderflyhq.com` for SSO across Wonderfly apps
- **App switcher:** Waffle menu component planned across all Wonderfly apps (ops.wonderflyhq.com GM dashboard, future marketing agents app)
- **Test suite:** 146 Jest tests, all passing. `npm test`
- **TypeScript:** `npx tsc --noEmit` must be clean before every commit
- **MCP:** Supabase MCP connected to Claude Code for direct DB querying in sessions

---

## 14. SIDEBAR NAVIGATION ORDER (as of v1.1)

1. Availability
2. Schedule
3. Chain Wizard
4. 4-Week Audit
5. Chain Loading
6. Equipment (sub: Equipment Flags)
7. Bookings
8. Pricing Calculator
9. Settings (admin only)

---

## DOCUMENT HISTORY

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-06-09 | First KB entry — Session 3 content only |
| 1.1 | 2026-06-09 | Comprehensive update incorporating Sessions 1, 2, and 3 full history |
