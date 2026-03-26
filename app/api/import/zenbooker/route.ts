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
  console.log('[import] ZENBOOKER_API_KEY defined:', !!apiKey, 'length:', apiKey?.length ?? 0)
  if (!apiKey) {
    return NextResponse.json({ error: 'ZENBOOKER_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')

  // Fetch one page from Zenbooker
  const zbUrl = new URL('https://api.zenbooker.com/v1/jobs')
  if (cursor) zbUrl.searchParams.set('cursor', cursor)

  console.log('[import] Fetching:', zbUrl.toString())

  // ── DEBUG MODE: return raw API response for inspection ──────────────────
  // Remove this block once the correct response shape is confirmed.
  let rawText: string
  let httpStatus: number
  try {
    const res = await fetch(zbUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Zenbooker-Version': '2025-09-01',
      },
    })
    httpStatus = res.status
    console.log('[import] HTTP status:', res.status, res.statusText)
    rawText = await res.text()
    console.log('[import] rawText length:', rawText.length)
    console.log('[import] rawText preview:', rawText.slice(0, 500))
  } catch (fetchErr) {
    return NextResponse.json({ debug_error: `fetch threw: ${String(fetchErr)}` }, { status: 502 })
  }

  // Return raw response directly so it's visible in the browser (not just Vercel logs)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    return NextResponse.json({
      debug_http_status: httpStatus,
      debug_raw_response: rawText.slice(0, 2000),
      debug_parse_error: 'Response is not valid JSON',
    })
  }

  return NextResponse.json({
    debug_http_status: httpStatus,
    debug_top_level_keys: Object.keys(parsed),
    debug_raw_preview: rawText.slice(0, 2000),
    debug_array_lengths: Object.fromEntries(
      Object.entries(parsed)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, (v as unknown[]).length])
    ),
  })
}
