import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WizardClient } from './WizardClient'

type EquipmentOption = {
  id: string
  name: string
  custom_setup_min: number | null
  custom_cleanup_min: number | null
  categories: string[] | null
  is_active: boolean
}

export default async function WizardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, name, custom_setup_min, custom_cleanup_min, categories, is_active')
    .eq('is_active', true)
    .overlaps('categories', ['Primary', 'Specialty'])
    .order('name')

  return <WizardClient equipment={(equipment ?? []) as EquipmentOption[]} />
}
