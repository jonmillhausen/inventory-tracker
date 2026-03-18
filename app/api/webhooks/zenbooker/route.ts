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
  const secret = request.headers.get('x-zenbooker-secret')
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

  // Log raw payload to webhook_logs
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

  try {
    // Fetch mappings and resolve
    const [{ data: serviceMappings }, { data: chainMappings }] = await Promise.all([
      supabase.from('service_mappings').select('*'),
      supabase.from('chain_mappings').select('*'),
    ])

    const services = payload.services ?? []
    const assignedStaff = payload.assigned_staff ?? []

    // Determine status and resolve items
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

    // Upsert booking
    const { data: booking, error: upsertErr } = await supabase
      .from('bookings')
      .upsert(
        {
          zenbooker_job_id: payload.job_id,
          customer_name: payload.customer_name,
          address: payload.address,
          event_date: payload.date,
          end_date: payload.end_date ?? null,
          start_time: payload.start_time,
          end_time: payload.end_time,
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
    if (action !== 'job_cancelled') {
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
      .update({ result: webhookResult, result_detail: resultDetail, booking_id: bookingId })
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
