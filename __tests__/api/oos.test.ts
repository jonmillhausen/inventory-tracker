/**
 * @jest-environment node
 *
 * OOS insert-pattern tests (audit P0-7): marking N units out of service
 * creates exactly ONE equipment_oos row with quantity N. The previous
 * sub-item route inserted N rows then called .single(), returning a 500
 * for any quantity > 1 AFTER the rows were inserted.
 */
import { POST as subItemOosPost } from '@/app/api/equipment/sub-items/[subId]/oos/route'
import { POST as equipmentOosPost } from '@/app/api/equipment/[id]/oos/route'
import { getSessionAndRole } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/api/auth', () => ({
  getSessionAndRole: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

function installMocks() {
  const inserts: unknown[] = []
  const client = {
    from: jest.fn(() => {
      const chain = {
        insert(row: unknown) {
          inserts.push(row)
          return chain
        },
        select: () => chain,
        single: () => Promise.resolve({ data: { id: 'oos-1' }, error: null }),
      }
      return chain
    }),
  }
  ;(getSessionAndRole as jest.Mock).mockResolvedValue({ role: 'admin' })
  ;(createClient as jest.Mock).mockResolvedValue(client)
  return { inserts }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/oos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => jest.clearAllMocks())

describe('sub-item OOS POST — single row with quantity N (P0-7)', () => {
  it('quantity 3 → 201 and exactly one row with quantity 3', async () => {
    const { inserts } = installMocks()
    const res = await subItemOosPost(makeRequest({ quantity: 3 }), {
      params: Promise.resolve({ subId: 'goal_set' }),
    })
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ sub_item_id: 'goal_set', quantity: 3 })
  })

  it('rejects non-integer and sub-1 quantities', async () => {
    const { inserts } = installMocks()
    for (const quantity of [0, -1, 1.5]) {
      const res = await subItemOosPost(makeRequest({ quantity }), {
        params: Promise.resolve({ subId: 'goal_set' }),
      })
      expect(res.status).toBe(400)
    }
    expect(inserts).toHaveLength(0)
  })
})

describe('equipment OOS POST — single row with quantity N (P0-7)', () => {
  it('quantity 5 → 201 and exactly one row with quantity 5', async () => {
    const { inserts } = installMocks()
    const res = await equipmentOosPost(makeRequest({ quantity: 5 }), {
      params: Promise.resolve({ id: 'arrow_tag' }),
    })
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ equipment_id: 'arrow_tag', quantity: 5 })
  })
})
