import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChainsClient } from './ChainsClient'
import type { Database } from '@/lib/types/database.types'
import type { BookingsData } from '@/lib/queries/bookings'

type ChainRow = Database['public']['Tables']['chains']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type BookingItemRow = Database['public']['Tables']['booking_items']['Row']

export default async function ChainsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: chains },
    { data: bookings },
    { data: bookingItems },
    { data: equipment },
    { data: subItems },
  ] = await Promise.all([
    supabase.from('chains').select('*').eq('is_active', true).order('name'),
    supabase.from('bookings').select('*'),
    supabase.from('booking_items').select('*'),
    supabase.from('equipment').select('*').eq('is_active', true).order('name'),
    supabase.from('equipment_sub_items').select('*').eq('is_active', true).order('name'),
  ])

  const initialData: BookingsData = {
    bookings: (bookings ?? []) as BookingRow[],
    bookingItems: (bookingItems ?? []) as BookingItemRow[],
  }

  return (
    <ChainsClient
      initialChains={(chains ?? []) as ChainRow[]}
      initialData={initialData}
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
    />
  )
}
