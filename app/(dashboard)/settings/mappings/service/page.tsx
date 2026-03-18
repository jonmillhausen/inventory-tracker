import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ServiceMappingsClient } from './ServiceMappingsClient'

export default async function ServiceMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappings }, { data: equipment }] = await Promise.all([
    supabase.from('service_mappings').select('*').order('zenbooker_service_name'),
    supabase.from('equipment').select('*').order('name'),
  ])

  return (
    <ServiceMappingsClient
      initialMappings={mappings ?? []}
      initialEquipment={equipment ?? []}
    />
  )
}
