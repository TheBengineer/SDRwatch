interface HeatmapCell {
  count: number
  intensity: number
}

interface HeatmapRow {
  scan_id: number
  label: string
  cells: HeatmapCell[]
}

interface CoverageHeatmapProps {
  rows?: HeatmapRow[]
  binLabels?: string[]
  maxCount?: number
  loading?: boolean
  error?: string | null
}

export default function CoverageHeatmap({ rows, binLabels, maxCount, loading, error }: CoverageHeatmapProps) {
  if (error) {
    return <div className="text-xs text-red-400">{error}</div>
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 w-full bg-slate-700/50 rounded" />
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return <div className="text-xs text-slate-400 italic">No coverage data available</div>
  }

  const binLabelsShort = binLabels && binLabels.length > 0
    ? binLabels
    : rows[0]?.cells.map((_, i) => `bin ${i}`)

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-[2px] min-w-full">
        {/* Header row — bin labels */}
        <div className="flex gap-[2px]">
          <div className="w-28 shrink-0" />
          {binLabelsShort?.map((label, i) => (
            <div
              key={i}
              className="w-6 shrink-0 text-[9px] text-slate-500 text-center leading-tight truncate"
              title={label}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {rows.map(row => (
          <div key={row.scan_id} className="flex gap-[2px] items-center">
            <div className="w-28 shrink-0 text-[10px] text-slate-400 truncate" title={row.label}>
              {row.label}
            </div>
            {row.cells.map((cell, ci) => (
              <div
                key={ci}
                className="w-6 h-[18px] shrink-0 rounded-sm"
                style={{ backgroundColor: `rgba(14,165,233,${Math.max(cell.intensity, 0.05)})` }}
                title={`Count: ${cell.count}${maxCount != null ? ` / max: ${maxCount}` : ''}`}
              />
            ))}
          </div>
        ))}
      </div>

      {maxCount != null && (
        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
          <span>0</span>
          <div className="flex-1 h-2 rounded bg-gradient-to-r from-sky-950 via-sky-500 to-sky-300" />
          <span>{maxCount}</span>
        </div>
      )}
    </div>
  )
}
