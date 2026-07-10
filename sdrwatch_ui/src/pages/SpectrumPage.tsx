import { useEffect, useRef, useState } from 'react'
import { useBaseline } from '../context/BaselineContext'
import SpectrumCanvas from '../components/SpectrumCanvas'
import { fetchSpectrum } from '../api/client'
import { apiGet } from '../api/client'
import { useZoomPan } from '../hooks/useZoomPan'
import type { SpectrumData, Signal, Recording } from '../types'

export default function SpectrumPage() {
  const { baselineId } = useBaseline()
  const [data, setData] = useState<SpectrumData | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomPan = useZoomPan()

  // Resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fetch spectrum data
  useEffect(() => {
    if (!baselineId) return
    const id = setInterval(async () => {
      try {
        const d = await fetchSpectrum(baselineId, undefined, undefined, 1000)
        setData(d)
        setError(null)
        setLoading(false)
        zoomPan.autoScaleY(d.power_db)
        if (!zoomPan.isReady && d.freqs.length > 1) {
          zoomPan.resetView(d.freqs[0], d.freqs[d.freqs.length - 1])
        }
      } catch {
        setError('Failed to load spectrum data')
        setLoading(false)
      }
    }, 5000)
    return () => clearInterval(id)
  }, [baselineId, zoomPan])

  // Fetch signals
  useEffect(() => {
    if (!baselineId) return
    const id = setInterval(async () => {
      try {
        setSignals(await apiGet<Signal[]>('/api/signals', { baseline_id: baselineId }))
      } catch {
        console.error('Failed to fetch signals')
      }
    }, 5000)
    return () => clearInterval(id)
  }, [baselineId])

  // Fetch recordings
  useEffect(() => {
    if (!baselineId) return
    const id = setInterval(async () => {
      try {
        const params: Record<string, string | number> = { baseline_id: baselineId }
        const resp = await apiGet<{ recordings: Recording[] }>('/api/recordings', params)
        setRecordings(resp.recordings || [])
      } catch {
        console.error('Failed to fetch recordings')
      }
    }, 5000)
    return () => clearInterval(id)
  }, [baselineId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Spectrum</h1>
        <button className="btn text-sm" onClick={() => {
          if (data?.freqs?.length) zoomPan.resetView(data.freqs[0], data.freqs[data.freqs.length - 1])
        }}>↺ Reset view</button>
      </div>

      {loading && <div className="card text-center text-slate-500 py-8">Loading spectrum data...</div>}
      {error && <div className="bg-red-600/60 text-white text-sm rounded-xl p-4">{error}</div>}
      {!loading && !error && data && (
        <div ref={containerRef} className="card p-0 overflow-hidden">
          <SpectrumCanvas
            data={data}
            signals={signals}
            recordings={recordings}
            zoomPan={zoomPan}
            width={width}
            height={400}
          />
        </div>
      )}
    </div>
  )
}
