'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { calculatePackingList } from '@/lib/utils/packingList'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

interface Props {
  initialChains: ChainRow[]
  initialData: BookingsData
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
}

export function ChainsClient({ initialChains, initialData, initialEquipment, initialSubItems }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const { data: chains = [] } = useChains(initialChains)
  const { data } = useBookings(initialData)
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)

  const [selectedChain, setSelectedChain] = useState<string>(() => initialChains[0]?.id ?? '')
  const [selectedDate, setSelectedDate] = useState(today)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [printError, setPrintError] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // Packing list for selected chain + date
  const packingList = useMemo(() => {
    if (!selectedChain) return []
    return calculatePackingList(bookings, bookingItems, equipment, subItems, selectedChain, selectedDate)
  }, [bookings, bookingItems, equipment, subItems, selectedChain, selectedDate])

  // Count events for selected chain + date
  const eventCount = useMemo(() => {
    return bookings.filter(b => b.chain === selectedChain && isBookingActiveOnDate(b, selectedDate)).length
  }, [bookings, selectedChain, selectedDate])

  const parentItems = packingList.filter(r => !r.isSubItem)
  const subItemRows = packingList.filter(r => r.isSubItem)

  function toggleCheck(itemId: string) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  async function handlePrint() {
    if (!selectedChain || !selectedDate) return
    setPrintError(null)
    setIsPrinting(true)
    try {
      const res = await fetch('/api/packing-list/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: selectedChain, date: selectedDate }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Failed to generate print link')
    } finally {
      setIsPrinting(false)
    }
  }

  const selectedChainData = chains.find(c => c.id === selectedChain)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chain Loading</h1>
        <Button onClick={handlePrint} disabled={!selectedChain || isPrinting} variant="outline">
          {isPrinting ? 'Generating…' : 'Print Packing List'}
        </Button>
      </div>

      {printError && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {printError}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label>Chain</Label>
          <div className="flex gap-2 flex-wrap">
            {chains.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedChain(c.id)
                  setCheckedItems(new Set())
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedChain === c.id
                    ? 'text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedChain === c.id ? { backgroundColor: c.color } : {}}
              >
                {c.name}
              </button>
            ))}
            {chains.length === 0 && (
              <span className="text-sm text-gray-400">No active chains configured</span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plDate">Date</Label>
          <Input
            id="plDate"
            type="date"
            className="w-44"
            value={selectedDate}
            onChange={e => {
              setSelectedDate(e.target.value)
              setCheckedItems(new Set())
            }}
          />
        </div>
      </div>

      {/* Summary */}
      {selectedChain && (
        <div className="text-sm text-gray-500">
          <span
            className="font-medium"
            style={{ color: selectedChainData?.color }}
          >
            {selectedChainData?.name}
          </span>
          {' '}— {eventCount} event{eventCount !== 1 ? 's' : ''} on {selectedDate}
          {packingList.length === 0 && eventCount === 0 && (
            <span className="ml-2 text-gray-400">(no equipment to pack)</span>
          )}
        </div>
      )}

      {/* Packing list table */}
      {packingList.length > 0 ? (
        <div className="space-y-4">
          {parentItems.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-2">Equipment</h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="w-10 px-3 py-2 text-center font-medium">✓</th>
                      <th className="text-left px-3 py-2 font-medium">Equipment</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parentItems.map(item => (
                      <tr
                        key={item.itemId}
                        className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${checkedItems.has(item.itemId) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleCheck(item.itemId)}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checkedItems.has(item.itemId)}
                            onChange={() => toggleCheck(item.itemId)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className={`px-3 py-2 ${checkedItems.has(item.itemId) ? 'line-through text-gray-400' : ''}`}>
                          {item.name}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-medium ${checkedItems.has(item.itemId) ? 'text-gray-400' : ''}`}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subItemRows.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-2">Support Equipment</h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="w-10 px-3 py-2 text-center font-medium">✓</th>
                      <th className="text-left px-3 py-2 font-medium">Item</th>
                      <th className="text-right px-3 py-2 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subItemRows.map(item => (
                      <tr
                        key={item.itemId}
                        className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${checkedItems.has(item.itemId) ? 'bg-green-50' : ''}`}
                        onClick={() => toggleCheck(item.itemId)}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checkedItems.has(item.itemId)}
                            onChange={() => toggleCheck(item.itemId)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className={`px-3 py-2 ${checkedItems.has(item.itemId) ? 'line-through text-gray-400' : ''}`}>
                          {item.name}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-medium ${checkedItems.has(item.itemId) ? 'text-gray-400' : ''}`}>
                          {item.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reset checkboxes */}
          {checkedItems.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCheckedItems(new Set())}>
              Clear all checks ({checkedItems.size})
            </Button>
          )}
        </div>
      ) : selectedChain ? (
        <div className="py-12 text-center text-gray-400 border rounded-md">
          No equipment to pack for {selectedChainData?.name} on {selectedDate}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400 border rounded-md">
          Select a chain to view the packing list
        </div>
      )}
    </div>
  )
}
