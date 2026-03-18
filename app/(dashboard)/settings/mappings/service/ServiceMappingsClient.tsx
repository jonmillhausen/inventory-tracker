'use client'

import React, { useState, useMemo } from 'react'
import { useServiceMappings, useDeleteServiceMapping } from '@/lib/queries/serviceMappings'
import { useEquipment } from '@/lib/queries/equipment'
import { ServiceMappingFormModal } from '@/components/modals/ServiceMappingFormModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  initialMappings: ServiceMappingRow[]
  initialEquipment: EquipmentRow[]
}

export function ServiceMappingsClient({ initialMappings, initialEquipment }: Props) {
  const { data: mappings = [] } = useServiceMappings(initialMappings)
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const deleteMapping = useDeleteServiceMapping()

  const [showCreate, setShowCreate] = useState(false)
  const [editMapping, setEditMapping] = useState<ServiceMappingRow | null>(null)
  const [addModifierFor, setAddModifierFor] = useState<{ serviceId: string; serviceName: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const equipById = useMemo(
    () => new Map(equipment.map(e => [e.id, e])),
    [equipment]
  )

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: ServiceMappingRow[] }>()
    for (const m of mappings) {
      const existing = map.get(m.zenbooker_service_id)
      if (existing) {
        existing.rows.push(m)
      } else {
        map.set(m.zenbooker_service_id, { name: m.zenbooker_service_name, rows: [m] })
      }
    }
    return map
  }, [mappings])

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this mapping?')) return
    try {
      await deleteMapping.mutateAsync(id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete mapping')
    }
  }

  const toggleExpand = (serviceId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Service Mappings</h1>
        <Button onClick={() => setShowCreate(true)}>Add Mapping</Button>
      </div>

      {deleteError && (
        <p className="text-red-600 text-sm">{deleteError}</p>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Zenbooker Service</th>
              <th className="px-4 py-3 font-medium">Modifier</th>
              <th className="px-4 py-3 font-medium">Maps To</th>
              <th className="px-4 py-3 font-medium text-center">Qty</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...groups.entries()].map(([serviceId, group]) => {
              const isBundle = group.rows.some(r => r.zenbooker_modifier_id !== null)
              const isOpen = expanded.has(serviceId)

              if (!isBundle) {
                const row = group.rows[0]
                return (
                  <tr key={serviceId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{group.name}</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3">{equipById.get(row.item_id)?.name ?? row.item_id}</td>
                    <td className="px-4 py-3 text-center">
                      {row.use_customer_qty
                        ? <Badge className="bg-blue-100 text-blue-800">Customer</Badge>
                        : row.default_qty}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditMapping(row)}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(row.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <React.Fragment key={serviceId}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(serviceId)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {isOpen ? '▾' : '▸'} {group.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 italic text-xs">Bundle — {group.rows.length} modifiers</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3 text-gray-400">—</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline"
                        onClick={e => { e.stopPropagation(); setAddModifierFor({ serviceId, serviceName: group.name }) }}>
                        + Modifier
                      </Button>
                    </td>
                  </tr>
                  {isOpen && group.rows.map(row => (
                    <tr key={row.id} className="bg-gray-50/50 text-xs">
                      <td className="px-4 py-2 pl-8 text-gray-500">{group.name}</td>
                      <td className="px-4 py-2 text-gray-700">{row.zenbooker_modifier_name}</td>
                      <td className="px-4 py-2">{equipById.get(row.item_id)?.name ?? row.item_id}</td>
                      <td className="px-4 py-2 text-center">
                        {row.use_customer_qty
                          ? <Badge className="bg-blue-100 text-blue-800 text-xs">Customer</Badge>
                          : row.default_qty}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditMapping(row)}>Edit</Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleDelete(row.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            {groups.size === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No service mappings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <ServiceMappingFormModal equipment={equipment} onClose={() => setShowCreate(false)} />
      )}
      {editMapping && (
        <ServiceMappingFormModal mapping={editMapping} equipment={equipment} onClose={() => setEditMapping(null)} />
      )}
      {addModifierFor && (
        <ServiceMappingFormModal
          prefillServiceId={addModifierFor.serviceId}
          prefillServiceName={addModifierFor.serviceName}
          equipment={equipment}
          onClose={() => setAddModifierFor(null)}
        />
      )}
    </div>
  )
}
