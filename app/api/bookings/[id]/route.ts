import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  // Verify booking exists
  const { error: existsError } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', id)
    .single()

  if (existsError?.code === 'PGRST116') {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (existsError) {
    return NextResponse.json({ error: existsError.message }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    items,
    customer_name,
    event_date,
    end_date,
    start_time,
    end_time,
    address,
    event_type,
    chain,
    status,
    notes,
  } = body as Record<string, unknown>

  // Build update object from provided fields only
  const updateFields: Record<string, unknown> = {}
  if (customer_name !== undefined) updateFields.customer_name = customer_name
  if (event_date !== undefined) updateFields.event_date = event_date
  if (end_date !== undefined) updateFields.end_date = end_date
  if (start_time !== undefined) updateFields.start_time = start_time
  if (end_time !== undefined) updateFields.end_time = end_time
  if (address !== undefined) updateFields.address = address
  if (event_type !== undefined) {
    const VALID_EVENT_TYPES = ['coordinated', 'dropoff', 'pickup', 'willcall']
    if (typeof event_type !== 'string' || !VALID_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json({ error: 'event_type must be one of: coordinated, dropoff, pickup, willcall' }, { status: 400 })
    }
    updateFields.event_type = event_type
  }
  if (chain !== undefined) updateFields.chain = chain
  if (status !== undefined) {
    const VALID_STATUSES = ['confirmed', 'canceled', 'completed', 'needs_review']
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
    }
    updateFields.status = status
  }
  if (notes !== undefined) updateFields.notes = notes

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update(updateFields)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // If items provided, replace booking_items
  if (Array.isArray(items)) {
    // Delete existing booking_items
    const { error: deleteError } = await supabase
      .from('booking_items')
      .delete()
      .eq('booking_id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Re-insert new booking_items (only qty > 0)
    const validItems = (items as Array<{ item_id: string; qty: number; is_sub_item: boolean; parent_item_id: string | null }>)
      .filter(item => item.qty > 0)

    if (validItems.length > 0) {
      const { error: insertError } = await supabase
        .from('booking_items')
        .insert(
          validItems.map(item => ({
            booking_id: id,
            item_id: item.item_id,
            qty: item.qty,
            is_sub_item: item.is_sub_item,
            parent_item_id: item.parent_item_id ?? null,
          }))
        )
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  }

  // Return updated booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  return NextResponse.json(booking)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const supabase = await createClient()

  // Delete booking_items first (safety in case no CASCADE on FK)
  const { error: itemsError } = await supabase
    .from('booking_items')
    .delete()
    .eq('booking_id', id)

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Delete booking
  const { error: bookingError } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
