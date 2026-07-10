import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { apiGet, apiPatch } from '../api/client'
import { useBaseline } from '../context/BaselineContext'
import type { Signal } from '../types'
import { EmptyState } from '../components/primitives'
import UnifiedFilterBar from '../components/primitives/UnifiedFilterBar'

const columnHelper = createColumnHelper<Signal>()

export default function SignalsListPage() {
  const { baselineId } = useBaseline()
  const [signals, setSignals] = useState<Signal[]>([])
  const [classification, setClassification] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const sortKey = `sort-state:signals:${baselineId || 'none'}`
  const [sorting, setSorting] = useState<SortingState>(() => {
    try {
      const saved = localStorage.getItem(sortKey)
      return saved ? JSON.parse(saved) : [{ id: 'f_center_hz', desc: false }]
    } catch {
      return [{ id: 'f_center_hz', desc: false }]
    }
  })
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Persistent sort – save to localStorage on change
  useEffect(() => {
    localStorage.setItem(sortKey, JSON.stringify(sorting))
  }, [sorting, sortKey])

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

  // ---- selection handlers ------------------------------------------------
  const toggleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelected(new Set(signals.map(s => s.id)))
    } else {
      setSelected(new Set())
    }
  }, [signals])

  const toggleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleBulkClassify = useCallback(async (classification: string) => {
    if (selected.size < 2) return
    const ids = Array.from(selected)
    await Promise.allSettled(
      ids.map(id => apiPatch(`/api/signals/${id}`, { classification })),
    )
    setSelected(new Set())
    // Refetch signals after batch update
    if (baselineId) {
      const params: Record<string, string | number | undefined> = { baseline_id: baselineId }
      if (classification) params.classification = classification
      if (selectedOnly) params.selected = '1'
      apiGet<Signal[]>('/api/signals', params)
        .then(data => setSignals(data))
        .catch(() => setSignals([]))
    }
  }, [selected, baselineId, selectedOnly])

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: () => (
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={selected.size === signals.length && signals.length > 0}
            onChange={e => toggleSelectAll(e.target.checked)}
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            Select all {signals.length}
          </span>
        </label>
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={selected.has(row.original.id)}
          onChange={() => toggleSelect(row.original.id)}
          onClick={e => e.stopPropagation()}
          aria-label={`Select signal ${row.original.id}`}
        />
      ),
    }),
    columnHelper.accessor('signal_id', {
      header: 'ID',
      cell: info => (
        <Link
          to={baselineId ? { pathname: `/signal/${info.row.original.id}`, search: `?baseline_id=${baselineId}` } : `/signal/${info.row.original.id}`}
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
        : <span className="text-slate-400">—</span>,
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
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
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
            <UnifiedFilterBar
              fields={[
                { key: 'classification', label: 'Classification', type: 'select', options: [
                  { value: '', label: 'All classifications' },
                  { value: 'friendly', label: 'Friendly' },
                  { value: 'ambient', label: 'Ambient' },
                  { value: 'hostile', label: 'Hostile' },
                  { value: 'unknown', label: 'Unknown' },
                ]}
              ]}
              values={{ classification }}
              onChange={(_, value) => setClassification(value)}
            />
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="selected-only" className="w-4 h-4" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />
              <label htmlFor="selected-only" className="text-xs uppercase tracking-wide text-slate-400 cursor-pointer">Selected only</label>
            </div>
          </div>
        </div>
      </div>

      {/* Table or empty state */}
      {!loading && signals.length === 0 ? (
        <EmptyState
          title={classification || selectedOnly ? 'No signals match the current filters' : 'No signals yet'}
          description={
            classification || selectedOnly
              ? 'Try adjusting or clearing the filters above to broaden your search.'
              : 'Start a scan to begin discovering signals in your selected baseline.'
          }
          action={
            classification || selectedOnly
              ? undefined
              : { label: 'Start a scan', to: '/control' }
          }
          secondaryAction={
            classification || selectedOnly
              ? { label: 'Clear filters', onClick: () => { setClassification(''); setSelectedOnly(false) } }
              : undefined
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{loading ? '…' : `${signals.length} signals`}</h2>
            {selected.size >= 2 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {selected.size} selected
                </span>
                <select
                  className="px-2 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-xs focus-visible:ring-2 focus-visible:ring-sky-400 outline-none"
                  value=""
                  onChange={e => {
                    const val = e.target.value
                    if (val) handleBulkClassify(val)
                    e.target.value = ''
                  }}
                >
                  <option value="" disabled>Classify all as…</option>
                  <option value="friendly">Friendly</option>
                  <option value="ambient">Ambient</option>
                  <option value="hostile">Hostile</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            )}
          </div>

        <table className="table signals-table" role="table" aria-label="Signals">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="text-xs uppercase tracking-wide text-slate-400">
                {headerGroup.headers.map(header => {
                  const isSelect = header.id === 'select'
                  return (
                    <th
                      key={header.id}
                      className={`th${isSelect ? '' : ' cursor-pointer hover:text-sky-400 select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400'}`}
                      onClick={isSelect ? undefined : header.column.getToggleSortingHandler()}
                      style={isSelect ? undefined : { width: header.getSize(), position: 'relative' }}
                      tabIndex={isSelect ? undefined : 0}
                      aria-sort={isSelect ? undefined : (
                        header.column.getIsSorted() === 'asc' ? 'ascending' as const
                        : header.column.getIsSorted() === 'desc' ? 'descending' as const
                        : undefined
                      )}
                      onKeyDown={isSelect ? undefined : (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          header.column.getToggleSortingHandler()?.(e)
                        }
                      }}
                    >
                      {isSelect ? flexRender(header.column.columnDef.header, header.getContext()) : (
                        <>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? <span className="ml-1 text-slate-400">↕</span>}
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`}
                            />
                          )}
                        </>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="td text-center text-slate-400">Loading…</td></tr>
              ) : table.getRowModel().rows.map(row => (
                <tr key={row.id} className={`border-b border-white/10 hover:bg-slate-800/40 cursor-pointer ${row.original.selected ? 'bg-sky-900/20' : ''}`} onClick={() => window.location.href = `/signal/${row.original.id}${baselineId ? `?baseline_id=${baselineId}` : ''}`}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="td text-sm" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
