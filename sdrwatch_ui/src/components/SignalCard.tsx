import { Signal } from '../types'

interface SignalCardProps {
  signal: Signal
}

const classificationColors: Record<string, string> = {
  friendly: 'bg-green-600/80 text-green-100',
  ambient: 'bg-slate-500/80 text-slate-100',
  hostile: 'bg-red-600/80 text-red-100',
  unknown: 'bg-slate-700/80 text-slate-300',
}

function formatFreq(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`
  return `${hz.toFixed(0)} Hz`
}

function formatBW(hz: number | null | undefined): string {
  if (hz == null) return '—'
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)} kHz`
  return `${hz.toFixed(0)} Hz`
}

export default function SignalCard({ signal }: SignalCardProps) {
  const chipClass = classificationColors[signal.classification] ?? classificationColors.unknown
  const hitRatio = signal.total_windows > 0
    ? ((signal.total_hits / signal.total_windows) * 100).toFixed(0)
    : '0'

  return (
    <article
      className={`border rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 ${
        signal.selected
          ? 'border-sky-500/60 bg-sky-900/30 ring-1 ring-sky-500/40'
          : 'border-white/10 bg-slate-900/60'
      }`}
      data-signal-id={signal.id}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-sky-400">
              {signal.signal_id ?? `SIG-${String(signal.id).padStart(4, '0')}`}
            </span>
            {signal.label && (
              <span className="chip text-xs bg-amber-600/60 text-amber-100 truncate max-w-24">
                {signal.label}
              </span>
            )}
          </div>
          <div className="text-2xl font-semibold mt-1 truncate">
            {formatFreq(signal.f_center_hz)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`text-lg ${signal.selected ? 'text-sky-400' : 'text-slate-500'}`}
            title={signal.selected ? 'Selected signal' : 'Not selected'}
          >
            {signal.selected ? '★' : '☆'}
          </span>
          <span className={`chip text-xs ${chipClass}`}>
            {signal.classification.charAt(0).toUpperCase() + signal.classification.slice(1)}
          </span>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {signal.snr_db != null && (
          <span className="chip text-xs bg-sky-700/60 text-sky-200">
            SNR {signal.snr_db.toFixed(1)} dB
          </span>
        )}
        {signal.user_bw_hz != null && (
          <span className="chip text-xs bg-purple-600/60">BW adj.</span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Bandwidth</div>
          <div className="text-lg font-semibold">{formatBW(signal.bandwidth_hz_display ?? signal.bandwidth_hz)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Confidence</div>
          <div className="text-lg font-semibold">
            {signal.confidence != null ? `${(signal.confidence * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">First seen</div>
          <div className="text-sm font-semibold truncate">{signal.first_seen_utc ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Last seen</div>
          <div className="text-sm font-semibold truncate">{signal.last_seen_utc ?? '—'}</div>
        </div>
      </div>

      {/* Hit stats */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-300">
        <span>Hits {signal.total_hits}</span>
        <span>Windows {signal.total_windows}</span>
        <span>Hit ratio {hitRatio}%</span>
      </div>

      {/* Notes */}
      {signal.notes && (
        <div className="text-xs text-slate-400 italic border-t border-white/10 pt-2 mt-1">
          {signal.notes.length > 100 ? `${signal.notes.slice(0, 100)}...` : signal.notes}
        </div>
      )}
    </article>
  )
}
