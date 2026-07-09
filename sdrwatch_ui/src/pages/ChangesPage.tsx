import { useEffect, useState, useCallback } from 'react'
import { useBaseline } from '../context/BaselineContext'
import { apiGet } from '../api/client'
import type { ChangeEvent, ChangePayload } from '../types'

// ── Event type visual config ──────────────────────────────────────────────

const EVENT_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  NEW_SIGNAL: {
    label: 'New Signal',
    dot: 'bg-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  QUIETED: {
    label: 'Quieted',
    dot: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  POWER_SHIFT: {
    label: 'Power Shift',
    dot: 'bg-sky-400',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
}

// ── Formatting helpers ────────────────────────────────────────────────────

function fmtMHz(hz: number | undefined | null): string {
  if (hz == null) return ''
  return `${(hz / 1_000_000).toFixed(3)} MHz`
}

function fmtkHz(hz: number | undefined | null): string {
  if (hz == null) return ''
  return `${(hz / 1_000).toFixed(0)} kHz`
}

function fmtDelta(db: number | undefined | null): string {
  if (db == null) return ''
  const sign = db > 0 ? '+' : ''
  return `Δ ${sign}${db.toFixed(1)} dB`
}

// ── Default summary per event type ────────────────────────────────────────

function defaultSummary(event: ChangeEvent): string {
  const freq = event.f_center_hz ? fmtMHz(event.f_center_hz) : ''
  switch (event.type) {
    case 'NEW_SIGNAL':
      return freq ? `New signal at ${freq}` : 'New signal detected'
    case 'QUIETED':
      return freq ? `Signal quieted at ${freq}` : 'Signal went quiet'
    case 'POWER_SHIFT': {
      const db = event.delta_db != null ? ` (${event.delta_db > 0 ? '+' : ''}${event.delta_db.toFixed(1)} dB)` : ''
      return freq ? `Power shift at ${freq}${db}` : 'Power shift detected'
    }
    default:
      return event.details ?? 'Change event'
  }
}

// ── Filters ───────────────────────────────────────────────────────────────

interface FilterDef {
  key: string
  label: string
}

const FILTERS: FilterDef[] = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW_SIGNAL', label: 'New' },
  { key: 'POWER_SHIFT', label: 'Power Shifts' },
  { key: 'QUIETED', label: 'Quieted' },
]

// ── Component ─────────────────────────────────────────────────────────────

export default function ChangesPage() {
  const { baselineId } = useBaseline()
  const [events, setEvents] = useState<ChangeEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [generatedAt, setGeneratedAt] = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchChanges = useCallback(async () => {
    if (!baselineId) return
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number | undefined> = {
        window_minutes: 30,
      }
      if (activeFilter !== 'ALL') {
        params.type = activeFilter
      }
      const data = await apiGet<ChangePayload>(
        `/api/baseline/${baselineId}/changes`,
        params,
      )
      setEvents(data.events ?? [])
      setTotalEvents(data.total_events ?? 0)
      setGeneratedAt(data.generated_at ?? '')
    } catch {
      setError('Could not load change events.')
    } finally {
      setLoading(false)
    }
  }, [baselineId, activeFilter])

  // Fetch on mount & when filter or baseline changes
  useEffect(() => {
    fetchChanges()
  }, [fetchChanges])

  // Poll every 30 seconds
  useEffect(() => {
    const id = setInterval(fetchChanges, 30_000)
    return () => clearInterval(id)
  }, [fetchChanges])

  // ── No-baseline guard ─────────────────────────────────────────────────

  if (!baselineId) {
    return (
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <h2 className="text-lg font-semibold mb-2">Change feed</h2>
        <p className="text-sm text-slate-300">
          Select a baseline to view recent spectrum changes.
        </p>
      </div>
    )
  }

  // ── Filter bar ────────────────────────────────────────────────────────

  const filterBar = (
    <div className="border border-white/10 rounded-xl p-4 bg-white/5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => {
            const isActive = activeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20 hover:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <div className="text-xs text-slate-400">
          {totalEvents} event{totalEvents !== 1 ? 's' : ''}
          {generatedAt ? ` · Refreshed ${generatedAt}` : ''}
        </div>
      </div>
    </div>
  )

  // ── Empty / loading / error states ───────────────────────────────────

  if (loading && events.length === 0) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="text-sm text-slate-400 border border-dashed border-white/15 rounded-xl p-4">
          Loading…
        </div>
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="text-sm text-red-400 border border-dashed border-red-500/25 rounded-xl p-4">
          {error}
        </div>
      </div>
    )
  }

  // ── Event feed ───────────────────────────────────────────────────────

  const feed = events.length === 0 ? (
    <div className="text-sm text-slate-300 border border-dashed border-white/15 rounded-xl p-4">
      No change events in the selected window.
    </div>
  ) : (
    <div className="space-y-3">
      {events.map((event, i) => {
        const style = EVENT_STYLE[event.type] ?? { label: event.type, dot: 'bg-slate-400', chip: 'bg-white/10 text-slate-300 border-white/20' }
        // Extra fields returned by API but not in ChangeEvent type
        const ext = event as unknown as { bandwidth_hz_display?: number; total_windows?: number; downtime_minutes?: number }
        // Template uses bandwidth_hz_display when available
        const bwValue = ext.bandwidth_hz_display ?? event.bandwidth_hz
        return (
          <div key={i} className="border border-white/10 rounded-xl p-4 bg-white/5">
            <div className="flex items-start gap-3">
              {/* Colored dot indicator */}
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />

              <div className="flex-1 min-w-0 space-y-2">
                {/* Header row: type chip + timestamp */}
                <div className="flex items-center justify-between gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${style.chip}`}>
                    {style.label}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {event.time_label ?? event.time_utc ?? '—'}
                  </span>
                </div>

                {/* Summary */}
                <div className="text-sm font-semibold text-slate-100">
                  {event.details || defaultSummary(event)}
                </div>

                {/* Metadata tags */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  {event.f_center_hz != null && (
                    <span>Center {fmtMHz(event.f_center_hz)}</span>
                  )}
                  {bwValue != null && (
                    <span>BW {fmtkHz(bwValue)}</span>
                  )}
                  {event.confidence != null && (
                    <span>Confidence {event.confidence.toFixed(2)}</span>
                  )}
                  {event.delta_db != null && (
                    <span>{fmtDelta(event.delta_db)}</span>
                  )}
                  {ext.total_windows != null && (
                    <span>Total windows {ext.total_windows}</span>
                  )}
                  {ext.downtime_minutes != null && (
                    <span>Quiet {ext.downtime_minutes} min</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {filterBar}
      {feed}
    </div>
  )
}
