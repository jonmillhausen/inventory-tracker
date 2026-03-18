import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsEquipmentClient } from './SettingsEquipmentClient'
import type { Database, UserRole } from '@/lib/types/database.types'

type EquipmentRow = Database['public']['Tables']['equipment']['Row']
type SubItemRow = Database['public']['Tables']['equipment_sub_items']['Row']

export default async function SettingsEquipmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()

  if ((profile?.role as UserRole) !== 'admin') redirect('/availability')

  const [{ data: equipment }, { data: subItems }] = await Promise.all([
    supabase.from('equipment').select('*').order('name'),
    supabase.from('equipment_sub_items').select('*').order('name'),
  ])

  return (
    <SettingsEquipmentClient
      initialEquipment={(equipment ?? []) as EquipmentRow[]}
      initialSubItems={(subItems ?? []) as SubItemRow[]}
    />
  )
}
