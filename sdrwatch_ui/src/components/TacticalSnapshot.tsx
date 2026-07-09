interface SnapshotData {
  persistent_signals?: number
  recent_new?: number
  last_update?: string | null
  active_window_minutes?: number
  recent_window_minutes?: number
}

interface TacticalSnapshotProps {
  snapshot: SnapshotData | null
  totalWindows?: number
  loading?: boolean
}

export default function TacticalSnapshot({ snapshot, totalWindows, loading }: TacticalSnapshotProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-white/10 rounded-xl p-4 bg-white/5 animate-pulse">
            <div className="h-3 w-16 bg-slate-700 rounded mb-2" />
            <div className="h-7 w-20 bg-slate-700 rounded mb-1" />
            <div className="h-3 w-24 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const persistent = snapshot?.persistent_signals ?? 0
  const recentNew = snapshot?.recent_new ?? 0
  const lastUpdate = snapshot?.last_update ?? null
  const recentWin = snapshot?.recent_window_minutes ?? 60

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <div className="text-xs uppercase tracking-wide text-slate-400">Persistent signals</div>
        <div className="text-2xl font-semibold">{persistent}</div>
        <div className="text-xs text-slate-400">updated per sweep</div>
      </div>
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <div className="text-xs uppercase tracking-wide text-slate-400">Recent new</div>
        <div className="text-2xl font-semibold">{recentNew}</div>
        <div className="text-xs text-slate-400">in the last {recentWin} min</div>
      </div>
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <div className="text-xs uppercase tracking-wide text-slate-400">Total windows</div>
        <div className="text-2xl font-semibold">{totalWindows ?? 0}</div>
        <div className="text-xs text-slate-400">derived from scan updates</div>
      </div>
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <div className="text-xs uppercase tracking-wide text-slate-400">Last update</div>
        <div className="text-lg font-semibold truncate">{lastUpdate ?? '—'}</div>
        <div className="text-xs text-slate-400">most recent sweep</div>
      </div>
    </div>
  )
}
