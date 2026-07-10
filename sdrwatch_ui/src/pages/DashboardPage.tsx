import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useBaseline } from '../context/BaselineContext'
import type { Signal, ChangePayload } from '../types'
import TacticalSnapshotView from '../components/TacticalSnapshot'
import SignalCardGrid from '../components/SignalCardGrid'
import FreqBarChart from '../components/FreqBarChart'
import TimelineChart from '../components/TimelineChart'
import CoverageHeatmap from '../components/CoverageHeatmap'
import SNRHistogram from '../components/SNRHistogram'
import FilterBar, { type DashboardFilters } from '../components/FilterBar'
import { Card } from '../components/primitives'
import ChangeFeedPreview from '../components/ChangeFeedPreview'

// ---------------------------------------------------------------------------
// Types matching the actual API shapes
// ---------------------------------------------------------------------------

interface SnapshotPayload {
  persistent_signals: number
  recent_new: number
  last_update: string | null
  recent_window_minutes: number
  active_window_minutes: number
}

interface BandSummaryItem {
  band_index: number
  label?: string
  f_low_hz: number
  f_high_hz: number
  persistent_signals: number
  recent_new: number
  occupied_fraction: number
  occupancy_level?: string
  note?: string
}

interface BandSummaryMeta {
  band_count: number
  band_width_mhz?: number
  recent_minutes?: number
}

interface BaselineRecord {
  id: number
  name: string
  total_windows: number
  freq_start_hz?: number
  freq_stop_hz?: number
  bin_hz?: number
}

interface TacticalResponse {
  baseline?: BaselineRecord
  snapshot: SnapshotPayload
  active_signals: Signal[]
  band_summary: BandSummaryItem[]
  band_summary_meta?: BandSummaryMeta
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChartParams(baselineId: number, filters: DashboardFilters): string {
  const params = new URLSearchParams()
  params.set('baseline_id', String(baselineId))
  if (filters.service) params.set('service', filters.service)
  if (filters.minSnr) params.set('min_snr_db', filters.minSnr)
  if (filters.lookbackHours) params.set('since_hours', filters.lookbackHours)
  if (filters.freqLow) params.set('freq_low_mhz', filters.freqLow)
  if (filters.freqHigh) params.set('freq_high_mhz', filters.freqHigh)
  return params.toString()
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Default filter state
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: DashboardFilters = {
  service: '',
  minSnr: '',
  lookbackHours: '168',
  freqLow: '',
  freqHigh: '',
}

// ---------------------------------------------------------------------------
// Sub-types for chart data
// ---------------------------------------------------------------------------

interface FreqBin {
  count: number
  mhz_start?: number
  mhz_end?: number
}

interface FreqResponse {
  latest: { bins: FreqBin[]; max_count: number }
  average: { bins: FreqBin[]; f_start_mhz: number; f_stop_mhz: number; max_avg: number }
}

interface TimelineBucket {
  label: string
  detections: number
  scans: number
  max_snr: number | null
}

interface TimelineResponse {
  buckets: TimelineBucket[]
  det_max: number
  scan_max: number
  snr_max: number
}

interface HeatmapCell {
  count: number
  intensity: number
}

interface HeatmapRow {
  scan_id: number
  label: string
  cells: HeatmapCell[]
}

interface HeatmapResponse {
  rows: HeatmapRow[]
  bin_labels: string[]
  max_count: number
}

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

interface SNRResponse {
  histogram: HistogramBin[]
  stats: SNRStats | null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { baselineId } = useBaseline()

  // Tactical snapshot
  const [tactical, setTactical] = useState<TacticalResponse | null>(null)
  const [tacticalLoading, setTacticalLoading] = useState(true)

  // Active signals (from tactical)
  const [activeSignals, setActiveSignals] = useState<Signal[]>([])
  const [signalsLoading, setSignalsLoading] = useState(true)

  // Change events
  const [changes, setChanges] = useState<ChangePayload | null>(null)
  const [changesLoading, setChangesLoading] = useState(true)

  // Frequency bins
  const [freqData, setFreqData] = useState<FreqResponse | null>(null)
  const [freqLoading, setFreqLoading] = useState(true)

  // Timeline
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(true)

  // Coverage heatmap
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null)
  const [heatmapLoading, setHeatmapLoading] = useState(true)

  // SNR histogram
  const [snrData, setSnrData] = useState<SNRResponse | null>(null)
  const [snrLoading, setSnrLoading] = useState(true)

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)

  // Error tracking
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchAll = useCallback(async (bid: number, f: DashboardFilters) => {
    const params = buildChartParams(bid, f)

    // Tactical snapshot + signals
    setTacticalLoading(true)
    const tacticalData = await fetchJson<TacticalResponse>(`/api/baseline/${bid}/tactical`)
    if (tacticalData) {
      setTactical(tacticalData)
      setActiveSignals(tacticalData.active_signals ?? [])
      setErrors(prev => ({ ...prev, tactical: null }))
    } else {
      setErrors(prev => ({ ...prev, tactical: 'Failed to load tactical data' }))
    }
    setTacticalLoading(false)
    setSignalsLoading(false)

    // Change events
    setChangesLoading(true)
    const changeData = await fetchJson<ChangePayload>(`/api/baseline/${bid}/changes?minutes=60`)
    if (changeData) {
      setChanges(changeData)
      setErrors(prev => ({ ...prev, changes: null }))
    } else {
      setErrors(prev => ({ ...prev, changes: 'Failed to load changes' }))
    }
    setChangesLoading(false)

    // Frequency bins
    setFreqLoading(true)
    const freqJson = await fetchJson<FreqResponse>(`/api/charts/frequency-bins?${params}`)
    if (freqJson) {
      setFreqData(freqJson)
      setErrors(prev => ({ ...prev, freq: null }))
    } else {
      setErrors(prev => ({ ...prev, freq: 'Failed to load frequency data' }))
    }
    setFreqLoading(false)

    // Timeline
    setTimelineLoading(true)
    const timelineJson = await fetchJson<TimelineResponse>(`/api/charts/timeline?${params}`)
    if (timelineJson) {
      setTimelineData(timelineJson)
      setErrors(prev => ({ ...prev, timeline: null }))
    } else {
      setErrors(prev => ({ ...prev, timeline: 'Failed to load timeline' }))
    }
    setTimelineLoading(false)

    // Coverage heatmap
    setHeatmapLoading(true)
    const heatJson = await fetchJson<HeatmapResponse>(`/api/charts/coverage-heatmap?${params}`)
    if (heatJson) {
      setHeatmapData(heatJson)
      setErrors(prev => ({ ...prev, heatmap: null }))
    } else {
      setErrors(prev => ({ ...prev, heatmap: 'Failed to load heatmap' }))
    }
    setHeatmapLoading(false)

    // SNR histogram
    setSnrLoading(true)
    const snrJson = await fetchJson<SNRResponse>(`/api/charts/snr-histogram?${params}`)
    if (snrJson) {
      setSnrData(snrJson)
      setErrors(prev => ({ ...prev, snr: null }))
    } else {
      setErrors(prev => ({ ...prev, snr: 'Failed to load SNR histogram' }))
    }
    setSnrLoading(false)
  }, [])

  // -----------------------------------------------------------------------
  // Initial fetch + poll on baseline change
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!baselineId) return

    // Reset states
    setTactical(null)
    setActiveSignals([])
    setChanges(null)
    setFreqData(null)
    setTimelineData(null)
    setHeatmapData(null)
    setSnrData(null)
    setErrors({})
    setTacticalLoading(true)
    setSignalsLoading(true)
    setChangesLoading(true)
    setFreqLoading(true)
    setTimelineLoading(true)
    setHeatmapLoading(true)
    setSnrLoading(true)

    // Fetch immediately
    fetchAll(baselineId, filters)

    // Poll every 5 seconds
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      fetchAll(baselineId, filters)
    }, 5000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [baselineId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Filter change handler — refetch immediately
  // -----------------------------------------------------------------------

  const handleFilterChange = useCallback((newFilters: DashboardFilters) => {
    setFilters(newFilters)
    if (baselineId) {
      fetchAll(baselineId, newFilters)
    }
  }, [baselineId, fetchAll])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!baselineId) {
    return (
      <div className="space-y-6">
        <Card variant="bordered">
          <h2 className="text-lg font-semibold mb-2">Dashboard</h2>
          <p className="text-sm text-slate-300">
            Select a baseline from the header to populate the dashboard with tactical data, signal cards, and charts.
          </p>
        </Card>
      </div>
    )
  }

  const snapshot = tactical?.snapshot ?? null
  const totalWindows = tactical?.baseline?.total_windows

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-300">
            Tactical spectrum awareness for baseline #{baselineId}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <Card variant="bordered" className="space-y-3">
        <h3 className="text-xs uppercase tracking-wide" style={{color:'var(--text-secondary)'}}>Filters</h3>
        <FilterBar filters={filters} onChange={handleFilterChange} />
      </Card>

      {/* Tactical snapshot */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tactical snapshot</h2>
        <TacticalSnapshotView
          snapshot={snapshot}
          totalWindows={totalWindows}
          loading={tacticalLoading}
        />
      </section>

      {/* Band summary */}
      {tactical?.band_summary && tactical.band_summary.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Band summary</h2>
            {tactical.band_summary_meta && (
              <span className="text-xs text-slate-400">
                {tactical.band_summary_meta.band_count} bands
                {tactical.band_summary_meta.band_width_mhz
                  ? ` · ${Number(tactical.band_summary_meta.band_width_mhz).toFixed(1)} MHz slices`
                  : ''}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {tactical.band_summary.map((band) => (
              <div key={band.band_index} className="border border-white/10 rounded-xl p-4 bg-slate-900/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{band.label ?? `Band ${band.band_index}`}</div>
                    <div className="text-xs text-slate-400">
                      {band.occupied_fraction != null ? `${Math.round(band.occupied_fraction * 100)}% occupied` : ''}
                    </div>
                  </div>
                  <span className="chip text-xs shrink-0">
                    {band.persistent_signals > 0 || band.recent_new > 0 ? 'Active' : 'Quiet'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-300 mt-3">
                  <span>Persistent {band.persistent_signals}</span>
                  <span>Recent new {band.recent_new}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Signal cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Active signals</h2>
            <p className="text-sm text-slate-300">
              {tactical?.snapshot?.active_window_minutes
                ? `Detections seen in the past ${tactical.snapshot.active_window_minutes} minutes`
                : 'Active signals detected in recent sweeps'}
            </p>
          </div>
          <span className="text-xs text-slate-400">{activeSignals.length} signals</span>
        </div>
        <SignalCardGrid signals={activeSignals} loading={signalsLoading} />
      </section>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Frequency bar chart */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Frequency spectrum</h2>
          <p className="text-xs text-slate-400">Latest scan bins and all-scans average</p>
          {errors.freq && <div className="text-xs text-red-400">{errors.freq}</div>}
          <FreqBarChart
            latestBins={freqData?.latest?.bins}
            avgBins={freqData?.average?.bins}
            latestMax={freqData?.latest?.max_count}
            avgMax={freqData?.average?.max_avg}
            avgStartMhz={freqData?.average?.f_start_mhz}
            avgStopMhz={freqData?.average?.f_stop_mhz}
            loading={freqLoading}
          />
        </section>

        {/* Timeline */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Timeline</h2>
          <p className="text-xs text-slate-400">Detections, scans, and max SNR over time</p>
          {errors.timeline && <div className="text-xs text-red-400">{errors.timeline}</div>}
          <TimelineChart
            buckets={timelineData?.buckets}
            detMax={timelineData?.det_max}
            scanMax={timelineData?.scan_max}
            snrMax={timelineData?.snr_max}
            loading={timelineLoading}
          />
        </section>

        {/* SNR histogram */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">SNR distribution</h2>
          <p className="text-xs text-slate-400">Signal-to-noise ratio histogram across detections</p>
          {errors.snr && <div className="text-xs text-red-400">{errors.snr}</div>}
          <SNRHistogram
            histogram={snrData?.histogram}
            stats={snrData?.stats}
            loading={snrLoading}
          />
        </section>

        {/* Coverage heatmap */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Coverage heatmap</h2>
          <p className="text-xs text-slate-400">Detection density by scan and frequency</p>
          {errors.heatmap && <div className="text-xs text-red-400">{errors.heatmap}</div>}
          <CoverageHeatmap
            rows={heatmapData?.rows}
            binLabels={heatmapData?.bin_labels}
            maxCount={heatmapData?.max_count}
            loading={heatmapLoading}
          />
        </section>
      </div>

      {/* Change feed */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Change feed</h2>
            <p className="text-sm text-slate-300">Recent signal change events</p>
          </div>
          <Link to={baselineId ? `/changes?baseline_id=${baselineId}` : '/changes'} className="btn text-xs text-sky-400 hover:underline">View all changes →</Link>
        </div>
        {errors.changes && <div className="text-xs text-red-400">{errors.changes}</div>}
        <ChangeFeedPreview
          events={changes?.events ?? []}
          totalEvents={changes?.total_events}
          windowMinutes={changes?.window_minutes}
          generatedAt={changes?.generated_at}
          loading={changesLoading}
        />
      </section>
    </div>
  )
}
