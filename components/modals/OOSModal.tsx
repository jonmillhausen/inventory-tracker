'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateOOS } from '@/lib/queries/equipment'

interface Props {
  target: { id: string; name: string; type: 'equipment' | 'sub_item' }
  onClose: () => void
}

export function OOSModal({ target, onClose }: Props) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useCreateOOS()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await mutation.mutateAsync({
        item_id: target.id,
        item_type: target.type,
        qty,
        note,
        return_date: returnDate || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create OOS entry')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Out of Service — {target.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Quantity</Label>
            <Input id="qty" type="number" min={1} value={qty}
              onChange={e => setQty(Number(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Reason</Label>
            <Input id="note" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Why is this item out of service?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return">Expected return date (optional)</Label>
            <Input id="return" type="date" value={returnDate}
              onChange={e => setReturnDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Mark OOS'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
