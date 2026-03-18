'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateSubItem, useUpdateSubItem } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  parentId: string
  parentName: string
  item?: SubItemRow
  onClose: () => void
}

export function SubItemFormModal({ parentId, parentName, item, onClose }: Props) {
  const isEdit = !!item
  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [totalQty, setTotalQty] = useState(item?.total_qty ?? 1)
  const [error, setError] = useState<string | null>(null)

  const create = useCreateSubItem()
  const update = useUpdateSubItem()
  const isPending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({ parentId, subId: item.id, name, total_qty: totalQty })
      } else {
        await create.mutateAsync({
          parentId,
          id: id.trim().toLowerCase().replace(/\s+/g, '_'),
          name,
          total_qty: totalQty,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Sub-Item — {parentName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">ID (slug)</Label>
              <Input id="id" value={id} onChange={e => setId(e.target.value)}
                placeholder="foam_machine_supplies" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Total Quantity</Label>
            <Input id="qty" type="number" min={0} value={totalQty}
              onChange={e => setTotalQty(Number(e.target.value))} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Sub-Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
