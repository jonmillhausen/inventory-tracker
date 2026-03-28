'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useResolveIssueFlag, useMarkOOS } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type IssueFlagRow = Database['public']['Tables']['issue_flag_items']['Row']

interface Props {
  itemId: string
  onClose: () => void
}

export function ResolveIssueFlagModal({ itemId, onClose }: Props) {
  const [flags, setFlags] = useState<IssueFlagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mutation = useResolveIssueFlag()
  const markOOS = useMarkOOS()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('issue_flag_items')
      .select('*')
      .eq('item_id', itemId)
      .is('resolved_at', null)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setFlags((data ?? []) as IssueFlagRow[])
        setLoading(false)
      })
  }, [itemId])

  async function resolve(flag: IssueFlagRow, action: 'cleared' | 'moved_to_oos') {
    try {
      if (action === 'moved_to_oos' && flag.item_type === 'equipment') {
        await markOOS.mutateAsync({
          equipmentId: flag.item_id,
          quantity: flag.qty ?? 1,
          issue_description: flag.note ?? null,
        })
      }
      await mutation.mutateAsync({ id: flag.id, resolved_action: action })
      // Derive new length inside the updater to avoid stale closure on `flags`
      setFlags(prev => {
        const next = prev.filter(f => f.id !== flag.id)
        if (next.length === 0) onClose()
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve flag')
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Issue Flags</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-sm text-gray-500">Loading flags…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && flags.length === 0 && (
          <p className="text-sm text-gray-500">No open flags.</p>
        )}
        <div className="space-y-3">
          {flags.map(flag => (
            <div key={flag.id} className="border rounded p-3 space-y-2">
              <p className="text-sm">
                <span className="font-medium">{flag.qty} unit(s)</span>
                {flag.note && <span className="text-gray-500"> — {flag.note}</span>}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => resolve(flag, 'cleared')}
                  disabled={mutation.isPending || markOOS.isPending}>
                  Clear
                </Button>
                <Button size="sm" variant="destructive"
                  onClick={() => resolve(flag, 'moved_to_oos')}
                  disabled={mutation.isPending || markOOS.isPending}>
                  Move to OOS
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
