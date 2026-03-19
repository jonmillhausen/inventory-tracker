import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

export interface ZenbookerService {
  service_id: string
  service_name: string
  qty?: number
  modifier?: {
    modifier_id: string
    modifier_name: string
  }
}

// Zenbooker webhook v3 (2025-09-01) payload shape.
// Top-level: event name + optional timestamp.
// All job data is nested under `data`.
export interface ZenbookerPayload {
  event: string
  timestamp?: number
  data: {
    id: string
    customer_name?: string
    address?: string
    date?: string
    end_date?: string
    time_slot?: {
      start_time?: string | null
      end_time?: string | null
    }
    assigned_staff?: Array<{ staff_id: string; staff_name: string }>
    services?: ZenbookerService[]
  }
}

export interface ResolvedItem {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export interface NameFallback {
  optionName: string
  equipmentId: string
}

export interface WebhookResolution {
  chainId: string | null
  resolvedItems: ResolvedItem[]
  unmappedNames: string[]
  nameFallbacks: NameFallback[]
}

/**
 * Strip parentheticals and extra whitespace, then lowercase.
 * "Bounce House (15x15)" → "bounce house"
 */
function normalizeForMatch(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Pure function — no DB calls.
 * Takes payload fields + current mapping tables + equipment list;
 * returns resolved items, chain, unmapped names, and name-fallback matches.
 */
export function resolveWebhookItems(
  services: ZenbookerService[],
  assignedStaff: Array<{ staff_id: string; staff_name: string }>,
  serviceMappings: ServiceMappingRow[],
  chainMappings: ChainMappingRow[],
  equipment: Array<{ id: string; name: string }> = [],
): WebhookResolution {
  // Resolve chain: first staff member with a mapping wins
  let chainId: string | null = null
  for (const staff of assignedStaff) {
    const cm = chainMappings.find(m => m.zenbooker_staff_id === staff.staff_id)
    if (cm) { chainId = cm.chain_id; break }
  }

  // Build a normalized lookup map for equipment names
  const equipmentByNormalizedName = new Map<string, string>()
  for (const eq of equipment) {
    equipmentByNormalizedName.set(normalizeForMatch(eq.name), eq.id)
  }

  const resolvedItems: ResolvedItem[] = []
  const unmappedNames: string[] = []
  const nameFallbacks: NameFallback[] = []

  for (const svc of services) {
    const modId = svc.modifier?.modifier_id ?? null
    const sm = serviceMappings.find(m =>
      m.zenbooker_service_id === svc.service_id &&
      (modId === null ? m.zenbooker_modifier_id === null : m.zenbooker_modifier_id === modId)
    )

    if (sm) {
      const qty = sm.use_customer_qty ? (svc.qty ?? sm.default_qty) : sm.default_qty
      resolvedItems.push({ item_id: sm.item_id, qty, is_sub_item: false, parent_item_id: null })
      continue
    }

    // No exact mapping — try name fallback
    const optionName = svc.modifier
      ? `${svc.service_name} / ${svc.modifier.modifier_name}`
      : svc.service_name

    const normalizedOption = normalizeForMatch(optionName)
    const equipmentId = equipmentByNormalizedName.get(normalizedOption)

    if (equipmentId) {
      resolvedItems.push({ item_id: equipmentId, qty: 1, is_sub_item: false, parent_item_id: null })
      nameFallbacks.push({ optionName, equipmentId })
    } else {
      unmappedNames.push(optionName)
    }
  }

  return { chainId, resolvedItems, unmappedNames, nameFallbacks }
}
