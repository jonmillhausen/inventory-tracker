'use client'

import React, { useState } from 'react'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IssueFlagModal } from '@/components/modals/IssueFlagModal'
import { OOSModal } from '@/components/modals/OOSModal'
import { ResolveIssueFlagModal } from '@/components/modals/ResolveIssueFlagModal'
import { canAdmin, canCreateIssueFlag } from '@/lib/auth/roles'
import type { UserRole, Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

// Admin and sales can resolve issue flags (matches API route permission)
const canResolveFlag = (r: UserRole) => r === 'admin' || r === 'sales'

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  role: UserRole
}

export function EquipmentClient({ initialEquipment, initialSubItems, role }: Props) {
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)

  const [issueFlagTarget, setIssueFlagTarget] = useState<{ id: string; name: string; type: 'equipment' | 'sub_item' } | null>(null)
  const [oosTarget, setOosTarget] = useState<{ id: string; name: string; type: 'equipment' | 'sub_item' } | null>(null)
  const [resolveFlagItemId, setResolveFlagItemId] = useState<string | null>(null)

  const subsByParent = new Map<string, SubItemRow[]>()
  for (const s of subItems) {
    if (!s.is_active) continue
    const list = subsByParent.get(s.parent_id) ?? []
    list.push(s)
    subsByParent.set(s.parent_id, list)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Equipment</h1>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-center">Total</th>
              <th className="px-4 py-3 font-medium text-center">OOS</th>
              <th className="px-4 py-3 font-medium text-center">Flags</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {equipment.filter(e => e.is_active).map(e => (
              <React.Fragment key={e.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-center">{e.total_qty}</td>
                  <td className="px-4 py-3 text-center">
                    {e.out_of_service > 0 ? (
                      <Badge variant="destructive">{e.out_of_service}</Badge>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.issue_flag > 0 ? (
                      <button
                        onClick={() => canResolveFlag(role) ? setResolveFlagItemId(e.id) : undefined}
                        className="inline-flex"
                      >
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 cursor-pointer">
                          {e.issue_flag}
                        </Badge>
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canCreateIssueFlag(role) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIssueFlagTarget({ id: e.id, name: e.name, type: 'equipment' })}
                        >
                          Flag
                        </Button>
                      )}
                      {canAdmin(role) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOosTarget({ id: e.id, name: e.name, type: 'equipment' })}
                        >
                          OOS
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {(subsByParent.get(e.id) ?? []).map(s => (
                  <tr key={s.id} className="bg-gray-50/50 text-gray-600 text-xs">
                    <td className="px-4 py-2 pl-8">{s.name}</td>
                    <td className="px-4 py-2 text-center">{s.total_qty}</td>
                    <td className="px-4 py-2 text-center">
                      {s.out_of_service > 0 ? <Badge variant="destructive" className="text-xs">{s.out_of_service}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {s.issue_flag > 0 ? (
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-xs">{s.issue_flag}</Badge>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {canCreateIssueFlag(role) && (
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => setIssueFlagTarget({ id: s.id, name: s.name, type: 'sub_item' })}>
                            Flag
                          </Button>
                        )}
                        {canAdmin(role) && (
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={() => setOosTarget({ id: s.id, name: s.name, type: 'sub_item' })}>
                            OOS
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {issueFlagTarget && (
        <IssueFlagModal
          target={issueFlagTarget}
          onClose={() => setIssueFlagTarget(null)}
        />
      )}
      {oosTarget && (
        <OOSModal
          target={oosTarget}
          onClose={() => setOosTarget(null)}
        />
      )}
      {resolveFlagItemId && (
        <ResolveIssueFlagModal
          itemId={resolveFlagItemId}
          onClose={() => setResolveFlagItemId(null)}
        />
      )}
    </div>
  )
}
