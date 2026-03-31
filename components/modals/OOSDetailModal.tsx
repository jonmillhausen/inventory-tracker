'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useEquipment,
  useEquipmentOOS,
  useEquipmentSubItems,
  useMarkOOS,
  useReturnFromOOS,
  useSubItemLinks,
  useSubItemOOS,
  useMarkSubItemOOS,
  useReturnSubItemFromOOS,
  useUpdateEquipment,
  useUpdateSubItem,
  useDecrementOOSQuantity,
} from '@/lib/queries/equipment'

interface Props {
  itemId: string
  itemName: string
  itemType: 'equipment' | 'sub_item'
  onClose: () => void
}

export function OOSDetailModal({ itemId, itemName, itemType, onClose }: Props) {
  const { data: equipmentRecords = [] } = useEquipmentOOS(itemType === 'equipment' ? itemId : '')
  const { data: subItemRecords = [] } = useSubItemOOS(itemType === 'sub_item' ? itemId : '')
  const records = itemType === 'equipment' ? equipmentRecords : subItemRecords

  const { data: equipment = [] } = useEquipment()
  const { data: subItems = [] } = useEquipmentSubItems()
  const { data: subItemLinks = [] } = useSubItemLinks()
  const updateEquipment = useUpdateEquipment()
  const updateSubItem = useUpdateSubItem()
  const decrementOOSQuantity = useDecrementOOSQuantity()

  const markEquipmentOOS = useMarkOOS()
  const markSubItemOOS = useMarkSubItemOOS()
  const returnEquipmentFromOOS = useReturnFromOOS()
  const returnSubItemFromOOS = useReturnSubItemFromOOS()

  const [quantity, setQuantity] = useState(1)
  const [issueDescription, setIssueDescription] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [removePending, setRemovePending] = useState(false)

  const currentItem = itemType === 'equipment'
    ? equipment.find(item => item.id === itemId)
    : subItems.find(item => item.id === itemId)

  const parentLink = itemType === 'sub_item'
    ? subItemLinks.find(link => link.sub_item_id === itemId)
    : null

  const activeCount = records.reduce((sum, r) => sum + r.quantity, 0)
  const isMarkPending = markEquipmentOOS.isPending || markSubItemOOS.isPending
  const isReturnPending = returnEquipmentFromOOS.isPending || returnSubItemFromOOS.isPending || decrementOOSQuantity.isPending || removePending

  async function handleMarkOOS(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const shared = {
        issue_description: issueDescription || null,
        expected_return_date: expectedReturnDate || null,
      }
      const tasks = Array.from({ length: quantity }, () => {
        if (itemType === 'equipment') {
          return markEquipmentOOS.mutateAsync({ equipmentId: itemId, quantity: 1, ...shared })
        }
        return markSubItemOOS.mutateAsync({ subItemId: itemId, quantity: 1, ...shared })
      })
      await Promise.all(tasks)
      setQuantity(1)
      setIssueDescription('')
      setExpectedReturnDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark out of service')
    }
  }

  async function handleReturn(oosId: string) {
    setError(null)
    try {
      if (itemType === 'equipment') {
        await returnEquipmentFromOOS.mutateAsync({ equipmentId: itemId, oosId })
      } else {
        await returnSubItemFromOOS.mutateAsync({ subItemId: itemId, oosId })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return from service')
    }
  }

  async function handlePermanentRemove(record: { id: string; quantity: number }) {
    setError(null)
    setRemovePending(true)
    try {
      if (!currentItem) {
        throw new Error('Item not found')
      }
      const newTotalQty = Math.max(0, currentItem.total_qty - 1)
      if (itemType === 'equipment') {
        await updateEquipment.mutateAsync({ id: itemId, total_qty: newTotalQty })
      } else {
        const parentId = parentLink?.parent_id
        if (!parentId) {
          throw new Error('No parent link found for sub-item')
        }
        await updateSubItem.mutateAsync({ parentId, subId: itemId, total_qty: newTotalQty })
      }
      await decrementOOSQuantity.mutateAsync(record.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item permanently')
    } finally {
      setRemovePending(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{itemName} — Out of Service ({activeCount})</DialogTitle>
        </DialogHeader>

        {/* Add new OOS record */}
        <form onSubmit={handleMarkOOS} className="space-y-3 border-b dark:border-gray-700 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="oos-description">Issue Description</Label>
            <Input
              id="oos-description"
              value={issueDescription}
              onChange={e => setIssueDescription(e.target.value)}
              placeholder="Describe the issue..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="oos-qty">Quantity</Label>
              <Input
                id="oos-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oos-date">Expected Return</Label>
              <Input
                id="oos-date"
                type="date"
                value={expectedReturnDate}
                onChange={e => setExpectedReturnDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            disabled={isMarkPending}
          >
            {isMarkPending ? 'Saving…' : 'Mark Out of Service +'}
          </Button>
        </form>

        {/* Active OOS records */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {records.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">No detailed OOS records</p>
          ) : (
            records.map(record => (
              <div
                key={record.id}
                className="flex items-start justify-between gap-2 bg-pink-50 dark:bg-red-900/20 rounded-md p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {record.issue_description || 'No description'} — ×{record.quantity}
                  </p>
                  {record.expected_return_date && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Returns: {new Date(record.expected_return_date + 'T00:00:00').toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <Button
                    size="sm"
                    className="shrink-0 bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                    onClick={() => handleReturn(record.id)}
                    disabled={isReturnPending}
                  >
                    ✓ Return to Service
                  </Button>
                  <Button
                    size="sm"
                    className="shrink-0 bg-red-600 hover:bg-red-700 text-white h-7 text-xs"
                    onClick={() => handlePermanentRemove(record)}
                    disabled={isReturnPending}
                  >
                    Permanently Remove (1)
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
