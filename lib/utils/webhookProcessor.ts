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

export interface ZenbookerPayload {
  action: string
  timestamp?: number
  job_id: string
  customer_name: string
  address: string
  date: string
  end_date?: string
  start_time: string
  end_time: string
  assigned_staff?: Array<{ staff_id: string; staff_name: string }>
  services?: ZenbookerService[]
}

export interface ResolvedItem {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export interface WebhookResolution {
  chainId: string | null
  resolvedItems: ResolvedItem[]
  unmappedNames: string[]
}

/**
 * Pure function — no DB calls.
 * Takes payload fields + current mapping tables; returns resolved items, chain, and unmapped names.
 */
export function resolveWebhookItems(
  services: ZenbookerService[],
  assignedStaff: Array<{ staff_id: string; staff_name: string }>,
  serviceMappings: ServiceMappingRow[],
  chainMappings: ChainMappingRow[],
): WebhookResolution {
  // Resolve chain: first staff member with a mapping wins
  let chainId: string | null = null
  for (const staff of assignedStaff) {
    const cm = chainMappings.find(m => m.zenbooker_staff_id === staff.staff_id)
    if (cm) { chainId = cm.chain_id; break }
  }

  const resolvedItems: ResolvedItem[] = []
  const unmappedNames: string[] = []

  for (const svc of services) {
    const modId = svc.modifier?.modifier_id ?? null
    const sm = serviceMappings.find(m =>
      m.zenbooker_service_id === svc.service_id &&
      (modId === null ? m.zenbooker_modifier_id === null : m.zenbooker_modifier_id === modId)
    )

    if (!sm) {
      const label = svc.modifier
        ? `${svc.service_name} / ${svc.modifier.modifier_name}`
        : svc.service_name
      unmappedNames.push(label)
      continue
    }

    const qty = sm.use_customer_qty ? (svc.qty ?? sm.default_qty) : sm.default_qty
    resolvedItems.push({
      item_id: sm.item_id,
      qty,
      is_sub_item: false,
      parent_item_id: null,
    })
  }

  return { chainId, resolvedItems, unmappedNames }
}
