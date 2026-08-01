import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { redirect } from 'next/navigation'
import { BookingsClient } from './BookingsClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'
import type { UserRole } from '@/lib/types/database.types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

export default async function BookingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const [
    { data: bookings },
    { data: bookingItems },
    { data: chains },
  ] = await Promise.all([
    fetchAll((from, to) => supabase.from('bookings').select('*').order('event_date', { ascending: false }).range(from, to)),
    fetchAll((from, to) => supabase.from('booking_items').select('*').range(from, to)),
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: (bookings ?? []) as BookingRow[],
    bookingItems: (bookingItems ?? []) as BookingItemRow[],
  }

  return (
    <BookingsClient
      initialData={initialData}
      initialChains={(chains ?? []) as ChainRow[]}
      role={profile.role as UserRole}
    />
  )
}
