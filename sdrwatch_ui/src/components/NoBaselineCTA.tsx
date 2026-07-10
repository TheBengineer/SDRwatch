import { useState, type FormEvent } from 'react'

interface Props {
  onBaselineCreated: () => void
}

export default function NoBaselineCTA({ onBaselineCreated }: Props) {
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = { name: name.trim() }
    const latNum = lat ? parseFloat(lat) : undefined
    const lonNum = lon ? parseFloat(lon) : undefined
    if (latNum !== undefined && !Number.isNaN(latNum)) body.location_lat = latNum
    if (lonNum !== undefined && !Number.isNaN(lonNum)) body.location_lon = lonNum

    try {
      const r = await fetch('/api/baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(text || `Server returned ${r.status}`)
      }
      setSuccess(true)
      // Reload page after a brief moment so the user sees success state
      setTimeout(() => onBaselineCreated(), 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create baseline')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 'calc(100vh - 120px)' }}
    >
      <div className="card max-w-lg w-full mx-4 text-center">
        {/* Icon */}
        <div className="text-5xl mb-4">📡</div>

        <h2 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          No Baseline Configured
        </h2>

        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          A baseline is your spectrum reference. SDRWatch compares new sweeps
          against it to detect changes in the RF environment.
        </p>

        {success ? (
          <div className="py-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Baseline created!
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Loading your dashboard…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="text-left">
            <div className="field mb-4">
              <label htmlFor="cta-name">Baseline Name *</label>
              <input
                id="cta-name"
                type="text"
                className="input w-full"
                placeholder="e.g. Roof Discone"
                value={name}
                onChange={e => { setName(e.target.value); setError(null) }}
                disabled={submitting}
                autoFocus
                required
              />
            </div>

            <div className="subgrid mb-4">
              <div className="field">
                <label htmlFor="cta-lat">Latitude</label>
                <input
                  id="cta-lat"
                  type="number"
                  step="any"
                  className="input w-full"
                  placeholder="e.g. 37.7749"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label htmlFor="cta-lon">Longitude</label>
                <input
                  id="cta-lon"
                  type="number"
                  step="any"
                  className="input w-full"
                  placeholder="e.g. -122.4194"
                  value={lon}
                  onChange={e => setLon(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {error && (
              <div
                className="text-sm rounded-xl px-3 py-2 mb-4"
                style={{ background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn w-full justify-center"
              disabled={submitting || !name.trim()}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-transparent border-t-white animate-spin" />
                  Creating…
                </span>
              ) : (
                'Create Baseline'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
