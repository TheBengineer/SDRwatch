import { useState, useEffect } from 'react'
import { EmptyState } from '../components/primitives'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpurEntry {
  bin_hz: number
  mean_power_db: number | null
  hits: number
  last_seen_utc: string | null
}

interface SpurMapResponse {
  spur_entries: SpurEntry[]
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SpurMapPage() {
  const [entries, setEntries] = useState<SpurEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchJson<SpurMapResponse>('/api/spur-map')
        if (cancelled) return
        if (data && Array.isArray(data.spur_entries)) {
          setEntries(data.spur_entries)
        } else {
          setEntries([])
          setError('Failed to load spur map data')
        }
      } catch {
        if (!cancelled) {
          setEntries([])
          setError('Failed to load spur map data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" title="Known SDR self-interference frequencies to exclude from detection.">Spur Map</h1>
            <p className="text-sm text-slate-400">Read-only view of stored spur bins</p>
          </div>
          {!loading && (
            <span className="text-xs text-slate-400">
              {entries.length} spur{entries.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-400 border border-red-500/25 rounded-xl p-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-400 py-4">Loading spur map data...</div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No spur map data"
            description="Run a spur calibration sweep from the Control panel to identify and suppress SDR artifacts."
            action={{ label: 'Go to Control', to: '/control' }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="th">Frequency (MHz)</th>
                  <th className="th">bin_hz</th>
                  <th className="th">Mean Power (dB)</th>
                  <th className="th">Hits</th>
                  <th className="th">Last Seen (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="td font-mono">
                      {(row.bin_hz / 1e6).toFixed(6)}
                    </td>
                    <td className="td font-mono text-xs">{row.bin_hz}</td>
                    <td className="td">
                      {row.mean_power_db != null ? row.mean_power_db.toFixed(1) : '—'}
                    </td>
                    <td className="td">{row.hits}</td>
                    <td className="td text-xs text-slate-400">
                      {row.last_seen_utc
                        ? row.last_seen_utc.slice(0, 19).replace('T', ' ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
