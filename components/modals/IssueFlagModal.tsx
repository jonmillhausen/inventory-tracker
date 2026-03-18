'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateIssueFlag } from '@/lib/queries/equipment'

interface Props {
  target: { id: string; name: string; type: 'equipment' | 'sub_item' }
  onClose: () => void
}

export function IssueFlagModal({ target, onClose }: Props) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useCreateIssueFlag()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mutation.mutateAsync({ item_id: target.id, item_type: target.type, qty, note })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flag')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Issue — {target.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Quantity affected</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Describe the issue"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Report Issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
