'use client'

import { useQuery } from '@tanstack/react-query'
import type { WizardAvailabilityResponse } from '@/app/api/wizard/availability/route'

export type WizardQueryParams = {
  itemId: string
  quantity: number
  zipCode: string
  year: number
  month: number
  durationMinutes: number
  preferredStart?: string
}

export const WIZARD_KEY = (params: WizardQueryParams) =>
  ['wizard-availability', params] as const

export function useWizardAvailability(
  params: WizardQueryParams | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: params
      ? WIZARD_KEY(params)
      : (['wizard-availability', 'idle'] as const),
    enabled: enabled && params !== null,
    queryFn: async (): Promise<WizardAvailabilityResponse> => {
      if (!params) throw new Error('params required')
      const search = new URLSearchParams({
        item_id: params.itemId,
        quantity: String(params.quantity),
        zip_code: params.zipCode,
        year: String(params.year),
        month: String(params.month),
        duration_minutes: String(params.durationMinutes),
      })
      if (params.preferredStart) search.set('preferred_start', params.preferredStart)
      const res = await fetch(`/api/wizard/availability?${search.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      return res.json()
    },
    staleTime: 30 * 1000,
  })
}
