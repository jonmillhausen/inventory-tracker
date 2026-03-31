import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AuditClient } from './AuditClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

export const metadata = {
  title: 'Event Audit',
}

export default async function AuditPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: bookings },
    { data: bookingItems },
    { data: chains },
    { data: equipment },
  ] = await Promise.all([
    supabase.from('bookings').select('*').order('event_date', { ascending: false }),
    supabase.from('booking_items').select('*'),
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: (bookings ?? []) as BookingRow[],
    bookingItems: (bookingItems ?? []) as BookingItemRow[],
  }

  return (
    <AuditClient
      initialData={initialData}
      initialChains={(chains ?? []) as ChainRow[]}
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
    />
  )
}
