import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerService } from '@/lib/utils/webhookProcessor'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

async function batchReprocess(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, zenbooker_job_id')
    .eq('status', 'needs_review')
    .not('zenbooker_job_id', 'is', null)

  if (!bookings?.length) return

  const [{ data: serviceMappings }, { data: chainMappings }] = await Promise.all([
    supabase.from('service_mappings').select('*'),
    supabase.from('chain_mappings').select('*'),
  ])

  for (const booking of bookings) {
    const { data: log } = await supabase
      .from('webhook_logs')
      .select('raw_payload')
      .eq('booking_id', booking.id)
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    if (!log?.raw_payload) continue

    const payload = log.raw_payload as Record<string, unknown>
    const services = (payload.services ?? []) as ZenbookerService[]
    const assignedStaff = (payload.assigned_staff ?? []) as Array<{ staff_id: string; staff_name: string }>

    const { resolvedItems, unmappedNames } = resolveWebhookItems(
      services,
      assignedStaff,
      (serviceMappings ?? []) as ServiceMappingRow[],
      (chainMappings ?? []) as ChainMappingRow[],
    )

    if (unmappedNames.length > 0) continue

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
    if (error.code === '23505')
      return NextResponse.json({ error: 'Duplicate mapping — this service/modifier is already mapped' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  void batchReprocess(supabase)

  return NextResponse.json(data, { status: 201 })
}
