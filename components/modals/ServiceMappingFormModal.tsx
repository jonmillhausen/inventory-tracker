'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateServiceMapping, useUpdateServiceMapping } from '@/lib/queries/serviceMappings'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  mapping?: ServiceMappingRow
  prefillServiceId?: string
  prefillServiceName?: string
  equipment: EquipmentRow[]
  onClose: () => void
}

export function ServiceMappingFormModal({ mapping, prefillServiceId, prefillServiceName, equipment, onClose }: Props) {
  const create = useCreateServiceMapping()
  const update = useUpdateServiceMapping()

  const [serviceId, setServiceId] = useState(mapping?.zenbooker_service_id ?? prefillServiceId ?? '')
  const [serviceName, setServiceName] = useState(mapping?.zenbooker_service_name ?? prefillServiceName ?? '')
  const [modifierId, setModifierId] = useState(mapping?.zenbooker_modifier_id ?? '')
  const [modifierName, setModifierName] = useState(mapping?.zenbooker_modifier_name ?? '')
  const [itemId, setItemId] = useState(mapping?.item_id ?? '')
  const [defaultQty, setDefaultQty] = useState(String(mapping?.default_qty ?? 1))
  const [useCustomerQty, setUseCustomerQty] = useState(mapping?.use_customer_qty ?? false)
  const [notes, setNotes] = useState(mapping?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!mapping

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = parseInt(defaultQty, 10)
    if (isNaN(qty) || qty < 0) {
      setError('Default quantity must be a whole number')
      return
    }
    try {
      const body = {
        zenbooker_service_id: serviceId.trim(),
        zenbooker_service_name: serviceName.trim() || serviceId.trim(),
        zenbooker_modifier_id: modifierId.trim() || null,
        zenbooker_modifier_name: modifierName.trim() || null,
        item_id: itemId,
        default_qty: qty,
        use_customer_qty: useCustomerQty,
        notes: notes.trim(),
      }
      if (isEdit) {
        await update.mutateAsync({ id: mapping.id, ...body })
      } else {
        await create.mutateAsync(body)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const activeEquipment = equipment.filter(e => e.is_active)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service Mapping' : 'Add Service Mapping'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="service-id" className="block text-sm font-medium mb-1">Zenbooker Service ID</label>
            <Input id="service-id" value={serviceId} onChange={e => setServiceId(e.target.value)} required
              placeholder="e.g. svc_foam_party" disabled={isEdit} />
          </div>
          <div>
            <label htmlFor="service-name" className="block text-sm font-medium mb-1">Service Name (display)</label>
            <Input id="service-name" value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Foam Party" />
          </div>
          <div>
            <label htmlFor="modifier-id" className="block text-sm font-medium mb-1">Modifier ID (leave blank for standalone)</label>
            <Input id="modifier-id" value={modifierId} onChange={e => setModifierId(e.target.value)}
              placeholder="e.g. mod_laser_tag" disabled={isEdit} />
          </div>
          {modifierId && (
            <div>
              <label htmlFor="modifier-name" className="block text-sm font-medium mb-1">Modifier Name (display)</label>
              <Input id="modifier-name" value={modifierName} onChange={e => setModifierName(e.target.value)} placeholder="Laser Tag" />
            </div>
          )}
          <div>
            <label htmlFor="equipment-item" className="block text-sm font-medium mb-1">Equipment Item</label>
            <Select value={itemId} onValueChange={val => setItemId(val ?? '')} required>
              <SelectTrigger id="equipment-item"><SelectValue placeholder="Select equipment..." /></SelectTrigger>
              <SelectContent>
                {activeEquipment.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="default-qty" className="block text-sm font-medium mb-1">Default Qty</label>
              <Input id="default-qty" type="number" min="0" value={defaultQty} onChange={e => setDefaultQty(e.target.value)} required />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useCustomerQty}
                  onChange={e => setUseCustomerQty(e.target.checked)}
                  className="w-4 h-4" />
                <span className="text-sm">Use customer qty</span>
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-1">Notes</label>
            <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEdit ? 'Save Changes' : 'Add Mapping'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
