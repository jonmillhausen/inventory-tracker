'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { useEquipment } from '@/lib/queries/equipment'
import { isBookingActiveOnDate, calculateAvailability } from '@/lib/utils/availability'
import { AlertTriangle, Clock, CircleHelp } from 'lucide-react'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
  initialEquipment: EquipmentRow[]
}

const FALLBACK_TRAVEL_MIN = 30

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

function formatDayMonth(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length < 6) return true
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

interface DayCell {
  date: string
  eventCount: number
  chainIds: string[]           // unique chain IDs with bookings
  hasUnassigned: boolean
  isOverbooked: boolean        // any equipment remaining < 0
  hasOverlap: boolean          // any booking sequence overlaps with 30-min fallback travel
}

function computeDayCell(
  date: string,
  bookings: BookingRow[],
  bookingItems: BookingsData['bookingItems'],
  equipment: EquipmentRow[],
  chains: ChainRow[],
): DayCell {
  const active = bookings.filter(b => isBookingActiveOnDate(b, date))
  const eventCount = active.length

  const chainIds = [...new Set(active.filter(b => b.chain).map(b => b.chain!))]
  const hasUnassigned = active.some(b => !b.chain)

  // Overbooking: use calculateAvailability (no sub-items needed for overbooking check)
  const rows = calculateAvailability(equipment, [], bookings, bookingItems, date)
  const isOverbooked = rows.some(r => r.remaining < 0)

  // Overlap: per chain, check if any booking sequence has travel+setup overlap (30-min fallback)
  let hasOverlap = false
  for (const chain of chains) {
    const chainBookings = active
      .filter(b => b.chain === chain.id)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

    for (let i = 1; i < chainBookings.length; i++) {
      const prev = chainBookings[i - 1]
      const curr = chainBookings[i]
      // Simplified overlap: does current event start before prev ends + 30min travel?
      const prevEnd = timeToMin(prev.end_time)
      const currStart = timeToMin(curr.start_time)
      if (currStart < prevEnd + FALLBACK_TRAVEL_MIN) {
        hasOverlap = true
        break
      }
    }
    if (hasOverlap) break
  }

  return { date, eventCount, chainIds, hasUnassigned, isOverbooked, hasOverlap }
}

export function AuditClient({ initialData, initialChains, initialEquipment }: Props) {
  const router = useRouter()
  const [anchorDate, setAnchorDate] = useState(todayStr)

  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)
  const { data: equipment = [] } = useEquipment(initialEquipment)

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // 14 dates starting from anchorDate
  const dates = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(anchorDate, i)),
    [anchorDate],
  )

  // Day of week labels (Sun, Mon, ...) from dates[0]
  const dowLabels = useMemo(
    () => dates.slice(0, 7).map(d => formatDayOfWeek(d)),
    [dates],
  )

  // Compute cells for all 14 dates
  const cells = useMemo(
    () => dates.map(date => computeDayCell(date, bookings, bookingItems, equipment, chains)),
    [dates, bookings, bookingItems, equipment, chains],
  )

  // Chain map for color lookup
  const chainMap = useMemo(
    () => new Map(chains.map(c => [c.id, c])),
    [chains],
  )

  function handleCellClick(date: string) {
    try { sessionStorage.setItem('date:schedule', date) } catch {}
    router.push('/schedule')
  }

  function renderCell(cell: DayCell, isToday: boolean) {
    const chainObjs = cell.chainIds.map(id => chainMap.get(id)).filter(Boolean) as ChainRow[]

    return (
      <div
        key={cell.date}
        onClick={() => handleCellClick(cell.date)}
        className={`
          border rounded-lg p-2.5 cursor-pointer transition-colors min-h-[110px]
          ${isToday ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-white hover:bg-gray-50'}
        `}
      >
        <div className="text-sm font-semibold text-gray-700 mb-1">{formatDayMonth(cell.date)}</div>

        {cell.eventCount === 0 ? (
          <div className="text-xs text-gray-300 mt-2">No events</div>
        ) : (
          <>
            <div className="text-sm text-gray-500 mb-1.5">
              {cell.eventCount} event{cell.eventCount !== 1 ? 's' : ''}
            </div>

            {/* Chain circles */}
            {chainObjs.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {chainObjs.map(c => (
                  <span
                    key={c.id}
                    className="inline-flex items-center justify-center rounded-full text-[9px] font-bold w-5 h-5"
                    style={{
                      backgroundColor: c.color,
                      color: isLightColor(c.color) ? '#1e293b' : '#fff',
                    }}
                    title={c.name}
                  >
                    {c.name === 'Will Call' ? 'W' : c.name.replace(/\D/g, '').slice(0, 2) || c.name[0]}
                  </span>
                ))}
                {cell.hasUnassigned && (
                  <span
                    className="inline-flex items-center justify-center rounded-full text-[9px] font-bold w-5 h-5"
                    style={{ backgroundColor: '#9ca3af', color: '#fff' }}
                    title="Unassigned"
                  >
                    U
                  </span>
                )}
              </div>
            )}

            {/* Warning icons — 2× original size */}
            <div className="flex gap-1.5 mt-1">
              {cell.isOverbooked && (
                <span title="Equipment overbooked">
                  <AlertTriangle size={22} className="text-red-500" />
                </span>
              )}
              {cell.hasOverlap && (
                <span title="Schedule overlap">
                  <Clock size={22} className="text-orange-500" />
                </span>
              )}
              {cell.hasUnassigned && (
                <span title="Unassigned events">
                  <CircleHelp size={22} className="text-gray-400" />
                </span>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  const today = todayStr()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">2-Week Audit</h1>
        <button
          onClick={() => setAnchorDate(todayStr())}
          className="border rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
        >
          Today
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><AlertTriangle size={13} className="text-red-500" /> Overbooked</span>
        <span className="flex items-center gap-1"><Clock size={13} className="text-orange-500" /> Overlap</span>
        <span className="flex items-center gap-1"><CircleHelp size={13} className="text-gray-400" /> Unassigned</span>
      </div>

      {/* Week 1 */}
      <div>
        <div className="grid grid-cols-7 gap-1.5 mb-1">
          {dowLabels.map((dow, i) => (
            <div key={i} className="text-[11px] font-semibold text-gray-400 text-center px-1">
              {dow}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.slice(0, 7).map(cell => renderCell(cell, cell.date === today))}
        </div>
      </div>

      {/* Week 2 */}
      <div>
        <div className="grid grid-cols-7 gap-1.5 mb-1">
          {dates.slice(7, 14).map((d, i) => (
            <div key={i} className="text-[11px] font-semibold text-gray-400 text-center px-1">
              {formatDayOfWeek(d)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.slice(7, 14).map(cell => renderCell(cell, cell.date === today))}
        </div>
      </div>
    </div>
  )
}
