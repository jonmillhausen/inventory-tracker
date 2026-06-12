/**
 * @jest-environment node
 *
 * Route-level tests for app/api/webhooks/zenbooker/route.ts with a mocked
 * Supabase service-role client. Added by audit P0-2/P0-3/P0-1
 * (docs/superpowers/audit-2026-06.md §3).
 */
import { POST } from '@/app/api/webhooks/zenbooker/route'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

jest.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: jest.fn(),
}))

type Resp = { data: unknown; error: { message: string } | null }

interface MockConfig {
  serviceMappings?: Resp
  chainMappings?: Resp
  equipment?: Resp
  bookingUpsert?: Resp
  bookingLookup?: Resp
  rpc?: Resp
  logInsert?: Resp
}

interface MockCalls {
  rpc: Array<{ name: string; args: Record<string, unknown> }>
  upserts: Array<{ table: string; row: Record<string, unknown> }>
  logUpdates: Array<Record<string, unknown>>
  inserts: Array<{ table: string; row: unknown }>
}

const DEFAULT_SERVICE_MAPPING = {
  id: 'sm1',
  zenbooker_service_id: 'svc1',
  zenbooker_service_name: 'Foam Party',
  zenbooker_modifier_id: null,
  zenbooker_modifier_name: null,
  item_id: 'foam_machine',
  default_qty: 1,
  use_customer_qty: false,
  is_skip: false,
  notes: '',
}

function makeMockClient(config: MockConfig = {}) {
  const calls: MockCalls = { rpc: [], upserts: [], logUpdates: [], inserts: [] }

  function makeTable(table: string) {
    let op = 'select'
    const chain: Record<string, unknown> & PromiseLike<Resp> = {
      insert(row: unknown) {
        op = 'insert'
        calls.inserts.push({ table, row })
        return chain
      },
      upsert(row: Record<string, unknown>) {
        op = 'upsert'
        calls.upserts.push({ table, row })
        return chain
      },
      update(row: Record<string, unknown>) {
        op = 'update'
        if (table === 'webhook_logs') calls.logUpdates.push(row)
        return chain
      },
      delete() {
        op = 'delete'
        return chain
      },
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      single: () => chain,
      then<T>(resolve?: (v: Resp) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(respond()).then(resolve, reject)
      },
    } as never

    function respond(): Resp {
      if (table === 'webhook_logs' && op === 'insert') {
        return config.logInsert ?? { data: { id: 'log-1' }, error: null }
      }
      if (table === 'webhook_logs') return { data: null, error: null }
      if (table === 'service_mappings') {
        return config.serviceMappings ?? { data: [DEFAULT_SERVICE_MAPPING], error: null }
      }
      if (table === 'chain_mappings') return config.chainMappings ?? { data: [], error: null }
      if (table === 'equipment') return config.equipment ?? { data: [], error: null }
      if (table === 'bookings' && op === 'upsert') {
        return config.bookingUpsert ?? { data: { id: 'booking-1' }, error: null }
      }
      if (table === 'bookings') return config.bookingLookup ?? { data: { id: 'booking-1' }, error: null }
      return { data: null, error: null }
    }

    return chain
  }

  const client = {
    from: jest.fn((table: string) => makeTable(table)),
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args })
      return Promise.resolve(config.rpc ?? { data: 0, error: null })
    }),
  }

  return { client, calls }
}

function installClient(config: MockConfig = {}) {
  const { client, calls } = makeMockClient(config)
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(client)
  return { client, calls }
}

function v3Payload(overrides: Record<string, unknown> = {}, dataOverrides: Record<string, unknown> = {}) {
  return {
    event: 'job.created',
    data: {
      id: 'job-123',
      customer: { name: 'Test Customer' },
      service_address: { formatted: '1 Main St, Arbutus, MD 21227' },
      start_date: '2026-06-15T14:00:00.000Z',
      timezone: 'America/New_York',
      time_slot: { start_time: '10:00', end_time: '12:00' },
      assigned_providers: [],
      services: [
        {
          service_id: 'svc1',
          service_name: 'Foam Party',
        },
      ],
      ...dataOverrides,
    },
    ...overrides,
  }
}

function makeRequest(payload: unknown, secret = 'test-secret') {
  return new Request(`http://localhost/api/webhooks/zenbooker?secret=${secret}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  process.env.ZENBOOKER_WEBHOOK_SECRET = 'test-secret'
  jest.clearAllMocks()
})

describe('POST /api/webhooks/zenbooker — P0-2 checked + atomic writes', () => {
  it('job.created success path replaces items via replace_booking_items RPC', async () => {
    const { calls } = installClient()
    const res = await POST(makeRequest(v3Payload()))
    expect(res.status).toBe(200)
    expect(calls.rpc).toHaveLength(1)
    expect(calls.rpc[0].name).toBe('replace_booking_items')
    expect(calls.rpc[0].args).toEqual({
      p_booking_id: 'booking-1',
      p_items: [{ item_id: 'foam_machine', qty: 1, is_sub_item: false, parent_item_id: null }],
    })
    const lastLog = calls.logUpdates[calls.logUpdates.length - 1]
    expect(lastLog.result).toBe('success')
  })

  it('failed items replace → result=error, 500', async () => {
    const { calls } = installClient({ rpc: { data: null, error: { message: 'insert blew up' } } })
    const res = await POST(makeRequest(v3Payload()))
    expect(res.status).toBe(500)
    const lastLog = calls.logUpdates[calls.logUpdates.length - 1]
    expect(lastLog.result).toBe('error')
    expect(String(lastLog.result_detail)).toContain('booking_items replace failed')
    expect(String(lastLog.result_detail)).toContain('insert blew up')
  })

  it('failed mappings fetch → 500, no booking upsert', async () => {
    const { calls } = installClient({
      serviceMappings: { data: null, error: { message: 'fetch broke' } },
    })
    const res = await POST(makeRequest(v3Payload()))
    expect(res.status).toBe(500)
    expect(calls.upserts).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
    const lastLog = calls.logUpdates[calls.logUpdates.length - 1]
    expect(lastLog.result).toBe('error')
    expect(String(lastLog.result_detail)).toContain('mapping fetch failed')
  })

  it('empty service_mappings table → refuses to process, 500', async () => {
    const { calls } = installClient({ serviceMappings: { data: [], error: null } })
    const res = await POST(makeRequest(v3Payload()))
    expect(res.status).toBe(500)
    expect(calls.upserts).toHaveLength(0)
    const lastLog = calls.logUpdates[calls.logUpdates.length - 1]
    expect(lastLog.result).toBe('error')
    expect(String(lastLog.result_detail)).toContain('refusing to process')
  })

  it('duplicate delivery → replace semantics keep items idempotent', async () => {
    const { calls } = installClient()
    const res1 = await POST(makeRequest(v3Payload()))
    const res2 = await POST(makeRequest(v3Payload()))
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // Both deliveries go through the atomic replace with identical items —
    // the second delivery overwrites rather than appends.
    expect(calls.rpc).toHaveLength(2)
    expect(calls.rpc[0].args).toEqual(calls.rpc[1].args)
  })

  it('failed items replace on job.service_order.edited → result=error, 500', async () => {
    const { calls } = installClient({ rpc: { data: null, error: { message: 'edited boom' } } })
    const res = await POST(makeRequest(v3Payload({ event: 'job.service_order.edited' })))
    expect(res.status).toBe(500)
    const lastLog = calls.logUpdates[calls.logUpdates.length - 1]
    expect(lastLog.result).toBe('error')
    expect(String(lastLog.result_detail)).toContain('edited boom')
  })

  it('rejects wrong secret with 401 and writes no log', async () => {
    const { calls } = installClient()
    const res = await POST(makeRequest(v3Payload(), 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(calls.inserts).toHaveLength(0)
  })
})
