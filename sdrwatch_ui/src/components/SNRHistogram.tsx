interface HistogramBin {
  label: string
  count: number
}

interface SNRStats {
  count: number
  p50: number
  p90: number
  p100: number
}

interface SNRHistogramProps {
  histogram?: HistogramBin[]
  stats?: SNRStats | null
  loading?: boolean
  error?: string | null
}

export default function SNRHistogram({ histogram, stats, loading, error }: SNRHistogramProps) {
  if (error) {
    return <div className="text-xs text-red-400">{error}</div>
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-32 w-full bg-slate-700/50 rounded" />
      </div>
    )
  }

  if (!histogram || histogram.length === 0) {
    return <div className="text-xs text-slate-400 italic">No SNR data available</div>
  }

  const maxCount = Math.max(...histogram.map(b => b.count), 1)

  return (
    <div>
      {/* Stats summary */}
      {stats && (
        <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 mb-3">
          <span>Total: {stats.count}</span>
          <span>P50: {stats.p50.toFixed(1)} dB</span>
          <span>P90: {stats.p90.toFixed(1)} dB</span>
          <span>Max: {stats.p100.toFixed(1)} dB</span>
        </div>
      )}

      {/* Bars */}
      <div className="flex items-end gap-1 h-32">
        {histogram.map((bin, i) => {
          const pct = (bin.count / maxCount) * 100
          return (
            <div
              key={i}
              className="flex-1 min-w-[12px] flex flex-col items-center"
            >
              <div
                className="w-full rounded-t bg-sky-500/70"
                style={{ height: `${Math.max(pct, 0.5)}%` }}
                title={`${bin.label}: ${bin.count}`}
              />
              {histogram.length <= 15 && (
                <span className="text-[9px] text-slate-500 mt-1 truncate w-full text-center">
                  {bin.label.split('–')[0]}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Axis labels */}
      {histogram.length <= 15 && (
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>{histogram[0]?.label.split('–')[0]} dB</span>
          <span>{histogram[histogram.length - 1]?.label.split('–')[1]} dB</span>
        </div>
      )}
    </div>
  )
}
