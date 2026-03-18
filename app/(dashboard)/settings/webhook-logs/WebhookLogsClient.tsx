// app/(dashboard)/settings/webhook-logs/WebhookLogsClient.tsx
'use client'

import React, { useState } from 'react'
import { useWebhookLogs } from '@/lib/queries/webhookLogs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database, WebhookResult } from '@/lib/types/database.types'

type WebhookLogRow = Database['public']['Tables']['webhook_logs']['Row']

const RESULT_BADGE: Record<NonNullable<WebhookResult>, { label: string; className: string }> = {
  success: { label: 'Success', className: 'bg-green-100 text-green-800' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800' },
  unmapped_service: { label: 'Unmapped', className: 'bg-yellow-100 text-yellow-800' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-600' },
}

interface Props {
  initialLogs: WebhookLogRow[]
}

export function WebhookLogsClient({ initialLogs }: Props) {
  const { data: logs = [], refetch, isFetching } = useWebhookLogs(initialLogs)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Webhook Logs</h1>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Job ID</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 font-medium">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map(log => {
              const badge = log.result ? RESULT_BADGE[log.result] : null
              return (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(log.received_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{log.zenbooker_job_id}</td>
                    <td className="px-4 py-3 text-xs font-mono">{log.action}</td>
                    <td className="px-4 py-3">
                      {badge ? (
                        <Badge className={badge.className}>{badge.label}</Badge>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {log.result_detail || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        {expandedId === log.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-gray-50">
                        <pre className="text-xs overflow-auto max-h-64">
                          {JSON.stringify(log.raw_payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No webhook logs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
