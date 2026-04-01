'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { usePersistedDate } from '@/lib/hooks/usePersistedDate'
import { useBookings } from '@/lib/queries/bookings'
import { useChains } from '@/lib/queries/chains'
import { useEquipment, useEquipmentSubItems, useSubItemLinks } from '@/lib/queries/equipment'
import { calculatePackingList } from '@/lib/utils/packingList'
import { isBookingActiveOnDate } from '@/lib/utils/availability'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, MapPin, Printer, Truck } from 'lucide-react'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'
import type { PackingListRow } from '@/lib/utils/packingList'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type SubItemLinkRow = Database['public']['Tables']['equipment_sub_item_links']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

type OverrideNoteType = 'equipment' | 'sub_item' | 'chain'

interface ChainLoadingOverride {
  chain_id: string
  event_date: string
  sub_item_id: string
  qty_override: number
}

interface ChainLoadingNote {
  chain_id: string
  event_date: string
  item_id: string
  item_type: OverrideNoteType
  note: string
}

interface Props {
  initialChains: ChainRow[]
  initialData: BookingsData
  initialEquipment: EquipmentRow[]
  initialSubItems: SubItemRow[]
  initialSubItemLinks: SubItemLinkRow[]
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  coordinated: '#3b82f6',
  dropoff: '#8b5cf6',
  pickup: '#d97706',
  willcall: '#0f172a',
}

function to12(t: string | null | undefined): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')}${ap}`
}

interface ChainCardProps {
  chain: ChainRow
  packingList: PackingListRow[]
  bookings: BookingRow[]
  checkedItems: Set<string>
  expandedSubs: Set<string>
  onToggleCheck: (itemId: string) => void
  onToggleSub: (key: string) => void
  onPrint: () => void
  isPrinting: boolean
  overrides: Map<string, number>
  notes: Map<string, ChainLoadingNote>
  chainNoteDraft: string
  savingOverrideKeys: Set<string>
  savingNoteKeys: Set<string>
  onSaveOverride: (subItemId: string, qty: number) => Promise<void>
  onSaveNote: (itemId: string, itemType: OverrideNoteType, note: string) => Promise<void>
}

function ChainCard({
  chain,
  packingList,
  bookings,
  checkedItems,
  expandedSubs,
  onToggleCheck,
  onToggleSub,
  onPrint,
  isPrinting,
  overrides,
  notes,
  chainNoteDraft: initialChainNoteDraft,
  savingOverrideKeys,
  savingNoteKeys,
  onSaveOverride,
  onSaveNote,
}: ChainCardProps) {
  const parentItems = packingList.filter(r => !r.isSubItem)

  function getSubItems(parentId: string): PackingListRow[] {
    return packingList.filter(r => r.isSubItem && r.parentItemId === parentId)
  }

  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [chainNoteDraft, setChainNoteDraft] = useState('')
  const [savedNoteKeys, setSavedNoteKeys] = useState<Set<string>>(new Set())
  const [overrideDrafts, setOverrideDrafts] = useState<Map<string, number>>(new Map())

  const chainNoteKey = `${chain.id}::chain::${chain.id}`
  const chainNote = notes.get(chainNoteKey)?.note ?? ''

  useEffect(() => {
    if (chainNote) {
      setChainNoteDraft(chainNote)
    } else {
      setChainNoteDraft(initialChainNoteDraft)
    }
  }, [chainNote, initialChainNoteDraft])

  const handleStartEditNote = (key: string) => {
    setEditingNoteKey(key)
    setNoteDraft(notes.get(key)?.note ?? '')
  }

  const handleSaveNote = async (chainId: string, itemId: string, itemType: OverrideNoteType, noteText?: string) => {
    const key = `${chainId}::${itemType}::${itemId}`
    if (editingNoteKey && editingNoteKey !== key) return
    await onSaveNote(itemId, itemType, noteText ?? noteDraft)
    setEditingNoteKey(null)
    setSavedNoteKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    window.setTimeout(() => {
      setSavedNoteKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 2000)
  }

  const handleSaveChainNote = async () => {
    console.log('[ChainLoading] handleSaveChainNote', { chainId: chain.id, chainNoteDraft })
    await handleSaveNote(chain.id, chain.id, 'chain', chainNoteDraft)
    setSavedNoteKeys(prev => {
      const next = new Set(prev)
      next.add(chainNoteKey)
      return next
    })
    window.setTimeout(() => {
      setSavedNoteKeys(prev => {
        const next = new Set(prev)
        next.delete(chainNoteKey)
        return next
      })
    }, 2000)
  }

  const handleQuantityDraftChange = (key: string, value: number) => {
    setOverrideDrafts(prev => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }

  const handleQuantitySave = async (subItemId: string, value: number) => {
    await onSaveOverride(subItemId, value)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Chain header */}
      <div
        className="px-3.5 py-2.5 flex items-center justify-between"
        style={{ backgroundColor: chain.color }}
      >
        <div className="flex items-center gap-2">
          <Truck size={14} style={{ color: isLightColor(chain.color) ? '#1e293b' : '#fff' }} />
          <span
            className="font-bold text-sm"
            style={{ color: isLightColor(chain.color) ? '#1e293b' : '#fff' }}
          >
            {chain.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs opacity-80"
            style={{ color: isLightColor(chain.color) ? '#1e293b' : '#fff' }}
          >
            {bookings.length} event{bookings.length !== 1 ? 's' : ''}
          </span>
          {bookings.length > 0 && (
            <button
              onClick={onPrint}
              disabled={isPrinting}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.3)', color: isLightColor(chain.color) ? '#1e293b' : '#fff' }}
            >
              <Printer size={11} />
            </button>
          )}
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">No events</div>
      ) : (
        <div className="p-3">
          {/* Packing list */}
          {parentItems.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                Packing List
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded border border-gray-100 dark:border-gray-700 p-2 space-y-0">
                {parentItems.map(item => {
                  const subs = getSubItems(item.itemId)
                  const subKey = `${chain.id}::${item.itemId}`
                  const isSubExpanded = expandedSubs.has(subKey)
                  const isChecked = checkedItems.has(`${chain.id}::${item.itemId}`)

                  return (
                    <div key={item.itemId}>
                      {/* Parent item row */}
                      <div className="flex flex-col gap-1 py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => onToggleCheck(`${chain.id}::${item.itemId}`)}
                              className="accent-green-600 rounded"
                            />
                            <span
                              className="text-xs font-semibold"
                              style={{ opacity: isChecked ? 0.4 : 1, textDecoration: isChecked ? 'line-through' : 'none' }}
                            >
                              {item.name}
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditNote(`${chain.id}::equipment::${item.itemId}`)}
                              className="text-[10px] text-blue-600 hover:underline print:hidden"
                            >
                              {notes.has(`${chain.id}::equipment::${item.itemId}`) ? 'Edit' : '+Note'}
                            </button>
                            <span className="font-mono text-xs font-bold ml-2">×{item.qty}</span>
                          </div>
                        </div>
                        {editingNoteKey === `${chain.id}::equipment::${item.itemId}` ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Input
                                value={noteDraft}
                                onChange={e => setNoteDraft(e.target.value)}
                                onBlur={() => handleSaveNote(chain.id, item.itemId, 'equipment')}
                                onKeyDown={ev => {
                                  if (ev.key === 'Enter') {
                                    ev.preventDefault()
                                    handleSaveNote(chain.id, item.itemId, 'equipment')
                                  }
                                }}
                                placeholder="Add a note"
                                className="w-full text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNote(chain.id, item.itemId, 'equipment')}
                                className="text-[10px] text-blue-600 hover:underline print:hidden"
                              >
                                Save
                              </button>
                            </div>
                            {savedNoteKeys.has(`${chain.id}::equipment::${item.itemId}`) && (
                              <div className="text-[10px] text-green-600">Saved ✓</div>
                            )}
                          </div>
                        ) : notes.has(`${chain.id}::equipment::${item.itemId}`) ? (
                          <div className="text-[10px] italic text-gray-500">
                            {notes.get(`${chain.id}::equipment::${item.itemId}`)?.note}
                          </div>
                        ) : null}
                      </div>

                      {/* Sub-items collapsible */}
                      {subs.length > 0 && (
                        <div className="ml-5">
                          <button
                            onClick={() => onToggleSub(subKey)}
                            className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold py-0.5 hover:text-gray-700"
                          >
                            {isSubExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                            {item.name} Supplies
                          </button>
                          {isSubExpanded && (
                            <div className="space-y-0">
                              {subs.map(sub => {
                                const subChecked = checkedItems.has(`${chain.id}::${sub.itemId}`)
                                const overrideKey = `${chain.id}::${sub.itemId}`
                                const overrideQty = overrideDrafts.get(overrideKey) ?? overrides.get(overrideKey) ?? sub.qty
                                const noteKey = `${chain.id}::sub_item::${sub.itemId}`
                                const isEditingNote = editingNoteKey === noteKey
                                const hasNote = notes.has(noteKey)
                                const isSaving = savingOverrideKeys.has(overrideKey)
                                const isNoteSaving = savingNoteKeys.has(noteKey)

                                return (
                                  <div key={sub.itemId} className="flex flex-col gap-1 py-0.5 border-b border-gray-100 last:border-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                                        <input
                                          type="checkbox"
                                          checked={subChecked}
                                          onChange={() => onToggleCheck(`${chain.id}::${sub.itemId}`)}
                                          className="accent-green-600 w-3 h-3"
                                        />
                                        <span
                                          className="text-[10px]"
                                          style={{ opacity: subChecked ? 0.4 : 1 }}
                                        >
                                          {sub.name}
                                        </span>
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min={0}
                                          value={overrideQty}
                                          onChange={e => handleQuantityDraftChange(overrideKey, Number(e.target.value))}
                                          onBlur={() => handleQuantitySave(sub.itemId, overrideQty)}
                                          onKeyDown={ev => {
                                            if (ev.key === 'Enter') {
                                              ev.preventDefault()
                                              handleQuantitySave(sub.itemId, overrideQty)
                                            }
                                          }}
                                          className="text-xs w-14 h-6 py-0 print:hidden"
                                        />
                                        <span className="hidden print:inline font-mono text-[10px] ml-1">×{overrideQty}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditNote(noteKey)}
                                          className="text-[10px] text-blue-600 hover:underline print:hidden"
                                        >
                                          {hasNote ? 'Edit' : '+Note'}
                                        </button>
                                      </div>
                                    </div>
                                    {isEditingNote ? (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Input
                                            value={noteDraft}
                                            onChange={e => setNoteDraft(e.target.value)}
                                            onBlur={() => handleSaveNote(chain.id, sub.itemId, 'sub_item')}
                                            onKeyDown={ev => {
                                              if (ev.key === 'Enter') {
                                                ev.preventDefault()
                                                handleSaveNote(chain.id, sub.itemId, 'sub_item')
                                              }
                                            }}
                                            placeholder="Add a note"
                                            className="w-full text-xs"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveNote(chain.id, sub.itemId, 'sub_item')}
                                            className="text-[10px] text-blue-600 hover:underline print:hidden"
                                          >
                                            Save
                                          </button>
                                        </div>
                                        {savedNoteKeys.has(noteKey) && (
                                          <div className="text-[10px] text-green-600">Saved ✓</div>
                                        )}
                                      </div>
                                    ) : hasNote ? (
                                      <div className="text-[10px] italic text-gray-500">
                                        {notes.get(noteKey)?.note}
                                      </div>
                                    ) : null}
                                    {isSaving && (
                                      <div className="text-[10px] text-gray-500">Saving…</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
              Additional details
            </label>
            <div className="space-y-2">
              <textarea
                rows={2}
                value={chainNoteDraft}
                onChange={e => setChainNoteDraft(e.target.value)}
                onBlur={handleSaveChainNote}
                placeholder="Additional details/instructions..."
                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs leading-5 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 print:hidden"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveChainNote}
                  className="text-[10px] text-blue-600 hover:underline print:hidden"
                >
                  Save
                </button>
                {savedNoteKeys.has(chainNoteKey) && (
                  <span className="text-[10px] text-green-600 print:hidden">Saved ✓</span>
                )}
              </div>
            </div>
            {chainNote && (
              <p className="mt-2 text-[10px] italic text-gray-500 print:text-gray-900">
                {chainNote}
              </p>
            )}
          </div>

          {/* Events section */}
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Events
            </div>
            {bookings.map(b => (
              <div key={b.id} className="py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    {b.zenbooker_job_id ? (
                      <a
                        href={`https://zenbooker.com/app?view=jobs&view-job=${b.zenbooker_job_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        {b.customer_name || 'Unnamed'}
                        <ExternalLink size={9} />
                      </a>
                    ) : (
                      <span className="font-semibold">{b.customer_name || 'Unnamed'}</span>
                    )}
                    <span
                      className="text-[8px] px-1 py-0.5 rounded font-semibold capitalize"
                      style={{
                        backgroundColor: (EVENT_TYPE_COLORS[b.event_type] ?? '#94a3b8') + '22',
                        color: EVENT_TYPE_COLORS[b.event_type] ?? '#94a3b8',
                      }}
                    >
                      {b.event_type ?? 'coordinated'}
                    </span>
                  </div>
                  <span className="text-gray-500 dark:text-white whitespace-nowrap">
                    {to12(b.start_time)}–{to12(b.end_time)}
                  </span>
                </div>
                {b.address && (
                  <div className="text-[10px] text-gray-400 dark:text-white mt-0.5 flex items-center gap-0.5">
                    <MapPin size={8} />
                    {b.address}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length < 6) return true
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
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

export function ChainsClient({ initialChains, initialData, initialEquipment, initialSubItems, initialSubItemLinks }: Props) {
  const { data: chains = [] } = useChains(initialChains)
  const { data } = useBookings(initialData)
  const { data: equipment = [] } = useEquipment(initialEquipment)
  const { data: subItems = [] } = useEquipmentSubItems(initialSubItems)
  const { data: subItemLinks = [] } = useSubItemLinks(initialSubItemLinks)

  const [selectedChain, setSelectedChain] = useState<'all' | string>('all')
  const [selectedDate, setSelectedDate] = usePersistedDate('date:chains')
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [printingChain, setPrintingChain] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map())
  const [notes, setNotes] = useState<Map<string, ChainLoadingNote>>(new Map())
  const [chainNoteDrafts, setChainNoteDrafts] = useState<Map<string, string>>(new Map())
  const [savingOverrideKeys, setSavingOverrideKeys] = useState<Set<string>>(new Set())
  const [savingNoteKeys, setSavingNoteKeys] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)

  const bookings = data?.bookings ?? []
  const bookingItems = data?.bookingItems ?? []

  // Which chains to show
  const visibleChains = useMemo(
    () => selectedChain === 'all' ? chains : chains.filter(c => c.id === selectedChain),
    [chains, selectedChain],
  )

  useEffect(() => {
    async function loadOverrides() {
      setLoadError(null)
      try {
        console.log('[ChainLoading] loadOverrides', { event_date: selectedDate })
        const res = await fetch(`/api/chain-loading/overrides?event_date=${selectedDate}`)
        if (!res.ok) {
          throw new Error(await res.text())
        }
        const data = await res.json() as { overrides: ChainLoadingOverride[]; notes: ChainLoadingNote[] }
        console.log('[ChainLoading] loadOverrides response', data)
        const overrideMap = new Map<string, number>()
        for (const item of data.overrides ?? []) {
          overrideMap.set(`${item.chain_id}::${item.sub_item_id}`, item.qty_override)
        }
        const noteMap = new Map<string, ChainLoadingNote>()
        const chainDrafts = new Map<string, string>()
        for (const note of data.notes ?? []) {
          noteMap.set(`${note.chain_id}::${note.item_type}::${note.item_id}`, note)
          if (note.item_type === 'chain') {
            chainDrafts.set(note.chain_id, note.note)
          }
        }
        setOverrides(overrideMap)
        setNotes(noteMap)
        setChainNoteDrafts(chainDrafts)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    }

    loadOverrides()
  }, [selectedDate])

  const saveOverride = useCallback(async (chainId: string, subItemId: string, qty: number) => {
    const key = `${chainId}::${subItemId}`
    console.log('[ChainLoading] saveOverride', { chainId, subItemId, qty, event_date: selectedDate })
    setSavingOverrideKeys(prev => new Set(prev).add(key))
    try {
      const res = await fetch('/api/chain-loading/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain_id: chainId, event_date: selectedDate, sub_item_id: subItemId, qty_override: qty }),
      })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      console.log('[ChainLoading] saveOverride response ok', { chainId, subItemId, qty })
      setOverrides(prev => {
        const next = new Map(prev)
        next.set(key, qty)
        return next
      })
    } finally {
      setSavingOverrideKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [selectedDate])

  const saveNote = useCallback(async (chainId: string, itemId: string, itemType: OverrideNoteType, note: string) => {
    const key = `${chainId}::${itemType}::${itemId}`
    console.log('[ChainLoading] saveNote', { chainId, itemId, itemType, note, event_date: selectedDate })
    setSavingNoteKeys(prev => new Set(prev).add(key))
    try {
      const res = await fetch('/api/chain-loading/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain_id: chainId, event_date: selectedDate, item_id: itemId, item_type: itemType, note }),
      })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      const data = await res.json() as { note: ChainLoadingNote }
      console.log('[ChainLoading] saveNote response', data)
      if (data.note) {
        setNotes(prev => {
          const next = new Map(prev)
          next.set(key, data.note)
          return next
        })
        if (itemType === 'chain') {
          setChainNoteDrafts(prev => {
            const next = new Map(prev)
            next.set(chainId, note)
            return next
          })
        }
      }
    } finally {
      setSavingNoteKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [selectedDate])

  // Per-chain data
  const chainData = useMemo(() => {
    return chains.map(chain => {
      const packingList = calculatePackingList(bookings, bookingItems, equipment, subItems, subItemLinks, chain.id, selectedDate)
      const chainBookings = bookings
        .filter(b => b.chain === chain.id && isBookingActiveOnDate(b, selectedDate))
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
      return { chain, packingList, bookings: chainBookings }
    })
  }, [bookings, bookingItems, equipment, subItems, subItemLinks, chains, selectedDate])

  function toggleCheck(key: string) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSub(key: string) {
    setExpandedSubs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handlePrint(chainId: string) {
    setPrintError(null)
    setPrintingChain(chainId)
    try {
      const activeForChain = bookings.filter(b => b.chain === chainId && isBookingActiveOnDate(b, selectedDate))
      const end_date = activeForChain.reduce<string | null>((latest, b) => {
        const effectiveEnd = b.end_date ?? b.event_date
        if (!effectiveEnd) return latest
        return latest === null || effectiveEnd > latest ? effectiveEnd : latest
      }, null) ?? selectedDate

      const res = await fetch('/api/packing-list/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: chainId, date: selectedDate, end_date }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Failed to generate print link')
    } finally {
      setPrintingChain(null)
    }
  }

  async function handlePrintAll() {
    const chainsWithEvents = visibleChains.filter(c =>
      bookings.some(b => b.chain === c.id && isBookingActiveOnDate(b, selectedDate))
    )
    if (chainsWithEvents.length === 0) return
    setPrintError(null)
    // Fetch all tokens in parallel then open tabs
    const tokens = await Promise.all(
      chainsWithEvents.map(async c => {
        const activeForChain = bookings.filter(b => b.chain === c.id && isBookingActiveOnDate(b, selectedDate))
        const end_date = activeForChain.reduce<string | null>((latest, b) => {
          const effectiveEnd = b.end_date ?? b.event_date
          if (!effectiveEnd) return latest
          return latest === null || effectiveEnd > latest ? effectiveEnd : latest
        }, null) ?? selectedDate
        const res = await fetch('/api/packing-list/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: c.id, date: selectedDate, end_date }),
        })
        if (!res.ok) return null
        const { url } = await res.json()
        return url as string
      })
    )
    for (const url of tokens) {
      if (url) window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chain Loading</h1>
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => { setSelectedDate(prevDay(selectedDate)); setCheckedItems(new Set()) }}
              className="border rounded px-1 py-1 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
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
            <button
              onClick={() => { setSelectedDate(nextDay(selectedDate)); setCheckedItems(new Set()) }}
              className="border rounded px-1 py-1 text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              aria-label="Next day"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => {
                setSelectedDate(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
                setCheckedItems(new Set())
              }}
              className="border rounded px-2 py-1 text-sm text-gray-600 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Today
            </button>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrintAll}
          disabled={!!printingChain}
          className="mt-1"
        >
          Print All
        </Button>
      </div>

      {printError && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {printError}
        </div>
      )}
      {loadError && (
        <div className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-700 border border-yellow-200">
          {loadError}
        </div>
      )}

      {/* Chain tab selector */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSelectedChain('all')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
            selectedChain === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          All
        </button>
        {chains.map(c => {
          const hasEvents = bookings.some(b => b.chain === c.id && isBookingActiveOnDate(b, selectedDate))
          const isSelected = selectedChain === c.id
          return (
            <button
              key={c.id}
              onClick={() => setSelectedChain(c.id)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors border"
              style={
                isSelected
                  ? { backgroundColor: c.color, color: isLightColor(c.color) ? '#1e293b' : '#fff', borderColor: c.color }
                  : hasEvents
                  ? { backgroundColor: 'white', color: '#1e293b', borderColor: '#e2e8f0' }
                  : { backgroundColor: 'white', color: '#cbd5e1', borderColor: '#f1f5f9' }
              }
            >
              {c.name}
              {hasEvents && ` (${bookings.filter(b => b.chain === c.id && isBookingActiveOnDate(b, selectedDate)).length})`}
            </button>
          )
        })}
        {chains.length === 0 && (
          <span className="text-sm text-gray-400">No active chains configured</span>
        )}
      </div>

      {/* Chain cards grid */}
      <div className={`grid gap-4 ${selectedChain === 'all' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
        {visibleChains.map(chain => {
          const cd = chainData.find(d => d.chain.id === chain.id)!
          return (
            <ChainCard
              key={chain.id}
              chain={chain}
              packingList={cd.packingList}
              bookings={cd.bookings}
              checkedItems={checkedItems}
              expandedSubs={expandedSubs}
              onToggleCheck={toggleCheck}
              onToggleSub={toggleSub}
              onPrint={() => handlePrint(chain.id)}
              isPrinting={printingChain === chain.id}
              overrides={overrides}
              notes={notes}
              chainNoteDraft={chainNoteDrafts.get(chain.id) ?? ''}
              savingOverrideKeys={savingOverrideKeys}
              savingNoteKeys={savingNoteKeys}
              onSaveOverride={async (subItemId, qty) => saveOverride(chain.id, subItemId, qty)}
              onSaveNote={async (itemId, itemType, note) => saveNote(chain.id, itemId, itemType, note)}
            />
          )
        })}
      </div>

      {visibleChains.length === 0 && (
        <div className="py-12 text-center text-gray-400 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
          No chains configured
        </div>
      )}

      {checkedItems.size > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setCheckedItems(new Set())}>
          Clear all checks ({checkedItems.size})
        </Button>
      )}
    </div>
  )
}
