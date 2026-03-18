import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSessionAndRole } from '@/lib/api/auth'

export async function POST(request: Request) {
  const auth = await getSessionAndRole(['admin', 'sales', 'staff', 'readonly'])
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { chain, date, end_date } = body as { chain?: string; date?: string; end_date?: string | null }

  if (!chain || !date) {
    return NextResponse.json({ error: 'chain and date are required' }, { status: 400 })
  }

  // end_date defaults to date (for single-day events)
  const effectiveEndDate = end_date || date

  // HMAC signs chain + event_date + end_date per spec
  const token = createHmac('sha256', process.env.PACKING_LIST_SECRET || '')
    .update(`${chain}:${date}:${effectiveEndDate}`)
    .digest('hex')

  // end_date included in URL so print route can reconstruct HMAC and validate window
  const url = `/api/packing-list/${token}/${encodeURIComponent(chain)}/${date}?end_date=${effectiveEndDate}`

  return NextResponse.json({ url })
}
