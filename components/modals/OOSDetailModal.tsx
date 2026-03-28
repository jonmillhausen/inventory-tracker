'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEquipmentOOS, useMarkOOS, useReturnFromOOS } from '@/lib/queries/equipment'

interface Props {
  equipmentId: string
  equipmentName: string
  onClose: () => void
}

export function OOSDetailModal({ equipmentId, equipmentName, onClose }: Props) {
  const { data: records = [] } = useEquipmentOOS(equipmentId)
  const markOOS = useMarkOOS()
  const returnFromOOS = useReturnFromOOS()

  const [quantity, setQuantity] = useState(1)
  const [issueDescription, setIssueDescription] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activeCount = records.reduce((sum, r) => sum + r.quantity, 0)

  async function handleMarkOOS(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await markOOS.mutateAsync({
        equipmentId,
        quantity,
        issue_description: issueDescription || null,
        expected_return_date: expectedReturnDate || null,
      })
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
      await returnFromOOS.mutateAsync({ equipmentId, oosId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return from service')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{equipmentName} — Out of Service ({activeCount})</DialogTitle>
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
            disabled={markOOS.isPending}
          >
            {markOOS.isPending ? 'Saving…' : 'Mark Out of Service +'}
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
                <Button
                  size="sm"
                  className="shrink-0 bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  onClick={() => handleReturn(record.id)}
                  disabled={returnFromOOS.isPending}
                >
                  ✓ Return to Service
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
