'use client'

import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { useBookings, type BookingsData } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { usePersistedDate } from '@/lib/hooks/usePersistedDate'
import {
  calculateAvailability,
  computeChainTimes,
  computeStats,
  getChainBookings,
  type AvailabilityRow,
  type AvailabilityStatus,
  type ChainBooking,
} from '@/lib/utils/availability'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialBookings: BookingsData
  initialChains: ChainRow[]
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

function chainLabel(name: string): string {
  return name.replace('Chain ', 'C')
}

function to12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')}${ap}`
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

function StatusBadge({ status }: { status: AvailabilityStatus }) {
  const map: Record<AvailabilityStatus, { bg: string; text: string; label: string }> = {
    overbooked: { bg: 'bg-red-900',    text: 'text-white',      label: '⚠ OVERBOOKED' },
    sold_out:   { bg: 'bg-red-50',     text: 'text-red-600',    label: 'SOLD OUT' },
    critical:   { bg: 'bg-yellow-50',  text: 'text-amber-600',  label: 'CRITICAL' },
    low:        { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'LOW' },
    available:  { bg: 'bg-green-50',   text: 'text-green-700',  label: 'AVAILABLE' },
  }
  const { bg, text, label } = map[status]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${bg} ${text}`}>
      {label}
    </span>
  )
}

function ChainPopup({
  chain,
  bookings,
  eqById,
  onClose,
}: {
  chain: string
  bookings: ChainBooking[]
  eqById: Map<string, string>
  onClose: () => void
}) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-64 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg p-3 text-left"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold text-xs dark:text-gray-100">{chain}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">✕</button>
      </div>
      {bookings.length === 0 ? (
        <p className="text-xs text-gray-400">No bookings</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {bookings.map(b => (
            <div key={b.id} className="text-xs border-b dark:border-gray-700 pb-2 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium dark:text-gray-100">{b.customer_name}</span>
                {b.zenbooker_job_id && (
                  <a
                    href={`https://zenbooker.com/app?view=jobs&view-job=${b.zenbooker_job_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-blue-500 hover:text-blue-700 flex-shrink-0"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <div className="text-gray-400">{b.start_time ? to12(b.start_time) : '—'} – {b.end_time ? to12(b.end_time) : '—'}</div>
              <div className="text-gray-400 truncate">{b.address}</div>
              {b.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {b.items.map((item, i) => (
                    <li key={i} className="text-gray-600">
                      {item.qty}× {eqById.get(item.item_id) ?? item.item_id}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AvailabilityClient({
  initialEquipment,
  initialSubItems,
  initialBookings,
  initialChains,
}: Props) {
  const [selectedDate, setSelectedDate] = usePersistedDate('date:availability')
  const [search, setSearch] = useState('')
  const [bookedOnly, setBookedOnly] = useState(false)
  const [openChainPop, setOpenChainPop] = useState<string | null>(null)

  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: bookingsData = initialBookings } = useBookings(initialBookings)
  const { data: chains = [] } = useChains(initialChains)

  const rows = useMemo(
    () => calculateAvailability(
      equipment,
      subItems,
      bookingsData.bookings,
      bookingsData.bookingItems,
      selectedDate
    ),
    [equipment, subItems, bookingsData, selectedDate]
  )

  const chainTimes = useMemo(
    () => computeChainTimes(bookingsData.bookings, selectedDate, bookingsData.bookingItems, equipment),
    [bookingsData, selectedDate, equipment]
  )

  const stats = useMemo(
    () => computeStats(rows, bookingsData.bookings, selectedDate),
    [rows, bookingsData, selectedDate]
  )

  const eqById = useMemo(
    () => new Map(equipment.map(e => [e.id, e.name])),
    [equipment]
  )

  const filteredRows = useMemo(
    () => rows.filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase()) &&
      (!bookedOnly || r.total_booked > 0)
    ),
    [rows, search, bookedOnly]
  )

  // Chain columns: named chains first (alphabetically), Will Call last
  const chainColumns = useMemo(() => {
    const named = chains.filter(c => c.name !== 'Will Call').sort((a, b) => a.name.localeCompare(b.name))
    const wc = chains.find(c => c.name === 'Will Call')
    return [...named, ...(wc ? [wc] : [])]
  }, [chains])

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Availability</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate(prevDay(selectedDate))}
            className="border rounded px-1 py-1 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="Previous day"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border dark:border-gray-600 rounded px-2 py-1 text-sm dark:bg-gray-800 dark:text-gray-100"
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

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Events Today',  value: stats.events,     color: 'text-blue-600' },
          { label: 'Chains Active', value: stats.chains,     color: 'text-purple-600' },
          { label: 'Sold Out',      value: stats.soldOut,    color: 'text-red-600' },
          { label: 'Overbooked',    value: stats.overbooked, color: 'text-red-900' },
          { label: 'Low Stock',     value: stats.low,        color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 font-mono ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            placeholder="Search equipment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm pl-8 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <button
          onClick={() => setBookedOnly(v => !v)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            bookedOnly
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          {bookedOnly ? 'Show All Equipment' : 'Show Booked Only'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-sm min-w-[160px]">Equipment</th>
                <th className="px-3 py-3 font-medium text-center">Total</th>
                <th className="px-3 py-3 font-medium text-center">Avail.</th>

                {/* Chain columns with color badges and time ranges */}
                {chainColumns.map(chain => {
                  const times = chainTimes[chain.id]
                  const hasBookings = !!times
                  return (
                    <th
                      key={chain.id}
                      className="px-2 py-2 text-center cursor-pointer select-none relative"
                      style={{ minWidth: 52 }}
                      onClick={() =>
                        hasBookings && setOpenChainPop(openChainPop === chain.name ? null : chain.name)
                      }
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{
                            backgroundColor: chain.color,
                            color: isLightColor(chain.color) ? '#000' : '#fff',
                          }}
                        >
                          {chain.name === 'Will Call' ? 'WC' : chainLabel(chain.name)}
                        </span>
                        {times && (
                          <span className="text-[8px] text-gray-400 whitespace-nowrap">
                            {to12(times.start)}–{to12(times.end)}
                          </span>
                        )}
                        {/* Chain popup */}
                        {openChainPop === chain.name && (
                          <ChainPopup
                            chain={chain.name}
                            bookings={getChainBookings(
                              bookingsData.bookings,
                              bookingsData.bookingItems,
                              selectedDate,
                              chain.id
                            )}
                            eqById={eqById}
                            onClose={() => setOpenChainPop(null)}
                          />
                        )}
                      </div>
                    </th>
                  )
                })}

                {/* Unassigned column */}
                <th className="px-2 py-3 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">Unasgn</th>

                <th className="px-3 py-3 font-medium text-center">Booked</th>
                <th className="px-3 py-3 font-medium text-center">Remaining</th>
                <th className="px-3 py-3 font-medium text-center min-w-[100px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6 + chainColumns.length}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No active equipment
                  </td>
                </tr>
              )}
              {filteredRows.map((row, idx) => (
                <tr key={row.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/30'}>
                  <td className="px-4 py-2.5 font-medium text-sm">{row.name}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400">{row.total_qty}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={
                        row.out_of_service > 0 || row.issue_flag > 0
                          ? 'text-amber-600 font-medium'
                          : 'text-gray-600 dark:text-gray-300'
                      }
                    >
                      {row.available_qty}
                    </span>
                  </td>
                  {chainColumns.map(chain => (
                    <td key={chain.id} className="px-2 py-2.5 text-center font-mono text-xs">
                      <span
                        className={
                          row.chain_qty[chain.id] > 0
                            ? 'text-gray-900 dark:text-gray-100 font-medium'
                            : 'text-gray-200 dark:text-gray-700'
                        }
                      >
                        {row.chain_qty[chain.id] || '—'}
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-center font-mono text-xs">
                    <span
                      className={
                        (row.chain_qty['Unassigned'] ?? 0) > 0
                          ? 'text-amber-600 font-medium'
                          : 'text-gray-200 dark:text-gray-700'
                      }
                    >
                      {row.chain_qty['Unassigned'] || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-semibold">
                    {row.total_booked || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold">
                    <span
                      className={
                        row.remaining < 0
                          ? 'text-red-700'
                          : row.remaining === 0
                          ? 'text-red-500'
                          : 'text-green-600'
                      }
                    >
                      {row.remaining}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Click outside to close chain popup */}
      {openChainPop && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenChainPop(null)}
        />
      )}
    </div>
  )
}
