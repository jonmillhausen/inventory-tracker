import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSessionAndRole } from '@/lib/api/auth'
import {
  resolveWebhookItems,
  resolveEventType,
  extractBookingFields,
} from '@/lib/utils/webhookProcessor'
import type { ZenbookerService, ZenbookerPayload } from '@/lib/utils/webhookProcessor'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// Zenbooker list-jobs API response shape (v3, 2025-09-01)
interface ZenbookerJob {
  id: string
  job_number?: string
  canceled?: boolean
  customer?: { name?: string }
  service_address?: { formatted?: string }
  start_date?: string
  timezone?: string
  estimated_duration_seconds?: number
  time_slot?: {
    start_time?: string | null
    end_time?: string | null
  }
  assigned_providers?: Array<{ id: string; name: string }>
  services?: ZenbookerService[]
  job_notes?: Array<{ text?: string }>
}

interface ZenbookerJobsResponse {
  data: ZenbookerJob[]
  next_cursor: string | null
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin'])
  if (auth instanceof NextResponse) return auth

  const apiKey = process.env.ZENBOOKER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ZENBOOKER_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')

  // Fetch one page from Zenbooker
  const zbUrl = new URL('https://api.zenbooker.com/v1/jobs')
  if (cursor) zbUrl.searchParams.set('cursor', cursor)

  let zbResponse: ZenbookerJobsResponse
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
    zbResponse = await res.json() as ZenbookerJobsResponse
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Zenbooker: ${String(err)}` },
      { status: 502 }
    )
  }

  const supabase = createServiceRoleClient()

  // Load lookup tables once per page
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

  for (const job of zbResponse.data ?? []) {
    if (job.canceled === true) {
      skipped_canceled++
      continue
    }

    const jobId = job.id
    const jobNumber = job.job_number ?? ''

    try {
      const services = job.services ?? []
      const { customerName, address, eventDate, startTime, endTime } =
        extractBookingFields(job as ZenbookerPayload['data'])
      const eventType = resolveEventType(services, customerName)
      const notes = (job.job_notes ?? [])
        .map(n => n.text ?? '')
        .filter(Boolean)
        .join('\n')

      const assignedStaff = (job.assigned_providers ?? []).map(p => ({
        staff_id: p.id,
        staff_name: p.name,
      }))

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

      // Upsert booking — overwrites all fields with latest data from Zenbooker
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

      // Replace booking_items with freshly resolved items
      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
      if (resolvedItems.length > 0) {
        await supabase
          .from('booking_items')
          .insert(resolvedItems.map(item => ({ ...item, booking_id: bookingId })))
      }

      // Audit log
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
    next_cursor: zbResponse.next_cursor ?? null,
  })
}
