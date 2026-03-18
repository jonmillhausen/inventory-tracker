'use client'

import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync'

/** Mounts the Realtime subscriptions. Renders nothing — placed once in the dashboard layout. */
export function RealtimeSync() {
  useRealtimeSync()
  return null
}
