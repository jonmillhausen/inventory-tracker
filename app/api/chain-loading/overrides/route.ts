import { NextResponse } from 'next/server'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

const NOTE_TYPES = ['equipment', 'sub_item', 'chain'] as const

type OverrideNoteType = typeof NOTE_TYPES[number]

interface ChainLoadingOverrideRow {
  chain_id: string
  event_date: string
  sub_item_id: string
  qty_override: number
  created_by: string | null
  updated_at: string
}

interface ChainLoadingNoteRow {
  chain_id: string
  event_date: string
  item_id: string
  item_type: OverrideNoteType
  note: string
  created_by: string | null
  updated_at: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const event_date = searchParams.get('event_date')
  const chain_id = searchParams.get('chain_id')

  if (!event_date) {
    return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
  }

  const supabase = await createClient()
  let query = supabase.from('chain_loading_overrides').select('*').eq('event_date', event_date)
  if (chain_id) query = query.eq('chain_id', chain_id)
  const { data: overrides, error: overrideError } = await query

  if (overrideError) {
    return NextResponse.json({ error: overrideError.message }, { status: 500 })
  }

  let noteQuery = supabase.from('chain_loading_notes').select('*').eq('event_date', event_date)
  if (chain_id) noteQuery = noteQuery.eq('chain_id', chain_id)
  const { data: notes, error: noteError } = await noteQuery

  if (noteError) {
    return NextResponse.json({ error: noteError.message }, { status: 500 })
  }

  console.log('[chain-loading/overrides] GET', { event_date, chain_id, overrides: overrides?.length, notes: notes?.length })
  return NextResponse.json({ overrides: overrides ?? [], notes: notes ?? [] })
}

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales'])
  if (auth instanceof NextResponse) return auth

  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    chain_id,
    event_date,
    sub_item_id,
    qty_override,
    item_id,
    item_type,
    note,
  } = body as Record<string, unknown>

  if (!chain_id || typeof chain_id !== 'string') {
    return NextResponse.json({ error: 'chain_id is required' }, { status: 400 })
  }
  if (!event_date || typeof event_date !== 'string') {
    return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  if (typeof qty_override === 'number') {
    if (!sub_item_id || typeof sub_item_id !== 'string') {
      return NextResponse.json({ error: 'sub_item_id is required for qty_override' }, { status: 400 })
    }

    const overridesTable = (supabase as any).from('chain_loading_overrides')
    const { data, error } = await overridesTable
      .upsert(
        {
          chain_id,
          event_date,
          sub_item_id,
          qty_override,
          created_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: ['chain_id', 'event_date', 'sub_item_id'] }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    results.override = data
  }

  if (typeof note === 'string') {
    if (!item_id || typeof item_id !== 'string') {
      return NextResponse.json({ error: 'item_id is required for note' }, { status: 400 })
    }
    if (!item_type || typeof item_type !== 'string' || !NOTE_TYPES.includes(item_type as any)) {
      return NextResponse.json({ error: 'item_type must be equipment, sub_item, or chain' }, { status: 400 })
    }

    console.log('[chain-loading/overrides] POST note', { chain_id, event_date, item_id, item_type, note })
    const notesTable = (supabase as any).from('chain_loading_notes')
    const { data, error } = await notesTable
      .upsert(
        {
          chain_id,
          event_date,
          item_id,
          item_type,
          note,
          created_by: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: ['chain_id', 'event_date', 'item_id', 'item_type'] }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    results.note = data
  }

  if (!('override' in results) && !('note' in results)) {
    return NextResponse.json({ error: 'No valid override or note payload provided' }, { status: 400 })
  }

  return NextResponse.json(results)
}
