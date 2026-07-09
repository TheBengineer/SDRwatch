interface TimelineBucket {
  label: string
  detections: number
  scans: number
  max_snr: number | null
}

interface TimelineChartProps {
  buckets?: TimelineBucket[]
  detMax?: number
  scanMax?: number
  snrMax?: number
  loading?: boolean
  error?: string | null
}

export default function TimelineChart({ buckets, detMax, scanMax, snrMax, loading, error }: TimelineChartProps) {
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

  if (!buckets || buckets.length === 0) {
    return <div className="text-xs text-slate-400 italic">No timeline data available</div>
  }

  const maxDet = detMax ?? 1
  const maxScan = scanMax ?? 1
  const maxSnr = snrMax ?? 1

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-sky-500" /> Detections
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-emerald-500" /> Scans
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-amber-500" /> SNR
        </span>
      </div>

      <div className="flex items-end gap-1 h-32 overflow-x-auto pb-1">
        {buckets.map((bucket, i) => {
          const detPct = maxDet > 0 ? (bucket.detections / maxDet) * 100 : 0
          const scanPct = maxScan > 0 ? (bucket.scans / maxScan) * 80 : 0
          const snrPct = maxSnr > 0 && bucket.max_snr != null ? (bucket.max_snr / maxSnr) * 60 : 0

          return (
            <div key={i} className="flex-1 min-w-[20px] flex flex-col items-center gap-[1px]">
              <div
                className="w-full rounded-t bg-amber-500/60"
                style={{ height: `${Math.max(snrPct, 0.5)}%` }}
                title={`SNR: ${bucket.max_snr?.toFixed(1) ?? 'N/A'} dB`}
              />
              <div
                className="w-full rounded-t bg-emerald-500/60"
                style={{ height: `${Math.max(scanPct, 0.5)}%` }}
                title={`Scans: ${bucket.scans}`}
              />
              <div
                className="w-full rounded-t bg-sky-500/60"
                style={{ height: `${Math.max(detPct, 0.5)}%` }}
                title={`Detections: ${bucket.detections}`}
              />
              {buckets.length <= 30 && (
                <span className="text-[10px] text-slate-500 mt-1 truncate w-full text-center">
                  {bucket.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
