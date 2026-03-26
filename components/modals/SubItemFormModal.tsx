'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateSubItemBulk, useUpdateSubItemBulk } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']

interface Props {
  // Passed when editing an existing sub-item
  item?: SubItemRow
  // All active primary equipment items (for the loadout qty table)
  allEquipment: EquipmentRow[]
  // Existing links for this sub-item (used to pre-fill loadout values on edit)
  existingLinks?: SubItemLinkRow[]
  onClose: () => void
}

export function SubItemFormModal({ item, allEquipment, existingLinks = [], onClose }: Props) {
  const isEdit = !!item

  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [totalQty, setTotalQty] = useState(item?.total_qty ?? 1)
  const [error, setError] = useState<string | null>(null)

  // Build initial loadout map from existing links
  const initialLoadouts = useMemo(() => {
    const map = new Map<string, number>()
    for (const link of existingLinks) {
      map.set(link.parent_id, link.loadout_qty)
    }
    return map
  }, [existingLinks])

  // loadoutQtys: parent_id → qty (0 means no link)
  const [loadoutQtys, setLoadoutQtys] = useState<Map<string, number>>(
    () => new Map(initialLoadouts)
  )

  const createBulk = useCreateSubItemBulk()
  const updateBulk = useUpdateSubItemBulk()
  const isPending = createBulk.isPending || updateBulk.isPending

  function setLoadout(parentId: string, qty: number) {
    setLoadoutQtys(prev => {
      const next = new Map(prev)
      next.set(parentId, qty)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const links = allEquipment.map(eq => ({
      parent_id: eq.id,
      loadout_qty: loadoutQtys.get(eq.id) ?? 0,
    }))

    try {
      if (isEdit) {
        await updateBulk.mutateAsync({ subId: item.id, name, total_qty: totalQty, links })
      } else {
        await createBulk.mutateAsync({
          id: id.trim().toLowerCase().replace(/\s+/g, '_'),
          name,
          total_qty: totalQty,
          links,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Sub-Item' : 'Add Sub-Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="sub-id">ID (slug)</Label>
              <Input
                id="sub-id"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="air_pump"
                required
              />
              <p className="text-xs text-gray-500">Lowercase, underscores only. Cannot be changed later.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sub-name">Name</Label>
            <Input id="sub-name" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-qty">Total Quantity</Label>
            <Input
              id="sub-qty"
              type="number"
              min={0}
              value={totalQty}
              onChange={e => setTotalQty(Number(e.target.value))}
              required
            />
            <p className="text-xs text-gray-500">Total physical inventory across all equipment types.</p>
          </div>

          {/* Loadout qty per parent equipment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Loadout Qty per Equipment</Label>
              <span className="text-xs text-gray-400">0 = not linked</span>
            </div>
            <div className="border rounded-md overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Equipment</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600 w-24">Loadout Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allEquipment.map(eq => (
                    <tr key={eq.id} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-700">{eq.name}</td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 text-center text-sm w-full"
                          value={loadoutQtys.get(eq.id) ?? 0}
                          onChange={e => setLoadout(eq.id, Number(e.target.value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Sub-Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
