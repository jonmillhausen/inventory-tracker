'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useResolveIssueFlag, useMarkOOS, useMarkSubItemOOS } from '@/lib/queries/equipment'
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
  // When set, we're in the "confirm move to OOS" step for this flag
  const [pendingOOS, setPendingOOS] = useState<{ flag: IssueFlagRow; returnDate: string } | null>(null)

  const mutation = useResolveIssueFlag()
  const markOOS = useMarkOOS()
  const markSubItemOOS = useMarkSubItemOOS()

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

  async function resolve(flag: IssueFlagRow, action: 'cleared' | 'moved_to_oos', returnDate?: string | null) {
    try {
      if (action === 'moved_to_oos') {
        const shared = {
          quantity: flag.qty ?? 1,
          issue_description: flag.note ?? null,
          expected_return_date: returnDate ?? null,
        }
        if (flag.item_type === 'equipment') {
          await markOOS.mutateAsync({ equipmentId: flag.item_id, ...shared })
        } else if (flag.item_type === 'sub_item') {
          await markSubItemOOS.mutateAsync({ subItemId: flag.item_id, ...shared })
        }
      }
      await mutation.mutateAsync({ id: flag.id, resolved_action: action })
      setPendingOOS(null)
      setFlags(prev => {
        const next = prev.filter(f => f.id !== flag.id)
        if (next.length === 0) onClose()
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve flag')
    }
  }

  const isPending = mutation.isPending || markOOS.isPending || markSubItemOOS.isPending

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

              {/* Confirm Move to OOS step */}
              {pendingOOS?.flag.id === flag.id ? (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor={`return-date-${flag.id}`} className="text-xs">
                      Expected Return Date <span className="text-gray-400">(optional)</span>
                    </Label>
                    <Input
                      id={`return-date-${flag.id}`}
                      type="date"
                      value={pendingOOS.returnDate}
                      onChange={e => setPendingOOS(prev => prev ? { ...prev, returnDate: e.target.value } : null)}
                      placeholder="mm/dd/yyyy"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => resolve(flag, 'moved_to_oos', pendingOOS.returnDate || null)}
                      disabled={isPending}
                    >
                      Confirm Move to OOS
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolve(flag, 'moved_to_oos', null)}
                      disabled={isPending}
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingOOS(null)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => resolve(flag, 'cleared')}
                    disabled={isPending}>
                    Clear
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => setPendingOOS({ flag, returnDate: '' })}
                    disabled={isPending}>
                    Move to OOS
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
