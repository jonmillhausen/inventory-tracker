'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useWizardAvailability, type WizardQueryParams } from '@/lib/queries/wizard'
import { formatTime12, computeAvailabilityRanges, type WizardDay, type WizardSlot, type WizardChainDay } from '@/lib/utils/wizardSlots'
import type { WizardAvailabilityResponse } from '@/app/api/wizard/availability/route'
import { WizardDayDetailModal } from '@/components/modals/WizardDayDetailModal'

type EquipmentOption = {
  id: string
  name: string
  custom_setup_min: number | null
  custom_cleanup_min: number | null
  categories: string[] | null
  is_active: boolean
}

// ─── MonthCalendar helpers ────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isPastDate(year: number, month: number, day: number, today: Date): boolean {
  const cellDate = new Date(year, month - 1, day)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return cellDate < todayMid
}

type CalendarProps = {
  year: number
  month: number
  data: WizardAvailabilityResponse | undefined
  isLoading: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onDayClick: (day: WizardDay) => void
}

function MonthCalendar({ year, month, data, isLoading, onPrevMonth, onNextMonth, onDayClick }: CalendarProps) {
  const today = new Date()
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = firstOfMonth.getDay()
  const totalDays = new Date(year, month, 0).getDate()

  const cells: (WizardDay | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(data?.days.find(x => x.date === dateStr) ?? {
      date: dateStr,
      available_inventory: 0,
      chains: [],
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const monthName = firstOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onPrevMonth} className="p-1 hover:bg-gray-100 rounded" aria-label="Previous month">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">{monthName}</h2>
        <button type="button" onClick={onNextMonth} className="p-1 hover:bg-gray-100 rounded" aria-label="Next month">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded">
        {WEEKDAYS.map(w => (
          <div key={w} className="bg-gray-50 text-xs font-medium text-center py-1">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="bg-white min-h-[88px]" />

          const dayNum = parseInt(cell.date.slice(8, 10), 10)
          const past = isPastDate(year, month, dayNum, today)

          const unavailable = !past && cell.available_inventory <= 0

          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => !past && onDayClick(cell)}
              className={`relative bg-white min-h-[88px] text-left p-1 ${past ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
              <span className="absolute top-2 left-2 inline-flex items-center justify-center w-6 h-6 rounded-sm bg-black text-white text-xs font-medium">
                {dayNum}
              </span>
              <div className="pt-8">
              {isLoading ? (
                <div className="h-3 w-12 bg-gray-200 animate-pulse rounded" />
              ) : unavailable ? (
                <div className="text-[10px] text-red-600 font-medium">Unavailable</div>
              ) : (
                (() => {
                  const allSlots = cell.chains.flatMap(c => c.slots)
                  const starredByStart = new Map<string, WizardSlot>()
                  for (const s of allSlots) {
                    if (s.starred && !starredByStart.has(s.start)) starredByStart.set(s.start, s)
                  }
                  const starredChips = Array.from(starredByStart.values())
                    .sort((a, b) => a.start.localeCompare(b.start))
                  const nonStarredStarts = allSlots.filter(s => !s.starred).map(s => s.start)
                  const ranges = computeAvailabilityRanges(nonStarredStarts)

                  return (
                    <>
                      {starredChips.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {starredChips.map((s, j) => (
                            <div key={`star-${j}`} className="text-[10px] truncate flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500 shrink-0" />
                              <span>{formatTime12(s.start)} – {formatTime12(s.end)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ranges.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {ranges.map((r, j) => (
                            <div key={`range-${j}`} className="text-[10px] truncate text-gray-600">
                              {formatTime12(r.start)} – {formatTime12(r.end)}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()
              )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── End MonthCalendar ────────────────────────────────────────────────────────

const DURATIONS: { label: string; value: number }[] = [
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '2.5 hours', value: 150 },
  { label: '3 hours', value: 180 },
  { label: '3.5 hours', value: 210 },
  { label: '4 hours', value: 240 },
]

const START_TIMES: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 23; h++) {
    for (const m of [0, 30]) {
      if (h === 23 && m === 30) continue
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

export function WizardClient({ equipment }: { equipment: EquipmentOption[] }) {
  const today = new Date()

  const [itemId, setItemId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(10)
  const [zipCode, setZipCode] = useState<string>('')
  const [durationMin, setDurationMin] = useState<number>(90)
  const [preferredStart, setPreferredStart] = useState<string>('')
  const [submittedParams, setSubmittedParams] = useState<WizardQueryParams | null>(null)
  const [selectedDay, setSelectedDay] = useState<WizardDay | null>(null)
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  })

  const queryParams: WizardQueryParams | null = useMemo(() => {
    if (!submittedParams) return null
    return { ...submittedParams, year: calMonth.year, month: calMonth.month }
  }, [submittedParams, calMonth])

  const { data, isFetching, error } = useWizardAvailability(queryParams, queryParams !== null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!itemId) return
    if (!/^\d{5}$/.test(zipCode)) {
      alert('Zip code must be 5 digits')
      return
    }
    setSubmittedParams({
      itemId,
      quantity,
      zipCode,
      year: calMonth.year,
      month: calMonth.month,
      durationMinutes: durationMin,
      preferredStart: preferredStart || undefined,
    })
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Chain Wizard</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4 p-4 border rounded-md">
        <div>
          <Label>Game</Label>
          <Select value={itemId} onValueChange={v => setItemId(v ?? '')}>
            <SelectTrigger>
              <SelectValue placeholder="Select a game" />
            </SelectTrigger>
            <SelectContent>
              {equipment.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            value={quantity}
            onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div>
          <Label htmlFor="zip">Zip Code</Label>
          <Input
            id="zip"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={zipCode}
            onChange={e => setZipCode(e.target.value)}
            placeholder="90210"
          />
        </div>
        <div>
          <Label>Event Length</Label>
          <Select value={String(durationMin)} onValueChange={v => setDurationMin(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map(d => (
                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Preferred Start (optional)</Label>
          <Select value={preferredStart} onValueChange={v => setPreferredStart(v ?? '')}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {START_TIMES.map(t => (
                <SelectItem key={t} value={t}>{formatTime12(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!itemId} className="w-full">Find Availability</Button>
        </div>
      </form>

      {error && <div className="text-red-600 text-sm">Error: {(error as Error).message}</div>}

      {!submittedParams && <div className="text-sm text-gray-500">Select a game and click Find Availability to see the calendar.</div>}
      {submittedParams && (
        <MonthCalendar
          year={calMonth.year}
          month={calMonth.month}
          data={data}
          isLoading={isFetching}
          onPrevMonth={() => setCalMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 })}
          onNextMonth={() => setCalMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 })}
          onDayClick={setSelectedDay}
        />
      )}
      <WizardDayDetailModal day={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  )
}
