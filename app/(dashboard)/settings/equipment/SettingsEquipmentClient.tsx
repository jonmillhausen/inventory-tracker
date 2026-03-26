'use client'

import React, { useMemo, useState } from 'react'
import { useEquipment, useEquipmentSubItems, useSubItemLinks, useDeactivateEquipment } from '@/lib/queries/equipment'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EquipmentFormModal } from '@/components/modals/EquipmentFormModal'
import { SubItemFormModal } from '@/components/modals/SubItemFormModal'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialSubItemLinks: SubItemLinkRow[]
}

export function SettingsEquipmentClient({ initialEquipment, initialSubItems, initialSubItemLinks }: Props) {
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: subItemLinks = [] } = useSubItemLinks(initialSubItemLinks)
  const deactivate = useDeactivateEquipment()

  const [addEquipment, setAddEquipment] = useState(false)
  const [editItem, setEditItem] = useState<EquipmentRow | null>(null)
  const [addSubItem, setAddSubItem] = useState(false)
  const [editSubItem, setEditSubItem] = useState<SubItemRow | null>(null)

  const activeEquipment = useMemo(() => equipment.filter(e => e.is_active), [equipment])

  const subsByParent = useMemo(() => {
    const map = new Map<string, SubItemRow[]>()
    for (const s of subItems) {
      const list = map.get(s.parent_id) ?? []
      list.push(s)
      map.set(s.parent_id, list)
    }
    return map
  }, [subItems])

  const linksBySubItem = useMemo(() => {
    const map = new Map<string, SubItemLinkRow[]>()
    for (const link of subItemLinks) {
      const list = map.get(link.sub_item_id) ?? []
      list.push(link)
      map.set(link.sub_item_id, list)
    }
    return map
  }, [subItemLinks])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Equipment Catalog</h1>
        <div className="flex gap-2">
          <Button onClick={() => setAddEquipment(true)}>Add Equipment</Button>
          <Button variant="outline" onClick={() => setAddSubItem(true)}>Add Sub-Item</Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium text-center">Qty</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {equipment.map(e => (
              <React.Fragment key={e.id}>
                <tr className={!e.is_active ? 'opacity-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.id}</td>
                  <td className="px-4 py-3 text-center">{e.total_qty}</td>
                  <td className="px-4 py-3 text-center">
                    {e.is_active
                      ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditItem(e)}>Edit</Button>
                      {e.is_active && (
                        <Button size="sm" variant="outline"
                          onClick={() => deactivate.mutate(e.id)}
                          disabled={deactivate.isPending}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {(subsByParent.get(e.id) ?? []).map(s => (
                  <tr key={s.id} className={`bg-gray-50/50 text-xs ${!s.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 pl-8 text-gray-700">{s.name}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono">{s.id}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{s.total_qty}</td>
                    <td className="px-4 py-2 text-center">
                      {s.is_active
                        ? <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>
                        : <Badge variant="outline" className="text-xs">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      <Button size="sm" variant="outline" className="h-6 text-xs"
                        onClick={() => setEditSubItem(s)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {addEquipment && <EquipmentFormModal onClose={() => setAddEquipment(false)} />}
      {editItem && <EquipmentFormModal item={editItem} onClose={() => setEditItem(null)} />}
      {addSubItem && (
        <SubItemFormModal
          allEquipment={activeEquipment}
          onClose={() => setAddSubItem(false)}
        />
      )}
      {editSubItem && (
        <SubItemFormModal
          item={editSubItem}
          allEquipment={activeEquipment}
          existingLinks={linksBySubItem.get(editSubItem.id) ?? []}
          onClose={() => setEditSubItem(null)}
        />
      )}
    </div>
  )
}
