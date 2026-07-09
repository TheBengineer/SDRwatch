import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { apiGet } from '../api/client'
import { useBaseline } from '../context/BaselineContext'
import type { Signal } from '../types'

const columnHelper = createColumnHelper<Signal>()

export default function SignalsListPage() {
  const { baselineId } = useBaseline()
  const [signals, setSignals] = useState<Signal[]>([])
  const [classification, setClassification] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'f_center_hz', desc: false }])

  useEffect(() => {
    if (!baselineId) return
    setLoading(true)
    const params: Record<string, string | number | undefined> = { baseline_id: baselineId }
    if (classification) params.classification = classification
    if (selectedOnly) params.selected = '1'
    apiGet<Signal[]>('/api/signals', params)
      .then(data => setSignals(data))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false))
  }, [baselineId, classification, selectedOnly])

  const columns = useMemo(() => [
    columnHelper.accessor('signal_id', {
      header: 'ID',
      cell: info => (
        <Link
          to={`/signal/${info.row.original.id}`}
          className="text-sky-400 hover:underline font-mono text-sm"
          onClick={e => e.stopPropagation()}
        >
          {info.getValue()}
        </Link>
      ),
      footer: info => info.column.id,
    }),
    columnHelper.accessor('f_center_hz', {
      header: 'Center (MHz)',
      cell: info => <span className="font-semibold">{(info.getValue() / 1e6).toFixed(4)}</span>,
    }),
    columnHelper.accessor('bandwidth_hz_display', {
      header: 'Bandwidth',
      cell: info => {
        const v = info.getValue()
        if (!v) return '—'
        return v >= 1e6 ? (v / 1e6).toFixed(1) + ' MHz' : (v / 1e3).toFixed(1) + ' kHz'
      },
    }),
    columnHelper.accessor('label', {
      header: 'Label',
      cell: info => info.getValue()
        ? <span className="chip bg-amber-600/60 text-amber-100">{info.getValue()}</span>
        : <span className="text-slate-500">—</span>,
    }),
    columnHelper.accessor('classification', {
      header: 'Classification',
      cell: info => classificationChip(info.getValue() || 'unknown'),
    }),
    columnHelper.accessor('confidence', {
      header: 'Confidence',
      cell: info => info.getValue() != null ? (info.getValue()! * 100).toFixed(0) + '%' : '—',
    }),
    columnHelper.accessor('total_hits', {
      header: 'Hits',
      cell: info => info.getValue() ?? 0,
    }),
    columnHelper.accessor('last_seen_utc', {
      header: 'Last seen',
      cell: info => info.getValue() ? info.getValue()!.slice(0, 19).replace('T', ' ') : '—',
    }),
  ], [])

  const table = useReactTable({
    data: signals,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Signals</h1>
            <p className="text-sm text-slate-400">Browse and manage all detected signals across baselines.</p>
          </div>

          {/* Filter toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="field">
              <label>Classification</label>
              <select className="input" value={classification} onChange={e => setClassification(e.target.value)}>
                <option value="">All classifications</option>
                <option value="friendly">Friendly</option>
                <option value="ambient">Ambient</option>
                <option value="hostile">Hostile</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="selected-only" className="w-4 h-4" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />
              <label htmlFor="selected-only" className="text-xs uppercase tracking-wide text-slate-400 cursor-pointer">Selected only</label>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{loading ? '…' : `${signals.length} signals`}</h2>
        </div>

        <table className="table">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="text-xs uppercase tracking-wide text-slate-400">
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="th cursor-pointer hover:text-sky-400 select-none" onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? <span className="ml-1 text-slate-600">↕</span>}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="td text-center text-slate-500">Loading…</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={8} className="td text-center text-slate-500">
                <div className="text-sm text-slate-400 border border-dashed border-white/20 rounded-xl p-4">No signals match the current filters.</div>
              </td></tr>
            ) : table.getRowModel().rows.map(row => (
              <tr key={row.id} className={`border-b border-white/10 hover:bg-slate-800/40 cursor-pointer ${row.original.selected ? 'bg-sky-900/20' : ''}`} onClick={() => window.location.href = `/signal/${row.original.id}`}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="td text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function classificationChip(cls: string) {
  const colors: Record<string, string> = {
    friendly: 'bg-green-600/80 text-green-100',
    ambient: 'bg-slate-500/80 text-slate-100',
    hostile: 'bg-red-600/80 text-red-100',
    unknown: 'bg-slate-700/80 text-slate-300',
  }
  return <span className={`chip text-xs ${colors[cls] || colors.unknown}`}>{cls || 'unknown'}</span>
}
