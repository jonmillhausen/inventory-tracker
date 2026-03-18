// app/(dashboard)/settings/webhook-logs/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WebhookLogsClient } from './WebhookLogsClient'
import type { Database } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']

export default async function WebhookLogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return <p className="text-red-600">Access denied</p>

  const { data: logsData } = await supabase
    .from('webhook_logs')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(200)
  const logs = (logsData ?? []) as WebhookLogRow[]

  return <WebhookLogsClient initialLogs={logs} />
}
