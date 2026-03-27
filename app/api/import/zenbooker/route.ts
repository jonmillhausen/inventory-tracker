import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSessionAndRole } from '@/lib/api/auth'
import {
  resolveWebhookItems,
  deduplicateItems,
  resolveEventType,
  extractEventDate,
  calcEndTime,
} from '@/lib/utils/webhookProcessor'
import type { ZenbookerService } from '@/lib/utils/webhookProcessor'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// ── Zenbooker v1 API types ────────────────────────────────────────────────

interface V1Option {
  id?: string
  text?: string    // v3 name
  name?: string    // v1 name (alias)
  quantity?: number
  price?: number
}

interface V1ServiceField {
  selected_options?: V1Option[]
}

interface V1PricingSummaryItem {
  type?: string       // 'service_option' | 'custom_price' | 'base_price' | etc.
  amount?: number
  description?: string
}

interface V1Service {
  service_id?: string
  service_name?: string
  name?: string              // fallback if service_name absent
  service_fields?: V1ServiceField[]        // v1
  service_selections?: Array<{ selected_options?: V1Option[] }> // v3 fallback
  pricing_summary?: V1PricingSummaryItem[] // v1: option summary when service_fields is absent
}

interface V1Job {
  id: string
  job_number?: string
  canceled?: boolean
  status?: string
  customer?: { name?: string; first_name?: string; last_name?: string }
  service_address?: { formatted?: string } | string
  start_date?: string
  job_date?: string
  timezone?: string
  estimated_duration_seconds?: number
  time_slot?: {
    name?: string
    start_time?: string | null
    end_time?: string | null
  }
  // v1 uses different field names for staff/provider assignment
  assigned_providers?: Array<{ id: string; name: string }>
  assigned_provider?: { id?: string; name?: string }
  providers?: Array<{ id?: string; name?: string }>
  services?: V1Service[]
  job_notes?: Array<{ text?: string; note?: string }>
}

interface V1Response {
  results: V1Job[]
  has_more: boolean
  next_cursor: string | null
}

// ── Service classification constants ──────────────────────────────────────

// v1 service_ids (different from v3)
const LASER_TAG_V1_SERVICE_ID    = '1747883952074x309158420488483400'
const LAWN_GAMES_V1_SERVICE_ID   = '1751332967401x820543194421858200'
const OBSTACLE_COURSE_V1_SERVICE_ID = '1749611522093x499322152628127740'

// Internal admin/logistics service names — exact matches (lowercase).
// Individual services with these names are silently filtered out.
// If ALL non-admin services are filtered, no booking is created (isAdminOnly).
// NOTE: 'generator, set up/break down' is intentionally absent — any service
// containing 'generator' is routed to equipment mapping (step 0 in loop) first.
const ADMIN_SERVICE_NAMES_EXACT = new Set([
  'booking adj',
  'large van unavailable',
  'late night surcharge',
  'detailed late night pick-up',
  'setup fee',
  'set up/break down',
  'event staffing',
  'event details',
  'staffing',
  'on site staff for 4 hours',
  'staff oversight for lawn games',
  'staff to run lawn games',
  'staff to run',
])

/**
 * Returns true for service names that are internal annotations, fees,
 * consumables, or logistics notes — no booking or equipment should be created.
 * NOTE: generator-containing names are checked BEFORE this function is called
 * so they are never dropped here.
 */
function isAdminServiceName(name: string): boolean {
  const nl = name.trim().toLowerCase()
  if (ADMIN_SERVICE_NAMES_EXACT.has(nl)) return true
  // "Additional N minutes rental time charge" and similar duration-extension fees
  if (/additional\s+\d+\s+minutes/i.test(nl)) return true
  // "Pick-up [time]" — logistics time-window entries, e.g. "Pick-up 7 pm to 9pm same day"
  // Does NOT match "Standard Pick-up" (starts with "Standard") or "Pick-up at Wonderfly Arena"
  if (/^pick-?up\s+\d/i.test(nl)) return true
  // "BRING …" — internal staff delivery/prep notes
  if (nl.startsWith('bring ')) return true
  // Foam bottles / foam solution — consumable, not tracked equipment
  if (nl.includes('foam solution')) return true
  // Pickup travel/convenience fees
  if (nl.includes('pick-up travel fee') || nl.includes('pick-up fee')) return true
  // Refunds
  if (nl.includes('refund of') || nl.includes('refund issued by stripe')) return true
  // Holiday surcharges
  if (nl.includes('holiday surcharge')) return true
  // Booking adjustments (catches "Booking adjustment" in addition to exact "booking adj")
  if (nl.includes('booking adjustment')) return true
  // Time-window pickup logistics (e.g. "6 pm Pick-up window")
  if (nl.includes('pick-up window')) return true
  // "Set Up/Break Down" as a substring (catches "Generator, Set Up/Break Down"
  // only if generator check above didn't fire — practically never, but safe)
  if (nl.includes('set up/break down')) return true
  // ABA Autism Event — one-off promo entry incorrectly assigned to staff
  if (nl.includes('aba autism event')) return true
  // Specific one-off skips confirmed by owner
  if (nl.includes('5 laser tag sets for 2 hours')) return true
  if (nl.includes('tifiny mcdonald')) return true
  return false
}

// Promo event service name substrings — any match routes to synthetic 'v1:promo_event'
// which maps to the promo_supplies equipment item in service_mappings.
const PROMO_SERVICE_PATTERNS = [
  'promo event',
  'promo booth',
  'tailgoat',              // catches 'TailGOAT', 'Jimmy\'s Seafood TailGOAT', etc.
  'polar plunge promo',
  'promo tent',
  'promo supplies',
  'promo materials',
  'tent + promo',
  '2 hour staff supervised event',
]

// Pickup-type service name substrings — entire job imports as event_type='pickup',
// no equipment, status='confirmed'.
const PICKUP_SERVICE_PATTERNS = [
  'lawn game pickup',
  'lawn game pick-up',
  'lawn games pick-up',
  'lawn game return',
  'standard pick-up',
]

// Arena-pickup service name substrings — imports as event_type='arena_pickup'.
const ARENA_PICKUP_SERVICE_PATTERNS = [
  'pick-up at wonderfly arena',
  'return to wonderfly arena',
]

// ── Time helpers ──────────────────────────────────────────────────────────

/**
 * Parse a 12-hour time string like "9:00 AM" into "09:00" (24-hour).
 * Returns null if unparseable.
 */
function parseTime12(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

/**
 * Parse a time_slot.name like "9:00 AM" or "9:00 AM - 11:00 AM"
 * into 24-hour start/end strings.
 */
function parseTimeSlotName(name: string): { start: string | null; end: string | null } {
  const parts = name.split(/\s*[-–]\s*/)
  return {
    start: parts[0] ? parseTime12(parts[0]) : null,
    end:   parts[1] ? parseTime12(parts[1]) : null,
  }
}

// ── v1 Job parser ─────────────────────────────────────────────────────────

interface ParsedJob {
  jobId: string
  jobNumber: string
  customerName: string
  address: string
  eventDate: string | null
  startTime: string | null
  endTime: string | null
  services: ZenbookerService[]
  assignedStaff: Array<{ staff_id: string; staff_name: string }>
  notes: string
  /** True when all services were admin-only entries and no booking should be created. */
  isAdminOnly: boolean
  /** True when a service name identifies this as a Wonderfly staff lawn-game/standard pickup. */
  isPickupJob: boolean
  /** True when a service name identifies this as a return to Wonderfly Arena. */
  isArenaPickupJob: boolean
}

function parseV1Job(job: V1Job): ParsedJob {
  // Customer name — try composite name first, then joined first+last
  const customerName =
    job.customer?.name ??
    [job.customer?.first_name, job.customer?.last_name].filter(Boolean).join(' ') ??
    ''

  // Address — may be an object or a plain string
  const address =
    typeof job.service_address === 'string'
      ? job.service_address
      : (job.service_address as { formatted?: string } | undefined)?.formatted ?? ''

  // Date — prefer start_date (ISO datetime), fall back to job_date
  const eventDate = extractEventDate(job.start_date ?? job.job_date, job.timezone)

  // Time — prefer explicit time_slot.start_time/end_time, fall back to parsing time_slot.name
  let startTime: string | null = job.time_slot?.start_time ?? null
  let endTime: string | null = job.time_slot?.end_time ?? null

  if ((!startTime || !endTime) && job.time_slot?.name) {
    const parsed = parseTimeSlotName(job.time_slot.name)
    if (!startTime) startTime = parsed.start
    if (!endTime)   endTime   = parsed.end
  }

  // Calculate end time from duration if still missing
  if (!endTime && startTime && job.estimated_duration_seconds) {
    endTime = calcEndTime(startTime, job.estimated_duration_seconds)
  }

  // ── Service normalization ──────────────────────────────────────────────
  // Priority order for each service:
  //   0.  Generator        → MUST come first (before admin skip) so that
  //                          "Generator, Set Up/Break Down" maps equipment
  //   0b. Bluetooth Speaker → same rationale
  //   1.  Admin/logistics  → skip silently (no booking item, no fallback)
  //   2.  Pickup by name   → set isPickupJob / isArenaPickupJob flag, skip
  //   3.  Promo events     → synthetic 'v1:promo_event' service_id
  //   4.  Gaga Pit         → synthetic 'v1:gaga_pit' service_id
  //   5.  Laser Tag v1     → synthetic modifier options for Elite / Lite variant
  //   5b. LT + Dart combo  → synthetic 'v1:lt_and_dart'
  //   5c. Jenga + C4 combo → synthetic 'v1:multi_lawn_game'
  //   5d. Bubble Balls     → synthetic 'v1:bubble_ball_bulk' with extracted qty
  //   5e. Hoverball        → synthetic 'v1:hoverball'
  //   5f. Velcro Dart      → synthetic 'v1:dart_board_internal'
  //   5g. Laser Tag (internal arena) → synthetic 'v1:laser_tag_internal'
  //   6.  Water Tag        → synthetic 'v1:water_tag' with extracted qty
  //   7.  Water Guns       → synthetic 'v1:water_guns' with extracted qty
  //   8.  Arena LT Rental  → synthetic 'v1:arena_laser_tag' with extracted qty
  //   9.  Lawn Games v1    → skip if no priced options
  //  10.  Generic path     → service_fields options + pricing_summary fallback

  let hadServices = false   // at least one non-admin service existed in the payload
  let isPickupJob      = false
  let isArenaPickupJob = false
  const services: ZenbookerService[] = []

  for (const svc of job.services ?? []) {
    const svcName = svc.service_name ?? svc.name ?? ''
    const nameLower = svcName.toLowerCase()

    // 0. Generator — checked before admin skip so "Generator, Set Up/Break Down"
    //    maps equipment rather than being dropped by the set up/break down pattern.
    if (nameLower.includes('generator')) {
      hadServices = true
      services.push({
        service_id:         'v1:generator',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 0b. Bluetooth Speaker (e.g. "BlueTooth Speaker", "Bluetooth speaker rental")
    if (nameLower.includes('speaker') || nameLower.includes('bluetooth')) {
      hadServices = true
      services.push({
        service_id:         'v1:bluetooth_speaker',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 1. Admin/logistics — filter silently
    if (isAdminServiceName(svcName)) continue

    hadServices = true

    // 2a. Pickup-type service names → mark job as pickup (no equipment)
    if (PICKUP_SERVICE_PATTERNS.some(p => nameLower.includes(p))) {
      isPickupJob = true
      continue
    }
    // 2b. Arena-pickup service names → mark job as arena_pickup
    if (ARENA_PICKUP_SERVICE_PATTERNS.some(p => nameLower.includes(p))) {
      isArenaPickupJob = true
      continue
    }

    // 3. Promo events → synthetic service_id
    if (PROMO_SERVICE_PATTERNS.some(p => nameLower.includes(p))) {
      services.push({
        service_id:         'v1:promo_event',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 4. Gaga Pit → synthetic service_id
    // TODO: replace 'v1:gaga_pit' with the actual service_id once confirmed via:
    //   SELECT raw_payload->'services' FROM webhook_logs
    //   WHERE action = 'job.import' AND result_detail LIKE '%unmapped: Gaga%' LIMIT 1;
    if (nameLower.includes('gaga')) {
      services.push({
        service_id:         'v1:gaga_pit',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 5. Laser Tag v1 — emit synthetic modifier options for Elite vs Lite
    //    The v1 API surfaces the tagger variant and customer quantity only in
    //    pricing_summary (e.g. "12x Elite Laser Tag" or "12x Laser Tag Lite (ages 5+)").
    if (svc.service_id === LASER_TAG_V1_SERVICE_ID) {
      const syntheticOptions: Array<{ id: string; text: string; quantity: number }> = []
      for (const ps of svc.pricing_summary ?? []) {
        if (ps.type !== 'service_option' || !ps.description || (ps.amount ?? 0) <= 0) continue
        const desc = ps.description
        const qtyMatch = desc.match(/^(\d+)[x×]\s*(.+)$/i)
        const qty  = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
        const text = qtyMatch ? qtyMatch[2].trim() : desc
        const tl   = text.toLowerCase()

        if (tl.includes('elite laser tag')) {
          syntheticOptions.push({ id: 'v1_lt_elite', text, quantity: qty })
        } else if (tl.includes('laser tag lite')) {
          syntheticOptions.push({ id: 'v1_lt_lite',  text, quantity: qty })
        }
      }
      if (syntheticOptions.length > 0) {
        services.push({
          service_id:         svc.service_id,
          service_name:       svcName,
          service_selections: [{ selected_options: syntheticOptions }],
        })
      }
      continue
    }

    // 5b. Laser Tag + Dart Board combined (must come before 5f and 5g)
    //     e.g. "Laser Tag and Giant Velcro Dart Board for Lindsay Frankel"
    if (nameLower.includes('laser tag') &&
        (nameLower.includes('dart board') || nameLower.includes('dartboard'))) {
      services.push({
        service_id:         'v1:lt_and_dart',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 5c. Giant Jenga + Connect 4 combined
    //     e.g. "Giant Jenga, Giant Connect 4, Table plus table cover"
    if (nameLower.includes('giant jenga') &&
        (nameLower.includes('giant connect 4') || nameLower.includes('connect 4'))) {
      services.push({
        service_id:         'v1:multi_lawn_game',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 5d. Bubble Balls with qty in service name
    //     e.g. "8 BubbleBalls for 2 hours, Additional staff set up time (15 minutes)"
    if (nameLower.includes('bubbleball') || nameLower.includes('bubble ball')) {
      const qtyMatch = svcName.match(/^(\d+)\s+bubb/i)
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
      services.push({
        service_id:         'v1:bubble_ball_bulk',
        service_name:       svcName,
        service_selections: [{ selected_options: [{ id: 'v1_bubble_bulk', text: svcName, quantity: qty }] }],
      })
      continue
    }

    // 5e. Hoverball Archery Range
    if (nameLower.includes('hoverball')) {
      services.push({
        service_id:         'v1:hoverball',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 5f. Velcro Dart / Dart Board (standalone internal booking)
    //     e.g. "Giant Velcro Dartboard in use at Arbutus"
    //     Combined LT+dart is caught by 5b above.
    if (nameLower.includes('velcro dart') || nameLower.includes('dart board')) {
      services.push({
        service_id:         'v1:dart_board_internal',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 5g. Laser Tag person-named internal arena bookings
    //     e.g. "Laser Tag for Andrea Hawkins", "Laser Tag - Leslie Ogu"
    //     Does NOT match: standard Laser Tag (caught by step 5 via service_id),
    //     Arena Laser Tag Rental (excluded by 'laser tag rental' check),
    //     combined LT+dart (caught by 5b), "5 Laser Tag sets" (skipped in step 1).
    if (nameLower.includes('laser tag') && !nameLower.includes('laser tag rental')) {
      services.push({
        service_id:         'v1:laser_tag_internal',
        service_name:       svcName,
        service_selections: [],
      })
      continue
    }

    // 6. Water Tag (e.g. "20 Water Tag sets", "10 Water Tag sets")
    //    Quantity extracted from service name numeric prefix.
    if (nameLower.includes('water tag')) {
      const qtyMatch = svcName.match(/^(\d+)\s+water\s+tag/i)
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
      services.push({
        service_id:         'v1:water_tag',
        service_name:       svcName,
        service_selections: [{ selected_options: [{ id: 'v1_water_tag', text: svcName, quantity: qty }] }],
      })
      continue
    }

    // 7. Water Guns (e.g. "10 Water Guns", "20 Water Guns")
    //    Quantity extracted from service name numeric prefix.
    if (nameLower.includes('water gun')) {
      const qtyMatch = svcName.match(/^(\d+)\s+water\s+gun/i)
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
      services.push({
        service_id:         'v1:water_guns',
        service_name:       svcName,
        service_selections: [{ selected_options: [{ id: 'v1_water_guns', text: svcName, quantity: qty }] }],
      })
      continue
    }

    // 8. Arena Laser Tag Rental (e.g. "Arena Laser Tag Rental - 10 sets")
    //    Quantity extracted from "- N sets" suffix.
    if (nameLower.includes('arena laser tag rental')) {
      const qtyMatch = svcName.match(/[-–]\s*(\d+)\s+set/i)
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
      services.push({
        service_id:         'v1:arena_laser_tag',
        service_name:       svcName,
        service_selections: [{ selected_options: [{ id: 'v1_arena_lt', text: svcName, quantity: qty }] }],
      })
      continue
    }

    // 9. Lawn Games — skip if service has no priced selections
    //    Blank Lawn Games services are sometimes added by reps as event annotations.
    if (svc.service_id === LAWN_GAMES_V1_SERVICE_ID) {
      const hasPricedSummary = (svc.pricing_summary ?? [])
        .some(ps => ps.type === 'service_option' && (ps.amount ?? 0) > 0)
      const hasFieldOptions = (svc.service_fields ?? svc.service_selections ?? [])
        .some(f => (f.selected_options?.length ?? 0) > 0)
      if (!hasPricedSummary && !hasFieldOptions) continue
    }

    // 10. Generic path
    // Build selections from service_fields (v1) or service_selections (v3 fallback).
    const sfSelections = (svc.service_fields ?? svc.service_selections ?? []).map(field => ({
      selected_options: (field.selected_options ?? []).map(opt => ({
        id:       opt.id ?? '',
        text:     opt.text ?? opt.name ?? '',
        // Coerce to number — the v1 API may return quantity as a string
        quantity: opt.quantity !== undefined ? Number(opt.quantity) : undefined,
        price:    opt.price !== undefined ? Number(opt.price) : undefined,
      })),
    }))

    const hasRealOptions = sfSelections.some(sel => (sel.selected_options?.length ?? 0) > 0)

    // Fallback: when service_fields is absent or empty, some v1 services surface
    // selected options only in pricing_summary[]. Parse "Nx Description" entries
    // from there as synthetic options with id='' — resolveWebhookItems handles
    // them via name-based modifier matching instead of ID-based matching.
    const psSelections =
      !hasRealOptions && (svc.pricing_summary?.length ?? 0) > 0
        ? [{
            selected_options: (svc.pricing_summary ?? [])
              .filter(ps => ps.type === 'service_option' && ps.description)
              .map(ps => {
                const desc = ps.description!
                // Parse optional "Nx " prefix (e.g. "3x Standard Cornhole" → qty=3)
                const qtyMatch = desc.match(/^(\d+)[x×]\s*(.+)$/i)
                return {
                  id:       '',   // synthetic — no Zenbooker modifier ID
                  text:     qtyMatch ? qtyMatch[2].trim() : desc,
                  quantity: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
                  price:    ps.amount !== undefined ? Number(ps.amount) : undefined,
                }
              }),
          }]
        : []

    services.push({
      service_id:         svc.service_id ?? '',
      service_name:       svcName,
      service_selections: [...sfSelections, ...psSelections],
    })
  }

  // A job is admin-only if the payload had services but ALL of them were filtered
  // out as admin/logistics entries — and none triggered the pickup flags.
  const isAdminOnly = hadServices && !isPickupJob && !isArenaPickupJob && services.length === 0

  // Staff/chain assignment — handle multiple possible field names in v1
  let assignedStaff: Array<{ staff_id: string; staff_name: string }> = []
  if (job.assigned_providers?.length) {
    assignedStaff = job.assigned_providers.map(p => ({ staff_id: p.id, staff_name: p.name }))
  } else if (job.assigned_provider?.id) {
    assignedStaff = [{ staff_id: job.assigned_provider.id, staff_name: job.assigned_provider.name ?? '' }]
  } else if (job.providers?.length) {
    assignedStaff = job.providers
      .filter(p => p.id)
      .map(p => ({ staff_id: p.id!, staff_name: p.name ?? '' }))
  }

  // Notes — handle both text and note field names
  const notes = (job.job_notes ?? [])
    .map(n => n.text ?? n.note ?? '')
    .filter(Boolean)
    .join('\n')

  return {
    jobId:          job.id,
    jobNumber:      job.job_number ?? '',
    customerName,
    address,
    eventDate,
    startTime,
    endTime,
    services,
    assignedStaff,
    notes,
    isAdminOnly,
    isPickupJob,
    isArenaPickupJob,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const apiKey = process.env.ZENBOOKER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ZENBOOKER_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')

  const zbUrl = new URL('https://api.zenbooker.com/v1/jobs')
  if (cursor) zbUrl.searchParams.set('cursor', cursor)

  let zbResponse: V1Response
  try {
    const res = await fetch(zbUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Zenbooker-Version': '2025-09-01',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Zenbooker API error: ${res.status} ${text}` },
        { status: 502 }
      )
    }
    zbResponse = await res.json() as V1Response
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Zenbooker: ${String(err)}` },
      { status: 502 }
    )
  }

  const supabase = createServiceRoleClient()

  const [{ data: serviceMappings }, { data: chainMappings }, { data: equipmentRows }] = await Promise.all([
    supabase.from('service_mappings').select('*'),
    supabase.from('chain_mappings').select('*'),
    supabase.from('equipment').select('id, name').eq('is_active', true),
  ])
  const smRows = (serviceMappings ?? []) as ServiceMappingRow[]
  const cmRows = (chainMappings ?? []) as ChainMappingRow[]
  const eqRows = (equipmentRows ?? []) as Array<{ id: string; name: string }>

  let imported = 0
  let skipped_canceled = 0
  let skipped_admin = 0
  let errors = 0
  const error_details: Array<{ job_id: string; job_number: string; error: string }> = []

  for (const job of zbResponse.results ?? []) {
    // Skip canceled — check both boolean field and status string
    if (job.canceled === true || job.status === 'canceled') {
      skipped_canceled++
      continue
    }

    const jobId = job.id
    const jobNumber = job.job_number ?? ''

    try {
      const parsed = parseV1Job(job)
      const {
        customerName, address, eventDate, startTime, endTime,
        services, assignedStaff, notes,
        isAdminOnly, isPickupJob, isArenaPickupJob,
      } = parsed

      // ── Admin-only jobs (item 6): skip booking creation entirely ──────────
      if (isAdminOnly) {
        await supabase.from('webhook_logs').insert({
          received_at:      new Date().toISOString(),
          zenbooker_job_id: jobId,
          action:           'job.import',
          raw_payload:      job as unknown as Record<string, unknown>,
          result:           'skipped',
          result_detail:    'admin-only services: no booking created',
        })
        skipped_admin++
        continue
      }

      // ── Wonderfly Games Pickup / Arena Return ─────────────────────────────
      // Import for chain/scheduling visibility but with no equipment mapping.
      // Detected by customerName (v3 webhook) OR service name patterns (v1 import).
      const isPickup      = customerName === 'Wonderfly Games Pickup'  || isPickupJob
      const isArenaReturn = customerName === 'Wonderfly Arena Return'   || isArenaPickupJob

      if (isPickup || isArenaReturn) {
        // Resolve chain so the booking is visible on the correct vehicle schedule
        let chainId: string | null = null
        for (const staff of assignedStaff) {
          const cm = cmRows.find(m => m.zenbooker_staff_id === staff.staff_id)
          if (cm) { chainId = cm.chain_id; break }
        }

        const eventType = isPickup ? 'pickup' as const : 'arena_pickup' as const

        const { data: booking, error: upsertErr } = await supabase
          .from('bookings')
          .upsert(
            {
              zenbooker_job_id: jobId,
              customer_name:    customerName,
              address,
              event_date:       eventDate,
              end_date:         null,
              start_time:       startTime,
              end_time:         endTime,
              chain:            chainId,
              status:           'confirmed' as const,
              event_type:       eventType,
              source:           'webhook' as const,
              notes,
            },
            { onConflict: 'zenbooker_job_id' }
          )
          .select('id')
          .single()

        if (upsertErr || !booking) throw new Error(upsertErr?.message ?? 'upsert failed')

        // Clear any stale booking_items (no equipment for these event types)
        await supabase.from('booking_items').delete().eq('booking_id', booking.id)

        // ── Link to matching drop-off booking ─────────────────────────────
        // Find the most recent drop-off or coordinated booking at the same
        // address on or before the pickup date, then set linked_booking_id on
        // both rows bidirectionally.  If the drop-off is already linked to a
        // different pickup, flag this booking as needs_review instead.
        let linkDetail = `${eventType}: imported with no equipment`
        if (eventDate) {
          const { data: matchingDropoff } = await supabase
            .from('bookings')
            .select('id, linked_booking_id')
            .eq('address', address)
            .in('event_type', ['dropoff', 'coordinated'])
            .lte('event_date', eventDate)
            .order('event_date', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (matchingDropoff) {
            if (matchingDropoff.linked_booking_id) {
              // Already linked to a different pickup — flag for review
              await supabase
                .from('bookings')
                .update({ status: 'needs_review' })
                .eq('id', booking.id)
              linkDetail += '; flagged needs_review: drop-off already linked'
            } else {
              // Bidirectional link
              await supabase
                .from('bookings')
                .update({ linked_booking_id: booking.id })
                .eq('id', matchingDropoff.id)
              await supabase
                .from('bookings')
                .update({ linked_booking_id: matchingDropoff.id })
                .eq('id', booking.id)
              linkDetail += `; linked to drop-off ${matchingDropoff.id}`
            }
          }
        }

        await supabase.from('webhook_logs').insert({
          received_at:      new Date().toISOString(),
          zenbooker_job_id: jobId,
          action:           'job.import',
          raw_payload:      job as unknown as Record<string, unknown>,
          result:           'success',
          result_detail:    linkDetail,
          booking_id:       booking.id,
        })

        imported++
        continue
      }

      // ── Normal booking import ─────────────────────────────────────────────
      const eventType = resolveEventType(services, customerName)

      const resolution = resolveWebhookItems(services, assignedStaff, smRows, cmRows, eqRows)
      const { chainId, resolvedItems, unmappedNames, nameFallbacks } = resolution

      const status: 'confirmed' | 'needs_review' = unmappedNames.length > 0 ? 'needs_review' : 'confirmed'
      const fallbackDetails = nameFallbacks.map(
        f => `name fallback: ${f.optionId ?? '(no id)'} "${f.optionName}" → ${f.equipmentId}`
      )
      let resultDetail: string | null = null
      if (unmappedNames.length > 0) {
        const parts = [`unmapped: ${unmappedNames.join(', ')}`]
        if (fallbackDetails.length > 0) parts.push(...fallbackDetails)
        resultDetail = parts.join('; ')
      } else if (fallbackDetails.length > 0) {
        resultDetail = fallbackDetails.join('; ')
      }

      const { data: booking, error: upsertErr } = await supabase
        .from('bookings')
        .upsert(
          {
            zenbooker_job_id: jobId,
            customer_name:    customerName,
            address,
            event_date:       eventDate,
            end_date:         null,
            start_time:       startTime,
            end_time:         endTime,
            chain:            chainId,
            status,
            event_type:       eventType,
            source:           'webhook' as const,
            notes,
          },
          { onConflict: 'zenbooker_job_id' }
        )
        .select('id')
        .single()

      if (upsertErr || !booking) {
        throw new Error(upsertErr?.message ?? 'upsert failed')
      }

      const bookingId = booking.id

      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
      const dedupedItems = deduplicateItems(resolvedItems)
      if (dedupedItems.length > 0) {
        await supabase
          .from('booking_items')
          .insert(dedupedItems.map(item => ({ ...item, booking_id: bookingId })))
      }

      const webhookResult = unmappedNames.length > 0 ? 'unmapped_service' : 'success'
      await supabase.from('webhook_logs').insert({
        received_at:      new Date().toISOString(),
        zenbooker_job_id: jobId,
        action:           'job.import',
        raw_payload:      job as unknown as Record<string, unknown>,
        result:           webhookResult,
        result_detail:    resultDetail,
        booking_id:       bookingId,
      })

      imported++
    } catch (err) {
      errors++
      error_details.push({ job_id: jobId, job_number: jobNumber, error: String(err) })

      await supabase.from('webhook_logs').insert({
        received_at:      new Date().toISOString(),
        zenbooker_job_id: jobId,
        action:           'job.import',
        raw_payload:      job as unknown as Record<string, unknown>,
        result:           'error',
        result_detail:    String(err),
      })
    }
  }

  return NextResponse.json({
    imported,
    skipped_canceled,
    skipped_admin,
    errors,
    error_details,
    next_cursor: zbResponse.has_more ? (zbResponse.next_cursor ?? null) : null,
  })
}
