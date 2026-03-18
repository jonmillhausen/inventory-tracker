import { resolveWebhookItems } from '@/lib/utils/webhookProcessor'
import type { ZenbookerService } from '@/lib/utils/webhookProcessor'

const makeServiceMapping = (overrides = {}) => ({
  id: 'sm1',
  zenbooker_service_id: 'svc1',
  zenbooker_service_name: 'Foam Party',
  zenbooker_modifier_id: null,
  zenbooker_modifier_name: null,
  item_id: 'foam_machine',
  default_qty: 1,
  use_customer_qty: false,
  notes: '',
  ...overrides,
})

const makeChainMapping = (overrides = {}) => ({
  id: 'cm1',
  zenbooker_staff_id: 'staff1',
  zenbooker_staff_name: 'Alice',
  chain_id: 'chain_1',
  notes: '',
  ...overrides,
})

describe('resolveWebhookItems', () => {
  it('returns empty resolution for no services and no staff', () => {
    const result = resolveWebhookItems([], [], [], [])
    expect(result).toEqual({ chainId: null, resolvedItems: [], unmappedNames: [] })
  })

  it('resolves a standalone service with default_qty', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toEqual([{ item_id: 'foam_machine', qty: 1, is_sub_item: false, parent_item_id: null }])
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('uses customer qty when use_customer_qty = true', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party', qty: 3 }
    const sm = makeServiceMapping({ use_customer_qty: true, default_qty: 1 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(3)
  })

  it('falls back to default_qty when use_customer_qty = true but qty not in payload', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party' }
    const sm = makeServiceMapping({ use_customer_qty: true, default_qty: 2 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(2)
  })

  it('adds unmapped service name when no mapping found', () => {
    const svc: ZenbookerService = { service_id: 'unknown', service_name: 'Mystery Service' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toHaveLength(0)
    expect(result.unmappedNames).toEqual(['Mystery Service'])
  })

  it('resolves a bundle service with modifier', () => {
    const svc: ZenbookerService = {
      service_id: 'svc2',
      service_name: 'Game Bundle',
      modifier: { modifier_id: 'mod1', modifier_name: 'Laser Tag' },
    }
    const sm = makeServiceMapping({
      id: 'sm2',
      zenbooker_service_id: 'svc2',
      zenbooker_modifier_id: 'mod1',
      zenbooker_modifier_name: 'Laser Tag',
      item_id: 'laser_tag',
    })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].item_id).toBe('laser_tag')
  })

  it('does not match modifier row for standalone service (modifier_id = null vs non-null)', () => {
    const svc: ZenbookerService = { service_id: 'svc2', service_name: 'Game Bundle' }
    const sm = makeServiceMapping({
      zenbooker_service_id: 'svc2',
      zenbooker_modifier_id: 'mod1',
    })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.unmappedNames).toEqual(['Game Bundle'])
  })

  it('resolves chain from assigned staff', () => {
    const result = resolveWebhookItems(
      [],
      [{ staff_id: 'staff1', staff_name: 'Alice' }],
      [],
      [makeChainMapping()]
    )
    expect(result.chainId).toBe('chain_1')
  })

  it('returns chainId = null when staff not in chain_mappings', () => {
    const result = resolveWebhookItems(
      [],
      [{ staff_id: 'unknown_staff', staff_name: 'Bob' }],
      [],
      [makeChainMapping()]
    )
    expect(result.chainId).toBeNull()
  })
})
