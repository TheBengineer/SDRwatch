// allow: SIZE_OK — route-level page with 14 independent data sections.
// Refactor target: extract sections (ThreatPanel, RecordingControls, CapturesList,
// Characterization, AllocationContext, TemporalBehavior, CollectionContext,
// RealtimePanel, EditForm) into sub-components under src/pages/signal-detail/.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useBaseline } from '../context/BaselineContext'
import { apiGet, apiPatch, apiPost } from '../api/client'
import type { SignalDetail, CollectionContext, Recording, LiveWindow } from '../types'

// ── Formatting helpers ────────────────────────────────────────────
function fmtFreq(mhz: number): string {
  return `${mhz.toFixed(6)} MHz`
}

function fmtTimestamp(utc: string): string {
  const d = new Date(utc)
  if (isNaN(d.getTime())) return utc
  return d.toLocaleString()
}

function fmtTsShort(utc: string): string {
  const d = new Date(utc)
  if (isNaN(d.getTime())) return utc
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtBandwidth(hz: number | null | undefined): string {
  if (hz == null) return '\u2014'
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)} MHz`
  return `${(hz / 1_000).toFixed(1)} kHz`
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '\u2014'
  const s = ms / 1_000
  if (s >= 60) return `${(s / 60).toFixed(1)}m`
  return `${s.toFixed(1)}s`
}

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '\u2014'
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`
  return `${bytes} B`
}

function threatBorder(level: string): string {
  if (level === 'high') return 'border-red-500'
  if (level === 'medium') return 'border-amber-500'
  return 'border-green-500'
}

function threatBadgeCls(level: string): string {
  if (level === 'high') return 'bg-red-600/80 text-red-100'
  if (level === 'medium') return 'bg-amber-600/80 text-amber-100'
  return 'bg-green-600/80 text-green-100'
}

function classBadgeCls(cls: string): string {
  if (cls === 'friendly') return 'bg-green-600/80 text-green-100'
  if (cls === 'hostile') return 'bg-red-600/80 text-red-100'
  if (cls === 'ambient') return 'bg-slate-500/80 text-slate-100'
  return 'bg-slate-700/80 text-slate-300'
}

// ── Component ─────────────────────────────────────────────────────
export default function SignalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const signalId = Number(id)
  const { baselineId } = useBaseline()

  // Data state
  const [signal, setSignal] = useState<SignalDetail | null>(null)
  const [collectionCtx, setCollectionCtx] = useState<CollectionContext | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [label, setLabel] = useState('')
  const [classification, setClassification] = useState('unknown')
  const [userBwHz, setUserBwHz] = useState('')
  const [notes, setNotes] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState('')
  const [recStatus, setRecStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'historical' | 'realtime'>('historical')
  const [liveWindows, setLiveWindows] = useState<LiveWindow[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const realtimeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Star toggle (optimistic)
  const [selected, setSelected] = useState(false)

  // ── Fetch signal detail ──────────────────────────────────────────
  const fetchSignal = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // API returns the signal object directly (not wrapped in {signal: ...})
      const data = await apiGet<SignalDetail>(
        `/api/signals/${signalId}`,
      )
      // Guard: if the API returned a 404-like empty object, treat as missing
      if (!data || !data.id) {
        setError('Signal not found')
        return
      }
      setSignal(data)
      setCollectionCtx(null)
      setLabel(data.label ?? '')
      setClassification(data.classification ?? 'unknown')
      setUserBwHz(data.user_bw_hz ? String(data.user_bw_hz) : '')
      setNotes(data.notes ?? '')
      setSelected(data.selected)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load signal')
    } finally {
      setLoading(false)
    }
  }, [signalId])

  // ── Fetch recordings ────────────────────────────────────────────
  const fetchRecordings = useCallback(async () => {
    try {
      const data = await apiGet<{ recordings: Recording[] }>('/api/recordings', {
        detection_id: signalId,
      })
      setRecordings(data.recordings ?? [])
    } catch {
      // silently fail — recordings are supplemental
    }
  }, [signalId])

  // ── Initial data load ───────────────────────────────────────────
  useEffect(() => {
    if (!signalId || isNaN(signalId)) return
    fetchSignal()
    fetchRecordings()
  }, [signalId, fetchSignal, fetchRecordings])

  // ── Star toggle ──────────────────────────────────────────────────
  const handleToggleSelect = useCallback(async () => {
    const prev = selected
    setSelected(p => !p)
    try {
      const data = await apiPost<{ selected: boolean }>(
        `/api/signals/${signalId}/toggle-selected`,
      )
      setSelected(data.selected)
    } catch {
      setSelected(prev)
    }
  }, [signalId, selected])

  // ── Form save ───────────────────────────────────────────────────
  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveStatus('saving')
    setSaveErrorMsg('')
    try {
      await apiPatch(`/api/signals/${signalId}`, {
        label: label || null,
        classification,
        user_bw_hz: userBwHz ? parseInt(userBwHz, 10) : null,
        notes: notes || null,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
      // Refresh signal data
      fetchSignal()
    } catch (e) {
      setSaveStatus('error')
      setSaveErrorMsg(e instanceof Error ? e.message : 'Failed to save')
    }
  }, [signalId, label, classification, userBwHz, notes, fetchSignal])

  const handleReset = useCallback(() => {
    if (!signal) return
    setLabel(signal.label ?? '')
    setClassification(signal.classification ?? 'unknown')
    setUserBwHz(signal.user_bw_hz ? String(signal.user_bw_hz) : '')
    setNotes(signal.notes ?? '')
  }, [signal])

  // ── Quick classify ──────────────────────────────────────────────
  const quickClassify = useCallback(async (cls: string) => {
    setClassification(cls)
    try {
      await apiPatch(`/api/signals/${signalId}`, { classification: cls })
      fetchSignal()
    } catch {
      // revert handled by fetchSignal
    }
  }, [signalId, fetchSignal])

  // ── Record IQ ───────────────────────────────────────────────────
  const handleRecordIQ = useCallback(async () => {
    if (!signal) return
    setRecStatus(null)
    try {
      await apiPost(`/api/recordings/${signalId}/queue`, {
        baseline_id: signal.baseline_id,
        f_center_hz: signal.f_center_hz,
        bandwidth_hz: signal.bandwidth_hz,
      })
      setRecStatus({ ok: true, msg: 'Queued for next recording pass' })
    } catch (e) {
      setRecStatus({ ok: false, msg: e instanceof Error ? e.message : 'Failed' })
    }
  }, [signal, signalId])

  // ── Mute ────────────────────────────────────────────────────────
  const handleMute = useCallback(async () => {
    if (!signal) return
    setRecStatus(null)
    try {
      await apiPost('/api/ignore-rules', {
        f_center_hz: signal.f_center_hz,
        tolerance_hz: 50000,
        baseline_id: signal.baseline_id,
        label: `Signal #${signalId}`,
      })
      setRecStatus({ ok: true, msg: 'Frequency muted \u2014 future sweeps will skip this signal' })
    } catch (e) {
      setRecStatus({ ok: false, msg: e instanceof Error ? e.message : 'Failed' })
    }
  }, [signal, signalId])

  // ── Real-time polling ───────────────────────────────────────────
  const fetchLiveWindows = useCallback(async () => {
    if (!signal) return
    try {
      const data = await apiGet<{ windows: LiveWindow[] }>('/api/live/windows', { limit: 50 })
      const tolerance = 500_000
      const nearby = (data.windows ?? []).filter(w => {
        const wCenter = w.center_hz ?? 0
        return Math.abs(wCenter - signal.f_center_hz) < tolerance
      })
      setLiveWindows(nearby)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch {
      // silent
    }
  }, [signal])

  useEffect(() => {
    if (viewMode === 'realtime') {
      fetchLiveWindows()
      realtimeRef.current = setInterval(() => {
        if (autoRefresh) fetchLiveWindows()
      }, 2000)
    }
    return () => {
      if (realtimeRef.current) {
        clearInterval(realtimeRef.current)
        realtimeRef.current = null
      }
    }
  }, [viewMode, autoRefresh, fetchLiveWindows])

  // ── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400 text-lg">Loading signal...</div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────
  if (error || !signal) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link to="/" className="text-sm text-slate-400 hover:text-sky-400">
          &larr; Dashboard
        </Link>
        <div className="card bg-slate-900/50 border border-white/10 rounded-xl p-6">
          <h1 className="text-2xl font-bold text-red-400">Signal not found</h1>
          <p className="text-sm text-slate-400 mt-2">
            {error || 'The requested signal does not exist or has been removed.'}
          </p>
          <Link
            to="/signals"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm"
          >
            Browse all signals
          </Link>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  const latestLive = liveWindows[liveWindows.length - 1]

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="card bg-slate-900/50 border border-white/10 rounded-xl p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link to="/" className="text-sm text-slate-400 hover:text-sky-400">
                &larr; Dashboard
              </Link>
              {signal.baseline_id && (
                <>
                  <span className="text-slate-500">&middot;</span>
                  <Link
                    to={`/?baseline_id=${signal.baseline_id}`}
                    className="text-sm text-slate-400 hover:text-sky-400"
                  >
                    Baseline #{signal.baseline_id}
                  </Link>
                </>
              )}
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-sky-400 font-mono">{signal.signal_id}</span>
              <span className="text-slate-300">{fmtFreq(signal.f_center_mhz ?? 0)}</span>
              <button
                type="button"
                onClick={handleToggleSelect}
                className={`text-2xl transition-colors ${
                  selected ? 'text-sky-400' : 'text-slate-500 hover:text-sky-400'
                }`}
                title={selected ? 'Deselect signal' : 'Select signal'}
              >
                {selected ? '\u2605' : '\u2606'}
              </button>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {signal.baseline_name && <>Baseline: {signal.baseline_name}</>}
              {signal.service && (
                <>
                  <span className="mx-2">&middot;</span>
                  <span className="text-amber-400">{signal.service}</span>
                </>
              )}
              {signal.region && (
                <span className="text-slate-500"> ({signal.region})</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`text-sm px-3 py-1 rounded-full font-medium ${threatBadgeCls(signal.threat_level)}`}
            >
              <span className="font-semibold">{signal.threat_label}</span>
              <span className="text-xs opacity-75 ml-1">({signal.threat_score}%)</span>
            </div>
            {signal.near_spur && (
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-purple-600/60 text-purple-100"
                title="Signal is near a known SDR spur"
              >
                &#x26A1; Spur
              </span>
            )}
            {signal.missing_since_utc && (
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-orange-600/60 text-orange-100"
                title={`Signal went quiet at ${signal.missing_since_utc}`}
              >
                &#x1F4E1; Intermittent
              </span>
            )}
            {signal.label && (
              <span className="text-sm px-2 py-0.5 rounded-full bg-amber-600/60 text-amber-100">
                {signal.label}
              </span>
            )}
            <Link
              to={baselineId ? { pathname: '/recordings', search: `?detection_id=${signal.id}&baseline_id=${baselineId}` } : `/recordings?detection_id=${signal.id}`}
              className="text-sm px-3 py-1 rounded-full font-medium bg-sky-600/60 text-sky-100 hover:bg-sky-500/80 transition-colors"
            >
              &#x1F399; {recordings.length} Recording{recordings.length !== 1 ? 's' : ''}
            </Link>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${classBadgeCls(signal.classification ?? 'unknown')}`}>
              {(signal.classification ?? 'unknown').charAt(0).toUpperCase() + (signal.classification ?? 'unknown').slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* ── View mode toggle ──────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode('historical')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'historical'
              ? 'ring-2 ring-sky-400 bg-sky-600/20 text-sky-300'
              : 'bg-white/8 text-slate-300 hover:bg-white/15'
          }`}
        >
          Historical Data
        </button>
        <button
          type="button"
          onClick={() => {
            if (signal.realtime_available) setViewMode('realtime')
          }}
          disabled={!signal.realtime_available}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            viewMode === 'realtime'
              ? 'ring-2 ring-sky-400 bg-sky-600/20 text-sky-300'
              : signal.realtime_available
                ? 'bg-white/8 text-slate-300 hover:bg-white/15'
                : 'opacity-50 cursor-not-allowed bg-white/5 text-slate-500'
          }`}
          title={
            signal.realtime_available
              ? 'Switch to real-time view'
              : 'No active scan covers this frequency'
          }
        >
          Real-Time
          {signal.realtime_available && (
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </button>
      </div>

      {/* ── Main grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Threat factors */}
          {signal.threat_factors && signal.threat_factors.length > 0 && (
            <section
              className={`bg-slate-900/50 border border-white/10 rounded-xl p-6 border-l-4 ${threatBorder(signal.threat_level)}`}
            >
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>&#x1F3AF; Threat Assessment</span>
                <span className="text-xs font-normal text-slate-400">(Automated analysis)</span>
              </h2>
              <ul className="space-y-1 text-sm">
                {signal.threat_factors.map((factor, i) => {
                  const fLow = factor.toLowerCase()
                  let dotColor = 'text-amber-400'
                  if (fLow.includes('artifact')) dotColor = 'text-slate-400'
                  else if (fLow.includes('high power') || fLow.includes('out-of-band')) dotColor = 'text-red-400'
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className={dotColor}>&bull;</span>
                      <span className="text-slate-300">{factor}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Recording controls */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-3">Recording</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRecordIQ}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
                title="Queue this signal for IQ capture"
              >
                &#x1F399; Record IQ
              </button>
              <button
                type="button"
                onClick={handleMute}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-amber-600/40 text-slate-300 text-sm transition-colors"
                title="Never record this frequency"
              >
                &#x1F507; Mute
              </button>
            </div>
            {recStatus && (
              <p
                className={`text-xs mt-2 ${
                  recStatus.ok ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {recStatus.ok ? '\u2705' : '\u274C'} {recStatus.msg}
              </p>
            )}
          </section>

          {/* Captures list */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-3">Captures</h2>
            {recordings.length === 0 ? (
              <p className="text-sm text-slate-500">No captures for this signal yet.</p>
            ) : (
              <div className="divide-y divide-slate-700/40">
                {recordings.map(rec => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-slate-300 uppercase">
                        {rec.modulation ?? 'raw'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {fmtDuration(rec.duration_ms)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {rec.raw_size_display ?? fmtBytes(rec.raw_bytes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {rec.ogg_path && rec.status === 'compressed' ? (
                        <audio controls preload="none" className="h-7 w-36">
                          <source
                            src={`/api/recordings/${rec.id}/download/ogg`}
                            type="audio/ogg"
                          />
                        </audio>
                      ) : (
                        <span className="text-xs text-slate-500">raw only</span>
                      )}
                      <a
                        href={`/api/recordings/${rec.id}/download/raw`}
                        className="text-xs px-1.5 py-0.5 rounded bg-white/10 hover:bg-sky-600/40 text-slate-300 transition-colors"
                        download
                      >
                        &#x2B07;
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link
              to={baselineId ? { pathname: '/recordings', search: `?detection_id=${signal.id}&baseline_id=${baselineId}` } : `/recordings?detection_id=${signal.id}`}
              className="text-xs text-slate-400 hover:text-sky-400 mt-3 inline-block transition-colors"
            >
              View all captures for this signal &rarr;
            </Link>
          </section>

          {/* Signal characterization */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">&#x1F4CA; Signal Characterization</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Peak Power</div>
                <div className="text-xl font-semibold">
                  {signal.peak_db != null ? `${signal.peak_db.toFixed(1)} dB` : '\u2014'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Noise Floor</div>
                <div className="text-xl font-semibold">
                  {signal.noise_db != null ? `${signal.noise_db.toFixed(1)} dB` : '\u2014'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">SNR</div>
                <div className={`text-xl font-semibold ${signal.snr_db != null && signal.snr_db > 20 ? 'text-amber-400' : ''}`}>
                  {signal.snr_db != null ? `${signal.snr_db.toFixed(1)} dB` : '\u2014'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Confidence</div>
                <div className="text-xl font-semibold">
                  {signal.confidence != null ? `${(signal.confidence * 100).toFixed(1)}%` : '\u2014'}
                </div>
              </div>
            </div>

            {(signal.baseline_noise || signal.baseline_occupancy) && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                  Baseline Statistics
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {signal.baseline_noise && (
                    <>
                      <div>
                        <div className="text-slate-400">Avg Noise Floor</div>
                        <div className="font-medium">
                          {signal.baseline_noise.noise_floor_ema.toFixed(1)} dB
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Avg Power</div>
                        <div className="font-medium">
                          {signal.baseline_noise.power_ema.toFixed(1)} dB
                        </div>
                      </div>
                    </>
                  )}
                  {signal.baseline_occupancy && (
                    <>
                      <div>
                        <div className="text-slate-400">Duty Cycle</div>
                        {signal.baseline_occupancy.observed_ms > 0 ? (
                          <>
                            <div className="font-medium">
                              {(signal.baseline_occupancy.duty_cycle * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500">
                              {(signal.baseline_occupancy.occupied_ms / 1000).toFixed(1)}s
                              {' / '}
                              {(signal.baseline_occupancy.observed_ms / 1000).toFixed(1)}s
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium">
                              {(signal.baseline_occupancy.occ_ratio * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500">
                              {signal.baseline_occupancy.occ_count} / {signal.baseline_occupancy.baseline_windows} windows
                            </div>
                          </>
                        )}
                      </div>
                      <div>
                        <div className="text-slate-400">Hit Count</div>
                        <div className="font-medium">{signal.baseline_occupancy.occ_count}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Frequency allocation context */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">&#x1F4E1; Allocation Context</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Center Frequency</div>
                <div className="text-xl font-semibold">{fmtFreq(signal.f_center_mhz ?? 0)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Lower Bound</div>
                <div className="text-lg font-semibold">{`${((signal.f_low_hz ?? 0) / 1e6).toFixed(6)} MHz`}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Upper Bound</div>
                <div className="text-lg font-semibold">{`${((signal.f_high_hz ?? 0) / 1e6).toFixed(6)} MHz`}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Bandwidth</div>
                <div className="text-xl font-semibold">
                  {fmtBandwidth(signal.user_bw_hz ?? signal.bandwidth_hz)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Service</div>
                <div className={`text-lg font-semibold ${!signal.service ? 'text-red-400' : ''}`}>
                  {signal.service || 'UNALLOCATED'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Region</div>
                <div className="text-lg font-semibold">{signal.region || '\u2014'}</div>
              </div>
            </div>
            {signal.bandplan_notes && (
              <div className="mt-3 text-sm text-slate-400">
                <span className="font-medium">Notes:</span> {signal.bandplan_notes}
              </div>
            )}
            {signal.near_spur && signal.spur_info && (
              <div className="mt-3 p-2 bg-purple-900/30 rounded text-sm">
                <span className="text-purple-300 font-medium">
                  &#x26A1; SDR Spur Detected:
                </span>
                <span className="text-slate-300">
                  {' '}{(signal.spur_info.bin_hz / 1e6).toFixed(3)} MHz,{' '}
                  {signal.spur_info.mean_power_db.toFixed(1)} dB avg,{' '}
                  {signal.spur_info.hits} hits
                </span>
              </div>
            )}
          </section>

          {/* Temporal behavior */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">&#x23F1;&#xFE0F; Temporal Behavior</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">First Seen</div>
                <div className="text-lg font-semibold">{fmtTsShort(signal.first_seen_utc)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Last Seen</div>
                <div className="text-lg font-semibold">{fmtTsShort(signal.last_seen_utc)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Total Hits</div>
                <div className="text-lg font-semibold">{signal.total_hits ?? 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Total Windows</div>
                <div className="text-lg font-semibold">{signal.total_windows ?? 0}</div>
              </div>
            </div>

            {/* Segment density bar */}
            {signal.hit_ratio != null && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="text-xs uppercase tracking-wide text-slate-400"
                    title="Segment detections per observation window. Values over 100% indicate wideband signals detected as multiple segments per window."
                  >
                    Segment Density
                  </div>
                  {signal.hit_ratio > 1.0 && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-600/80 text-amber-100">
                      {(signal.hit_ratio * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-4 relative overflow-hidden">
                  <div
                    className="bg-sky-500 h-4 rounded-full transition-all"
                    style={{ width: `${Math.min(signal.hit_ratio * 100, 100).toFixed(1)}%` }}
                  />
                  {signal.hit_ratio < 0.1 && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                      Low density &mdash; may indicate burst transmission
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  {(signal.hit_ratio * 100).toFixed(1)}% &middot; {signal.total_hits ?? 0} hits / {signal.total_windows ?? 0} windows
                </div>
              </div>
            )}

            {signal.missing_since_utc && (
              <div className="mt-3 p-2 bg-orange-900/30 rounded text-sm">
                <span className="text-orange-300 font-medium">&#x1F4E1; Signal Quiet Since:</span>
                <span className="text-slate-300"> {fmtTimestamp(signal.missing_since_utc)}</span>
              </div>
            )}

            {signal.scan_activity && (
              <div className="mt-3 pt-3 border-t border-slate-700 text-sm">
                <span className="text-slate-400">Recent activity:</span>
                <span className="text-slate-300">
                  {' '}{signal.scan_activity.recent_scans} scans, latest at{' '}
                  {fmtTsShort(signal.scan_activity.latest_scan)}
                </span>
              </div>
            )}
          </section>

          {/* Collection context */}
          {collectionCtx && (
            <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">&#x1F6F0;&#xFE0F; Collection Context</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {collectionCtx.sdr_serial && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">SDR Serial</div>
                    <div className="font-mono">{collectionCtx.sdr_serial}</div>
                  </div>
                )}
                {collectionCtx.antenna && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Antenna</div>
                    <div>{collectionCtx.antenna}</div>
                  </div>
                )}
                {collectionCtx.location_lat != null && collectionCtx.location_lon != null && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Location</div>
                    <div>
                      {collectionCtx.location_lat.toFixed(5)}, {collectionCtx.location_lon.toFixed(5)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Scan Range</div>
                  <div>
                    {(collectionCtx.freq_start_hz / 1e6).toFixed(3)}
                    &thinsp;&ndash;&thinsp;
                    {(collectionCtx.freq_stop_hz / 1e6).toFixed(3)} MHz
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Bin Width</div>
                  <div>{(collectionCtx.bin_hz / 1000).toFixed(1)} kHz</div>
                </div>
                {collectionCtx.bandplan_path && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Bandplan</div>
                    <div className="text-xs">{collectionCtx.bandplan_path}</div>
                  </div>
                )}
              </div>
              {collectionCtx.baseline_notes && (
                <div className="mt-3 text-sm text-slate-400">
                  <span className="font-medium">Baseline notes:</span> {collectionCtx.baseline_notes}
                </div>
              )}
            </section>
          )}

          {/* Real-time data panel */}
          {viewMode === 'realtime' && (
            <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>&#x1F4C8; Real-Time Data</span>
                <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              </h2>

              {liveWindows.length === 0 ? (
                <div className="text-center text-slate-400 py-4">
                  No recent observations at this frequency
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Center</div>
                      <div className="text-lg font-semibold">
                        {(latestLive.center_mhz ?? 0).toFixed(3)} MHz
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Detections</div>
                      <div className="text-lg font-semibold">{latestLive.det_count ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Mean Power</div>
                      <div className="text-lg font-semibold">
                        {(latestLive.mean_db ?? 0).toFixed(1)} dB
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">P90 Power</div>
                      <div className={`text-lg font-semibold ${latestLive.anomalous ? 'text-red-400' : ''}`}>
                        {(latestLive.p90_db ?? 0).toFixed(1)} dB
                      </div>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-400">Recent observations:</span>
                    <span className="font-semibold ml-2">{liveWindows.length}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={e => setAutoRefresh(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                  />
                  <span>Auto-refresh</span>
                </label>
                <span>{lastUpdate ? `Updated: ${lastUpdate}` : '\u2014'}</span>
              </div>
            </section>
          )}

          {/* Notes display */}
          {signal.notes && (
            <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-2">&#x1F4DD; Notes</h2>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{signal.notes}</p>
            </section>
          )}
        </div>

        {/* ── Right column ────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Classification & labeling form */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Classification &amp; Labeling</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="signal-label" className="form-label">
                  Label
                </label>
                <input
                  id="signal-label"
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g., Local FM, ATC, etc."
                  maxLength={64}
                  className="input w-full text-sm"
                />
                <div className="text-xs muted mt-1">Short identifier (max 64 chars)</div>
              </div>

              <div>
                <label htmlFor="signal-classification" className="form-label">
                  Classification
                </label>
                <select
                  id="signal-classification"
                  value={classification}
                  onChange={e => setClassification(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="unknown">Unknown</option>
                  <option value="friendly">Friendly</option>
                  <option value="ambient">Ambient</option>
                  <option value="hostile">Hostile</option>
                </select>
              </div>

              <div>
                <label htmlFor="signal-user-bw" className="form-label">
                  Corrected Bandwidth (Hz)
                </label>
                <input
                  id="signal-user-bw"
                  type="number"
                  value={userBwHz}
                  onChange={e => setUserBwHz(e.target.value)}
                  placeholder="e.g., 25000"
                  min={0}
                  step={1000}
                  className="input w-full text-sm"
                />
                <div className="text-xs muted mt-1">
                  Override display bandwidth (leave empty to use detected)
                </div>
              </div>

              <div>
                <label htmlFor="signal-notes" className="form-label">
                  Notes
                </label>
                <textarea
                  id="signal-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add any observations or context..."
                  maxLength={1024}
                  className="input w-full text-sm resize-y"
                />
                <div className="text-xs muted mt-1">Max 1024 characters</div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saveStatus === 'saving'}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm transition-colors"
                >
                  Reset
                </button>
              </div>

              {saveStatus === 'saved' && (
                <p className="text-sm text-green-400">Changes saved successfully.</p>
              )}
              {saveStatus === 'error' && (
                <p className="text-sm text-red-400">{saveErrorMsg || 'Failed to save'}</p>
              )}
            </form>
          </section>

          {/* Quick actions */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => quickClassify('friendly')}
                className="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
              >
                &#x2713; Mark as Friendly
              </button>
              <button
                type="button"
                onClick={() => quickClassify('ambient')}
                className="w-full px-4 py-2 rounded-lg bg-slate-500 hover:bg-slate-400 text-white text-sm font-medium transition-colors"
              >
                &#x25CB; Mark as Ambient
              </button>
              <button
                type="button"
                onClick={() => quickClassify('hostile')}
                className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                &#x26A0; Mark as Hostile
              </button>
            </div>
          </section>

          {/* EP/COMSEC quick reference */}
          <section className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-sm font-semibold mb-2 text-slate-400">EP/COMSEC Quick Reference</h2>
            <div className="text-xs text-slate-500 space-y-1">
              <p>
                <strong className="text-red-400">Hostile:</strong> Confirmed adversary emissions,
                jammers, surveillance
              </p>
              <p>
                <strong className="text-green-400">Friendly:</strong> Own-force communications,
                authorized equipment
              </p>
              <p>
                <strong className="text-slate-400">Ambient:</strong> Expected background (broadcast,
                nav aids)
              </p>
              <p>
                <strong className="text-amber-400">Unknown:</strong> Requires further analysis
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
