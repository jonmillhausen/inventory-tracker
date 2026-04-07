'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import type { Database } from '@/lib/types/database.types'

type ReportRow = Database['public']['Tables']['equipment_reports']['Row']

interface ReportsClientProps {
  initialReports: ReportRow[]
  equipmentMap: Record<string, string>
  subItemMap: Record<string, { name: string; parent_id: string }>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getEquipmentLabel(
  report: ReportRow,
  equipmentMap: Record<string, string>,
  subItemMap: Record<string, { name: string; parent_id: string }>
): string {
  const parentName = equipmentMap[report.equipment_id] ?? report.equipment_id
  if (report.sub_item_id) {
    const sub = subItemMap[report.sub_item_id]
    return sub ? `${parentName} > ${sub.name}` : parentName
  }
  return parentName
}

export function ReportsClient({ initialReports, equipmentMap, subItemMap }: ReportsClientProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return initialReports
    const q = search.toLowerCase()
    return initialReports.filter(r => {
      const label = getEquipmentLabel(r, equipmentMap, subItemMap).toLowerCase()
      return r.staff_name.toLowerCase().includes(q) || label.includes(q)
    })
  }, [initialReports, search, equipmentMap, subItemMap])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Damaged / Missing Reports</h1>
      </div>

      <div className="relative w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by staff or equipment..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Date</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Staff Member</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Equipment</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Type</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Qty</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Note</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No reports found
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                    {formatDate(r.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.staff_name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {getEquipmentLabel(r, equipmentMap, subItemMap)}
                  </td>
                  <td className="px-4 py-3">
                    {r.report_type === 'damaged' ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        Damaged
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.quantity}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">
                    {r.note ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.flag_created ? (
                      <span className="text-green-600 dark:text-green-400">✓</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
