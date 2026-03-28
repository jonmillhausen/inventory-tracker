'use client'

import React, { useState, useMemo } from 'react'
import { useEquipment, useEquipmentSubItems, useSubItemLinks, useDeactivateEquipment, useEquipmentOOSSums } from '@/lib/queries/equipment'
import { useBookings } from '@/lib/queries/bookings'
import { calculateAvailability } from '@/lib/utils/availability'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IssueFlagModal } from '@/components/modals/IssueFlagModal'
import { OOSModal } from '@/components/modals/OOSModal'
import { OOSDetailModal } from '@/components/modals/OOSDetailModal'
import { ResolveIssueFlagModal } from '@/components/modals/ResolveIssueFlagModal'
import { EquipmentFormModal } from '@/components/modals/EquipmentFormModal'
import { SubItemFormModal } from '@/components/modals/SubItemFormModal'
import { canAdmin, canCreateIssueFlag } from '@/lib/auth/roles'
import { ChevronDown, ChevronUp, Flag, X } from 'lucide-react'
import type { UserRole, Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

const canResolveFlag = (r: UserRole) => r === 'admin' || r === 'sales'

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialSubItemLinks: SubItemLinkRow[]
  role: UserRole
}

export function EquipmentClient({ initialEquipment, initialSubItems, initialSubItemLinks, role }: Props) {
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: subItemLinks = [] } = useSubItemLinks(initialSubItemLinks)
  const deactivate = useDeactivateEquipment()
  const { data: oosSums = {} } = useEquipmentOOSSums()
  const { data: bookingsData = { bookings: [], bookingItems: [] } } = useBookings()

  // Modal state
  const [addingType, setAddingType] = useState<'primary' | 'sub_item' | null>(null)
  const [editEquipment, setEditEquipment] = useState<EquipmentRow | null>(null)
  const [editSubItem, setEditSubItem] = useState<SubItemRow | null>(null)
  const [issueFlagTarget, setIssueFlagTarget] = useState<{ id: string; name: string; type: 'equipment' | 'sub_item' } | null>(null)
  const [oosTarget, setOosTarget] = useState<{ id: string; name: string; type?: 'equipment' | 'sub_item' } | null>(null)
  const [resolveFlagItemId, setResolveFlagItemId] = useState<string | null>(null)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [equipmentFilter, setEquipmentFilter] = useState<'all' | 'damaged' | 'flags'>('all')

  const todayET = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), [])
  const oosMap = useMemo(() => new Map(Object.entries(oosSums)), [oosSums])
  const availByEquipmentId = useMemo(() => {
    const rows = calculateAvailability(equipment, [], bookingsData.bookings, bookingsData.bookingItems, todayET, oosMap)
    return new Map(rows.map(r => [r.id, r.available_qty]))
  }, [equipment, bookingsData, todayET, oosMap])

  // All active primary equipment (for modals)
  const activeEquipment = useMemo(() => equipment.filter(e => e.is_active), [equipment])

  // Filtered equipment for table display
  const filteredEquipment = useMemo(() => {
    if (equipmentFilter === 'damaged') return activeEquipment.filter(e => (oosSums[e.id] ?? 0) >= 1)
    if (equipmentFilter === 'flags') return activeEquipment.filter(e => e.issue_flag >= 1)
    return activeEquipment
  }, [activeEquipment, equipmentFilter])

  // Map sub-items by id
  const subItemMap = useMemo(() => new Map(subItems.map(s => [s.id, s])), [subItems])

  // For each parent: list of { sub, loadout_qty } sorted by sub name
  const linksByParent = useMemo(() => {
    const map = new Map<string, Array<{ sub: SubItemRow; loadout_qty: number }>>()
    for (const link of subItemLinks) {
      const sub = subItemMap.get(link.sub_item_id)
      if (!sub || !sub.is_active) continue
      const list = map.get(link.parent_id) ?? []
      list.push({ sub, loadout_qty: link.loadout_qty })
      map.set(link.parent_id, list)
    }
    // Sort sub-items by name within each parent
    for (const [k, list] of map) {
      map.set(k, list.sort((a, b) => a.sub.name.localeCompare(b.sub.name)))
    }
    return map
  }, [subItemLinks, subItemMap])

  // Per-parent: whether any linked sub-item has flags or damage
  const subStatusByParent = useMemo(() => {
    const result = new Map<string, { hasFlags: boolean; hasDamage: boolean }>()
    for (const [parentId, subs] of linksByParent) {
      result.set(parentId, {
        hasFlags: subs.some(({ sub }) => sub.issue_flag > 0),
        hasDamage: subs.some(({ sub }) => sub.out_of_service > 0),
      })
    }
    return result
  }, [linksByParent])

  // Existing links for a specific sub-item (for edit pre-fill)
  const linksBySubItem = useMemo(() => {
    const map = new Map<string, SubItemLinkRow[]>()
    for (const link of subItemLinks) {
      const list = map.get(link.sub_item_id) ?? []
      list.push(link)
      map.set(link.sub_item_id, list)
    }
    return map
  }, [subItemLinks])

  function toggleParent(id: string) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with filter buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">Equipment</h1>
          {/* Filter buttons */}
          <div className="flex gap-1.5">
            {(['all', 'damaged', 'flags'] as const).map(f => {
              const labels = { all: 'All Equipment', damaged: 'Out of Service Only', flags: 'Flags Only' }
              return (
                <button
                  key={f}
                  onClick={() => setEquipmentFilter(f)}
                  className={`px-3 py-1 text-sm rounded-md border font-medium transition-colors ${
                    equipmentFilter === f
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-900 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {labels[f]}
                </button>
              )
            })}
          </div>
        </div>
        {canAdmin(role) && (
          <div className="flex gap-2">
            <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => setAddingType('primary')}>+ Primary Equipment</Button>
            <Button size="sm" variant="outline" className="border-blue-500 text-blue-500 hover:bg-blue-50" onClick={() => setAddingType('sub_item')}>+ Sub-Item</Button>
          </div>
        )}
      </div>

      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-center">Total</th>
              <th className="px-4 py-3 font-medium text-center">Avail.</th>
              <th className="px-4 py-3 font-medium text-center">Loadout</th>
              <th className="px-4 py-3 font-medium text-center">Out of Service</th>
              <th className="px-4 py-3 font-medium text-center">
                <span className="inline-flex items-center gap-1 justify-center">
                  <Flag size={13} className="text-orange-500" />
                  Flags
                </span>
              </th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredEquipment.map(e => {
              const subs = linksByParent.get(e.id) ?? []
              const isExpanded = expandedParents.has(e.id)
              const subStatus = subStatusByParent.get(e.id)

              return (
                <React.Fragment key={e.id}>
                  {/* Parent row */}
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-bold">
                      {e.name}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{e.total_qty}</td>
                    <td className="px-4 py-3 text-center font-medium">
                      {(() => {
                        const avail = availByEquipmentId.get(e.id) ?? 0
                        return <span className={avail > 0 ? 'text-green-600' : 'text-red-600'}>{avail}</span>
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300 dark:text-gray-600">—</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {(oosSums[e.id] ?? 0) > 0 ? (
                          <button
                            onClick={() => setOosTarget({ id: e.id, name: e.name })}
                            className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
                          >
                            {oosSums[e.id]}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-300 dark:text-gray-600">0</span>
                        )}
                        <button
                          onClick={() => setOosTarget({ id: e.id, name: e.name })}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          aria-label="Add out of service record"
                        >
                          <span className="text-base leading-none">+</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.issue_flag > 0 ? (
                        <button onClick={() => canResolveFlag(role) ? setResolveFlagItemId(e.id) : undefined} className="inline-flex">
                          <Badge variant="outline" className="text-yellow-700 border-yellow-400 cursor-pointer">
                            {e.issue_flag}
                          </Badge>
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        {canCreateIssueFlag(role) && (
                          <Button size="sm" variant="outline"
                            onClick={() => setIssueFlagTarget({ id: e.id, name: e.name, type: 'equipment' })}>
                            Flag
                          </Button>
                        )}
                        {canAdmin(role) && (
                          <>
                            <Button size="sm" variant="outline"
                              onClick={() => setEditEquipment(e)}>
                              Edit
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Supplies toggle row */}
                  {subs.length > 0 && (
                    <tr className="bg-gray-50/30 dark:bg-gray-700/20">
                      <td className="px-4 py-1" colSpan={4}>
                        <button
                          onClick={() => toggleParent(e.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 font-semibold hover:text-gray-700"
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          {e.name} Supplies ({subs.length})
                        </button>
                      </td>
                      <td className="px-4 py-1 text-center">
                        {!isExpanded && subStatus?.hasDamage
                          ? <X size={14} className="text-red-400 mx-auto" />
                          : ''}
                      </td>
                      <td className="px-4 py-1 text-center">
                        {!isExpanded && subStatus?.hasFlags
                          ? <Flag size={14} className="text-orange-400 mx-auto" />
                          : ''}
                      </td>
                      <td />
                    </tr>
                  )}

                  {/* Sub-item rows */}
                  {isExpanded && subs.map(({ sub, loadout_qty }) => (
                    <tr key={sub.id} className="bg-gray-50/50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 text-xs">
                      <td className="px-4 py-2 pl-10">{sub.name}</td>
                      <td className="px-4 py-2 text-center">{sub.total_qty}</td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 text-center font-medium text-blue-700">{loadout_qty}</td>
                      <td className="px-4 py-2 text-center">
                        {sub.out_of_service > 0 ? (
                          <Badge variant="destructive" className="text-xs">{sub.out_of_service}</Badge>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {sub.issue_flag > 0 ? (
                          <button onClick={() => canResolveFlag(role) ? setResolveFlagItemId(sub.id) : undefined} className="inline-flex">
                            <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-xs cursor-pointer">
                              {sub.issue_flag}
                            </Badge>
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          {canCreateIssueFlag(role) && (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={() => setIssueFlagTarget({ id: sub.id, name: sub.name, type: 'sub_item' })}>
                              Flag
                            </Button>
                          )}
                          {canAdmin(role) && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-xs"
                                onClick={() => setOosTarget({ id: sub.id, name: sub.name, type: 'sub_item' })}>
                                Damaged
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-xs"
                                onClick={() => setEditSubItem(sub)}>
                                Edit
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add primary equipment */}
      {addingType === 'primary' && (
        <EquipmentFormModal onClose={() => setAddingType(null)} />
      )}

      {/* Edit primary equipment */}
      {editEquipment && (
        <EquipmentFormModal item={editEquipment} onClose={() => setEditEquipment(null)} />
      )}

      {/* Add sub-item */}
      {addingType === 'sub_item' && (
        <SubItemFormModal
          allEquipment={activeEquipment}
          onClose={() => setAddingType(null)}
        />
      )}

      {/* Edit sub-item */}
      {editSubItem && (
        <SubItemFormModal
          item={editSubItem}
          allEquipment={activeEquipment}
          existingLinks={linksBySubItem.get(editSubItem.id) ?? []}
          onClose={() => setEditSubItem(null)}
        />
      )}

      {issueFlagTarget && (
        <IssueFlagModal target={issueFlagTarget} onClose={() => setIssueFlagTarget(null)} />
      )}
      {oosTarget && oosTarget.type === 'sub_item' ? (
        <OOSModal
          target={{ id: oosTarget.id, name: oosTarget.name, type: 'sub_item' }}
          onClose={() => setOosTarget(null)}
        />
      ) : oosTarget ? (
        <OOSDetailModal
          equipmentId={oosTarget.id}
          equipmentName={oosTarget.name}
          onClose={() => setOosTarget(null)}
        />
      ) : null}
      {resolveFlagItemId && (
        <ResolveIssueFlagModal itemId={resolveFlagItemId} onClose={() => setResolveFlagItemId(null)} />
      )}
    </div>
  )
}
