import { createClient } from '@/lib/supabase/server'
import { AvailabilityClient } from './AvailabilityClient'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export default async function AvailabilityPage() {
  const supabase = await createClient()

  const [
    { data: equipment },
    { data: subItems },
    { data: bookings },
    { data: bookingItems },
  ] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
    supabase.from('bookings').select('*').neq('status', 'canceled'),
    supabase.from('booking_items').select('*'),
  ])

  return (
    <AvailabilityClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
      initialBookings={{
        bookings: (bookings ?? []) as BookingRow[],
        bookingItems: (bookingItems ?? []) as BookingItemRow[],
      }}
    />
  )
}
