import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']

// Zenbooker v3 service structure:
// Each service has service_selections[], each selection has selected_options[].
// Each option maps to a modifier/add-on with its own id and qty.
export interface ZenbookerSelectedOption {
  id: string
  text: string      // display label in v3
  quantity?: number // customer-supplied quantity
  price?: number    // unit price; options with price > 0 are equipment selections
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
    customer?: { name?: string }
    service_address?: { formatted?: string }
    start_date?: string           // ISO 8601 datetime, e.g. "2026-12-23T13:00:00.000Z"
    timezone?: string             // IANA tz, e.g. "America/New_York"
    estimated_duration_seconds?: number
    time_slot?: {
      start_time?: string | null  // "HH:MM" 24-hour
      end_time?: string | null    // "HH:MM" 24-hour; may be null
    }
    assigned_providers?: Array<{ id: string; name: string }>
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
  optionId?: string   // present when fallback triggered by a service option (not a service name)
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
  optionId: string | undefined,
  equipmentByNormalizedName: Map<string, string>,
  resolvedItems: ResolvedItem[],
  nameFallbacks: NameFallback[],
  unmappedNames: string[],
) {
  const equipmentId = equipmentByNormalizedName.get(normalizeForMatch(label))
  if (equipmentId) {
    resolvedItems.push({ item_id: equipmentId, qty: 1, is_sub_item: false, parent_item_id: null })
    nameFallbacks.push({ optionName: label, optionId, equipmentId })
  } else {
    unmappedNames.push(label)
  }
}

/**
 * Pure function — no DB calls.
 *
 * Resolution logic per service (v3 structure):
 *   1. Collect all selected_options across all service_selections.
 *   2. For each option: look up (service_id, option.id) → modifier-specific mapping(s).
 *      - is_skip rows cause the option to be silently consumed (no item, no fallback).
 *   3. If no modifier match: try name fallback (per option).
 *   4. If still no match: silently skip (non-equipment options like duration, group size).
 *   5. After all options: if no modifier match was found for the option AND a base
 *      mapping exists — push base items ONCE per service (deduped across all options).
 *   6. If a service has no options at all: attempt base mapping, or fall back to name match.
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

    // All base mappings: service_id match with no modifier (modifier_id IS NULL).
    // Multiple rows are allowed (e.g. a service that maps to 2 pieces of equipment).
    const baseMappings = serviceMappings.filter(
      m => m.zenbooker_service_id === svc.service_id && m.zenbooker_modifier_id === null
    )

    if (allOptions.length === 0) {
      // No options — push ALL base mapped items, or fall back to name match
      if (baseMappings.length > 0) {
        for (const bm of baseMappings) {
          if (bm.is_skip || !bm.item_id) continue
          resolvedItems.push({
            item_id: bm.item_id,
            qty: bm.default_qty,
            is_sub_item: false,
            parent_item_id: null,
          })
        }
      } else {
        tryNameFallback(svc.service_name, undefined, equipmentByNormalizedName, resolvedItems, nameFallbacks, unmappedNames)
      }
      continue
    }

    // Track whether the base mapping has been pushed for this service.
    // It fires AT MOST ONCE — not once per unmatched option.
    let baseMappingPushed = false

    for (const option of allOptions) {
      // 1. Modifier-specific mappings: ALL rows for (service_id, option.id).
      //    Multiple rows are allowed — e.g. one option can map to two equipment items.
      //    is_skip rows consume the option silently (no item, no fallback).
      const modifierMappings = serviceMappings.filter(
        m => m.zenbooker_service_id === svc.service_id && m.zenbooker_modifier_id === option.id
      )

      if (modifierMappings.length > 0) {
        for (const mm of modifierMappings) {
          if (mm.is_skip) continue
          if (!mm.item_id) continue
          const qty = mm.use_customer_qty
            ? (option.quantity ?? mm.default_qty)
            : mm.default_qty
          resolvedItems.push({ item_id: mm.item_id, qty, is_sub_item: false, parent_item_id: null })
        }
        continue  // option handled by modifier rows (even if all were is_skip)
      }

      // 2. Base mapping fallback: push ALL base rows, but only ONCE per service.
      //    Multiple unmatched options (duration, group size, logistics) must not
      //    each trigger a separate base insert.
      if (!baseMappingPushed && baseMappings.length > 0) {
        for (const bm of baseMappings) {
          if (bm.is_skip || !bm.item_id) continue
          resolvedItems.push({ item_id: bm.item_id, qty: bm.default_qty, is_sub_item: false, parent_item_id: null })
        }
        baseMappingPushed = true
        continue
      }

      // 3. Name fallback: exact normalized match against equipment names.
      //    Uses full label ("Service / Option text") — not a partial/substring match.
      const label = `${svc.service_name} / ${option.text}`
      const equipmentId = equipmentByNormalizedName.get(normalizeForMatch(label))
      if (equipmentId) {
        resolvedItems.push({ item_id: equipmentId, qty: 1, is_sub_item: false, parent_item_id: null })
        nameFallbacks.push({ optionName: label, optionId: option.id, equipmentId })
        continue
      }

      // 4. No match — silently skip. Options like service fees, group size,
      //    duration, and booking method will never have equipment mappings
      //    and should not trigger unmapped_service.
    }
  }

  return { chainId, resolvedItems, unmappedNames, nameFallbacks }
}
