'use client'

import { useState } from 'react'

interface ImportStats {
  imported: number
  skipped_canceled: number
  errors: number
  error_details: Array<{ job_id: string; job_number: string; error: string }>
}

export function ImportClient() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<ImportStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runImport() {
    setIsRunning(true)
    setResult(null)
    setError(null)

    const accumulated: ImportStats = {
      imported: 0,
      skipped_canceled: 0,
      errors: 0,
      error_details: [],
    }

    let cursor: string | null = null

    try {
      do {
        const url = cursor
          ? `/api/import/zenbooker?cursor=${encodeURIComponent(cursor)}`
          : '/api/import/zenbooker'

        const res = await fetch(url, { method: 'POST' })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        accumulated.imported += data.imported ?? 0
        accumulated.skipped_canceled += data.skipped_canceled ?? 0
        accumulated.errors += data.errors ?? 0
        accumulated.error_details.push(...(data.error_details ?? []))
        cursor = data.next_cursor ?? null
      } while (cursor !== null)

      setResult(accumulated)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold">Import</h1>

      <div className="border rounded-lg p-5 space-y-4">
        <div>
          <h2 className="font-medium text-sm">Zenbooker Bulk Import</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pulls all jobs from Zenbooker and upserts them into the bookings system
            using the same service mapping logic as the webhook handler.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Re-running will update all existing bookings with the latest data from Zenbooker.
          </p>
        </div>

        <button
          onClick={runImport}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium rounded-md transition-colors"
        >
          {isRunning && (
            <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {isRunning ? 'Importing…' : 'Import from Zenbooker'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
            <div className="font-semibold text-gray-700">Import complete</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white border rounded p-2">
                <div className={`text-2xl font-bold font-mono ${result.imported > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {result.imported}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Imported</div>
              </div>
              <div className="bg-white border rounded p-2">
                <div className="text-2xl font-bold font-mono text-gray-400">{result.skipped_canceled}</div>
                <div className="text-xs text-gray-500 mt-0.5">Skipped (canceled)</div>
              </div>
              <div className="bg-white border rounded p-2">
                <div className={`text-2xl font-bold font-mono ${result.errors > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {result.errors}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Errors</div>
              </div>
            </div>
            {result.error_details.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-red-600">Error details:</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.error_details.map((e, i) => (
                    <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                      Job #{e.job_number || e.job_id}: {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
