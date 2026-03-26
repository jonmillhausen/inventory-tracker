import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSessionAndRole } from '@/lib/api/auth'
import {
  resolveWebhookItems,
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

interface V1Service {
  service_id?: string
  service_name?: string
  name?: string              // fallback if service_name absent
  service_fields?: V1ServiceField[]        // v1
  service_selections?: Array<{ selected_options?: V1Option[] }> // v3 fallback
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

  // Normalize v1 services to the ZenbookerService shape resolveWebhookItems expects.
  // v1 uses service_fields[].selected_options[] instead of service_selections[].selected_options[].
  // v1 options may use "name" instead of "text" for the label.
  const services: ZenbookerService[] = (job.services ?? []).map(svc => ({
    service_id:   svc.service_id ?? '',
    service_name: svc.service_name ?? svc.name ?? '',
    service_selections: (svc.service_fields ?? svc.service_selections ?? []).map(field => ({
      selected_options: (field.selected_options ?? []).map(opt => ({
        id:       opt.id ?? '',
        text:     opt.text ?? opt.name ?? '',
        quantity: opt.quantity,
        price:    opt.price,
      })),
    })),
  }))

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
    jobId:        job.id,
    jobNumber:    job.job_number ?? '',
    customerName,
    address,
    eventDate,
    startTime,
    endTime,
    services,
    assignedStaff,
    notes,
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
      const { customerName, address, eventDate, startTime, endTime, services, assignedStaff, notes } = parsed

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
            customer_name: customerName,
            address,
            event_date: eventDate,
            end_date: null,
            start_time: startTime,
            end_time: endTime,
            chain: chainId,
            status,
            event_type: eventType,
            source: 'webhook',
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
      if (resolvedItems.length > 0) {
        await supabase
          .from('booking_items')
          .insert(resolvedItems.map(item => ({ ...item, booking_id: bookingId })))
      }

      const webhookResult = unmappedNames.length > 0 ? 'unmapped_service' : 'success'
      await supabase.from('webhook_logs').insert({
        received_at: new Date().toISOString(),
        zenbooker_job_id: jobId,
        action: 'job.import',
        raw_payload: job as unknown as Record<string, unknown>,
        result: webhookResult,
        result_detail: resultDetail,
        booking_id: bookingId,
      })

      imported++
    } catch (err) {
      errors++
      error_details.push({ job_id: jobId, job_number: jobNumber, error: String(err) })

      await supabase.from('webhook_logs').insert({
        received_at: new Date().toISOString(),
        zenbooker_job_id: jobId,
        action: 'job.import',
        raw_payload: job as unknown as Record<string, unknown>,
        result: 'error',
        result_detail: String(err),
      })
    }
  }

  return NextResponse.json({
    imported,
    skipped_canceled,
    errors,
    error_details,
    next_cursor: zbResponse.has_more ? (zbResponse.next_cursor ?? null) : null,
  })
}
