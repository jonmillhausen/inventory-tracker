import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChainMappingsClient } from './ChainMappingsClient'
import type { Database } from '@/lib/types/database.types'

type ChainMappingRow = Database['public']['Tables']['chain_mappings']['Row']
type ChainRow = Database['public']['Tables']['chains']['Row']

export default async function ChainMappingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const [{ data: mappingsData }, { data: chainsData }] = await Promise.all([
    supabase.from('chain_mappings').select('*').order('zenbooker_staff_name'),
    supabase.from('chains').select('*').order('name'),
  ])
  const mappings = (mappingsData ?? []) as ChainMappingRow[]
  const chains = (chainsData ?? []) as ChainRow[]

  return (
    <ChainMappingsClient
      initialMappings={mappings}
      initialChains={chains}
    />
  )
}
