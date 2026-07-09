// allow: SIZE_OK — Page component with 4 independent panels (Health, DB Stats, Config, Errors)
// sharing data-fetch lifecycle. Splitting would introduce artificial fragmentation.
import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthData {
  status: string
  db: string
  controller: string
  wal_size_bytes: number | null
}

interface TableRowCounts {
  [table: string]: number | null
}

interface RecentScan {
  id: number
  baseline_id: number
  timestamp_utc: string
  num_hits: number
  num_segments: number
  num_new_signals: number
  duration_ms?: number
}

interface DbStatsData {
  tables: TableRowCounts
  recent_scans: RecentScan[]
}

interface ConfigData {
  env: Record<string, string>
  constants: Record<string, string | number>
  db_path?: string
}

interface ErrorEntry {
  ts: string
  path: string
  method: string
  error: string
  type: string
  traceback: string
}

interface ErrorsData {
  errors: ErrorEntry[]
  total_captured: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const token = localStorage.getItem('SDRWATCH_TOKEN') || ''
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function statusBadge(status: string) {
  const cls =
    status === 'ok'
      ? 'bg-green-600 text-green-100'
      : status === 'degraded'
        ? 'bg-amber-500 text-amber-950'
        : 'bg-red-600 text-red-100'
  return <span className={`chip text-xs font-semibold ${cls}`}>{status.toUpperCase()}</span>
}

// ---------------------------------------------------------------------------
// Collapsible panel component
// ---------------------------------------------------------------------------

function Panel({
  title, defaultOpen, children, loading,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  loading?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? true)

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <span className={`text-xs text-slate-500 transition-transform ${open ? '' : 'rotate-[-90deg]'}`}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white/[0.02] border-t border-white/10">
          {loading ? (
            <div className="text-sm text-slate-400">Loading...</div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DebugPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [dbStats, setDbStats] = useState<DbStatsData | null>(null)
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [errors, setErrors] = useState<ErrorsData | null>(null)
  const [loading, setLoading] = useState(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -----------------------------------------------------------------------
  // Fetch all
  // -----------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    const [h, d, c, e] = await Promise.all([
      fetchJson<HealthData>('/api/debug/health'),
      fetchJson<DbStatsData>('/api/debug/db-stats'),
      fetchJson<ConfigData>('/api/debug/config'),
      fetchJson<ErrorsData>('/api/debug/errors?limit=20'),
    ])
    if (h) setHealth(h)
    if (d) setDbStats(d)
    if (c) setConfig(c)
    if (e) setErrors(e)
    setLoading(false)
  }, [])

  // -----------------------------------------------------------------------
  // Initial fetch + poll every 10s
  // -----------------------------------------------------------------------

  useEffect(() => {
    setLoading(true)
    fetchAll()

    pollingRef.current = setInterval(fetchAll, 10_000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [fetchAll])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Debug Panel</h1>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchAll() }}
          className="btn text-xs"
        >
          ↻ Refresh All
        </button>
      </div>

      {/* Health */}
      <Panel title="Health" loading={loading && !health}>
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">Status</div>
              <div>{statusBadge(health.status)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Database</div>
              <div className="text-sm text-cyan-400">{health.db}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Controller</div>
              <div className="text-sm text-cyan-400">{health.controller}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">WAL Size</div>
              <div className="text-sm text-cyan-400">
                {health.wal_size_bytes != null
                  ? (health.wal_size_bytes / 1024).toFixed(1) + ' KB'
                  : 'N/A'}
              </div>
            </div>
          </div>
        )}
        {!loading && !health && (
          <div className="text-sm text-red-400">Failed to load health data.</div>
        )}
      </Panel>

      {/* DB Stats */}
      <Panel title="Database Statistics" loading={loading && !dbStats}>
        {dbStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Table row counts */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Table Row Counts
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs">
                    <th className="px-2 py-1 text-left">Table</th>
                    <th className="px-2 py-1 text-right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dbStats.tables).map(([name, count]) => (
                    <tr key={name} className="border-b border-white/5">
                      <td className="px-2 py-1 text-slate-300">{name}</td>
                      <td className="px-2 py-1 text-right font-mono text-sm">
                        {count != null ? count.toLocaleString() : <span className="text-slate-500 italic">N/A</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent scans */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Recent Scans (last 10)
              </h3>

              {/* Sparkline for scan durations */}
              {dbStats.recent_scans.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-slate-500 mb-1">Sweep duration (ms)</div>
                  <div className="flex items-end gap-[2px] h-[30px]">
                    {dbStats.recent_scans
                      .filter(s => s.duration_ms != null)
                      .slice(0, 20)
                      .map((s, i) => {
                        const durations = dbStats.recent_scans
                          .filter(x => x.duration_ms != null)
                          .map(x => x.duration_ms!)
                        const maxDur = Math.max(...durations, 1)
                        const h = Math.max(2, (s.duration_ms! / maxDur) * 30)
                        return (
                          <div
                            key={i}
                            className="w-[6px] rounded-sm bg-sky-500"
                            style={{ height: `${h}px` }}
                            title={`${s.duration_ms!.toFixed(0)} ms`}
                          />
                        )
                      })}
                  </div>
                </div>
              )}

              {dbStats.recent_scans.length === 0 ? (
                <div className="text-sm text-slate-500 italic">No recent scans</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-1 py-1 text-left">ID</th>
                        <th className="px-1 py-1 text-left">Baseline</th>
                        <th className="px-1 py-1 text-left">Hits</th>
                        <th className="px-1 py-1 text-left">Segs</th>
                        <th className="px-1 py-1 text-left">New</th>
                        <th className="px-1 py-1 text-left">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbStats.recent_scans.slice(0, 10).map(s => (
                        <tr key={s.id} className="border-b border-white/5">
                          <td className="px-1 py-1 font-mono">{s.id}</td>
                          <td className="px-1 py-1">{s.baseline_id}</td>
                          <td className="px-1 py-1">{s.num_hits}</td>
                          <td className="px-1 py-1">{s.num_segments}</td>
                          <td className="px-1 py-1">{s.num_new_signals}</td>
                          <td className="px-1 py-1 text-slate-400">
                            {s.duration_ms != null ? `${s.duration_ms.toFixed(0)} ms` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        {!loading && !dbStats && (
          <div className="text-sm text-red-400">Failed to load DB stats.</div>
        )}
      </Panel>

      {/* Config */}
      <Panel title="Configuration" loading={loading && !config}>
        {config && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Environment variables */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Environment Variables
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(config.env).map(([k, v]) => (
                    <tr key={k} className="border-b border-white/5">
                      <td className="px-2 py-1 text-slate-300 font-mono text-xs">{k}</td>
                      <td className="px-2 py-1 text-cyan-400 font-mono text-xs break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Runtime constants */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Runtime Constants
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(config.constants).map(([k, v]) => (
                    <tr key={k} className="border-b border-white/5">
                      <td className="px-2 py-1 text-slate-300 font-mono text-xs">{k}</td>
                      <td className="px-2 py-1 text-cyan-400 font-mono text-xs">
                        {typeof v === 'number' ? v.toLocaleString() : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {config?.db_path && (
          <div className="mt-3 text-xs text-slate-500">
            Database path: <span className="text-cyan-400 font-mono">{config.db_path}</span>
          </div>
        )}
        {!loading && !config && (
          <div className="text-sm text-red-400">Failed to load config.</div>
        )}
      </Panel>

      {/* Errors */}
      <Panel title="Recent Errors" loading={loading && !errors}>
        {errors ? (
          errors.errors.length === 0 ? (
            <div className="text-sm text-slate-500 italic">No errors captured. That's good!</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Showing {errors.errors.length} of {errors.total_captured} captured errors
              </div>
              {errors.errors.map((e, i) => (
                <div
                  key={i}
                  className="border border-red-500/30 rounded-lg p-3 bg-red-500/10 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-red-300 font-semibold text-sm">
                      {e.type}: {e.method} {e.path}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">{e.ts}</span>
                  </div>
                  <div className="text-sm text-slate-100">{e.error}</div>
                  <details>
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      Show traceback
                    </summary>
                    <pre className="mt-2 text-xs text-slate-400 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto bg-black/30 p-2 rounded">
                      {e.traceback}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )
        ) : loading ? null : (
          <div className="text-sm text-red-400">Failed to load errors.</div>
        )}
      </Panel>
    </div>
  )
}
