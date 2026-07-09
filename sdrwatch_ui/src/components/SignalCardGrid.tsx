import { Signal } from '../types'
import SignalCard from './SignalCard'

interface SignalCardGridProps {
  signals: Signal[]
  loading?: boolean
}

export default function SignalCardGrid({ signals, loading }: SignalCardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-white/10 rounded-2xl p-4 bg-slate-900/60 animate-pulse">
            <div className="h-4 w-24 bg-slate-700 rounded mb-3" />
            <div className="h-8 w-32 bg-slate-700 rounded mb-3" />
            <div className="h-4 w-20 bg-slate-700 rounded mb-2" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-6 bg-slate-700 rounded" />
              <div className="h-6 bg-slate-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (signals.length === 0) {
    return (
      <div className="text-sm text-slate-300 border border-dashed border-white/20 rounded-xl p-4">
        No active signals in the current window. Once sweeps run, persistent detections will appear as cards.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {signals.map(sig => (
        <SignalCard key={sig.id} signal={sig} />
      ))}
    </div>
  )
}
