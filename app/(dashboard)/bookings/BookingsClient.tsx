'use client'

import { useState, useMemo } from 'react'
import { useBookings, useDeleteBooking, useUpdateBooking, useAssignChain } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { canWrite, canAssignChain } from '@/lib/auth/roles'
import { BookingFormModal } from '@/components/modals/BookingFormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Database, UserRole } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'
import type { BookingItemWithName } from '@/components/modals/BookingFormModal'
import { useWebhookLogForBooking } from '@/lib/queries/webhookLogs'
import { ServiceMappingFormModal } from '@/components/modals/ServiceMappingFormModal'
import { useEquipment } from '@/lib/queries/equipment'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']
type BookingStatus = Database['public']['Enums']['booking_status']

interface Props {
  initialData: BookingsData
  initialChains: ChainRow[]
  role: UserRole
}

const STATUS_BADGE: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  needs_review: { label: 'Needs Review', className: 'bg-yellow-100 text-yellow-800' },
  canceled: { label: 'Canceled', className: 'bg-gray-100 text-gray-600' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800' },
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  coordinated: 'Coordinated',
  dropoff: 'Drop-off',
  pickup: 'Pickup',
  willcall: 'Will Call',
}

function NeedsReviewPanel({ bookingId, onClose, onCreateMapping }: {
  bookingId: string
  onClose: () => void
  onCreateMapping: (serviceId: string, serviceName: string) => void
}) {
  const { data: log, isLoading } = useWebhookLogForBooking(bookingId)
  const [showPayload, setShowPayload] = useState(false)

  const unmappedNames = log?.result_detail
    ? log.result_detail.split(', ').filter(Boolean)
    : []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Needs Review</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {isLoading && <p className="text-gray-500 text-sm">Loading webhook details...</p>}
        {!isLoading && !log && (
          <p className="text-gray-500 text-sm">No webhook log found for this booking. It may have been created manually or the log was not captured.</p>
        )}
        {log && (
          <div className="space-y-4">
            {unmappedNames.length > 0 && (
              <div>
                <p className="text-sm font-medium text-yellow-800 mb-2">Unmapped Zenbooker Services:</p>
                <ul className="space-y-1">
                  {unmappedNames.map(name => (
                    <li key={name} className="flex items-center justify-between bg-yellow-50 rounded px-3 py-1.5">
                      <span className="text-sm">{name}</span>
                      <button
                        onClick={() => onCreateMapping('', name)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Create Mapping
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <button
                onClick={() => setShowPayload(p => !p)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                {showPayload ? 'Hide' : 'Show'} Raw Payload
              </button>
              {showPayload && (
                <pre className="mt-2 bg-gray-50 rounded p-3 text-xs overflow-auto max-h-64">
                  {JSON.stringify(log.raw_payload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function BookingsClient({ initialData, initialChains, role }: Props) {
  const { data } = useBookings(initialData)
  const { data: chains = [] } = useChains(initialChains)
  const deleteBooking = useDeleteBooking()
  const updateBooking = useUpdateBooking()
  const assignChain = useAssignChain()

  const [showCreate, setShowCreate] = useState(false)
  const [editBooking, setEditBooking] = useState<(BookingRow & { items: BookingItemWithName[] }) | null>(null)
  const [assigningChainForId, setAssigningChainForId] = useState<string | null>(null)
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null)
  const [createMappingPreset, setCreateMappingPreset] = useState<{ serviceId: string; serviceName: string } | null>(null)
  const { data: allEquipment = [] } = useEquipment()

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterEventType, setFilterEventType] = useState<string>('all')

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // Build chain lookup
  const chainMap = new Map(chains.map(c => [c.id, c]))

  // Build booking items lookup by booking_id
  const itemsByBookingId = useMemo(() => {
    const map = new Map<string, BookingItemRow[]>()
    for (const item of bookingItems) {
      const list = map.get(item.booking_id) ?? []
      list.push(item)
      map.set(item.booking_id, list)
    }
    return map
  }, [bookingItems])

  // Filtered bookings
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (filterDate && b.event_date !== filterDate) return false
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      if (filterEventType !== 'all' && b.event_type !== filterEventType) return false
      return true
    })
  }, [bookings, filterDate, filterStatus, filterEventType])

  function openEdit(booking: BookingRow) {
    const items = (itemsByBookingId.get(booking.id) ?? []).map(bi => ({
      ...bi,
      name: bi.item_id, // name will be resolved by the modal via equipment hook
    }))
    setEditBooking({ ...booking, items })
  }

  async function handleCancel(booking: BookingRow) {
    if (!window.confirm(`Cancel booking for ${booking.customer_name}?`)) return
    try {
      await updateBooking.mutateAsync({ id: booking.id, status: 'canceled' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel booking')
    }
  }

  async function handleDelete(booking: BookingRow) {
    if (!window.confirm(`Permanently delete booking for ${booking.customer_name}? This cannot be undone.`)) return
    try {
      await deleteBooking.mutateAsync(booking.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete booking')
    }
  }

  async function handleAssignChain(bookingId: string, chainId: string | null) {
    try {
      await assignChain.mutateAsync({ id: bookingId, chain: chainId })
      setAssigningChainForId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign chain')
    }
  }

  function formatTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        {canWrite(role) && (
          <Button onClick={() => setShowCreate(true)}>+ Add Booking</Button>
        )}
      </div>

      {/* Needs review banner */}
      {bookings.filter(b => b.status === 'needs_review').length > 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          ⚠️ {bookings.filter(b => b.status === 'needs_review').length} booking{bookings.filter(b => b.status === 'needs_review').length !== 1 ? 's' : ''} need attention
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          type="date"
          className="w-44"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          placeholder="Filter by date"
        />
        <Select value={filterStatus} onValueChange={val => setFilterStatus(val ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEventType} onValueChange={val => setFilterEventType(val ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Event Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="coordinated">Coordinated</SelectItem>
            <SelectItem value="dropoff">Drop-off</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
            <SelectItem value="willcall">Will Call</SelectItem>
          </SelectContent>
        </Select>
        {(filterDate || filterStatus !== 'all' || filterEventType !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => {
            setFilterDate('')
            setFilterStatus('all')
            setFilterEventType('all')
          }}>
            Clear filters
          </Button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-3 py-2 font-medium">Customer</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Chain</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">No bookings found</td>
              </tr>
            )}
            {filtered.map(booking => {
              const isCanceled = booking.status === 'canceled'
              const chain = booking.chain ? chainMap.get(booking.chain) : null
              const badge = STATUS_BADGE[booking.status]

              return (
                <tr
                  key={booking.id}
                  className={`border-b hover:bg-gray-50 ${isCanceled ? 'opacity-50' : ''}`}
                >
                  <td className="px-3 py-2 font-medium">{booking.customer_name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {booking.event_date}
                    {booking.end_date && ` – ${booking.end_date}`}
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                  </td>
                  <td className="px-3 py-2">
                    {assigningChainForId === booking.id ? (
                      <div className="flex items-center gap-1">
                        <Select
                          value={booking.chain ?? ''}
                          onValueChange={val => handleAssignChain(booking.id, val || null)}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {chains.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1 text-xs"
                          onClick={() => setAssigningChainForId(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : chain ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: chain.color + '22', color: chain.color }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: chain.color }}
                        />
                        {chain.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{EVENT_TYPE_LABEL[booking.event_type]}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {booking.status === 'needs_review' && canWrite(role) && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs text-yellow-700 border-yellow-300"
                          onClick={() => setReviewingBookingId(booking.id)}>
                          Review
                        </Button>
                      )}
                      {canWrite(role) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEdit(booking)}
                          >
                            Edit
                          </Button>
                          {!isCanceled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700"
                              onClick={() => handleCancel(booking)}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(booking)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {canAssignChain(role) && !canWrite(role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setAssigningChainForId(
                            assigningChainForId === booking.id ? null : booking.id
                          )}
                        >
                          Assign Chain
                        </Button>
                      )}
                      {canWrite(role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700"
                          onClick={() => setAssigningChainForId(
                            assigningChainForId === booking.id ? null : booking.id
                          )}
                        >
                          Chain
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreate && (
        <BookingFormModal onClose={() => setShowCreate(false)} />
      )}
      {editBooking && (
        <BookingFormModal
          booking={editBooking}
          onClose={() => setEditBooking(null)}
        />
      )}
      {reviewingBookingId && (
        <NeedsReviewPanel
          bookingId={reviewingBookingId}
          onClose={() => setReviewingBookingId(null)}
          onCreateMapping={(serviceId, serviceName) => {
            setCreateMappingPreset({ serviceId, serviceName })
            setReviewingBookingId(null)
          }}
        />
      )}
      {createMappingPreset && (
        <ServiceMappingFormModal
          prefillServiceId={createMappingPreset.serviceId}
          prefillServiceName={createMappingPreset.serviceName}
          equipment={allEquipment}
          onClose={() => setCreateMappingPreset(null)}
        />
      )}
    </div>
  )
}
