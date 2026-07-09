// allow: SIZE_OK — Page component with filter toolbar, recordings table, expandable waveform/canvas,
// audio player, demodulation, bulk delete, and polling — all in one unified UI surface.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Recording, Baseline } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTokenHeaders(): Record<string, string> {
  const token = localStorage.getItem('SDRWATCH_TOKEN') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: getTokenHeaders() })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function postJson(url: string, body: unknown): Promise<Response | null> {
  try {
    const hdrs: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getTokenHeaders(),
    }
    return await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
  } catch {
    return null
  }
}

async function apiDelete(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'DELETE', headers: getTokenHeaders() })
    return res.ok
  } catch {
    return false
  }
}

function fmtTime(secs: number): string {
  if (!secs || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

// ---------------------------------------------------------------------------
// Drawing amplitude on canvas
// ---------------------------------------------------------------------------

function drawAmplitude(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  playheadPos?: number,
) {
  if (!canvas || !data || data.length < 2) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const parent = canvas.parentElement
  const w = parent ? parent.clientWidth : 800
  const h = 100
  const dpr = window.devicePixelRatio || 1
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, w, h)

  const pad = 4
  const plotW = w - pad * 2
  const plotH = h - pad * 2

  // Fill area
  ctx.beginPath()
  ctx.moveTo(pad, pad + plotH)
  for (let i = 0; i < data.length; i++) {
    const x = pad + (i / (data.length - 1)) * plotW
    const y = pad + plotH - (data[i] * plotH)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(pad + plotW, pad + plotH)
  ctx.closePath()
  ctx.fillStyle = 'rgba(14,165,233,0.15)'
  ctx.fill()

  // Line
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const x = pad + (i / (data.length - 1)) * plotW
    const y = pad + plotH - (data[i] * plotH)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = '#0ea5e9'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Playhead
  if (playheadPos !== undefined && playheadPos >= 0) {
    const phx = pad + playheadPos * plotW
    ctx.beginPath()
    ctx.moveTo(phx, pad)
    ctx.lineTo(phx, pad + plotH)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface RecFilters {
  baselineId: string
  modulation: string
  status: string
  fMinMhz: string
  fMaxMhz: string
}

const DEFAULT_FILTERS: RecFilters = {
  baselineId: '',
  modulation: '',
  status: '',
  fMinMhz: '',
  fMaxMhz: '',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RecordingsPage() {
  const [searchParams] = useSearchParams()
  const detectionId = searchParams.get('detection_id')

  // Baselines list for filter
  const [baselines, setBaselines] = useState<Baseline[]>([])

  // Filters
  const [filters, setFilters] = useState<RecFilters>(DEFAULT_FILTERS)

  // Recordings
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)

  // Expand/collapse
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Audio playback refs per recording (use a map keyed by recording id)
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map())
  const ampDataRefs = useRef<Map<number, Float32Array>>(new Map())

  // Bulk delete
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Refresh interval
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -----------------------------------------------------------------------
  // Fetch baselines
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchJson<{ baselines: Baseline[] }>('/api/baselines').then(data => {
      if (data && Array.isArray(data.baselines)) {
        setBaselines(data.baselines)
      }
    })
  }, [])

  // -----------------------------------------------------------------------
  // Build query params from filters
  // -----------------------------------------------------------------------

  const buildParams = useCallback(() => {
    const params = new URLSearchParams()
    if (filters.baselineId) params.set('baseline_id', filters.baselineId)
    if (filters.modulation) params.set('modulation', filters.modulation)
    if (filters.status) params.set('status', filters.status)
    if (filters.fMinMhz) params.set('f_min_mhz', filters.fMinMhz)
    if (filters.fMaxMhz) params.set('f_max_mhz', filters.fMaxMhz)
    if (detectionId) params.set('detection_id', detectionId)
    return params.toString()
  }, [filters, detectionId])

  // -----------------------------------------------------------------------
  // Fetch recordings
  // -----------------------------------------------------------------------

  const fetchRecordings = useCallback(async () => {
    const params = buildParams()
    const data = await fetchJson<{ recordings: Recording[] }>(
      `/api/recordings?${params}`,
    )
    if (data && Array.isArray(data.recordings)) {
      setRecordings(data.recordings)
    }
    setLoading(false)
  }, [buildParams])

  // -----------------------------------------------------------------------
  // Initial fetch + poll every 5s
  // -----------------------------------------------------------------------

  useEffect(() => {
    setLoading(true)
    fetchRecordings()

    pollRef.current = setInterval(fetchRecordings, 5000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [fetchRecordings])

  // -----------------------------------------------------------------------
  // Expand/collapse — load amplitude data
  // -----------------------------------------------------------------------

  const toggleExpand = useCallback(async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)

    // Load amplitude if not cached
    if (!ampDataRefs.current.has(id)) {
      try {
        const token = localStorage.getItem('SDRWATCH_TOKEN') || ''
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const resp = await fetch(`/api/recordings/${id}/amplitude`, { headers })
        if (!resp.ok) return
        const buf = await resp.arrayBuffer()
        const floats = new Float32Array(buf)
        ampDataRefs.current.set(id, floats)
      } catch {
        // amplitude unavailable
      }
    }
  }, [expandedId])

  // -----------------------------------------------------------------------
  // Draw canvas after expand / on window resize
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (expandedId == null) return
    const data = ampDataRefs.current.get(expandedId)
    if (!data) return

    const canvas = document.getElementById(`plot-${expandedId}`) as HTMLCanvasElement | null
    if (!canvas) return

    // Store amplitude on canvas for click-to-seek
    const audio = audioRefs.current.get(expandedId)
    const pos = audio && audio.duration > 0 ? audio.currentTime / audio.duration : 0
    drawAmplitude(canvas, data, pos)
  }, [expandedId, recordings])

  // -----------------------------------------------------------------------
  // Audio timeupdate handler — redraw playhead
  // -----------------------------------------------------------------------

  const handleTimeUpdate = useCallback((id: number) => {
    const audio = audioRefs.current.get(id)
    const canvas = document.getElementById(`plot-${id}`) as HTMLCanvasElement | null
    const data = ampDataRefs.current.get(id)
    const timeLabel = document.getElementById(`time-${id}`)
    const playLabel = document.getElementById(`playlabel-${id}`)

    if (audio && timeLabel) {
      const dur = audio.duration || 0
      const ct = audio.currentTime || 0
      timeLabel.textContent = `${fmtTime(ct)} / ${fmtTime(dur)}`
    }
    if (audio && playLabel) {
      playLabel.textContent = audio.paused ? '▶ Paused' : '⏸ Playing'
    }
    if (canvas && data && audio) {
      const dur = audio.duration || 0
      drawAmplitude(canvas, data, dur > 0 ? audio.currentTime / dur : 0)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Click-to-seek on canvas
  // -----------------------------------------------------------------------

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>, id: number) => {
    const canvas = e.currentTarget
    const audio = audioRefs.current.get(id)
    if (!audio || !audio.duration) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (audio.duration > 0) {
      audio.currentTime = x * audio.duration
      audio.play().catch(() => {})
    }
  }, [])

  // -----------------------------------------------------------------------
  // Toggle play/pause
  // -----------------------------------------------------------------------

  const togglePlay = useCallback((id: number) => {
    const audio = audioRefs.current.get(id)
    if (!audio) return
    const label = document.getElementById(`playlabel-${id}`)
    if (audio.paused) {
      audio.play().catch(() => {})
      if (label) label.textContent = '⏸ Playing'
    } else {
      audio.pause()
      if (label) label.textContent = '▶ Paused'
    }
  }, [])

  // -----------------------------------------------------------------------
  // Demodulate and play
  // -----------------------------------------------------------------------

  const playModulation = useCallback(async (id: number, mod: string) => {
    const audio = audioRefs.current.get(id)
    const label = document.getElementById(`playlabel-${id}`)
    const modlabel = document.getElementById(`modlabel-${id}`)
    if (!audio) return
    try {
      const hdrs: Record<string, string> = {
        'Content-Type': 'application/json',
        ...getTokenHeaders(),
      }
      const resp = await fetch(`/api/recordings/${id}/demod`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ modulation: mod }),
      })
      if (!resp.ok) {
        if (label) label.textContent = '❌ Demod failed'
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      audio.src = url
      if (modlabel) {
        modlabel.textContent = mod.toUpperCase()
        modlabel.style.display = 'inline'
      }
      if (label) label.textContent = `⏸ ${mod.toUpperCase()}`
      await audio.play()
    } catch {
      if (label) label.textContent = '❌ Error'
    }
  }, [])

  // -----------------------------------------------------------------------
  // Delete single recording
  // -----------------------------------------------------------------------

  const deleteRec = useCallback(async (id: number) => {
    if (!confirm(`Delete recording #${id}?`)) return
    const ok = await apiDelete(`/api/recordings/${id}`)
    if (ok) fetchRecordings()
  }, [fetchRecordings])

  // -----------------------------------------------------------------------
  // Bulk delete
  // -----------------------------------------------------------------------

  const bulkDelete = useCallback(async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} recording(s)?`)) return
    const resp = await postJson('/api/recordings/bulk-delete', {
      ids: Array.from(selected),
    })
    if (resp && resp.ok) {
      setSelected(new Set())
      fetchRecordings()
    } else {
      alert('Bulk delete failed')
    }
  }, [selected, fetchRecordings])

  // -----------------------------------------------------------------------
  // Select all toggle
  // -----------------------------------------------------------------------

  const toggleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelected(new Set(recordings.map(r => r.id)))
    } else {
      setSelected(new Set())
    }
  }, [recordings])

  const toggleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // -----------------------------------------------------------------------
  // Download raw
  // -----------------------------------------------------------------------

  const downloadRaw = useCallback((id: number) => {
    window.location.href = `/api/recordings/${id}/download/raw`
  }, [])

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const queuedCount = recordings.filter(r => r.status === 'queued').length

  // Render status color
  function statusColor(status: string) {
    switch (status) {
      case 'compressed': return 'text-green-400'
      case 'queued': return 'text-amber-400'
      case 'compression_failed': return 'text-red-400'
      default: return 'text-slate-400'
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Recordings</h1>
          {detectionId && (
            <span className="chip text-xs bg-sky-600/60 text-sky-100">
              Signal #{detectionId}
              <a href={`/signal/${detectionId}`} className="text-sky-200 hover:text-white ml-1">
                →
              </a>
            </span>
          )}
        </div>
        <span className="text-sm text-slate-400">
          {loading ? 'Loading...' : `${recordings.length} recordings${queuedCount ? ` (${queuedCount} queued)` : ''}`}
        </span>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="field">
            <label>Baseline</label>
            <select
              className="input"
              value={filters.baselineId}
              onChange={e => setFilters(f => ({ ...f, baselineId: e.target.value }))}
            >
              <option value="">All baselines</option>
              {baselines.map(b => (
                <option key={b.id} value={b.id}>#{b.id} · {b.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Modulation</label>
            <select
              className="input"
              value={filters.modulation}
              onChange={e => setFilters(f => ({ ...f, modulation: e.target.value }))}
            >
              <option value="">All modulations</option>
              <option value="fm">FM</option>
              <option value="am">AM</option>
              <option value="cw">CW</option>
              <option value="usb">USB</option>
              <option value="lsb">LSB</option>
              <option value="digital">Digital</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              className="input"
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="raw">Raw</option>
              <option value="compressed">Compressed</option>
              <option value="compression_failed">Failed</option>
            </select>
          </div>
          <div className="field">
            <label>Min MHz</label>
            <input
              className="input"
              type="number"
              step="0.1"
              placeholder="e.g. 88"
              value={filters.fMinMhz}
              onChange={e => setFilters(f => ({ ...f, fMinMhz: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Max MHz</label>
            <input
              className="input"
              type="number"
              step="0.1"
              placeholder="e.g. 108"
              value={filters.fMaxMhz}
              onChange={e => setFilters(f => ({ ...f, fMaxMhz: e.target.value }))}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn text-sm"
              onClick={() => { setLoading(true); fetchRecordings() }}
            >
              ↻ Refresh
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-red-600/60 hover:bg-red-500 text-white text-sm transition-colors"
                onClick={bulkDelete}
              >
                ✕ Delete {selected.size}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recordings table */}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="text-xs uppercase text-slate-400">
              <th className="th" style={{ width: 32 }}>
                <input
                  type="checkbox"
                  title="Select all"
                  className="w-4 h-4"
                  checked={selected.size === recordings.length && recordings.length > 0}
                  onChange={e => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="th">ID</th>
              <th className="th">Freq (MHz)</th>
              <th className="th">Modulation</th>
              <th className="th">Duration</th>
              <th className="th">Raw</th>
              <th className="th">OGG</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && recordings.length === 0 ? (
              <tr>
                <td colSpan={10} className="td text-center text-slate-500 py-8">
                  Loading recordings...
                </td>
              </tr>
            ) : recordings.length === 0 ? (
              <tr>
                <td colSpan={10} className="td text-center text-slate-500 py-8">
                  No recordings yet. Run a scan with --capture-iq to create recordings.
                </td>
              </tr>
            ) : (
              recordings.map(rec => {
                const isExpanded = expandedId === rec.id
                const isChecked = selected.has(rec.id)

                return (
                  <tbody key={rec.id}>
                    <tr
                      className={`cursor-pointer hover:bg-slate-800/40 ${isChecked ? 'bg-sky-900/20' : ''} ${isExpanded ? 'bg-slate-800/30' : ''}`}
                      onClick={() => toggleExpand(rec.id)}
                    >
                      <td className="td" style={{ width: 32 }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rec-checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(rec.id)}
                        />
                      </td>
                      <td className="td font-mono text-xs">{rec.id}</td>
                      <td className="td font-mono">
                        {rec.f_mhz != null ? rec.f_mhz.toFixed(4) : '—'}
                      </td>
                      <td className="td">
                        {rec.modulation
                          ? <span className="chip text-xs">{rec.modulation.toUpperCase()}</span>
                          : <span className="chip text-xs text-slate-500">—</span>
                        }
                      </td>
                      <td className="td text-xs">
                        {rec.duration_ms ? `${(rec.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="td text-xs">{rec.raw_size_display || '—'}</td>
                      <td className="td text-xs">{rec.ogg_size_display || '—'}</td>
                      <td className={`td text-xs ${statusColor(rec.status)}`}>
                        {rec.status || '—'}
                      </td>
                      <td className="td text-xs text-slate-400">
                        {rec.created_utc
                          ? rec.created_utc.slice(0, 19).replace('T', ' ')
                          : '—'}
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1 items-center" onClick={e => e.stopPropagation()}>
                          <button
                            className="chip text-xs hover:bg-sky-600/40 cursor-pointer"
                            onClick={() => downloadRaw(rec.id)}
                          >
                            ⬇ Raw
                          </button>
                          <button
                            className="chip text-xs hover:bg-red-600/40 cursor-pointer"
                            onClick={() => deleteRec(rec.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="td" style={{ padding: 0 }}>
                          <div className="bg-slate-900/60 rounded-b-2xl p-4 space-y-3 border-t border-slate-700/40">
                            {/* Waveform & audio player */}
                            <div>
                              <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                                <span
                                  id={`playlabel-${rec.id}`}
                                  className="cursor-pointer hover:text-sky-400"
                                  onClick={() => togglePlay(rec.id)}
                                >
                                  ▶ Click waveform to play
                                </span>
                                <span id={`time-${rec.id}`} className="text-slate-500">
                                  {rec.duration_ms
                                    ? `${fmtTime(rec.duration_ms / 1000)} / ${fmtTime(rec.duration_ms / 1000)}`
                                    : '--:-- / --:--'}
                                </span>
                                <span
                                  id={`modlabel-${rec.id}`}
                                  className="chip text-xs bg-sky-600/60 text-sky-100"
                                  style={{ display: 'none' }}
                                >
                                  FM
                                </span>
                              </div>
                              <canvas
                                id={`plot-${rec.id}`}
                                height={100}
                                style={{ width: '100%', height: '100px', background: '#0b1220', borderRadius: '0.5rem', cursor: 'pointer' }}
                                onClick={e => handleCanvasClick(e, rec.id)}
                              />
                            </div>

                            {/* Audio element */}
                            <audio
                              ref={el => {
                                if (el) audioRefs.current.set(rec.id, el)
                              }}
                              controls
                              preload="none"
                              style={{ width: '100%', height: 40 }}
                              onTimeUpdate={() => handleTimeUpdate(rec.id)}
                              onPlay={() => {
                                const label = document.getElementById(`playlabel-${rec.id}`)
                                if (label) label.textContent = '⏸ Playing'
                              }}
                              onPause={() => {
                                const label = document.getElementById(`playlabel-${rec.id}`)
                                if (label) label.textContent = '▶ Paused'
                              }}
                              onEnded={() => {
                                const label = document.getElementById(`playlabel-${rec.id}`)
                                if (label) label.textContent = '▶ Click to replay'
                                handleTimeUpdate(rec.id)
                              }}
                            />

                            {/* Modulation buttons */}
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-400 mr-1">Demod:</span>
                              {['fm', 'am', 'cw', 'lsb', 'usb'].map(mod => (
                                <button
                                  key={mod}
                                  className="chip cursor-pointer hover:bg-sky-600/40"
                                  onClick={e => { e.stopPropagation(); playModulation(rec.id, mod) }}
                                >
                                  {mod.toUpperCase()}
                                </button>
                              ))}
                              <span className="text-slate-500 ml-2">
                                {rec.duration_ms ? `${(rec.duration_ms / 1000).toFixed(1)}s` : ''}
                                {rec.sample_rate_hz
                                  ? ` @ ${(rec.sample_rate_hz / 1e6).toFixed(1)} MS/s`
                                  : ''}
                              </span>
                              <button
                                className="chip text-xs hover:bg-sky-600/40 cursor-pointer ml-auto"
                                onClick={() => downloadRaw(rec.id)}
                              >
                                ⬇ Raw
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
