'use client'

import { useMemo, useState } from 'react'
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

type EquipmentOption = {
  id: string
  name: string
  custom_setup_min: number | null
  custom_cleanup_min: number | null
  categories: string[] | null
  is_active: boolean
}

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
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!itemId} className="w-full">Find Availability</Button>
        </div>
      </form>

      {error && <div className="text-red-600 text-sm">Error: {(error as Error).message}</div>}

      {/* Calendar grid is added in Task 5 */}
      <div data-testid="calendar-placeholder">
        {!submittedParams && (
          <div className="text-sm text-gray-500">Select a game and click Find Availability to see the calendar.</div>
        )}
        {submittedParams && isFetching && (
          <div className="text-sm text-gray-500">Loading availability…</div>
        )}
        {submittedParams && data && (
          <pre className="text-xs">{JSON.stringify(data.month, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}
