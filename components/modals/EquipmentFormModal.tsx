'use client'

import { useState, type ChangeEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateEquipment, useUpdateEquipment } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']

interface Props {
  item?: EquipmentRow
  onClose: () => void
}

export function EquipmentFormModal({ item, onClose }: Props) {
  const isEdit = !!item
  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [totalQty, setTotalQty] = useState(item?.total_qty ?? 1)
  const [setupMin, setSetupMin] = useState<string>(item?.custom_setup_min?.toString() ?? '')
  const [cleanupMin, setCleanupMin] = useState<string>(item?.custom_cleanup_min?.toString() ?? '')
  const [categories, setCategories] = useState<string[]>(item?.categories ?? [])
  const [error, setError] = useState<string | null>(null)

  const CATEGORY_OPTIONS = ['Primary', 'Specialty', 'Lawn Games', 'Add-Ons'] as const

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    setCategories(Array.from(event.target.selectedOptions, option => option.value))
  }

  const create = useCreateEquipment()
  const update = useUpdateEquipment()
  const isPending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: item.id,
          name,
          total_qty: totalQty,
          custom_setup_min: setupMin ? Number(setupMin) : null,
          custom_cleanup_min: cleanupMin ? Number(cleanupMin) : null,
          categories,
        })
      } else {
        await create.mutateAsync({
          id: id.trim().toLowerCase().replace(/\s+/g, '_'),
          name,
          total_qty: totalQty,
          custom_setup_min: setupMin ? Number(setupMin) : null,
          custom_cleanup_min: cleanupMin ? Number(cleanupMin) : null,
          categories,
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
          <DialogTitle>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">ID (slug)</Label>
              <Input id="id" value={id} onChange={e => setId(e.target.value)}
                placeholder="foam_machine" required />
              <p className="text-xs text-gray-500">Lowercase, underscores only. Cannot be changed later.</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="setup">Setup min (optional)</Label>
              <Input id="setup" type="number" min={0} value={setupMin}
                onChange={e => setSetupMin(e.target.value)} placeholder="45" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleanup">Cleanup min (optional)</Label>
              <Input id="cleanup" type="number" min={0} value={cleanupMin}
                onChange={e => setCleanupMin(e.target.value)} placeholder="45" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categories">Categories</Label>
            <select
              id="categories"
              multiple
              size={4}
              value={categories.filter(cat => CATEGORY_OPTIONS.includes(cat as any))}
              onChange={handleCategoryChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              {CATEGORY_OPTIONS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500">Select one or more fixed categories. GameTruck is not editable here.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Equipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
