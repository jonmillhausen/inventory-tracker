import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { calculatePackingList } from '@/lib/utils/packingList'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

interface ChainLoadingOverrideRow {
  chain_id: string
  event_date: string
  sub_item_id: string
  qty_override: number
}

interface ChainLoadingNoteRow {
  chain_id: string
  event_date: string
  item_id: string
  item_type: string
  note: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; chain: string; date: string }> }
) {
  const { token, chain: encodedChain, date } = await params
  const chain = decodeURIComponent(encodedChain)
  const { searchParams } = new URL(request.url)
  const end_date = searchParams.get('end_date') || date

  const expected = createHmac('sha256', process.env.PACKING_LIST_SECRET || '')
    .update(`${chain}:${date}:${end_date}`)
    .digest('hex')

  const tokenBuf = Buffer.from(token, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokensMatch =
    tokenBuf.length === expectedBuf.length &&
    timingSafeEqual(tokenBuf, expectedBuf)

  if (!tokensMatch) {
    return new Response('Forbidden', { status: 403 })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const windowStart = new Date(date + 'T00:00:00Z')
  windowStart.setUTCDate(windowStart.getUTCDate() - 1)
  const windowEnd = new Date(end_date + 'T00:00:00Z')
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1)

  if (today < windowStart || today > windowEnd) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createServiceRoleClient()

  const [
    { data: bookings, error: bErr },
    { data: bookingItems, error: biErr },
    { data: equipment, error: eErr },
    { data: subItems, error: sErr },
    { data: subItemLinks, error: slErr },
    { data: chainsRaw, error: cErr },
    { data: chainMappingsRaw, error: cmErr },
    { data: overrideRows, error: oErr },
    { data: noteRows, error: nErr },
  ] = await Promise.all([
    supabase.from('bookings').select('*'),
    supabase.from('booking_items').select('*'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_items').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_item_links').select('*'),
    supabase.from('chains').select('*').eq('id', chain).single(),
    supabase.from('chain_mappings').select('*').eq('chain_id', chain),
    supabase.from('chain_loading_overrides').select('*').eq('event_date', date).eq('chain_id', chain),
    supabase.from('chain_loading_notes').select('*').eq('event_date', date).eq('chain_id', chain),
  ])

  if (bErr || biErr || eErr || sErr || slErr || cErr || cmErr || oErr || nErr) {
    return new Response('Internal Server Error', { status: 500 })
  }

  const chains = chainsRaw as ChainRow | null
  const chainName = chains?.name ?? chain
  const chainMappings = (chainMappingsRaw ?? []) as ChainMappingRow[]

  const overrideMap = new Map<string, number>()
  for (const overrideRow of (overrideRows ?? []) as ChainLoadingOverrideRow[]) {
    overrideMap.set(overrideRow.sub_item_id, overrideRow.qty_override)
  }

  const noteMap = new Map<string, string>()
  for (const noteRow of (noteRows ?? []) as ChainLoadingNoteRow[]) {
    noteMap.set(`${noteRow.item_type}::${noteRow.item_id}`, noteRow.note)
  }
  const chainNote = noteMap.get(`chain::${chain}`) ?? ''

  const rows = calculatePackingList(
    bookings as BookingRow[],
    bookingItems as BookingItemRow[],
    equipment as EquipmentRow[],
    subItems as SubItemRow[],
    subItemLinks as SubItemLinkRow[],
    chain,
    date
  )

  const parentItems = rows.filter(row => !row.isSubItem)
  const subItemsByParent = new Map<string, typeof rows[number][]>()
  for (const row of rows.filter(row => row.isSubItem)) {
    const key = row.parentItemId ?? ''
    const list = subItemsByParent.get(key) ?? []
    list.push(row)
    subItemsByParent.set(key, list)
  }

  const { isBookingActiveOnDate } = await import('@/lib/utils/availability')
  const chainBookings = (bookings as BookingRow[])
    .filter(b => b.chain === chain && isBookingActiveOnDate(b, date))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const staffHeaders = chainMappings
    .map(mapping => mapping.zenbooker_staff_name)
    .filter(Boolean) as string[]

  const eventHeaders = chainBookings.map((booking, index) =>
    staffHeaders[index] ?? `${fmt12(booking.start_time)} - ${fmt12(booking.end_time)}`
  )

  const bookingQtyByBooking = new Map<string, Map<string, number>>()
  for (const item of bookingItems as BookingItemRow[]) {
    if (item.is_sub_item) continue
    const bookingMap = bookingQtyByBooking.get(item.booking_id) ?? new Map<string, number>()
    bookingMap.set(item.item_id, (bookingMap.get(item.item_id) ?? 0) + item.qty)
    bookingQtyByBooking.set(item.booking_id, bookingMap)
  }

  const subItemLinksBySub = new Map<string, SubItemLinkRow>()
  for (const link of subItemLinks as SubItemLinkRow[]) {
    subItemLinksBySub.set(link.sub_item_id, link)
  }

  const eventQtyForParent = (bookingId: string, itemId: string) => {
    return bookingQtyByBooking.get(bookingId)?.get(itemId) ?? 0
  }

  const eventQtyForSubItem = (bookingId: string, subItemId: string, parentItemId: string | null) => {
    if (!parentItemId) return 0
    const parentQty = eventQtyForParent(bookingId, parentItemId)
    const parentName = (equipment as EquipmentRow[]).find(e => e.id === parentItemId)?.name ?? ''
    const link = subItemLinksBySub.get(subItemId)
    if (!link) return 0
    return getEffectiveParentQty(parentName, parentQty) * link.loadout_qty
  }

  const equipmentTableRows = parentItems
    .map(parent => {
      const parentNote = noteMap.get(`equipment::${parent.itemId}`)
      const parentRow = `<tr>
        <td><strong>${escapeHtml(parent.name)}</strong>${parentNote ? `<div class="note">${escapeHtml(parentNote)}</div>` : ''}</td>
        <td>${parent.qty}</td>
        ${chainBookings.map(booking => `<td>${escapeHtml(String(eventQtyForParent(booking.id, parent.itemId) || ''))}</td>`).join('')}
      </tr>`
      const childRows = (subItemsByParent.get(parent.itemId) ?? [])
        .map(child => {
          const overrideQty = overrideMap.get(child.itemId) ?? child.qty
          const childNote = noteMap.get(`sub_item::${child.itemId}`)
          return `<tr>
            <td style="padding-left: 24px">${escapeHtml(child.name)}${childNote ? `<div class="note">${escapeHtml(childNote)}</div>` : ''}</td>
            <td>${overrideQty}</td>
            ${chainBookings.map(booking => `<td>${escapeHtml(String(eventQtyForSubItem(booking.id, child.itemId, child.parentItemId) || ''))}</td>`).join('')}
          </tr>`
        })
        .join('')
      return parentRow + childRows
    })
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(chainName)} Packing List — ${escapeHtml(date)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
    .header-left { font-size: 24px; font-weight: bold; }
    .header-right { font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; font-size: 12px; }
    th, td { border: 1px solid #000; padding: 8px; vertical-align: top; }
    th { background: #f0f0f0; }
    .note { margin-top: 4px; font-size: 11px; color: #333; }
    .section-label { font-size: 12px; font-weight: bold; margin-top: 24px; margin-bottom: 8px; }
    .additional-details { white-space: pre-wrap; font-size: 12px; line-height: 1.4; }
    .signature-label { margin-top: 32px; font-size: 12px; }
    .signature-line { display: block; margin-top: 24px; width: 320px; border-top: 1px solid #000; padding-top: 8px; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header-row">
    <div class="header-left">${escapeHtml(chainName)}</div>
    <div class="header-right">${escapeHtml(formattedDate)}</div>
  </div>

  <div class="section-label">Equipment</div>
  ${parentItems.length > 0 ? `<table><thead><tr><th>Item</th><th>Total</th>${chainBookings.map(() => '<th>Event</th>').join('')}</tr></thead><tbody>${equipmentTableRows}</tbody></table>` : '<p>No equipment items available for this date.</p>'}

  ${chainNote ? `<div class="section-label">Notes</div><div class="additional-details">${escapeHtml(chainNote)}</div>` : ''}

  <div class="signature-label">I confirm all equipment and supplies above have been loaded with the correct quantities and are in working condition:</div>
  <span class="signature-line">Driver Signature</span>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function fmt12(t: string | null | undefined): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getEffectiveParentQty(itemName: string, qty: number): number {
  if (qty <= 0) return 0
  const slug = itemName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const tier1 = new Set(['bubble_ball', 'elite_laser_tag', 'arrow_tag'])
  const tier2 = new Set(['gel_tag', 'laser_tag_lite'])
  if (tier1.has(slug)) return Math.max(1, Math.floor(qty / 10))
  if (tier2.has(slug)) return Math.max(1, Math.floor(qty / 20))
  return qty
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

