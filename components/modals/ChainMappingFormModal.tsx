'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateChainMapping, useUpdateChainMapping } from '@/lib/queries/chainMappings'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  mapping?: ChainMappingRow
  chains: ChainRow[]
  onClose: () => void
}

export function ChainMappingFormModal({ mapping, chains, onClose }: Props) {
  const create = useCreateChainMapping()
  const update = useUpdateChainMapping()

  const [staffId, setStaffId] = useState(mapping?.zenbooker_staff_id ?? '')
  const [staffName, setStaffName] = useState(mapping?.zenbooker_staff_name ?? '')
  const [chainId, setChainId] = useState(mapping?.chain_id ?? '')
  const [notes, setNotes] = useState(mapping?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!mapping

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const body = {
        zenbooker_staff_id: staffId.trim(),
        zenbooker_staff_name: staffName.trim() || staffId.trim(),
        chain_id: chainId,
        notes: notes.trim(),
      }
      if (isEdit) await update.mutateAsync({ id: mapping.id, ...body })
      else await create.mutateAsync(body)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const activeChains = chains.filter(c => c.is_active)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Chain Mapping' : 'Add Chain Mapping'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staff-id" className="block text-sm font-medium mb-1">Zenbooker Staff ID</label>
            <Input id="staff-id" value={staffId} onChange={e => setStaffId(e.target.value)} required
              placeholder="e.g. staff_alice" disabled={isEdit} />
          </div>
          <div>
            <label htmlFor="staff-name" className="block text-sm font-medium mb-1">Staff Name (display)</label>
            <Input id="staff-name" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Alice Smith" />
          </div>
          <div>
            <label htmlFor="chain-select" className="block text-sm font-medium mb-1">Chain</label>
            <Select value={chainId} onValueChange={val => setChainId(val ?? '')} required>
              <SelectTrigger id="chain-select"><SelectValue placeholder="Select chain..." /></SelectTrigger>
              <SelectContent>
                {activeChains.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
