import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChainMappingsClient } from './ChainMappingsClient'

export default async function ChainMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappings }, { data: chains }] = await Promise.all([
    supabase.from('chain_mappings').select('*').order('zenbooker_staff_name'),
    supabase.from('chains').select('*').order('name'),
  ])

  return (
    <ChainMappingsClient
      initialMappings={mappings ?? []}
      initialChains={chains ?? []}
    />
  )
}
