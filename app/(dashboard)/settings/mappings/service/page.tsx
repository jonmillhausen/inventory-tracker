import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ServiceMappingsClient } from './ServiceMappingsClient'
import type { Database } from '@/lib/types/database.types'

type ServiceMappingRow = Database['public']['Tables']['service_mappings']['Row']
type EquipmentRow = Database['public']['Tables']['equipment']['Row']

export default async function ServiceMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappingsData }, { data: equipmentData }] = await Promise.all([
    supabase.from('service_mappings').select('*').order('zenbooker_service_name'),
    supabase.from('equipment').select('*').order('name'),
  ])
  const mappings = (mappingsData ?? []) as ServiceMappingRow[]
  const equipment = (equipmentData ?? []) as EquipmentRow[]

  return (
    <ServiceMappingsClient
      initialMappings={mappings}
      initialEquipment={equipment}
    />
  )
}
