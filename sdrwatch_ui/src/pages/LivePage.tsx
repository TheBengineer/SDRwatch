import { useState, useEffect, useCallback, useRef } from 'react'
import type { LiveWindow } from '../types'

// ---------------------------------------------------------------------------
// Types matching the actual API shapes
// ---------------------------------------------------------------------------

interface ActiveJob {
  id: number | string
  label?: string
  status?: string
}

interface ActiveJobResponse {
  state: string
  job?: ActiveJob | null
}

interface LiveWindowsResponse {
  windows: LiveWindow[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTokenHeaders(): Record<string, string> {
  const token = localStorage.getItem('SDRWATCH_TOKEN') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LivePage() {
  // Job state
  const [jobState, setJobState] = useState<string>('idle')
  const [jobLabel, setJobLabel] = useState<string>('No active scan')
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)

  // Windows
  const [windows, setWindows] = useState<LiveWindow[]>([])
  const [updated, setUpdated] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Auth
  const authFailedRef = useRef(false)

  // -----------------------------------------------------------------------
  // Fetch active job
  // -----------------------------------------------------------------------

  const fetchActiveJob = useCallback(async () => {
    try {
      const token = localStorage.getItem('SDRWATCH_TOKEN') || ''
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const resp = await fetch('/api/jobs/active', { headers })

      if (resp.status === 401) {
        authFailedRef.current = true
        setError('Unauthorized: set SDRWATCH_TOKEN in localStorage to access /api endpoints.')
        setCurrentJobId(null)
        setJobState('idle')
        setJobLabel('No active scan')
        return
      }
      if (!resp.ok) throw new Error('state fetch failed')

      const data: ActiveJobResponse = await resp.json()
      authFailedRef.current = false
      setError(null)

      if (data.state === 'running' && data.job) {
        const id = String(data.job.id)
        setCurrentJobId(id)
        const label = data.job.label
          ? `${data.job.label} (#${data.job.id})`
          : `Job #${data.job.id}`
        setJobState('running')
        setJobLabel(label)
      } else {
        setCurrentJobId(null)
        setJobState('idle')
        setJobLabel('No active scan')
      }
    } catch (err) {
      console.error(err)
      setError('Unable to reach API: ' + (err instanceof Error ? err.message : String(err)))
      setCurrentJobId(null)
      setJobState('idle')
      setJobLabel('No active scan')
    }
  }, [])

  // -----------------------------------------------------------------------
  // Fetch windows
  // -----------------------------------------------------------------------

  const fetchWindows = useCallback(async () => {
    if (authFailedRef.current) return
    if (!currentJobId) {
      setWindows([])
      return
    }

    try {
      const params = new URLSearchParams({ limit: '100', job_id: currentJobId })
      const headers = getTokenHeaders()
      const resp = await fetch(`/api/live/windows?${params.toString()}`, { headers })

      if (resp.status === 401) {
        authFailedRef.current = true
        setError('Unauthorized: set SDRWATCH_TOKEN in localStorage to access /api endpoints.')
        return
      }
      if (!resp.ok) throw new Error('window fetch failed')

      const data: LiveWindowsResponse = await resp.json()
      const wins = Array.isArray(data.windows) ? data.windows : []
      setWindows(wins)
      setUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      console.error(err)
      setError('Unable to fetch windows: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [currentJobId])

  // -----------------------------------------------------------------------
  // Polling loop every 4s
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    const loop = async () => {
      await fetchActiveJob()
      if (cancelled) return
      await fetchWindows()
      if (cancelled) return
      setTimeout(loop, 4000)
    }

    loop()

    return () => { cancelled = true }
  }, [fetchActiveJob, fetchWindows])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isRunning = jobState === 'running'
  const stripWindows = windows.slice(-30)
  const counts = stripWindows.map(w => w.det_count ?? 0)
  const maxCount = Math.max(...counts, 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Live Windows</h1>
            <p className="text-sm text-slate-400">
              Tails the scanner log via /api/live/windows for quick observability.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`chip text-xs font-semibold ${
                isRunning
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-slate-500/20 text-slate-400'
              }`}
            >
              {isRunning ? 'Running' : 'Idle'}
            </span>
            <span className="text-sm text-slate-400">{jobLabel}</span>
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-2">
          Browser API calls reuse the optional SDRWATCH_TOKEN stored in localStorage.
        </div>
        {error && (
          <div className="text-xs text-red-300 mt-2">{error}</div>
        )}
      </div>

      {/* Windows table */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Recent windows</h2>
          <div className="text-xs text-slate-500">
            {updated ? `Updated ${updated}` : '—'}
          </div>
        </div>

        {!isRunning && (
          <div className="text-sm text-amber-300 mb-3">
            No active scan. Start a job to stream live windows.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="th">#</th>
                <th className="th">Freq (MHz)</th>
                <th className="th">Detections</th>
                <th className="th">Mean (dB)</th>
                <th className="th">P90 (dB)</th>
                <th className="th">Anomalous</th>
              </tr>
            </thead>
            <tbody>
              {windows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="td text-center text-slate-500 py-8">
                    No window data yet.
                  </td>
                </tr>
              ) : (
                windows.map((win, idx) => {
                  const order = windows.length - idx
                  return (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="td text-slate-400">{order}</td>
                      <td className="td font-mono">
                        {win.center_mhz != null ? win.center_mhz.toFixed(3) : '—'}
                      </td>
                      <td className="td">{win.det_count ?? 0}</td>
                      <td className="td">
                        {win.mean_db != null ? win.mean_db.toFixed(1) : '—'}
                      </td>
                      <td className="td">
                        {win.p90_db != null ? win.p90_db.toFixed(1) : '—'}
                      </td>
                      <td className="td">
                        <span
                          className={`chip text-xs ${
                            win.anomalous
                              ? 'bg-amber-400/80 text-slate-900'
                              : 'bg-emerald-400/70 text-slate-900'
                          }`}
                        >
                          {win.anomalous ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strip chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Strip chart</h2>
          <div className="text-xs text-slate-500">Height = det_count, color = anomaly</div>
        </div>
        <div className="flex items-end gap-1 min-h-[120px] overflow-x-auto">
          {stripWindows.length === 0 ? (
            <div className="text-sm text-slate-400 py-8">No data.</div>
          ) : (
            stripWindows.map((win, idx) => {
              const det = counts[idx]
              const height = Math.max(4, Math.round((det / maxCount) * 90))
              const color = win.anomalous ? '#f97316' : '#38bdf8'
              return (
                <div key={idx} className="flex flex-col items-center gap-1 min-w-[38px]">
                  <div className="text-[0.65rem] text-slate-400">{det}</div>
                  <div
                    className="w-5 rounded-sm"
                    style={{ height: `${height}px`, background: color }}
                  />
                  <div className="text-[0.6rem] text-slate-500">
                    {win.center_mhz != null ? win.center_mhz.toFixed(2) : '—'}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
