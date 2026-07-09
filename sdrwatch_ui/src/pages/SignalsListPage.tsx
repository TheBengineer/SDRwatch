import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api/client'
import { useBaseline } from '../context/BaselineContext'
import type { Signal } from '../types'

export default function SignalsListPage() {
  const { baselineId } = useBaseline()
  const [signals, setSignals] = useState<Signal[]>([])
  const [classification, setClassification] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(true)

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
              <th className="th">ID</th>
              <th className="th">Center (MHz)</th>
              <th className="th">Bandwidth</th>
              <th className="th">Label</th>
              <th className="th">Classification</th>
              <th className="th">Confidence</th>
              <th className="th">Hits</th>
              <th className="th">Last seen</th>
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
            ) : signals.map(s => (
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
