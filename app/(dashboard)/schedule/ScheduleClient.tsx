'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { usePersistedDate } from '@/lib/hooks/usePersistedDate'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { useEquipment } from '@/lib/queries/equipment'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { useTheme } from '@/components/providers/ThemeProvider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Truck, MapPin, ExternalLink, X, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
  initialEquipment: EquipmentRow[]
}

const BASE_ADDRESS = '4811 Benson Ave, Arbutus, MD 21227'
const START_H = 6
const END_H = 23
const PX_PER_MIN = 1.2
const TOTAL_PX = (END_H - START_H) * 60 * PX_PER_MIN
const FALLBACK_TRAVEL_MIN = 30

const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => i + START_H)

function yPos(minOfDay: number): number {
  return (minOfDay - START_H * 60) * PX_PER_MIN
}

function timeToMin(time: string | null | undefined): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

function getEndTimeMinutes(booking: BookingRow): number {
  const endMinutes = timeToMin(booking.end_time)
  if (booking.end_date && booking.event_date && booking.end_date > booking.event_date) {
    return endMinutes + 24 * 60
  }
  return endMinutes
}

function formatTime12(time: string | null | undefined): string {
  if (!time) return '—'
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatHour(h: number): string {
  const hour = h % 12 || 12
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${hour}${suffix}`
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length < 6) return true
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

function getSetup(
  booking: BookingRow,
  allBookingItems: BookingItemRow[],
  equipmentMap: Map<string, EquipmentRow>,
): { before: number; after: number } {
  const et = booking.event_type
  if (et === 'willcall') return { before: 0, after: 0 }
  if (et === 'dropoff') return { before: 15, after: 0 }
  if (et === 'pickup') return { before: 0, after: 15 }
  // coordinated: use custom times from equipment, default 45/45
  const items = allBookingItems.filter(bi => bi.booking_id === booking.id)
  let maxSetup = 0
  let maxCleanup = 0
  let hasCustomSetup = false
  let hasCustomCleanup = false
  for (const bi of items) {
    const eq = equipmentMap.get(bi.item_id)
    if (eq?.custom_setup_min != null) {
      hasCustomSetup = true
      maxSetup = Math.max(maxSetup, eq.custom_setup_min)
    }
    if (eq?.custom_cleanup_min != null) {
      hasCustomCleanup = true
      maxCleanup = Math.max(maxCleanup, eq.custom_cleanup_min)
    }
  }
  return { before: hasCustomSetup ? maxSetup : 45, after: hasCustomCleanup ? maxCleanup : 45 }
}

interface TravelInfo {
  minutes: number
  hasToll: boolean
}

async function fetchTravelInfo(from: string, to: string, date: string, time: string): Promise<TravelInfo> {
  try {
    const params = new URLSearchParams({ from, to, date, time })
    const res = await fetch(`/api/travel-estimates?${params}`)
    if (!res.ok) return { minutes: FALLBACK_TRAVEL_MIN, hasToll: false }
    const data = await res.json()
    return {
      minutes: typeof data.minutes === 'number' ? data.minutes : FALLBACK_TRAVEL_MIN,
      hasToll: data.has_toll === true,
    }
  } catch {
    return { minutes: FALLBACK_TRAVEL_MIN, hasToll: false }
  }
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function ScheduleClient({ initialData, initialChains, initialEquipment }: Props) {
  const { theme } = useTheme()
  const [selectedDate, setSelectedDate] = usePersistedDate('date:schedule')
  const [showTravel, setShowTravel] = useState(true)
  const [showSetup, setShowSetup] = useState(true)
  const [popupId, setPopupId] = useState<string | null>(null)
  const [travelCalcFrom, setTravelCalcFrom] = useState(BASE_ADDRESS)
  const [travelCalcResult, setTravelCalcResult] = useState<TravelInfo | null>(null)
  const [travelCalcLoading, setTravelCalcLoading] = useState(false)
  const [travelCalcError, setTravelCalcError] = useState<string | null>(null)
  // travelTimes: key = "${from}::${to}", value = { minutes, hasToll }
  const [travelTimes, setTravelTimes] = useState<Map<string, TravelInfo>>(new Map())

  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)
  const { data: equipment = [] } = useEquipment(initialEquipment)

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  const equipmentMap = useMemo(() => {
    const m = new Map<string, EquipmentRow>()
    for (const eq of equipment) m.set(eq.id, eq)
    return m
  }, [equipment])

  // Active bookings for the selected event date only.
  // Multi-day bookings still use end_date only for rendering height/duration.
  const activeBookings = useMemo(
    () => bookings.filter(b => b.event_date === selectedDate),
    [bookings, selectedDate],
  )

  const popupBooking = useMemo(
    () => activeBookings.find(b => b.id === popupId) ?? null,
    [activeBookings, popupId],
  )

  // Build chain columns: active chains that have bookings + unassigned
  interface ScheduleCol {
    id: string
    name: string
    color: string
    bookings: BookingRow[]
  }

  const columns: ScheduleCol[] = useMemo(() => {
    const chainCols: ScheduleCol[] = chains.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      bookings: activeBookings
        .filter(b => b.chain === c.id)
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    }))

    const unassigned = activeBookings.filter(b => !b.chain)
    if (unassigned.length > 0) {
      chainCols.push({
        id: '__unassigned__',
        name: 'Unassigned',
        color: '#9ca3af',
        bookings: unassigned.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
      })
    }

    return chainCols.filter(c => c.bookings.length > 0)
  }, [chains, activeBookings])

  // Fetch travel times for all routes (including return trips) when date or columns change
  const fetchAllTravelTimes = useCallback(async () => {
    if (!showTravel) return
    const pairs: Array<{ from: string; to: string; time: string }> = []

    for (const col of columns) {
      const evts = col.bookings
      for (let i = 0; i < evts.length; i++) {
        const toAddr = evts[i].address ?? ''
        if (!toAddr) continue
        if (i === 0) {
          pairs.push({ from: BASE_ADDRESS, to: toAddr, time: evts[i].start_time ?? '08:00' })
        } else {
          const fromAddr = evts[i - 1].address ?? ''
          if (fromAddr) {
            pairs.push({ from: fromAddr, to: toAddr, time: evts[i].start_time ?? '08:00' })
          }
        }
      }
      // Return trip: last event back to base
      const lastEvt = evts[evts.length - 1]
      if (lastEvt?.address) {
        const returnTime = lastEvt.end_time ?? '17:00'
        pairs.push({ from: lastEvt.address, to: BASE_ADDRESS, time: returnTime })
      }
    }

    if (pairs.length === 0) return

    const results = await Promise.all(
      pairs.map(p =>
        fetchTravelInfo(p.from, p.to, selectedDate, p.time).then(info => ({
          key: `${p.from}::${p.to}`,
          info,
        }))
      )
    )

    setTravelTimes(prev => {
      const next = new Map(prev)
      for (const { key, info } of results) next.set(key, info)
      return next
    })
  }, [columns, selectedDate, showTravel])

  useEffect(() => {
    fetchAllTravelTimes()
  }, [fetchAllTravelTimes])

  useEffect(() => {
    if (!popupBooking) return

    const col = columns.find(c => c.bookings.some(b => b.id === popupBooking.id))
    const bookingIndex = col?.bookings.findIndex(b => b.id === popupBooking.id) ?? -1
    const defaultFrom = bookingIndex > 0 ? (col?.bookings[bookingIndex - 1].address ?? BASE_ADDRESS) : BASE_ADDRESS

    setTravelCalcFrom(defaultFrom)
    setTravelCalcResult(null)
    setTravelCalcError(null)
  }, [popupBooking, columns])

  const calculatePopupTravel = useCallback(async (booking: BookingRow) => {
    if (!booking.address) return

    setTravelCalcLoading(true)
    setTravelCalcError(null)

    try {
      const result = await fetchTravelInfo(travelCalcFrom, booking.address, selectedDate, booking.start_time ?? '08:00')
      setTravelCalcResult(result)
    } catch {
      setTravelCalcError('Unable to calculate travel time')
    } finally {
      setTravelCalcLoading(false)
    }
  }, [selectedDate, travelCalcFrom])

  function getTravelInfo(from: string, to: string): TravelInfo {
    return travelTimes.get(`${from}::${to}`) ?? { minutes: FALLBACK_TRAVEL_MIN, hasToll: false }
  }

  // Map: colId → overlap windows (exact time ranges in minutes) to render as overlays
  interface OverlapWindow { startMin: number; endMin: number }
  const columnOverlaps = useMemo(() => {
    const result = new Map<string, OverlapWindow[]>()
    for (const col of columns) {
      const evts = col.bookings
      const windows: OverlapWindow[] = []
      for (let i = 1; i < evts.length; i++) {
        const prev = evts[i - 1]
        const curr = evts[i]
        const prevSeqEnd = getEndTimeMinutes(prev) + getSetup(prev, bookingItems, equipmentMap).after
        const fromAddr = prev.address ?? BASE_ADDRESS
        const toAddr = curr.address ?? ''
        const travel = toAddr ? getTravelInfo(fromAddr, toAddr).minutes : FALLBACK_TRAVEL_MIN
        const currNeedsDepartBy = timeToMin(curr.start_time) - getSetup(curr, bookingItems, equipmentMap).before - travel
        if (currNeedsDepartBy < prevSeqEnd) {
          windows.push({ startMin: currNeedsDepartBy, endMin: prevSeqEnd })
        }
      }
      if (windows.length > 0) result.set(col.id, windows)
    }
    return result
  }, [columns, travelTimes, bookingItems, equipmentMap])

  const colWidth = Math.max(120, 900 / Math.max(columns.length, 1))
  const gridWidth = 50 + colWidth * columns.length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Schedule Board</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate(prevDay(selectedDate))}
              className="border rounded px-1 py-1 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
            <Input
              id="schedDate"
              type="date"
              className="w-44"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
            <button
              onClick={() => setSelectedDate(nextDay(selectedDate))}
              className="border rounded px-1 py-1 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label="Next day"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))}
              className="border rounded px-2 py-1 text-sm text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Today
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTravel}
              onChange={() => setShowTravel(v => !v)}
              className="accent-blue-500"
            />
            Travel Time
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSetup}
              onChange={() => setShowSetup(v => !v)}
              className="accent-blue-500"
            />
            Setup/Cleanup
          </label>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        {activeBookings.length} event{activeBookings.length !== 1 ? 's' : ''} on{' '}
        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })}
      </div>

      {columns.length === 0 ? (
        <div className="rounded-md border dark:border-gray-700 bg-white dark:bg-gray-800 py-16 text-center text-sm text-gray-400">
          No events scheduled for this date
        </div>
      ) : (
        <div className="rounded-md border dark:border-gray-700 bg-white dark:bg-gray-800 overflow-auto" style={{ maxHeight: 'calc(100vh - 190px)' }}>
          <div style={{ minWidth: gridWidth, display: 'grid', gridTemplateColumns: `50px repeat(${columns.length}, 1fr)` }}>
            {/* Header row — sticky */}
            <div className="bg-gray-50 dark:bg-gray-700/50 border-b-2 border-gray-200 dark:border-gray-600 p-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 sticky top-0 z-20">
              Time
            </div>
            {columns.map(col => {
              const hasOverlap = (columnOverlaps.get(col.id)?.length ?? 0) > 0
              return (
                <div
                  key={col.id}
                  className="bg-gray-50 dark:bg-gray-700/50 border-b-2 border-gray-200 dark:border-gray-600 border-l border-gray-100 dark:border-gray-700 p-1.5 text-center sticky top-0 z-20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                      style={{ backgroundColor: col.color + '33', color: col.color, border: `1px solid ${col.color}66` }}
                    >
                      {col.name}
                    </span>
                    {hasOverlap && (
                      <span title="Schedule overlap detected">
                        <Clock size={11} className="text-red-500 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Time label column */}
            <div className="relative border-r border-gray-100" style={{ height: TOTAL_PX }}>
              {HOURS.map(h => (
                <div
                  key={h}
                  className="absolute left-0 right-0 text-right pr-1"
                  style={{ top: yPos(h * 60) - 6 }}
                >
                  <span className="text-xs text-gray-700 dark:text-gray-400">
                    {formatHour(h)}
                  </span>
                </div>
              ))}
              {/* No grid lines here — chain columns draw their own lines */}
            </div>

            {/* Chain columns */}
            {columns.map(col => {
              const evts = col.bookings
              return (
                <div
                  key={col.id}
                  className="relative border-l border-gray-100"
                  style={{ height: TOTAL_PX }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map(h => (
                    <div
                      key={'g' + h}
                      className="absolute left-0 right-0 border-b border-gray-100"
                      style={{ top: yPos(h * 60), height: 0 }}
                    />
                  ))}

                  {/* Overlap overlays — rendered on top of all event blocks */}
                  {(columnOverlaps.get(col.id) ?? []).map((w, wi) => {
                    const durationMin = Math.round(w.endMin - w.startMin)
                    return (
                      <div
                        key={`overlap-${wi}`}
                        className="absolute left-0.5 right-0.5 flex items-center justify-center pointer-events-none rounded"
                        style={{
                          top: yPos(w.startMin),
                          height: Math.max(durationMin * PX_PER_MIN, 10),
                          backgroundColor: 'rgba(254, 202, 202, 0.85)',
                          border: '1px solid #ef4444',
                          fontSize: 8,
                          color: '#991b1b',
                          fontWeight: 600,
                          zIndex: 10,
                        }}
                      >
                        {durationMin}m overlap
                      </div>
                    )
                  })}

                  {evts.map((booking, bi) => {
                    const s = timeToMin(booking.start_time)
                    const e = getEndTimeMinutes(booking)
                    const su = getSetup(booking, bookingItems, equipmentMap)
                    const eventHeight = Math.max((e - s) * PX_PER_MIN, 20)
                    const fromAddr = bi === 0 ? BASE_ADDRESS : (evts[bi - 1].address ?? BASE_ADDRESS)
                    const toAddr = booking.address ?? ''
                    const travelInfo = toAddr ? getTravelInfo(fromAddr, toAddr) : { minutes: FALLBACK_TRAVEL_MIN, hasToll: false }
                    const isLast = bi === evts.length - 1
                    const isOpen = popupId === booking.id

                    // Return travel info (last event → base)
                    const returnInfo = isLast && toAddr
                      ? getTravelInfo(toAddr, BASE_ADDRESS)
                      : { minutes: FALLBACK_TRAVEL_MIN, hasToll: false }

                    // booking items for equipment list in popup
                    const items = bookingItems.filter(bi2 => bi2.booking_id === booking.id)

                    return (
                      <div key={booking.id}>
                        {/* Travel to event block */}
                        {showTravel && (
                          <div
                            className="absolute left-0.5 right-0.5 flex items-center justify-center gap-0.5 rounded overflow-hidden border border-gray-200"
                            style={{
                              top: bi === 0
                                ? yPos(Math.max(s - su.before - travelInfo.minutes, START_H * 60))
                                : yPos(getEndTimeMinutes(evts[bi - 1]) + getSetup(evts[bi - 1], bookingItems, equipmentMap).after),
                              height: bi === 0
                                ? travelInfo.minutes * PX_PER_MIN
                                : Math.max(
                                    Math.min(
                                      travelInfo.minutes,
                                      Math.max(s - su.before - getEndTimeMinutes(evts[bi - 1]) - getSetup(evts[bi - 1], bookingItems, equipmentMap).after, 0)
                                    ),
                                    0
                                  ) * PX_PER_MIN || travelInfo.minutes * PX_PER_MIN,
                              backgroundColor: '#f1f5f9',
                              fontSize: 8,
                              color: '#64748b',
                            }}
                          >
                            <Truck size={8} />
                            <span>{travelInfo.minutes}m</span>
                            {travelInfo.hasToll && <span title="Toll route">🛣️</span>}
                          </div>
                        )}

                        {/* Setup block */}
                        {showSetup && su.before > 0 && (
                          <div
                            className="absolute left-0.5 right-0.5 flex items-center justify-center rounded"
                            style={{
                              top: yPos(s - su.before),
                              height: su.before * PX_PER_MIN,
                              backgroundColor: theme === 'dark' ? col.color + '59' : undefined,
                              border: `1px dashed ${col.color}`,
                              fontSize: 8,
                              color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : '#1e293b',
                            }}
                          >
                            {su.before}m Setup
                          </div>
                        )}

                        {/* Event block */}
                        <div
                          onClick={() => setPopupId(isOpen ? null : booking.id)}
                          className="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer"
                          style={{
                            top: yPos(s),
                            height: eventHeight,
                            backgroundColor: theme === 'dark' ? col.color : col.color + '33',
                            border: `2px solid ${col.color}`,
                            padding: '2px 4px',
                            fontSize: 9,
                          }}
                        >
                          <div className="font-bold truncate" style={{ color: theme === 'dark' ? (isLightColor(col.color) ? '#1e293b' : '#fff') : '#1e293b' }}>
                            {booking.customer_name || 'Event'}
                          </div>
                          <div style={{ opacity: 0.7, fontSize: 8 }}>
                            {formatTime12(booking.start_time)}–{formatTime12(booking.end_time)}
                          </div>
                          <div style={{ fontSize: 7, textTransform: 'capitalize', opacity: 0.6 }}>
                            {booking.event_type ?? 'coordinated'}
                          </div>
                        </div>

                        {/* Event popup */}
                        {isOpen && (
                          <div
                            onClick={ev => ev.stopPropagation()}
                            className="absolute left-0 right-0 z-50 bg-white border border-gray-200 rounded-md shadow-lg text-gray-900"
                            style={{
                              top: yPos(s) + eventHeight + 4,
                              padding: 10,
                              fontSize: 11,
                            }}
                          >
                            <div className="flex items-start justify-between mb-1.5">
                              <div>
                                <div className="font-bold text-gray-900" style={{ fontSize: 12 }}>
                                  {booking.customer_name || 'Unnamed'}
                                </div>
                                {booking.zenbooker_job_id && (
                                  <a
                                    href={`https://zenbooker.com/app?view=jobs&view-job=${booking.zenbooker_job_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={ev => ev.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-blue-500 hover:underline"
                                    style={{ fontSize: 10 }}
                                  >
                                    View in Zenbooker <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                              <button
                                onClick={() => setPopupId(null)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X size={12} />
                              </button>
                            </div>

                            {booking.address && (
                              <div className="flex items-center gap-1 text-gray-500 mb-1.5" style={{ fontSize: 10 }}>
                                <MapPin size={9} />
                                {booking.address}
                              </div>
                            )}

                            <div className="space-y-2 mb-2">
                              <div className="text-gray-400 uppercase tracking-[0.2em] text-[10px]">
                                Travel estimate
                              </div>
                              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                <Input
                                  value={travelCalcFrom}
                                  onChange={e => {
                                    setTravelCalcFrom(e.target.value)
                                    setTravelCalcResult(null)
                                    setTravelCalcError(null)
                                  }}
                                  placeholder="From address"
                                  className="min-w-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => calculatePopupTravel(booking)}
                                  disabled={travelCalcLoading || !booking.address || !travelCalcFrom.trim()}
                                  className="inline-flex items-center justify-center rounded bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {travelCalcLoading ? 'Calculating…' : 'Estimate'}
                                </button>
                              </div>
                              {!booking.address && (
                                <div className="text-xs text-red-500">Event address is required to calculate travel time.</div>
                              )}
                              {travelCalcResult && booking.address && (
                                <div className="text-xs text-gray-700">
                                  Estimated travel from <span className="font-semibold">{travelCalcFrom}</span> to <span className="font-semibold">{booking.address}</span>: <span className="font-semibold">{travelCalcResult.minutes}m</span>
                                  {travelCalcResult.hasToll ? ' · Toll route likely' : ' · Toll-free route available'}
                                </div>
                              )}
                              {travelCalcError && <div className="text-xs text-red-500">{travelCalcError}</div>}
                            </div>

                            {items.length > 0 && (
                              <div>
                                <div className="text-gray-400 font-semibold uppercase mb-1" style={{ fontSize: 9, letterSpacing: '0.5px' }}>
                                  Equipment
                                </div>
                                {items.map((item, i) => (
                                  <div key={i} className="text-gray-900" style={{ fontSize: 10, padding: '1px 0' }}>
                                    <span className="font-semibold mr-1">×{item.qty}</span>
                                    <span>{equipmentMap.get(item.item_id)?.name ?? item.item_id}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Cleanup block */}
                        {showSetup && su.after > 0 && (
                          <div
                            className="absolute left-0.5 right-0.5 flex items-center justify-center rounded"
                            style={{
                              top: yPos(e),
                              height: su.after * PX_PER_MIN,
                              backgroundColor: theme === 'dark' ? col.color + '59' : undefined,
                              border: `1px dashed ${col.color}`,
                              fontSize: 8,
                              color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : '#1e293b',
                            }}
                          >
                            {su.after}m Cleanup
                          </div>
                        )}

                        {/* Return travel block (last event only) */}
                        {isLast && showTravel && toAddr && (
                          <div
                            className="absolute left-0.5 right-0.5 flex items-center justify-center gap-0.5 rounded overflow-hidden border border-gray-200"
                            style={{
                              top: yPos(e + su.after),
                              height: returnInfo.minutes * PX_PER_MIN,
                              backgroundColor: '#f1f5f9',
                              fontSize: 8,
                              color: '#64748b',
                            }}
                          >
                            <Truck size={8} />
                            <span>{returnInfo.minutes}m</span>
                            {returnInfo.hasToll && <span title="Toll route">🛣️</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {columns.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {columns.map(col => (
            <div key={col.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
              {col.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
