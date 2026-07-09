interface FreqBin {
  count: number
  mhz_start?: number
  mhz_end?: number
  avg?: number
}

interface FreqBarChartProps {
  latestBins?: FreqBin[]
  avgBins?: FreqBin[]
  latestMax?: number
  avgMax?: number
  avgStartMhz?: number
  avgStopMhz?: number
  loading?: boolean
  error?: string | null
}

function BarChartBody({ bins, maxVal, color }: { bins: FreqBin[]; maxVal: number; color: string }) {
  if (bins.length === 0) return <div className="text-xs text-slate-400 italic">No data</div>

  return (
    <div className="flex items-end gap-[2px] h-32">
      {bins.map((bin, i) => {
        const val = bin.count ?? bin.avg ?? 0
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
        return (
          <div
            key={i}
            className="flex-1 min-w-[3px] rounded-t"
            style={{ height: `${Math.max(pct, 0.5)}%`, backgroundColor: color }}
            title={`${bin.mhz_start != null ? `${bin.mhz_start.toFixed(2)}–${bin.mhz_end?.toFixed(2) ?? ''} MHz` : `bin ${i}`}: ${typeof val === 'number' ? val.toFixed(1) : val}`}
          />
        )
      })}
    </div>
  )
}

export default function FreqBarChart({ latestBins, avgBins, latestMax, avgMax, avgStartMhz, avgStopMhz, loading, error }: FreqBarChartProps) {
  if (error) {
    return <div className="text-xs text-red-400">{error}</div>
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-4 w-32 bg-slate-700 rounded" />
        <div className="animate-pulse h-32 w-full bg-slate-700/50 rounded" />
        <div className="animate-pulse h-4 w-32 bg-slate-700 rounded mt-4" />
        <div className="animate-pulse h-32 w-full bg-slate-700/50 rounded" />
      </div>
    )
  }

  const hasLatest = latestBins && latestBins.length > 0
  const hasAvg = avgBins && avgBins.length > 0

  if (!hasLatest && !hasAvg) {
    return <div className="text-xs text-slate-400 italic">No frequency data available</div>
  }

  return (
    <div className="space-y-6">
      {/* Latest scan */}
      {hasLatest && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs uppercase tracking-wide text-slate-400">Latest scan</h4>
            <span className="text-[11px] text-slate-500">Max: {latestMax}</span>
          </div>
          <BarChartBody bins={latestBins!} maxVal={latestMax ?? 1} color="rgba(14,165,233,0.7)" />
        </div>
      )}

      {/* Average spectrum */}
      {hasAvg && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs uppercase tracking-wide text-slate-400">Average spectrum</h4>
            <span className="text-[11px] text-slate-500">
              {avgStartMhz != null ? `${avgStartMhz.toFixed(1)}–${avgStopMhz?.toFixed(1) ?? ''} MHz` : ''}
            </span>
          </div>
          <BarChartBody bins={avgBins!} maxVal={avgMax ?? 1} color="rgba(139,92,246,0.7)" />
          {avgStartMhz != null && (
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>{avgStartMhz.toFixed(1)} MHz</span>
              <span>{avgStopMhz?.toFixed(1) ?? ''} MHz</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
