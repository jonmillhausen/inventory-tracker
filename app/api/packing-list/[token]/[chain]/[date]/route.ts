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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; chain: string; date: string }> }
) {
  const { token, chain: encodedChain, date } = await params
  const chain = decodeURIComponent(encodedChain)

  // end_date from query string (set by token generation route); defaults to date for single-day events
  const { searchParams } = new URL(request.url)
  const end_date = searchParams.get('end_date') || date

  // Validate HMAC token (must match the formula used in token generation)
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

  // Validity window check: valid from (event_date - 1 day) through (end_date + 1 day)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const windowStart = new Date(date + 'T00:00:00Z')
  windowStart.setUTCDate(windowStart.getUTCDate() - 1)
  const windowEnd = new Date(end_date + 'T00:00:00Z')
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1)

  if (today < windowStart || today > windowEnd) {
    return new Response('Forbidden', { status: 403 })
  }

  // Service role client bypasses RLS — this route is unauthenticated (token-gated)
  const supabase = createServiceRoleClient()

  // Fetch all data needed for packing list
  const [
    { data: bookings, error: bErr },
    { data: bookingItems, error: biErr },
    { data: equipment, error: eErr },
    { data: subItems, error: sErr },
    { data: subItemLinks, error: slErr },
    { data: chainsRaw, error: cErr },
  ] = await Promise.all([
    supabase.from('bookings').select('*'),
    supabase.from('booking_items').select('*'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_items').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_item_links').select('*'),
    supabase.from('chains').select('*').eq('id', chain).single(),
  ])
  const chains = chainsRaw as ChainRow | null

  if (bErr || biErr || eErr || sErr || slErr) {
    return new Response('Internal Server Error', { status: 500 })
  }

  const chainName = cErr || !chains ? chain : chains.name

  const rows = calculatePackingList(
    bookings as BookingRow[],
    bookingItems as BookingItemRow[],
    equipment as EquipmentRow[],
    subItems as SubItemRow[],
    subItemLinks as SubItemLinkRow[],
    chain,
    date
  )

  const parentItems = rows.filter(r => !r.isSubItem)
  const subItemRows = rows.filter(r => r.isSubItem)

  // Get the chain bookings active on this date (for the events table)
  const { isBookingActiveOnDate } = await import('@/lib/utils/availability')
  const chainBookings = (bookings as BookingRow[])
    .filter(b => b.chain === chain && isBookingActiveOnDate(b, date))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

  // Format date for display
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Build equipment table rows with sub-items grouped under parents
  const subItemsByParent = new Map<string, typeof subItemRows[number][]>()
  for (const si of subItemRows) {
    const list = subItemsByParent.get(si.parentItemId ?? '') ?? []
    list.push(si)
    subItemsByParent.set(si.parentItemId ?? '', list)
  }

  const equipmentTableRows = parentItems
    .map(item => {
      const childRows = (subItemsByParent.get(item.itemId) ?? [])
        .map(si => `<tr style="background:#f9f9f9"><td class="check"></td><td style="padding-left:24px"><em>${escapeHtml(si.name)}</em></td><td>${si.qty}</td></tr>`)
        .join('\n')
      return `<tr><td class="check"></td><td>${escapeHtml(item.name)}</td><td>${item.qty}</td></tr>\n${childRows}`
    })
    .join('\n')

  const eventTableRows = chainBookings
    .map(b => `<tr><td>${escapeHtml(b.customer_name)}</td><td>${escapeHtml(b.start_time ?? '')}–${escapeHtml(b.end_time ?? '')}</td><td>${escapeHtml(b.event_type)}</td><td>${escapeHtml(b.address)}</td></tr>`)
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(chainName)} Packing List — ${escapeHtml(date)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    h1, h2 { margin-bottom: 8px; }
    .check { width: 24px; text-align: center; }
    @media print {
      body { padding: 10px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(chainName)} Packing List</h1>
  <p>${escapeHtml(formattedDate)}</p>

  <h2>Equipment</h2>
  ${parentItems.length > 0
    ? `<table>
    <tr><th class="check">✓</th><th>Equipment</th><th>Qty</th></tr>
    ${equipmentTableRows}
  </table>`
    : '<p>No equipment for this chain on this date.</p>'}

  <h2>Events (${chainBookings.length})</h2>
  ${chainBookings.length > 0
    ? `<table>
    <tr><th>Customer</th><th>Time</th><th>Type</th><th>Address</th></tr>
    ${eventTableRows}
  </table>`
    : '<p>No events for this chain on this date.</p>'}
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
