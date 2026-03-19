import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// Zenbooker v3 service structure:
// Each service has service_selections[], each selection has selected_options[].
// Each option maps to a modifier/add-on with its own id and qty.
export interface ZenbookerSelectedOption {
  id: string
  text: string      // display label in v3 (was "name" in earlier assumptions)
  quantity?: number // qty in v3 (was "qty" in earlier assumptions)
}

export interface ZenbookerService {
  service_id: string
  service_name: string
  service_selections?: Array<{
    selected_options?: ZenbookerSelectedOption[]
  }>
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
 * Try a name-based fallback against the equipment table.
 * Returns a ResolvedItem + NameFallback on match, or pushes to unmappedNames.
 */
function tryNameFallback(
  label: string,
  equipmentByNormalizedName: Map<string, string>,
  resolvedItems: ResolvedItem[],
  nameFallbacks: NameFallback[],
  unmappedNames: string[],
) {
  const equipmentId = equipmentByNormalizedName.get(normalizeForMatch(label))
  if (equipmentId) {
    resolvedItems.push({ item_id: equipmentId, qty: 1, is_sub_item: false, parent_item_id: null })
    nameFallbacks.push({ optionName: label, equipmentId })
  } else {
    unmappedNames.push(label)
  }
}

/**
 * Pure function — no DB calls.
 *
 * Resolution logic per service (v3 structure):
 *   1. Collect all selected_options across all service_selections.
 *   2. For each option: look up (service_id, option.id) → modifier-specific mapping.
 *   3. If no modifier match: fall back to base mapping (service_id, modifier_id IS NULL).
 *   4. If still no match: try equipment name fallback.
 *   5. If all fail: unmapped.
 *   6. If a service has no options at all: attempt the base mapping directly.
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
    const allOptions = (svc.service_selections ?? [])
      .flatMap(sel => sel.selected_options ?? [])

    // Base mapping: service_id match with no modifier (modifier_id IS NULL)
    const baseMapping = serviceMappings.find(
      m => m.zenbooker_service_id === svc.service_id && m.zenbooker_modifier_id === null
    )

    if (allOptions.length === 0) {
      // No options — use base mapping or name fallback
      if (baseMapping) {
        resolvedItems.push({
          item_id: baseMapping.item_id,
          qty: baseMapping.default_qty,
          is_sub_item: false,
          parent_item_id: null,
        })
      } else {
        tryNameFallback(svc.service_name, equipmentByNormalizedName, resolvedItems, nameFallbacks, unmappedNames)
      }
      continue
    }

    for (const option of allOptions) {
      console.log(`[webhook option] service=${svc.service_id} raw option:`, JSON.stringify(option))

      // 1. Modifier-specific mapping: (service_id, option.id)
      const modifierMapping = serviceMappings.find(
        m => m.zenbooker_service_id === svc.service_id && m.zenbooker_modifier_id === option.id
      )

      if (modifierMapping) {
        const qty = modifierMapping.use_customer_qty
          ? (option.quantity ?? modifierMapping.default_qty)
          : modifierMapping.default_qty
        resolvedItems.push({ item_id: modifierMapping.item_id, qty, is_sub_item: false, parent_item_id: null })
        continue
      }

      // 2. Base mapping fallback: (service_id, modifier_id IS NULL)
      if (baseMapping) {
        const qty = baseMapping.use_customer_qty
          ? (option.quantity ?? baseMapping.default_qty)
          : baseMapping.default_qty
        resolvedItems.push({ item_id: baseMapping.item_id, qty, is_sub_item: false, parent_item_id: null })
        continue
      }

      // 3. Name fallback against equipment table
      const label = `${svc.service_name} / ${option.text}`
      tryNameFallback(label, equipmentByNormalizedName, resolvedItems, nameFallbacks, unmappedNames)
    }
  }

  return { chainId, resolvedItems, unmappedNames, nameFallbacks }
}
