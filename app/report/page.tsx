'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronRight, ChevronDown, Check } from 'lucide-react'

interface EquipmentItem {
  id: string
  name: string
  is_active: boolean
}

interface SubItem {
  id: string
  parent_id: string
  name: string
  is_active: boolean
}

type ReportType = 'damaged' | 'missing'

export default function ReportPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [subItems, setSubItems] = useState<SubItem[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [staffName, setStaffName] = useState('')
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null)
  const [reportType, setReportType] = useState<ReportType>('damaged')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submittedName, setSubmittedName] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/reports/equipment')
        if (!res.ok) throw new Error('Failed to load equipment')
        const data = await res.json()
        setEquipment(data.equipment ?? [])
        setSubItems(data.subItems ?? [])
      } catch {
        setError('Failed to load equipment. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Group sub-items by parent
  const subItemsByParent = useMemo(() => {
    const map: Record<string, SubItem[]> = {}
    for (const s of subItems) {
      if (!map[s.parent_id]) map[s.parent_id] = []
      map[s.parent_id].push(s)
    }
    return map
  }, [subItems])

  // Filter equipment by search
  const filteredEquipment = useMemo(() => {
    if (!search.trim()) return equipment
    const q = search.toLowerCase()
    return equipment.filter(e => {
      if (e.name.toLowerCase().includes(q)) return true
      const subs = subItemsByParent[e.id]
      return subs?.some(s => s.name.toLowerCase().includes(q))
    })
  }, [equipment, search, subItemsByParent])

  // Auto-populate note when switching to missing
  useEffect(() => {
    if (reportType === 'missing' && note === '') {
      setNote('Missing')
    } else if (reportType === 'damaged' && note === 'Missing') {
      setNote('')
    }
  }, [reportType]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(parentId: string) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }

  function selectParent(id: string) {
    setSelectedEquipmentId(id)
    setSelectedSubItemId(null)
  }

  function selectSubItem(parentId: string, subId: string) {
    setSelectedEquipmentId(parentId)
    setSelectedSubItemId(subId)
  }

  // Get selected label for display
  const selectedLabel = useMemo(() => {
    if (!selectedEquipmentId) return null
    const parent = equipment.find(e => e.id === selectedEquipmentId)
    if (!parent) return null
    if (selectedSubItemId) {
      const sub = subItems.find(s => s.id === selectedSubItemId)
      return sub ? `${parent.name} > ${sub.name}` : parent.name
    }
    return parent.name
  }, [selectedEquipmentId, selectedSubItemId, equipment, subItems])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEquipmentId) {
      setError('Please select an equipment item.')
      return
    }
    if (reportType === 'damaged' && !note.trim()) {
      setError('Please describe the damage.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/reports/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_name: staffName,
          equipment_id: selectedEquipmentId,
          sub_item_id: selectedSubItemId,
          report_type: reportType,
          quantity,
          note: note.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit report')
      }

      setSubmittedName(staffName)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setStaffName('')
    setSelectedEquipmentId(null)
    setSelectedSubItemId(null)
    setReportType('damaged')
    setQuantity(1)
    setNote('')
    setSearch('')
    setExpandedParents(new Set())
    setError(null)
    setSubmitted(false)
    setSubmittedName('')
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md text-center space-y-6 p-8 bg-white rounded-lg shadow">
          <img src="/wonderfly-logo-icon.png" alt="Wonderfly" className="h-12 w-auto mx-auto" />
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-green-100">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            Report submitted. Thank you, {submittedName}!
          </h2>
          <Button onClick={resetForm} className="w-full">
            Submit another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4">
      <div className="w-full max-w-lg space-y-6 p-8 bg-white rounded-lg shadow">
        <img src="/wonderfly-logo-icon.png" alt="Wonderfly" className="h-12 w-auto mx-auto" />
        <h1 className="text-xl font-bold text-center text-gray-900">
          Equipment Damage / Missing Report
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Staff Name */}
          <div className="space-y-2">
            <Label htmlFor="staffName">Staff Name</Label>
            <Input
              id="staffName"
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
              required
              placeholder="Your name"
            />
          </div>

          {/* Equipment Selector */}
          <div className="space-y-2">
            <Label>Equipment</Label>
            {selectedLabel && (
              <div className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                <span className="font-medium">Selected:</span> {selectedLabel}
                <button
                  type="button"
                  className="ml-auto text-gray-400 hover:text-gray-600"
                  onClick={() => { setSelectedEquipmentId(null); setSelectedSubItemId(null) }}
                >
                  ✕
                </button>
              </div>
            )}
            <Input
              placeholder="Search equipment..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {loading ? (
                <div className="p-4 text-sm text-gray-500 text-center">Loading equipment...</div>
              ) : filteredEquipment.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No equipment found</div>
              ) : (
                filteredEquipment.map(eq => {
                  const subs = subItemsByParent[eq.id]
                  const hasSubs = subs && subs.length > 0
                  const isExpanded = expandedParents.has(eq.id)
                  const isSelected = selectedEquipmentId === eq.id && !selectedSubItemId

                  return (
                    <div key={eq.id}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        {hasSubs ? (
                          <button
                            type="button"
                            className="shrink-0 p-0.5 hover:bg-gray-200 rounded"
                            onClick={() => toggleExpand(eq.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown size={14} className="text-gray-500" />
                            ) : (
                              <ChevronRight size={14} className="text-gray-500" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <button
                          type="button"
                          className="flex-1 text-left text-sm"
                          onClick={() => selectParent(eq.id)}
                        >
                          {eq.name}
                        </button>
                      </div>
                      {hasSubs && isExpanded && subs.map(sub => {
                        const isSubSelected = selectedSubItemId === sub.id
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            className={`w-full text-left flex items-center gap-2 pl-10 pr-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${
                              isSubSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                            }`}
                            onClick={() => selectSubItem(eq.id, sub.id)}
                          >
                            {sub.name}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Report Type */}
          <div className="space-y-2">
            <Label>Report Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`py-3 rounded-md text-sm font-medium border-2 transition-colors ${
                  reportType === 'damaged'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setReportType('damaged')}
              >
                Damaged
              </button>
              <button
                type="button"
                className={`py-3 rounded-md text-sm font-medium border-2 transition-colors ${
                  reportType === 'missing'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setReportType('missing')}
              >
                Missing
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity Affected</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              required
              className="w-24"
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">
              Note {reportType === 'damaged' && <span className="text-red-500">*</span>}
            </Label>
            <textarea
              id="note"
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-y"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={reportType === 'damaged' ? 'Describe the issue...' : ''}
              required={reportType === 'damaged'}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </Button>
        </form>
      </div>
    </div>
  )
}
