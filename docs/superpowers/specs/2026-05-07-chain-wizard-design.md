# Chain Wizard — Design Spec

**Date:** 2026-05-07
**Status:** Approved scope, pending plan
**Owner:** Jon

## 1. Overview

The Chain Wizard is a sales-team tool for finding the best available time slots and chains for a new event booking. The user picks a game, quantity, zip code, optional event length, and optional preferred start time. The page renders a month calendar where each day shows up to three suggested slot chips (with star markers for "recommended" slots); clicking a day opens a per-chain breakdown.

Slot scoring and conflict detection happen server-side; the client only renders.

## 2. Routing, Navigation, Auth

- Route: `/wizard`, under the `(dashboard)` group → `app/(dashboard)/wizard/page.tsx`.
- Auth: standard dashboard auth (login required). API route uses `getSessionAndRole(['admin', 'sales'])` to mirror existing routes like `app/api/bookings/route.ts`.
- Sidebar: append a new entry to `NAV_ITEMS` in `components/layout/Sidebar.tsx` with label "Chain Wizard", href `/wizard`, icon `WandSparkles` from `lucide-react` (fall back to `Wand2` if the installed version doesn't export it; v0.577 should have both).

## 3. Data Model — actual columns

These are the real schema names from the codebase, used verbatim in queries:

- **`equipment`**: `id`, `name`, `total_qty`, `out_of_service` (counter, trigger-maintained), `is_active`, `categories` (text array), `custom_setup_min` (nullable int), `custom_cleanup_min` (nullable int).
- **`bookings`**: `id`, `customer_name`, `event_date`, `end_date` (nullable), `start_time`, `end_time`, `chain` (text FK to `chains.id` by name), `status`, `event_type`.
- **`booking_items`**: `booking_id`, `item_id`, `qty`, `is_sub_item`, `parent_item_id`.
- **`chains`**: `id`, `name`, `color`, `is_active`. (No territory field; see §6 travel.)
- **`equipment_oos`**: `id`, `equipment_id`, `quantity`, `created_at`, `expected_return_date` (nullable), `returned_at` (nullable).

### 3.1 Equipment dropdown filter

Show only items where `is_active = true` AND `categories && ARRAY['Primary','Specialty']` (Postgres array overlap operator). Lawn games and add-ons are excluded.

### 3.2 Setup / cleanup minutes

For the selected equipment item:
- `setupMin = equipment.custom_setup_min ?? 45`; if value is `0`, treat as `45`.
- `cleanupMin = equipment.custom_cleanup_min ?? 45`; if value is `0`, treat as `45`.

Default fallback is **45 minutes** (overriding the spec draft's 30-minute fallback).

### 3.3 Available inventory on a date

For a given date `D`:
```
activeOosCount(D) = sum(equipment_oos.quantity) where
    equipment_oos.equipment_id = item_id
    AND equipment_oos.created_at::date <= D
    AND (equipment_oos.returned_at IS NULL OR equipment_oos.returned_at::date > D)
    AND (equipment_oos.expected_return_date IS NULL OR equipment_oos.expected_return_date > D)

availableInventory(D) = equipment.total_qty - activeOosCount(D)
```

This per-date approach is more accurate than the static `out_of_service` counter for future months.

## 4. Input Form

Top panel of the page, with these fields:

| Field | Control | Notes |
|---|---|---|
| Game | Select | Filtered as in §3.1; shows equipment name only (no quantities). |
| Quantity | Number input | min 1, default 10 |
| Zip Code | Text input | Accepts 5 digits; basic regex validation (`/^\d{5}$/`). |
| Event Length | Select (optional) | 1, 1.5, 2, 2.5, 3, 3.5, 4 hours. |
| Preferred Start Time | Time select (optional) | 30-min increments, 07:00–23:00. |

A "Find Availability" button submits the form. The calendar below renders only after the first submit; before submit it shows an empty-state placeholder.

Use `@base-ui/react/select` (existing project pattern at `components/ui/select.tsx`).

## 5. Calendar View

- Month grid: 7 columns Sun–Sat, 5–6 rows depending on month.
- Header has month name and prev/next-month buttons.
- Past dates are grayed out and not clickable.
- While `/api/wizard/availability` is in flight, show a skeleton/loader covering the grid (per-day shimmer is fine).
- Each day cell:
  - If `availableInventory(D) <= 0` for the selected item: red "Unavailable" label, no chips, click does nothing.
  - Else: up to 3 slot chips, sorted by score desc then start time asc. Each chip shows `H:MM AM/PM – H:MM AM/PM` and a ⭐ if recommended (see §7).
  - If more than 3 slots exist: a "+ N more" affordance below the chips. Clicking the chip area or "+ N more" opens the day detail popup (§8).

## 6. Slot Generation Algorithm (server-side)

Constants:
```
SLOT_INCREMENT_MIN = 30
DAY_START = "08:00"
DAY_END   = "22:00"   // last possible start time
DEFAULT_DURATION_MIN = 90
TRAVEL_BUFFER_MIN = 30   // flat — no per-chain territory data
```

Per chain (active chains only), per day in the requested month, walk candidate start times from `DAY_START` to `DAY_END` in `SLOT_INCREMENT_MIN` steps. For each candidate `S`:

1. **Compute the candidate occupied window:**
   ```
   occStart = S - setupMin - TRAVEL_BUFFER_MIN
   occEnd   = S + duration + cleanupMin + TRAVEL_BUFFER_MIN
   ```
   Skip if `occStart < 00:00` or `occEnd > 24:00` for that day.

2. **Per-chain conflict check:** for each booking already on this chain on this day (status not canceled, including coordinated overnight + drop-off/pickup paired ranges per existing `isBookingActiveOnDate` semantics), compute that booking's occupied window the same way:
   ```
   bookingOccStart = booking.start_time - bookingItemSetup - TRAVEL_BUFFER_MIN
   bookingOccEnd   = booking.end_time   + bookingItemCleanup + TRAVEL_BUFFER_MIN
   ```
   Reject `S` if its occupied window overlaps any existing booking's occupied window on this chain.

   For booking-level setup/cleanup, use the **selected wizard item's** setupMin/cleanupMin as a uniform proxy across all bookings on the chain (we are not summing per-item setup across an existing booking's items). This keeps the calculation tractable; cross-item buffer accuracy is handled by the global 30-min travel buffer.

3. **Global inventory check:** compute the total quantity of `item_id` already booked across **all chains** during the candidate's occupied window `[occStart, occEnd]`:
   - **Same-day bookings** (event_date == end_date OR end_date is null): sum `booking_items.qty` where the booking's occupied window overlaps `[occStart, occEnd]`. The booking's occupied window is computed using its own start_time/end_time and the wizard item's setupMin/cleanupMin + 30-min travel as a uniform proxy.
   - **Multi-day bookings** (linked drop-off/pickup pairs, or coordinated overnight events spanning multiple dates): if the booking is active on `date` per `isBookingActiveOnDate`, treat it as occupying inventory for the entire day. Sum its `qty` unconditionally.

   Reject `S` if `bookedQty + requestedQty > availableInventory(date)`.

4. **Score the slot** per §7. A slot with score < 2 is still shown (no star); a slot is only excluded by step 2 or step 3.

5. **Emit** the slot with: `start`, `end`, `score`, `criteria` array (which of A/B/C met), `available_qty` (after subtracting `requestedQty`).

### Travel time

Flat 30-minute travel buffer applied symmetrically to every slot and every existing booking. No chain → lat/lng map. The zip code input is captured for record-keeping / future enhancement but does not affect math in v1.

## 7. Scoring

Three additive criteria, max score 3.

- **A — Start time match:** only evaluated if user provided `Preferred Start Time`. Slot's start `== preferredStart`. If the user provided a preferred start AND this slot doesn't match, the slot gets **0 stars regardless of B/C** (override of the score-based star rule).
- **B — Tight scheduling:** chain has at least one event that day, AND this slot's occupied window starts within 30 min after some existing event's occupied window end, OR ends within 30 min before some existing event's occupied window start.
- **C — Equipment match:** chain already has at least one booking that day with `booking_items.item_id == selected item_id`.

A slot is **starred (recommended)** iff:
- score ≥ 2, AND
- if user provided a preferred start, criterion A passed.

(Event length is not a star gate — every generated slot already uses the user-selected duration, so there is nothing to override.)

## 8. Day Detail Popup

A modal (existing `Dialog` pattern from `components/modals/`). Opens on day-cell click.

- **Header:** weekday + date (e.g., "Wednesday, May 14") and a summary line: `X chains available · Y recommended slots`.
- **Body:** one section per chain that has at least one available slot, sorted by chain's best-slot score desc.
  - Section header: chain name with its color badge.
  - Existing events on that chain that day: small list — `H:MM AM/PM – H:MM AM/PM · customer name`.
  - Slot list: for each slot, show:
    - Time range
    - ⭐ if recommended
    - Criteria breakdown in muted text: `✓ Same equipment · ✓ Back-to-back` (only show ✓ for criteria that passed; omit if none).
    - `N available` count for that window.
- Past dates: popup does not open.

## 9. API Contract

`GET /api/wizard/availability`

**Query params:**
- `item_id` — string (equipment.id)
- `quantity` — int ≥ 1
- `zip_code` — string, 5-digit
- `year` — int
- `month` — int 1–12
- `duration_minutes` — int, default 90 (1h–4h in 30-min steps)
- `preferred_start` — optional `HH:MM` (24-hr)

**Auth:** `getSessionAndRole(['admin', 'sales'])`.

**Response (200):**
```ts
type WizardAvailabilityResponse = {
  item: { id: string; name: string; setup_min: number; cleanup_min: number; total_qty: number };
  month: { year: number; month: number };
  days: WizardDay[];
};

type WizardDay = {
  date: string;          // YYYY-MM-DD
  available_inventory: number;  // after OOS subtraction; if <= 0 day is "unavailable"
  chains: WizardChainDay[];
};

type WizardChainDay = {
  chain_id: string;
  chain_name: string;
  chain_color: string;
  existing_events: { start: string; end: string; customer_name: string }[]; // HH:MM
  slots: WizardSlot[]; // sorted by score desc, start asc; only feasible slots
};

type WizardSlot = {
  start: string;          // HH:MM
  end: string;            // HH:MM
  score: 0|1|2|3;
  criteria: { a: boolean; b: boolean; c: boolean };
  starred: boolean;
  available_qty: number;  // remaining after this booking
};
```

**Error shape:** `{ error: string }` with status 400 / 401 / 403 / 500, matching existing routes.

The route runs all per-day computation in a single Supabase fetch pass (one bookings + booking_items query for the month, one chains query, one OOS query). No per-day round-trips.

## 10. Client Data Fetching

- Single TanStack Query hook `useWizardAvailability(params)` keyed by all input fields + year/month, with `enabled` flag flipped after the user clicks "Find Availability".
- On month nav, the query refetches with the new `year`/`month` (input fields stay sticky).
- Use the existing patterns in `lib/queries/bookings.ts` for shape and naming. Place in `lib/queries/wizard.ts`.

## 11. Edge Cases

- **No event length:** server defaults `duration_minutes` to 90.
- **No preferred start:** Criterion A is skipped entirely; star eligibility falls back to score ≥ 2.
- **Equipment OOS:** subtracted via `equipment_oos` per §3.3.
- **Past dates:** grayed out, not clickable, no popup.
- **Loading state:** month grid renders skeleton while query is in flight.
- **Empty chains:** if a chain has zero feasible slots on a day, it is omitted from that day's popup but the day still shows other chains' slots.
- **Day is unavailable (inventory ≤ 0):** the day cell shows the red label; `chains: []` returned by API.

## 12. File Structure

```
app/(dashboard)/wizard/
  page.tsx              # server component, auth gate, mounts WizardClient
  WizardClient.tsx      # client form + calendar + popup state
app/api/wizard/
  availability/
    route.ts            # GET handler, scoring logic
lib/queries/
  wizard.ts             # useWizardAvailability hook
lib/utils/
  wizardSlots.ts        # pure slot-generation + scoring logic, unit-testable
```

`wizardSlots.ts` is pure (no Supabase dependency) so it can be unit-tested with synthetic bookings/chains/equipment. The route fetches data, calls `wizardSlots.ts`, and returns the response.

## 13. Verification Requirements

- `pnpm tsc --noEmit` (or project's equivalent) must pass before commit.
- Unit tests for `wizardSlots.ts` covering: no-events day, full-day-blocked, criterion A skip, criterion A override of star, criterion B back-to-back, criterion C same-equipment, global inventory cap, OOS-day-zero handling.
- Manual smoke test: select a known busy chain/day, verify chips appear and popup opens.

## 14. Out of Scope

- Booking creation directly from the wizard (it's a research tool — user copies the slot into the existing booking form).
- Per-chain travel-time variance (flat 30-min for v1).
- Persistent saved searches.
- Mobile layout beyond what flexbox/grid gives us by default.
