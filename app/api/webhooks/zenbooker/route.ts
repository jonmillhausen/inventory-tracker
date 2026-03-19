import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerPayload } from '@/lib/utils/webhookProcessor'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// Zenbooker v3 uses dot-notation event names
const PROCESSABLE_ACTIONS = new Set([
  'job.created',
  'job.rescheduled',
  'job.cancelled',
  'service_order.edited',
  'job.assigned',
  'job.completed',
  'job.started',
])

const SKIPPABLE_ACTIONS = new Set([
  'recurring_booking.created',
  'recurring_booking.canceled',
])

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

  // Debug: log raw payload so we can inspect what Zenbooker is sending
  console.log('[zenbooker webhook] received payload:', JSON.stringify(payload, null, 2))

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

  // ── job.assigned / job.completed: update existing booking ────────────────
  if (action === 'job.assigned' || action === 'job.completed') {
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
        const assignedStaff = payload.data.assigned_staff ?? []
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

        const detail = chainId ? `chain set to ${chainId}` : 'no chain mapping found for assigned staff'
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

      return NextResponse.json({ ok: true })
    } catch (err) {
      await supabase
        .from('webhook_logs')
        .update({ result: 'error', result_detail: String(err) })
        .eq('id', logId)
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  try {
    // Fetch mappings and equipment for resolution
    const [{ data: serviceMappings }, { data: chainMappings }, { data: equipmentRows }] = await Promise.all([
      supabase.from('service_mappings').select('*'),
      supabase.from('chain_mappings').select('*'),
      supabase.from('equipment').select('id, name').eq('is_active', true),
    ])

    const services = payload.data.services ?? []
    const assignedStaff = payload.data.assigned_staff ?? []

    // Determine status and resolve items
    let status: 'confirmed' | 'canceled' | 'needs_review'
    let chainId: string | null = null
    let resolvedItems: Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }> = []
    let unmappedNames: string[] = []
    let resultDetail: string | null = null

    if (action === 'job.cancelled') {
      status = 'canceled'
    } else {
      const resolution = resolveWebhookItems(
        services,
        assignedStaff,
        (serviceMappings ?? []) as ServiceMappingRow[],
        (chainMappings ?? []) as ChainMappingRow[],
        (equipmentRows ?? []) as Array<{ id: string; name: string }>,
      )
      chainId = resolution.chainId
      resolvedItems = resolution.resolvedItems
      unmappedNames = resolution.unmappedNames

      const fallbackDetails = resolution.nameFallbacks.map(
        f => `matched by name fallback: ${f.optionName} → ${f.equipmentId}`
      )

      if (unmappedNames.length > 0) {
        status = 'needs_review'
        const parts = [`unmapped: ${unmappedNames.join(', ')}`]
        if (fallbackDetails.length > 0) parts.push(...fallbackDetails)
        resultDetail = parts.join('; ')
      } else if (fallbackDetails.length > 0) {
        status = 'confirmed'
        resultDetail = fallbackDetails.join('; ')
      } else {
        status = 'confirmed'
      }
    }

    // Upsert booking
    const { data: booking, error: upsertErr } = await supabase
      .from('bookings')
      .upsert(
        {
          zenbooker_job_id: jobId,
          customer_name: payload.data.customer_name ?? '',
          address: payload.data.address ?? '',
          event_date: payload.data.date ?? '',
          end_date: payload.data.end_date ?? null,
          start_time: payload.data.time_slot?.start_time ?? null,
          end_time: payload.data.time_slot?.end_time ?? null,
          chain: chainId,
          status,
          event_type: 'dropoff',
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

    // Replace booking_items (skip for cancellations)
    if (action !== 'job.cancelled') {
      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
      if (resolvedItems.length > 0) {
        await supabase.from('booking_items').insert(
          resolvedItems.map(item => ({ ...item, booking_id: bookingId }))
        )
      }
    }

    // Update webhook log with result
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
