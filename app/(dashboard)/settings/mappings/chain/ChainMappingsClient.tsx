'use client'

import { useState, useMemo } from 'react'
import { useChainMappings, useDeleteChainMapping } from '@/lib/queries/chainMappings'
import { useChains } from '@/lib/queries/chains'
import { ChainMappingFormModal } from '@/components/modals/ChainMappingFormModal'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  initialMappings: ChainMappingRow[]
  initialChains: ChainRow[]
}

export function ChainMappingsClient({ initialMappings, initialChains }: Props) {
  const { data: mappings = [] } = useChainMappings(initialMappings)
  const { data: chains = [] } = useChains(initialChains)
  const deleteMapping = useDeleteChainMapping()

  const [showCreate, setShowCreate] = useState(false)
  const [editMapping, setEditMapping] = useState<ChainMappingRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const chainById = useMemo(() => new Map(chains.map(c => [c.id, c])), [chains])

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this chain mapping?')) return
    try {
      await deleteMapping.mutateAsync(id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete mapping')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chain Mappings</h1>
        <Button onClick={() => setShowCreate(true)}>Add Mapping</Button>
      </div>

      {deleteError && <p className="text-red-600 text-sm">{deleteError}</p>}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Staff Name</th>
              <th className="px-4 py-3 font-medium">Staff ID</th>
              <th className="px-4 py-3 font-medium">Assigned Chain</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {mappings.map(m => {
              const chain = chainById.get(m.chain_id)
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{m.zenbooker_staff_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.zenbooker_staff_id}</td>
                  <td className="px-4 py-3">
                    {chain ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: chain.color }} />
                        {chain.name}
                      </span>
                    ) : m.chain_id}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditMapping(m)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(m.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {mappings.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No chain mappings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <ChainMappingFormModal chains={chains} onClose={() => setShowCreate(false)} />}
      {editMapping && (
        <ChainMappingFormModal mapping={editMapping} chains={chains} onClose={() => setEditMapping(null)} />
      )}
    </div>
  )
}
