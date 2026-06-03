import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PricingClient } from './PricingClient'

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <PricingClient />
}
