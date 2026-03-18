'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
}

const START_MIN = 7 * 60   // 420 — 7:00am
const END_MIN = 22 * 60    // 1320 — 10:00pm
const RANGE = END_MIN - START_MIN  // 900

function timeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function getLeft(startTime: string): string {
  const min = Math.max(timeToMin(startTime), START_MIN)
  return `${((min - START_MIN) / RANGE) * 100}%`
}

function getWidth(startTime: string, endTime: string): string {
  const start = Math.max(timeToMin(startTime), START_MIN)
  const end = Math.min(timeToMin(endTime), END_MIN)
  return `${(Math.max(0, end - start) / RANGE) * 100}%`
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 7 through 22

export function ScheduleClient({ initialData, initialChains }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)

  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)

  const bookings = data?.bookings ?? []

  // Active, non-canceled bookings for selected date
  const activeBookings = useMemo(() => {
    return bookings.filter(b => isBookingActiveOnDate(b, selectedDate))
  }, [bookings, selectedDate])

  // Build rows: one per active chain + unassigned
  interface ScheduleRow {
    id: string
    name: string
    color: string
    bookings: BookingRow[]
  }

  const rows: ScheduleRow[] = useMemo(() => {
    const chainRows: ScheduleRow[] = chains.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      bookings: activeBookings.filter(b => b.chain === c.id),
    }))

    const unassigned = activeBookings.filter(b => !b.chain)
    if (unassigned.length > 0) {
      chainRows.push({
        id: '__unassigned__',
        name: 'Unassigned',
        color: '#9ca3af',
        bookings: unassigned,
      })
    }

    return chainRows.filter(r => r.bookings.length > 0 || chains.find(c => c.id === r.id))
  }, [chains, activeBookings])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule Board</h1>
        <div className="flex items-center gap-2">
          <Label htmlFor="schedDate" className="text-sm font-medium">Date</Label>
          <Input
            id="schedDate"
            type="date"
            className="w-44"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="text-sm text-gray-500">
        {activeBookings.length} event{activeBookings.length !== 1 ? 's' : ''} on{' '}
        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        })}
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <div style={{ minWidth: '900px' }}>
          {/* Time header */}
          <div className="flex border-b">
            <div className="flex-none w-32" />
            <div className="flex flex-1">
              {HOURS.map(h => (
                <div
                  key={h}
                  className="flex-1 text-xs text-center text-gray-400 py-1 border-l"
                >
                  {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                </div>
              ))}
            </div>
          </div>

          {/* Chain rows */}
          {rows.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No events scheduled for this date
            </div>
          ) : (
            rows.map(row => (
              <div key={row.id} className="flex border-b last:border-b-0 hover:bg-gray-50">
                {/* Chain label */}
                <div
                  className="flex-none w-32 px-3 py-2 flex items-center text-sm font-medium truncate"
                  style={{ color: row.color }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 flex-none"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate">{row.name}</span>
                </div>

                {/* Timeline area */}
                <div className="relative flex-1 h-14 border-l">
                  {/* Hour grid lines */}
                  {HOURS.slice(1).map(h => (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 border-l border-gray-100"
                      style={{ left: `${((h * 60 - START_MIN) / RANGE) * 100}%` }}
                    />
                  ))}

                  {/* Booking cards */}
                  {row.bookings.map(booking => (
                    <div
                      key={booking.id}
                      className="absolute top-1 bottom-1 rounded text-xs text-white px-1 overflow-hidden flex items-center cursor-default select-none shadow-sm"
                      style={{
                        left: getLeft(booking.start_time),
                        width: getWidth(booking.start_time, booking.end_time),
                        backgroundColor: row.color,
                        minWidth: '4px',
                      }}
                      title={`${booking.customer_name}\n${formatTime12(booking.start_time)}–${formatTime12(booking.end_time)}\n${booking.event_type}\n${booking.address}`}
                    >
                      <span className="truncate">
                        {booking.customer_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      {chains.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chains.map(c => (
            <div key={c.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
