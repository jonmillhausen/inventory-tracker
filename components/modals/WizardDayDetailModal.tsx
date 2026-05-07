'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Star } from 'lucide-react'
import { formatTime12, computeAvailabilityRanges, type WizardDay } from '@/lib/utils/wizardSlots'

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('default', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function criteriaText(c: { a: boolean; b: boolean; c: boolean }): string {
  const out: string[] = []
  if (c.a) out.push('✓ Preferred start')
  if (c.b) out.push('✓ Back-to-back')
  if (c.c) out.push('✓ Same equipment')
  return out.join(' · ')
}

type Props = {
  day: WizardDay | null
  onClose: () => void
}

export function WizardDayDetailModal({ day, onClose }: Props) {
  const open = day !== null
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
                  {chain.existing_events.map((e, i) => (
                    <div key={i}>{formatTime12(e.start)} – {formatTime12(e.end)} · {e.customer_name}</div>
                  ))}
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
                          <div key={`s-${i}`} className="flex items-center gap-2 text-sm">
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 shrink-0" />
                            <span className="font-medium">{formatTime12(s.start)} – {formatTime12(s.end)}</span>
                            <span className="text-xs text-gray-500">{criteriaText(s.criteria)}</span>
                            <span className="text-xs text-gray-400 ml-auto">{s.available_qty} available</span>
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
