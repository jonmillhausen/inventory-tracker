'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Star, ChevronDown, ChevronUp } from 'lucide-react'
import { formatTime12, computeAvailabilityRanges, type WizardDay } from '@/lib/utils/wizardSlots'
import { createClient } from '@/lib/supabase/client'
import { useEquipment } from '@/lib/queries/equipment'
import type { Database } from '@/lib/types/database.types'

type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('default', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

type Props = {
  day: WizardDay | null
  onClose: () => void
}

export function WizardDayDetailModal({ day, onClose }: Props) {
  const open = day !== null

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [itemsCache, setItemsCache] = useState<Record<string, BookingItemRow[] | 'loading' | 'error'>>({})
  const { data: equipment } = useEquipment()
  const equipmentNameById = new Map((equipment ?? []).map(e => [e.id, e.name]))

  async function toggleExpand(bookingId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
    if (itemsCache[bookingId]) return // already fetched (data, loading, or error)

    setItemsCache(prev => ({ ...prev, [bookingId]: 'loading' }))
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('booking_items')
        .select('id, booking_id, item_id, qty, is_sub_item, parent_item_id')
        .eq('booking_id', bookingId)
        .eq('is_sub_item', false)
      if (error) throw error
      setItemsCache(prev => ({ ...prev, [bookingId]: data ?? [] }))
    } catch {
      setItemsCache(prev => ({ ...prev, [bookingId]: 'error' }))
    }
  }

  if (!day) return null

  const chainsWithSlots = day.chains.filter(c => c.slots.length > 0)
  const totalRecommended = chainsWithSlots.reduce(
    (sum, c) => sum + c.slots.filter(s => s.starred).length, 0,
  )

  // Sort chains by best slot score
  const sortedChains = [...chainsWithSlots].sort((a, b) => {
    const aScore = a.slots[0]?.score ?? 0
    const bScore = b.slots[0]?.score ?? 0
    return bScore - aScore
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formatDateLong(day.date)}</DialogTitle>
          <div className="text-sm text-gray-600">
            {chainsWithSlots.length} {chainsWithSlots.length === 1 ? 'chain' : 'chains'} available · {totalRecommended} recommended slot{totalRecommended === 1 ? '' : 's'}
          </div>
        </DialogHeader>

        {sortedChains.length === 0 && (
          <div className="text-sm text-gray-500">No available slots on this day.</div>
        )}

        <div className="space-y-4">
          {sortedChains.map(chain => (
            <div key={chain.chain_id} className="border rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: chain.chain_color }} />
                <span className="font-semibold">{chain.chain_name}</span>
              </div>

              {chain.existing_events.length > 0 && (
                <div className="mb-2 text-xs text-gray-600">
                  <div className="font-medium">Already booked:</div>
                  {chain.existing_events.map((e) => {
                    const isOpen = expanded.has(e.booking_id)
                    const items = itemsCache[e.booking_id]
                    return (
                      <div key={e.booking_id}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(e.booking_id)}
                          className="w-full flex items-center gap-1 py-0.5 hover:bg-gray-50 text-left"
                        >
                          <span className="flex-1">
                            {formatTime12(e.start)} – {formatTime12(e.end)} · {e.customer_name}
                          </span>
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {isOpen && (
                          <div className="ml-3 mt-0.5 space-y-0.5">
                            {items === 'loading' && <div className="text-gray-400">Loading…</div>}
                            {items === 'error' && <div className="text-red-600">Failed to load items</div>}
                            {Array.isArray(items) && items.length === 0 && (
                              <div className="text-gray-400">No items</div>
                            )}
                            {Array.isArray(items) && items.map(it => (
                              <div key={it.id}>• {it.qty}× {equipmentNameById.get(it.item_id) ?? it.item_id}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {(() => {
                const starred = chain.slots
                  .filter(s => s.starred)
                  .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
                const nonStarredStarts = chain.slots.filter(s => !s.starred).map(s => s.start)
                const ranges = computeAvailabilityRanges(nonStarredStarts)

                return (
                  <>
                    {starred.length > 0 && (
                      <div className="space-y-1">
                        {starred.map((s, i) => (
                          <div key={`s-${i}`} className="text-sm">
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0" />
                              <span className="font-medium">{formatTime12(s.start)} – {formatTime12(s.end)}</span>
                              <span className="text-xs text-gray-400 ml-auto">{s.available_qty} available</span>
                            </div>
                            {(s.criteria.a || s.criteria.b || s.criteria.c) && (
                              <div className="ml-6 mt-0.5 text-xs text-gray-500 space-y-0.5">
                                {s.criteria.a && <div>✓ Preferred start</div>}
                                {s.criteria.b && <div>✓ Back-to-back</div>}
                                {s.criteria.c && <div>✓ Same equipment</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {starred.length > 0 && ranges.length > 0 && (
                      <hr className="my-2 border-gray-200" />
                    )}
                    {ranges.length > 0 && (
                      <div className="space-y-1">
                        {ranges.map((r, i) => (
                          <div key={`r-${i}`} className="flex items-center gap-2 text-sm text-gray-600">
                            <span>{formatTime12(r.start)} – {formatTime12(r.end)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
