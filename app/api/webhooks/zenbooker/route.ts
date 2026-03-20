import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerPayload, ZenbookerService } from '@/lib/utils/webhookProcessor'
import type { Database, EventType } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// Zenbooker v3 uses dot-notation event names
const PROCESSABLE_ACTIONS = new Set([
  'job.created',
  'job.rescheduled',
  'job.canceled',
  'job.service_order.edited',
  'job.assigned',
  'job.completed',
  'job.started',
])

const SKIPPABLE_ACTIONS = new Set([
  'recurring_booking.created',
  'recurring_booking.canceled',
])

// Services where the customer chooses delivery vs pickup via a modifier option.
// All other services default to "coordinated".
const DELIVERY_SERVICES = new Set([
  'Lawn Games',
  'Foam Party - Drop-Off',
  'Party Pack Bundle',
  'Big Bash Bundle',
])

/**
 * Determine event_type from the services list and customer name.
 * - DELIVERY_SERVICES check modifier options for delivery/pickup selection.
 * - All other services → "coordinated".
 */
function resolveEventType(services: ZenbookerService[], customerName: string): EventType {
  const hasDeliveryService = services.some(svc => DELIVERY_SERVICES.has(svc.service_name))
  if (!hasDeliveryService) return 'coordinated'

  // Name-based pickup signals take priority
  if (customerName === 'Wonderfly Games Pickup') return 'pickup'
  if (services.some(svc => svc.service_name.includes('Pickup'))) return 'pickup'

  // Check modifier options on delivery-category services
  for (const svc of services) {
    if (!DELIVERY_SERVICES.has(svc.service_name)) continue
    const allOptions = (svc.service_selections ?? []).flatMap(sel => sel.selected_options ?? [])
    for (const option of allOptions) {
      if (option.text.includes('Customer Pickup')) return 'arena_pickup'
      if (option.text.includes('Standard Delivery') || option.text.includes('Priority Delivery')) return 'dropoff'
    }
  }

  return 'dropoff'
}

/**
 * Extract a YYYY-MM-DD date string from an ISO datetime in the given timezone.
 * Falls back to null if start_date is absent or unparseable.
 */
function extractEventDate(startDate: string | undefined, timezone: string | undefined): string | null {
  if (!startDate) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(startDate))
  } catch {
    return null
  }
}

/**
 * Add durationSeconds to a "HH:MM" start time, returning "HH:MM".
 */
function calcEndTime(startTime: string, durationSeconds: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const totalMinutes = h * 60 + m + Math.round(durationSeconds / 60)
  const endH = Math.floor(totalMinutes / 60) % 24
  const endM = totalMinutes % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

/**
 * Extract booking fields from a v3 payload's data object.
 * Handles missing end_time by computing it from start_time + estimated_duration_seconds.
 */
function extractBookingFields(data: ZenbookerPayload['data']) {
  const customerName = data.customer?.name ?? ''
  const address = data.service_address?.formatted ?? ''
  const eventDate = extractEventDate(data.start_date, data.timezone)
  const startTime = data.time_slot?.start_time ?? null
  let endTime = data.time_slot?.end_time ?? null
  if (!endTime && startTime && data.estimated_duration_seconds) {
    endTime = calcEndTime(startTime, data.estimated_duration_seconds)
  }
  return { customerName, address, eventDate, startTime, endTime }
}

export async function POST(request: Request) {
  // Step 1: Verify shared secret from query parameter
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (!secret || secret !== process.env.ZENBOOKER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read body once, check size, then parse as JSON
  let bodyBuffer: ArrayBuffer
  try {
    bodyBuffer = await request.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 })
  }

  if (bodyBuffer.byteLength > 1_000_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let payload: ZenbookerPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBuffer)) as ZenbookerPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Timestamp check (if present, reject if > 5 minutes old)
  if (payload.timestamp) {
    const ageSec = Math.floor(Date.now() / 1000) - payload.timestamp
    if (ageSec > 300 || ageSec < -300) {
      return NextResponse.json({ error: 'Stale timestamp' }, { status: 400 })
    }
  }

  // Validate required fields — v3 structure: event at root, job id at data.id
  if (!payload.data?.id || typeof payload.data.id !== 'string') {
    return NextResponse.json({ error: 'Missing data.id' }, { status: 400 })
  }

  const jobId = payload.data.id
  const supabase = createServiceRoleClient()
  const action = payload.event ?? 'unknown'

  // Log raw payload to webhook_logs
  const { data: logRow, error: logErr } = await supabase
    .from('webhook_logs')
    .insert({
      received_at: new Date().toISOString(),
      zenbooker_job_id: jobId,
      action,
      raw_payload: payload as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (logErr || !logRow) {
    return NextResponse.json({ error: 'Log write failed' }, { status: 500 })
  }

  const logId = logRow.id

  // Handle skippable actions (recurring)
  if (SKIPPABLE_ACTIONS.has(action)) {
    await supabase
      .from('webhook_logs')
      .update({ result: 'skipped', result_detail: 'recurring booking: skipped' })
      .eq('id', logId)
    return NextResponse.json({ ok: true })
  }

  // Handle unrecognized actions
  if (!PROCESSABLE_ACTIONS.has(action)) {
    await supabase
      .from('webhook_logs')
      .update({ result: 'skipped', result_detail: `unrecognized action: ${action}` })
      .eq('id', logId)
    return NextResponse.json({ ok: true })
  }

  // ── job.started: log only, no booking mutation ───────────────────────────
  if (action === 'job.started') {
    await supabase
      .from('webhook_logs')
      .update({ result: 'success', result_detail: 'job.started: logged' })
      .eq('id', logId)
    return NextResponse.json({ ok: true })
  }

  // Helper: map v3 assigned_providers to resolveWebhookItems format
  const assignedStaff = (payload.data.assigned_providers ?? []).map(p => ({
    staff_id: p.id,
    staff_name: p.name,
  }))

  // ── Actions that update an existing booking ──────────────────────────────
  const UPDATE_ACTIONS = new Set(['job.assigned', 'job.completed', 'job.canceled', 'job.rescheduled', 'job.service_order.edited'])

  if (UPDATE_ACTIONS.has(action)) {
    try {
      const { data: existingBooking, error: lookupErr } = await supabase
        .from('bookings')
        .select('id')
        .eq('zenbooker_job_id', jobId)
        .single()

      if (lookupErr || !existingBooking) {
        await supabase
          .from('webhook_logs')
          .update({ result: 'error', result_detail: 'booking not found' })
          .eq('id', logId)
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      }

      const bookingId = existingBooking.id

      if (action === 'job.assigned') {
        const { data: chainMappingsRaw } = await supabase.from('chain_mappings').select('*')
        const chainMappings = (chainMappingsRaw ?? []) as ChainMappingRow[]
        let chainId: string | null = null
        for (const staff of assignedStaff) {
          const cm = chainMappings.find(m => m.zenbooker_staff_id === staff.staff_id)
          if (cm) { chainId = cm.chain_id; break }
        }

        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ chain: chainId })
          .eq('id', bookingId)

        if (updateErr) {
          await supabase
            .from('webhook_logs')
            .update({ result: 'error', result_detail: updateErr.message })
            .eq('id', logId)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        const detail = chainId ? `chain set to ${chainId}` : 'no chain mapping found for assigned provider'
        await supabase
          .from('webhook_logs')
          .update({ result: 'success', result_detail: detail, booking_id: bookingId })
          .eq('id', logId)
      }

      if (action === 'job.completed') {
        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ status: 'completed' })
          .eq('id', bookingId)

        if (updateErr) {
          await supabase
            .from('webhook_logs')
            .update({ result: 'error', result_detail: updateErr.message })
            .eq('id', logId)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        await supabase
          .from('webhook_logs')
          .update({ result: 'success', result_detail: 'status set to completed', booking_id: bookingId })
          .eq('id', logId)
      }

      if (action === 'job.canceled') {
        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ status: 'canceled' })
          .eq('id', bookingId)

        if (updateErr) {
          await supabase
            .from('webhook_logs')
            .update({ result: 'error', result_detail: updateErr.message })
            .eq('id', logId)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        await supabase
          .from('webhook_logs')
          .update({ result: 'success', result_detail: 'status set to canceled', booking_id: bookingId })
          .eq('id', logId)
      }

      if (action === 'job.rescheduled') {
        const { eventDate, startTime, endTime, address } = extractBookingFields(payload.data)

        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ event_date: eventDate, start_time: startTime, end_time: endTime, address })
          .eq('id', bookingId)

        if (updateErr) {
          await supabase
            .from('webhook_logs')
            .update({ result: 'error', result_detail: updateErr.message })
            .eq('id', logId)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        await supabase
          .from('webhook_logs')
          .update({ result: 'success', result_detail: 'booking rescheduled', booking_id: bookingId })
          .eq('id', logId)
      }

      if (action === 'job.service_order.edited') {
        const [{ data: serviceMappings }, { data: chainMappings }, { data: equipmentRows }] = await Promise.all([
          supabase.from('service_mappings').select('*'),
          supabase.from('chain_mappings').select('*'),
          supabase.from('equipment').select('id, name').eq('is_active', true),
        ])

        const services = payload.data.services ?? []
        const { customerName } = extractBookingFields(payload.data)
        const resolution = resolveWebhookItems(
          services,
          assignedStaff,
          (serviceMappings ?? []) as ServiceMappingRow[],
          (chainMappings ?? []) as ChainMappingRow[],
          (equipmentRows ?? []) as Array<{ id: string; name: string }>,
        )

        const { unmappedNames, resolvedItems, nameFallbacks } = resolution
        const fallbackDetails = nameFallbacks.map(f => `matched by name fallback: ${f.optionName} → ${f.equipmentId}`)

        const newStatus: 'confirmed' | 'needs_review' = unmappedNames.length > 0 ? 'needs_review' : 'confirmed'
        const eventType = resolveEventType(services, customerName)
        let resultDetail: string | null = null
        if (unmappedNames.length > 0) {
          const parts = [`unmapped: ${unmappedNames.join(', ')}`]
          if (fallbackDetails.length > 0) parts.push(...fallbackDetails)
          resultDetail = parts.join('; ')
        } else if (fallbackDetails.length > 0) {
          resultDetail = fallbackDetails.join('; ')
        }

        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ status: newStatus, event_type: eventType })
          .eq('id', bookingId)

        if (updateErr) {
          await supabase
            .from('webhook_logs')
            .update({ result: 'error', result_detail: updateErr.message })
            .eq('id', logId)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        // Replace booking_items
        await supabase.from('booking_items').delete().eq('booking_id', bookingId)
        if (resolvedItems.length > 0) {
          await supabase.from('booking_items').insert(
            resolvedItems.map(item => ({ ...item, booking_id: bookingId }))
          )
        }

        const webhookResult = unmappedNames.length > 0 ? 'unmapped_service' : 'success'
        await supabase
          .from('webhook_logs')
          .update({ result: webhookResult, result_detail: resultDetail, booking_id: bookingId })
          .eq('id', logId)
      }

      return NextResponse.json({ ok: true })
    } catch (err) {
      await supabase
        .from('webhook_logs')
        .update({ result: 'error', result_detail: String(err) })
        .eq('id', logId)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  // ── job.created: full upsert ─────────────────────────────────────────────
  try {
    const [{ data: serviceMappings }, { data: chainMappings }, { data: equipmentRows }] = await Promise.all([
      supabase.from('service_mappings').select('*'),
      supabase.from('chain_mappings').select('*'),
      supabase.from('equipment').select('id, name').eq('is_active', true),
    ])

    const services = payload.data.services ?? []
    const { customerName, address, eventDate, startTime, endTime } = extractBookingFields(payload.data)
    const eventType = resolveEventType(services, customerName)

    const resolution = resolveWebhookItems(
      services,
      assignedStaff,
      (serviceMappings ?? []) as ServiceMappingRow[],
      (chainMappings ?? []) as ChainMappingRow[],
      (equipmentRows ?? []) as Array<{ id: string; name: string }>,
    )
    const { chainId, resolvedItems, unmappedNames, nameFallbacks } = resolution
    const fallbackDetails = nameFallbacks.map(f => `matched by name fallback: ${f.optionName} → ${f.equipmentId}`)

    const status: 'confirmed' | 'needs_review' = unmappedNames.length > 0 ? 'needs_review' : 'confirmed'
    let resultDetail: string | null = null
    if (unmappedNames.length > 0) {
      const parts = [`unmapped: ${unmappedNames.join(', ')}`]
      if (fallbackDetails.length > 0) parts.push(...fallbackDetails)
      resultDetail = parts.join('; ')
    } else if (fallbackDetails.length > 0) {
      resultDetail = fallbackDetails.join('; ')
    }

    // Upsert booking
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

    // Replace booking_items
    await supabase.from('booking_items').delete().eq('booking_id', bookingId)
    if (resolvedItems.length > 0) {
      await supabase.from('booking_items').insert(
        resolvedItems.map(item => ({ ...item, booking_id: bookingId }))
      )
    }

    const webhookResult = unmappedNames.length > 0 ? 'unmapped_service' : 'success'
    await supabase
      .from('webhook_logs')
      .update({ result: webhookResult, result_detail: resultDetail ?? null, booking_id: bookingId })
      .eq('id', logId)

    return NextResponse.json({ ok: true })

  } catch (err) {
    await supabase
      .from('webhook_logs')
      .update({ result: 'error', result_detail: String(err) })
      .eq('id', logId)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
