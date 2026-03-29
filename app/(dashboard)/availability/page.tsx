import { createClient } from '@/lib/supabase/server'
import { AvailabilityClient } from './AvailabilityClient'
import type { Database } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

export default async function AvailabilityPage() {
  const supabase = await createClient()

  const [
    { data: equipment },
    { data: subItems },
    { data: bookings },
    { data: bookingItems },
    { data: chains },
    { data: oosRows },
  ] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
    supabase.from('bookings').select('*').neq('status', 'canceled'),
    supabase.from('booking_items').select('*'),
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_oos').select('equipment_id, quantity').not('equipment_id', 'is', null).is('returned_at', null),
  ])

  const initialOosSums: Record<string, number> = {}
  for (const row of oosRows ?? []) {
    if (row.equipment_id) {
      initialOosSums[row.equipment_id] = (initialOosSums[row.equipment_id] ?? 0) + row.quantity
    }
  }

  return (
    <AvailabilityClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
      initialBookings={{
        bookings: (bookings ?? []) as BookingRow[],
        bookingItems: (bookingItems ?? []) as BookingItemRow[],
      }}
      initialChains={(chains ?? []) as ChainRow[]}
      initialOosSums={initialOosSums}
    />
  )
}
