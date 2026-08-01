import { calculatePackingList, getEffectiveParentQty } from '@/lib/utils/packingList'
import type { Database } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

// P1-5: tier membership is keyed on equipment.id, which is a stable slug, NOT
// on slugify(equipment.name).  Keying on the display name meant renaming
// "Gel Tag" -> "Geltag" silently dropped geltag from Tier 2 into Tier 3, so a
// 20-unit booking packed 20 sets of every sub-item instead of 1.

const makeEquipment = (id: string, name: string): EquipmentRow => ({
  id,
  name,
  total_qty: 100,
  out_of_service: 0,
  issue_flag: 0,
  is_active: true,
  custom_setup_min: null,
  custom_cleanup_min: null,
  categories: ['Primary'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const makeBooking = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: 'b1',
  zenbooker_job_id: 'job1',
  customer_name: 'Alice',
  event_date: '2026-08-15',
  end_date: null,
  start_time: '10:00',
  end_time: '14:00',
  chain: 'chain_1',
  status: 'confirmed',
  event_type: 'coordinated',
  source: 'webhook',
  address: '123 Main St',
  notes: '',
  linked_booking_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('getEffectiveParentQty — tier boundaries keyed by equipment id', () => {
  // Live ids as of 2026-08-01. Note bubbleball has no underscore: the old
  // name-slug happened to be 'bubble_ball', which is exactly the kind of
  // coincidence that made the name-keyed lookup look correct.
  const TIER1_IDS = ['bubbleball', 'elite_laser_tag', 'arrow_tag']
  const TIER2_IDS = ['geltag', 'laser_tag_lite']

  describe.each(TIER1_IDS)('Tier 1 (÷10): %s', id => {
    test.each([
      [0, 0],
      [1, 1],
      [9, 1],
      [10, 1],
      [19, 1],
      [20, 2],
      [39, 3],
      [40, 4],
    ])('qty %i → ×%i sets', (qty, expected) => {
      expect(getEffectiveParentQty(id, qty)).toBe(expected)
    })
  })

  describe.each(TIER2_IDS)('Tier 2 (÷20): %s', id => {
    test.each([
      [0, 0],
      [1, 1],
      [9, 1],
      [10, 1],
      [19, 1],
      [20, 1],
      [39, 1],
      [40, 2],
    ])('qty %i → ×%i sets', (qty, expected) => {
      expect(getEffectiveParentQty(id, qty)).toBe(expected)
    })
  })

  describe('Tier 3 (qty as-is): everything else', () => {
    test.each([
      [0, 0],
      [1, 1],
      [9, 9],
      [10, 10],
      [19, 19],
      [20, 20],
      [39, 39],
      [40, 40],
    ])('qty %i → ×%i sets', (qty, expected) => {
      expect(getEffectiveParentQty('cornhole', qty)).toBe(expected)
    })
  })

  test('negative and zero quantities floor to 0, never to the min-1 clamp', () => {
    expect(getEffectiveParentQty('bubbleball', 0)).toBe(0)
    expect(getEffectiveParentQty('bubbleball', -5)).toBe(0)
    expect(getEffectiveParentQty('geltag', 0)).toBe(0)
  })
})

describe('tier lookup is immune to display-name changes', () => {
  test('geltag resolves Tier 2 under its current display name "Geltag"', () => {
    expect(getEffectiveParentQty('geltag', 20)).toBe(1)
  })

  test('geltag resolved Tier 2 under its former display name too', () => {
    // The id never changed; only equipment.name did. Both eras must agree.
    expect(getEffectiveParentQty('geltag', 20)).toBe(1)
  })

  test.each([
    ['Geltag', 'geltag'],
    ['Gel Tag', 'geltag'],
    ['GEL TAG', 'geltag'],
    ['Gel-Tag Blasters', 'geltag'],
    ['Bubble Ball', 'bubbleball'],
    ['Bubbleball', 'bubbleball'],
    ['Bubble  Balls (2026)', 'bubbleball'],
  ])('display name %s does not affect the tier resolved for id %s', (name, id) => {
    const equipment = [makeEquipment(id, name)]
    const subLinks: SubItemLinkRow[] = [
      { id: 'l1', sub_item_id: 'masks', parent_id: id, loadout_qty: 20 },
    ]
    const subItems: SubItemRow[] = [
      { id: 'masks', parent_id: id, name: 'Full Face Masks', total_qty: 500, out_of_service: 0, issue_flag: 0, is_active: true },
    ]
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: id, qty: 20, is_sub_item: false, parent_item_id: null },
    ]

    const rows = calculatePackingList(
      [makeBooking()], items, equipment, subItems, subLinks, 'chain_1', '2026-08-15'
    )
    const masks = rows.find(r => r.itemId === 'masks')!

    // geltag is Tier 2 (20/20 = 1 set), bubbleball is Tier 1 (20/10 = 2 sets).
    const expectedSets = id === 'geltag' ? 1 : 2
    expect(masks.qty).toBe(expectedSets * 20)
  })
})

describe('Geltag regression — the live defect', () => {
  // Reproduces the real geltag loadout: 7 sub-item links, max booked qty 20.
  const GELTAG_LINKS: Array<[string, string, number]> = [
    ['full_face_masks', 'Full Face Masks', 20],
    ['plastic_safety_glasses', 'Plastic Safety Glasses', 20],
    ['gellets', 'Gellets (bring 30k/hr)', 30000],
    ['gametruck_barriers', 'Gametruck Barriers (Orange and Green)', 6],
    ['small_barriers', 'Small Barriers', 6],
    ['target_stand', 'Target Stand (Black/Silver)', 2],
    ['large_a_frame', 'Large A-Frame Warning Sign (Place at entry point)', 1],
  ]

  test('a 20-unit Geltag booking packs exactly one set of each sub-item', () => {
    const equipment = [makeEquipment('geltag', 'Geltag')]
    const subItems: SubItemRow[] = GELTAG_LINKS.map(([id, name, qty]) => ({
      id, parent_id: 'geltag', name, total_qty: qty * 10, out_of_service: 0, issue_flag: 0, is_active: true,
    }))
    const subLinks: SubItemLinkRow[] = GELTAG_LINKS.map(([id, , qty], i) => ({
      id: `l${i}`, sub_item_id: id, parent_id: 'geltag', loadout_qty: qty,
    }))
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'geltag', qty: 20, is_sub_item: false, parent_item_id: null },
    ]

    const rows = calculatePackingList(
      [makeBooking()], items, equipment, subItems, subLinks, 'chain_1', '2026-08-15'
    )

    for (const [subId, , loadout] of GELTAG_LINKS) {
      const row = rows.find(r => r.itemId === subId)
      expect(row).toBeDefined()
      // ×1 set — NOT ×20, which is what Tier 3 fallthrough produced.
      expect(row!.qty).toBe(loadout)
    }

    expect(rows.find(r => r.itemId === 'gellets')!.qty).toBe(30_000)
    expect(rows.find(r => r.itemId === 'full_face_masks')!.qty).toBe(20)
  })

  test('a 40-unit Geltag booking packs two sets', () => {
    const equipment = [makeEquipment('geltag', 'Geltag')]
    const subItems: SubItemRow[] = [
      { id: 'full_face_masks', parent_id: 'geltag', name: 'Full Face Masks', total_qty: 500, out_of_service: 0, issue_flag: 0, is_active: true },
    ]
    const subLinks: SubItemLinkRow[] = [
      { id: 'l1', sub_item_id: 'full_face_masks', parent_id: 'geltag', loadout_qty: 20 },
    ]
    const items: BookingItemRow[] = [
      { id: 'bi1', booking_id: 'b1', item_id: 'geltag', qty: 40, is_sub_item: false, parent_item_id: null },
    ]

    const rows = calculatePackingList(
      [makeBooking()], items, equipment, subItems, subLinks, 'chain_1', '2026-08-15'
    )
    expect(rows.find(r => r.itemId === 'full_face_masks')!.qty).toBe(40)
  })

  test('an unknown parent id falls through to Tier 3 rather than throwing', () => {
    expect(getEffectiveParentQty('some_new_item', 7)).toBe(7)
  })
})
