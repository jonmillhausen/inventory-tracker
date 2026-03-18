'use client'

import React, { useMemo, useState } from 'react'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { useBookings, type BookingsData } from '@/lib/queries/bookings'
import { calculateAvailability } from '@/lib/utils/availability'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialBookings: BookingsData
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function availabilityBadge(available: number, total: number) {
  if (available <= 0) return <Badge variant="destructive">0 / {total}</Badge>
  if (available <= total * 0.3)
    return <Badge className="bg-yellow-500 text-white">{available} / {total}</Badge>
  return <Badge className="bg-green-600 text-white">{available} / {total}</Badge>
}

export function AvailabilityClient({ initialEquipment, initialSubItems, initialBookings }: Props) {
  const [selectedDate, setSelectedDate] = useState(today())

  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: bookingsData = initialBookings } = useBookings(initialBookings)

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Availability</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Equipment</th>
              <th className="px-4 py-3 font-medium text-center">Available / Total</th>
              <th className="px-4 py-3 font-medium text-center">OOS</th>
              <th className="px-4 py-3 font-medium text-center">Booked</th>
              <th className="px-4 py-3 font-medium text-center">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No active equipment
                </td>
              </tr>
            )}
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-center">
                    {availabilityBadge(row.available_qty, row.total_qty)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{row.out_of_service || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{row.booked_qty || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {row.issue_flag > 0 ? (
                      <Badge variant="outline" className="text-yellow-700 border-yellow-400">
                        {row.issue_flag}
                      </Badge>
                    ) : '—'}
                  </td>
                </tr>
                {row.sub_items.map(sub => (
                  <tr key={sub.id} className="bg-gray-50/50 text-gray-600">
                    <td className="px-4 py-2 pl-8 text-xs">{sub.name}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {availabilityBadge(sub.available_qty, sub.total_qty)}
                    </td>
                    <td className="px-4 py-2 text-center text-xs">{sub.out_of_service || '—'}</td>
                    <td className="px-4 py-2 text-center text-xs">{sub.booked_qty || '—'}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {sub.issue_flag > 0 ? (
                        <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-xs">
                          {sub.issue_flag}
                        </Badge>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
