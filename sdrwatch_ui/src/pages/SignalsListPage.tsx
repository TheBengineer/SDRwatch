import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client'
import { useBaseline } from '../context/BaselineContext'
import type { Signal } from '../types'

type SortField = 'id' | 'f_center_hz' | 'bandwidth_hz' | 'confidence' | 'total_hits' | 'last_seen_utc' | 'classification'
type SortDir = 'asc' | 'desc'

function sortSignals(list: Signal[], field: SortField, dir: SortDir): Signal[] {
  return [...list].sort((a, b) => {
    const aVal = a[field] ?? ''
    const bVal = b[field] ?? ''
    let cmp = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal)
    else if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal
    return dir === 'asc' ? cmp : -cmp
  })
}

export default function SignalsListPage() {
  const { baselineId } = useBaseline()
  const [signals, setSignals] = useState<Signal[]>([])
  const [classification, setClassification] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => sortSignals(signals, sortField, sortDir), [signals, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-slate-600">↕</span>
    return <span className="ml-1 text-sky-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

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
              <select
                className="input"
                value={classification}
                onChange={e => setClassification(e.target.value)}
              >
                <option value="">All classifications</option>
                <option value="friendly">Friendly</option>
                <option value="ambient">Ambient</option>
                <option value="hostile">Hostile</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="selected-only"
                className="w-4 h-4"
                checked={selectedOnly}
                onChange={e => setSelectedOnly(e.target.checked)}
              />
              <label htmlFor="selected-only" className="text-xs uppercase tracking-wide text-slate-400 cursor-pointer">
                Selected only
              </label>
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
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('id')}>ID<SortIcon field="id" /></th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('f_center_hz')}>Center (MHz)<SortIcon field="f_center_hz" /></th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('bandwidth_hz')}>Bandwidth<SortIcon field="bandwidth_hz" /></th>
              <th className="th">Label</th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('classification')}>Classification<SortIcon field="classification" /></th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('confidence')}>Confidence<SortIcon field="confidence" /></th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('total_hits')}>Hits<SortIcon field="total_hits" /></th>
              <th className="th cursor-pointer hover:text-sky-400 select-none" onClick={() => toggleSort('last_seen_utc')}>Last seen<SortIcon field="last_seen_utc" /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="td text-center text-slate-500">Loading…</td></tr>
            ) : signals.length === 0 ? (
              <tr>
                <td colSpan={8} className="td text-center text-slate-500">
                  <div className="text-sm text-slate-400 border border-dashed border-white/20 rounded-xl p-4">
                    No signals match the current filters.
                  </div>
                </td>
              </tr>
            ) : sorted.map(s => (
              <tr
                key={s.id}
                className={`border-b border-white/10 hover:bg-slate-800/40 cursor-pointer ${s.selected ? 'bg-sky-900/20' : ''}`}
                onClick={() => window.location.href = `/signal/${s.id}`}
              >
                <td className="td">
                  <Link
                    to={`/signal/${s.id}`}
                    className="text-sky-400 hover:underline font-mono text-sm"
                    onClick={e => e.stopPropagation()}
                  >
                    {s.signal_id}
                  </Link>
                  {s.selected && <span className="text-sky-400 ml-1">★</span>}
                </td>
                <td className="td font-semibold">{(s.f_center_hz / 1e6).toFixed(4)}</td>
                <td className="td text-sm">
                  {s.bandwidth_hz_display
                    ? s.bandwidth_hz_display >= 1e6
                      ? (s.bandwidth_hz_display / 1e6).toFixed(1) + ' MHz'
                      : (s.bandwidth_hz_display / 1e3).toFixed(1) + ' kHz'
                    : '—'}
                </td>
                <td className="td">
                  {s.label
                    ? <span className="chip bg-amber-600/60 text-amber-100">{s.label}</span>
                    : <span className="text-slate-500">—</span>}
                </td>
                <td className="td">{classificationChip(s.classification)}</td>
                <td className="td text-sm">
                  {s.confidence != null ? (s.confidence * 100).toFixed(0) + '%' : '—'}
                </td>
                <td className="td text-sm">{s.total_hits ?? 0}</td>
                <td className="td text-sm text-slate-400">
                  {s.last_seen_utc ? s.last_seen_utc.slice(0, 19).replace('T', ' ') : '—'}
                </td>
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
