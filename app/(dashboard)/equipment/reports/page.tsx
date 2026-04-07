import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsClient } from './ReportsClient'
import type { Database } from '@/lib/types/database.types'

type ReportRow = Database['public']['Tables']['equipment_reports']['Row']

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: reports }, { data: equipment }, { data: subItems }] = await Promise.all([
    supabase
      .from('equipment_reports')
      .select('*')
      .order('submitted_at', { ascending: false }),
    supabase.from('equipment').select('id, name').order('name'),
    supabase.from('equipment_sub_items').select('id, parent_id, name').order('name'),
  ])

  return (
    <ReportsClient
      initialReports={(reports ?? []) as ReportRow[]}
      equipmentMap={Object.fromEntries((equipment ?? []).map(e => [e.id, e.name]))}
      subItemMap={Object.fromEntries((subItems ?? []).map(s => [s.id, { name: s.name, parent_id: s.parent_id }]))}
    />
  )
}
