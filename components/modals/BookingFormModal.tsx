'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateBooking, useUpdateBooking } from '@/lib/queries/bookings'
import { useEquipment, useEquipmentSubItems } from '@/lib/queries/equipment'
import { useChains } from '@/lib/queries/chains'
import type { Database, EventType } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export interface BookingItemWithName extends BookingItemRow {
  name: string
}

interface Props {
  booking?: BookingRow & { items: BookingItemWithName[] }
  onClose: () => void
}

interface ItemQty {
  item_id: string
  qty: number
  is_sub_item: boolean
  parent_item_id: string | null
}

export function BookingFormModal({ booking, onClose }: Props) {
  const isEdit = !!booking

  const { data: equipment = [] } = useEquipment()
  const { data: subItems = [] } = useEquipmentSubItems()
  const { data: chains = [] } = useChains()

  const createBooking = useCreateBooking()
  const updateBooking = useUpdateBooking()

  const [customerName, setCustomerName] = useState(booking?.customer_name ?? '')
  const [eventDate, setEventDate] = useState(booking?.event_date ?? '')
  const [endDate, setEndDate] = useState(booking?.end_date ?? '')
  const [startTime, setStartTime] = useState(booking?.start_time ?? '')
  const [endTime, setEndTime] = useState(booking?.end_time ?? '')
  const [address, setAddress] = useState(booking?.address ?? '')
  const [eventType, setEventType] = useState<EventType>(booking?.event_type ?? 'dropoff')
  const [chain, setChain] = useState<string>(booking?.chain ?? '')
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  // Build initial item qty map from existing booking items
  const [itemQtyMap, setItemQtyMap] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>()
    if (booking?.items) {
      for (const item of booking.items) {
        map.set(item.item_id, item.qty)
      }
    }
    return map
  })

  const activeEquipment = equipment.filter(e => e.is_active)

  // Group sub-items by parent
  const subsByParent = new Map<string, SubItemRow[]>()
  for (const sub of subItems) {
    if (!sub.is_active) continue
    const list = subsByParent.get(sub.parent_id) ?? []
    list.push(sub)
    subsByParent.set(sub.parent_id, list)
  }

  function setItemQty(itemId: string, qty: number) {
    setItemQtyMap(prev => {
      const next = new Map(prev)
      if (qty <= 0) {
        next.delete(itemId)
      } else {
        next.set(itemId, qty)
      }
      return next
    })
  }

  function buildItemsPayload(): ItemQty[] {
    const items: ItemQty[] = []
    for (const eq of activeEquipment) {
      const qty = itemQtyMap.get(eq.id) ?? 0
      if (qty > 0) {
        items.push({ item_id: eq.id, qty, is_sub_item: false, parent_item_id: null })
      }
      for (const sub of subsByParent.get(eq.id) ?? []) {
        const subQty = itemQtyMap.get(sub.id) ?? 0
        if (subQty > 0) {
          items.push({ item_id: sub.id, qty: subQty, is_sub_item: true, parent_item_id: eq.id })
        }
      }
    }
    return items
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const payload = {
      customer_name: customerName.trim(),
      event_date: eventDate,
      end_date: endDate || null,
      start_time: startTime,
      end_time: endTime,
      address: address.trim(),
      event_type: eventType,
      chain: chain || null,
      notes: notes.trim(),
      items: buildItemsPayload(),
    }

    try {
      if (isEdit && booking) {
        await updateBooking.mutateAsync({ id: booking.id, ...payload })
      } else {
        await createBooking.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const isPending = createBooking.isPending || updateBooking.isPending

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Booking' : 'New Booking'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Customer Name */}
          <div className="space-y-1">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="eventDate">Event Date *</Label>
              <Input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End Date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Times row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="startTime">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endTime">End Time *</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label htmlFor="address">Address *</Label>
            <Input
              id="address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          {/* Event Type + Chain row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Event Type *</Label>
              <Select value={eventType} onValueChange={v => setEventType(v ?? 'dropoff')} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coordinated">Coordinated</SelectItem>
                  <SelectItem value="dropoff">Drop-off</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="willcall">Will Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chain</Label>
              <Select value={chain} onValueChange={v => setChain(v ?? '')} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {chains.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Equipment Section */}
          {activeEquipment.length > 0 && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Equipment</Label>
              <div className="border rounded-md divide-y">
                {activeEquipment.map(eq => {
                  const childSubs = subsByParent.get(eq.id) ?? []
                  return (
                    <div key={eq.id}>
                      {/* Parent equipment row */}
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-medium">{eq.name}</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-20 h-8 text-center"
                          value={itemQtyMap.get(eq.id) ?? 0}
                          onChange={e => setItemQty(eq.id, Number(e.target.value))}
                          disabled={isPending}
                        />
                      </div>
                      {/* Sub-items indented */}
                      {childSubs.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between px-3 py-2 pl-8 bg-gray-50">
                          <span className="text-sm text-gray-600">{sub.name}</span>
                          <Input
                            type="number"
                            min={0}
                            className="w-20 h-8 text-center"
                            value={itemQtyMap.get(sub.id) ?? 0}
                            onChange={e => setItemQty(sub.id, Number(e.target.value))}
                            disabled={isPending}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
