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

// Helper: wrap options into a v3 service_selections shape
const withOptions = (options: Array<{ id: string; text: string; quantity?: number; price?: number }>) => ({
  service_selections: [{ selected_options: options }],
})

describe('resolveWebhookItems', () => {
  it('returns empty resolution for no services and no staff', () => {
    const result = resolveWebhookItems([], [], [], [])
    expect(result).toEqual({ chainId: null, resolvedItems: [], unmappedNames: [], nameFallbacks: [] })
  })

  it('resolves a standalone service with no options via base mapping', () => {
    const svc: ZenbookerService = { service_id: 'svc1', service_name: 'Foam Party' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toEqual([{ item_id: 'foam_machine', qty: 1, is_sub_item: false, parent_item_id: null }])
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('resolves a service option via modifier-specific mapping', () => {
    const svc: ZenbookerService = {
      service_id: 'svc2',
      service_name: 'Laser Tag',
      ...withOptions([{ id: 'mod1', text: 'Elite Laser Tag', quantity: 1 }]),
    }
    const sm = makeServiceMapping({
      id: 'sm2',
      zenbooker_service_id: 'svc2',
      zenbooker_modifier_id: 'mod1',
      zenbooker_modifier_name: 'Elite Laser Tag',
      item_id: 'elite_laser_tag',
    })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].item_id).toBe('elite_laser_tag')
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('uses option qty when use_customer_qty = true', () => {
    const svc: ZenbookerService = {
      service_id: 'svc1',
      service_name: 'Foam Party',
      ...withOptions([{ id: 'mod1', text: 'Option A', quantity: 3 }]),
    }
    const sm = makeServiceMapping({ zenbooker_modifier_id: 'mod1', use_customer_qty: true, default_qty: 1 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(3)
  })

  it('falls back to default_qty when use_customer_qty = true but option has no qty', () => {
    const svc: ZenbookerService = {
      service_id: 'svc1',
      service_name: 'Foam Party',
      ...withOptions([{ id: 'mod1', text: 'Option A' }]),
    }
    const sm = makeServiceMapping({ zenbooker_modifier_id: 'mod1', use_customer_qty: true, default_qty: 2 })
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems[0].qty).toBe(2)
  })

  it('falls back to base mapping when option has no modifier-specific mapping', () => {
    const svc: ZenbookerService = {
      service_id: 'svc1',
      service_name: 'Foam Party',
      ...withOptions([{ id: 'unknown_mod', text: 'Unknown Add-on', quantity: 1 }]),
    }
    const baseSm = makeServiceMapping() // modifier_id: null
    const result = resolveWebhookItems([svc], [], [baseSm], [])
    expect(result.resolvedItems[0].item_id).toBe('foam_machine')
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('silently skips unmatched options — price is irrelevant, only mappings matter', () => {
    const svc: ZenbookerService = {
      service_id: 'meta_svc',  // no mapping for this service
      service_name: 'Laser Tag',
      ...withOptions([
        { id: 'dur1', text: '4+ Hours', price: 0 },
        { id: 'grp1', text: 'Large Group 26+', price: 75 },
        { id: 'gen1', text: 'Generator (required if no outlet nearby)', price: 25 },
        { id: 'bkm1', text: 'Get a Custom Quote' },
      ]),
    }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toHaveLength(0)
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('adds unmapped service name when no options and no base mapping found', () => {
    const svc: ZenbookerService = { service_id: 'unknown', service_name: 'Mystery Service' }
    const result = resolveWebhookItems([svc], [], [makeServiceMapping()], [])
    expect(result.resolvedItems).toHaveLength(0)
    expect(result.unmappedNames).toEqual(['Mystery Service'])
  })

  it('silently skips an option that does not match any modifier or base mapping', () => {
    const svc: ZenbookerService = {
      service_id: 'svc2',
      service_name: 'Game Bundle',
      ...withOptions([{ id: 'different_mod', text: 'Other Option', price: 25 }]),
    }
    const sm = makeServiceMapping({ zenbooker_service_id: 'svc2', zenbooker_modifier_id: 'mod1' })
    // no base mapping, no modifier match, no equipment name match → silently skipped
    const result = resolveWebhookItems([svc], [], [sm], [])
    expect(result.resolvedItems).toHaveLength(0)
    expect(result.unmappedNames).toHaveLength(0)
  })

  it('resolves multiple options within a single service independently', () => {
    const svc: ZenbookerService = {
      service_id: 'svc1',
      service_name: 'Laser Tag',
      ...withOptions([
        { id: 'opt_elite', text: 'Elite', quantity: 1 },
        { id: 'opt_basic', text: 'Basic', quantity: 2 },
      ]),
    }
    const smElite = makeServiceMapping({ zenbooker_service_id: 'svc1', zenbooker_modifier_id: 'opt_elite', item_id: 'elite_laser_tag', default_qty: 1 })
    const smBasic = makeServiceMapping({ id: 'sm2', zenbooker_service_id: 'svc1', zenbooker_modifier_id: 'opt_basic', item_id: 'basic_laser_tag', default_qty: 1 })
    const result = resolveWebhookItems([svc], [], [smElite, smBasic], [])
    expect(result.resolvedItems).toHaveLength(2)
    expect(result.resolvedItems.map(r => r.item_id)).toEqual(['elite_laser_tag', 'basic_laser_tag'])
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
