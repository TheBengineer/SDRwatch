import { ChangeEvent } from '../types'

interface ChangeFeedPreviewProps {
  events: ChangeEvent[]
  totalEvents?: number
  windowMinutes?: number
  generatedAt?: string
  loading?: boolean
}

const typeColors: Record<string, string> = {
  NEW_SIGNAL: 'bg-emerald-600/80 text-emerald-100',
  QUIETED: 'bg-amber-600/80 text-amber-100',
  POWER_SHIFT: 'bg-purple-600/80 text-purple-100',
}

function formatFreq(hz: number | undefined | null): string {
  if (hz == null) return ''
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`
  return `${hz.toFixed(0)} Hz`
}

function formatBW(hz: number | undefined | null): string {
  if (hz == null) return ''
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)} kHz`
  return `${hz.toFixed(0)} Hz`
}

export default function ChangeFeedPreview({ events, totalEvents, windowMinutes, generatedAt, loading }: ChangeFeedPreviewProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-white/10 rounded-xl p-4 bg-slate-900/40 animate-pulse">
            <div className="h-3 w-16 bg-slate-700 rounded mb-2" />
            <div className="h-4 w-48 bg-slate-700 rounded mb-1" />
            <div className="h-3 w-36 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-sm text-slate-300 border border-dashed border-white/20 rounded-xl p-4">
        No change events in the selected window.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        {totalEvents ?? events.length} events
        {windowMinutes != null ? ` · window ${windowMinutes} min` : ''}
        {generatedAt ? ` · ${generatedAt}` : ''}
      </div>
      {events.slice(0, 10).map((event, idx) => {
        const chipClass = typeColors[event.type] ?? 'bg-slate-600/80 text-slate-200'
        return (
          <div
            key={`${event.type}-${idx}`}
            className="border border-white/10 rounded-xl p-4 bg-slate-900/40"
            data-event-type={event.type}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className={`chip text-xs uppercase tracking-wide ${chipClass}`}>{event.type}</span>
              <span>{event.time_label ?? event.time_utc ?? ''}</span>
            </div>
            <div className="text-sm font-semibold mt-2">{event.details ?? formatFreq(event.f_center_hz)}</div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-400 mt-3">
              {event.f_center_hz != null && <span>{formatFreq(event.f_center_hz)}</span>}
              {event.bandwidth_hz != null && <span>{formatBW(event.bandwidth_hz)}</span>}
              {event.confidence != null && <span>Confidence {event.confidence.toFixed(2)}</span>}
              {event.delta_db != null && <span>Δ {event.delta_db.toFixed(1)} dB</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
