import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpectrumData, Signal, Recording } from '../types'
import type { UseZoomPanReturn, ZoomState } from '../hooks/useZoomPan'

interface Props {
  data: SpectrumData
  signals?: Signal[]
  recordings?: Recording[]
  zoomPan: UseZoomPanReturn
  width: number
  height?: number
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  friendly: '#22c55e',
  ambient: '#94a3b8',
  hostile: '#ef4444',
  unknown: '#3b82f6',
}

function formatFreq(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)} kHz`
  return `${hz.toFixed(0)} Hz`
}

function formatPower(db: number): string {
  return `${db.toFixed(0)} dBm`
}

/** Pick a "nice" grid step that yields ~target lines across the range. */
function niceStep(range: number, target = 8): number {
  const raw = range / target
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / magnitude
  if (norm <= 1) return magnitude
  if (norm <= 2) return 2 * magnitude
  if (norm <= 5) return 5 * magnitude
  return 10 * magnitude
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  props: Props,
  zoom: ZoomState,
): void {
  const { data, signals, recordings, width, height = 400 } = props
  const pad = { top: 20, right: 20, bottom: 40, left: 60 }
  const pw = width - pad.left - pad.right
  const ph = height - pad.top - pad.bottom
  if (pw <= 0 || ph <= 0) return

  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, width, height)

  const freqStart = zoom.centerHz - zoom.spanHz / 2
  const freqEnd = zoom.centerHz + zoom.spanHz / 2

  // ── 1. Spectrum layer (natural Hz/dB coords) ─────────────────────
  ctx.save()
  ctx.beginPath()
  ctx.rect(pad.left, pad.top, pw, ph)
  ctx.clip()

  // Transform: CSS-pixel (dpr-scaled) space → frequency/power space
  const scaleX = pw / zoom.spanHz
  const scaleY = -ph / (zoom.maxDb - zoom.minDb)
  ctx.setTransform(
    scaleX, 0, 0, scaleY,
    -zoom.centerHz * scaleX + pw / 2 + pad.left,
    height - pad.bottom,
  )

  // Frequency grid lines
  {
    const step = niceStep(zoom.spanHz)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let f = Math.floor(freqStart / step) * step; f <= freqEnd; f += step) {
      ctx.beginPath()
      ctx.moveTo(f, zoom.minDb)
      ctx.lineTo(f, zoom.maxDb)
      ctx.stroke()
    }
  }
  // Power grid lines
  {
    const step = niceStep(zoom.maxDb - zoom.minDb, 5)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let db = Math.ceil(zoom.minDb / step) * step; db <= zoom.maxDb; db += step) {
      ctx.beginPath()
      ctx.moveTo(freqStart, db)
      ctx.lineTo(freqEnd, db)
      ctx.stroke()
    }
  }

  // Spectrum fill under trace
  if (data.freqs.length > 0 && data.power_db.length > 0) {
    const len = Math.min(data.freqs.length, data.power_db.length)
    ctx.beginPath()
    ctx.moveTo(data.freqs[0], zoom.minDb)
    for (let i = 0; i < len; i++) ctx.lineTo(data.freqs[i], data.power_db[i])
    ctx.lineTo(data.freqs[len - 1], zoom.minDb)
    ctx.closePath()
    ctx.fillStyle = 'rgba(14, 165, 233, 0.15)'
    ctx.fill()

    // Spectrum trace line
    ctx.beginPath()
    for (let i = 0; i < len; i++) {
      if (i === 0) ctx.moveTo(data.freqs[i], data.power_db[i])
      else ctx.lineTo(data.freqs[i], data.power_db[i])
    }
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Noise floor (dashed)
  if (data.freqs.length > 0 && data.noise_db.length > 0) {
    const len = Math.min(data.freqs.length, data.noise_db.length)
    ctx.beginPath()
    for (let i = 0; i < len; i++) {
      if (i === 0) ctx.moveTo(data.freqs[i], data.noise_db[i])
      else ctx.lineTo(data.freqs[i], data.noise_db[i])
    }
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()

  // ── 2. Markers (CSS-pixel space) ─────────────────────────────────
  const freqToX = (f: number) => ((f - freqStart) / zoom.spanHz) * pw + pad.left

  // Signal markers (colored vertical lines)
  if (signals) {
    for (const sig of signals) {
      const x = freqToX(sig.f_center_hz)
      if (x < pad.left || x > width - pad.right) continue
      ctx.strokeStyle = CLASSIFICATION_COLORS[sig.classification] ?? '#3b82f6'
      ctx.lineWidth = 2
      ctx.globalAlpha = sig.selected ? 1 : 0.5
      ctx.beginPath()
      ctx.moveTo(x, pad.top)
      ctx.lineTo(x, height - pad.bottom)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // Recording markers (dashed vertical orange)
  if (recordings) {
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    for (const rec of recordings) {
      const x = freqToX(rec.f_center_hz)
      if (x < pad.left || x > width - pad.right) continue
      ctx.beginPath()
      ctx.moveTo(x, pad.top)
      ctx.lineTo(x, height - pad.bottom)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // ── 3. Axis labels (CSS-pixel space) ─────────────────────────────
  const fontFamily = '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.font = `11px ${fontFamily}`

  // X-axis frequency labels
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  {
    const step = niceStep(zoom.spanHz)
    for (let f = Math.floor(freqStart / step) * step; f <= freqEnd; f += step) {
      const x = freqToX(f)
      if (x < pad.left || x > width - pad.right) continue
      ctx.fillText(formatFreq(f), x, height - pad.bottom + 8)
    }
  }
  // Y-axis power labels
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  {
    const step = niceStep(zoom.maxDb - zoom.minDb, 5)
    const invRange = 1 / (zoom.maxDb - zoom.minDb)
    for (let db = Math.ceil(zoom.minDb / step) * step; db <= zoom.maxDb; db += step) {
      const y = (1 - (db - zoom.minDb) * invRange) * ph + pad.top
      if (y < pad.top - 2 || y > height - pad.bottom + 2) continue
      ctx.fillText(formatPower(db), pad.left - 8, y)
    }
  }

  // Y-axis title ("dBm" rotated)
  ctx.save()
  ctx.translate(14, pad.top + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#64748b'
  ctx.font = `11px ${fontFamily}`
  ctx.fillText('dBm', 0, 0)
  ctx.restore()
}

const CLICK_TOLERANCE_PX = 8

export default function SpectrumCanvas(props: Props) {
  const { data, zoomPan, width, height = 400 } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  const zoomPanRef = useRef(zoomPan)
  const [tick, setTick] = useState(0)
  const [hoveredSignal, setHoveredSignal] = useState<Signal | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  propsRef.current = props
  zoomPanRef.current = zoomPan

  // Auto-scale Y on data changes
  useEffect(() => {
    if (data.power_db.length > 0) {
      zoomPanRef.current.autoScaleY(data.power_db)
      setTick((t) => t + 1)
    }
  }, [data.power_db])

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const raf = requestAnimationFrame(() => {
      ctx.save()
      ctx.scale(dpr, dpr)
      drawFrame(ctx, propsRef.current, zoomPanRef.current.zoom)
      ctx.restore()
    })
    return () => cancelAnimationFrame(raf)
  }, [data, width, height, tick])

  // Find signal nearest to mouse position
  const findSignal = useCallback((clientX: number): Signal | null => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const mx = clientX - rect.left
    const zoom = zoomPanRef.current.zoom
    const pad = { left: 60, right: 20, top: 20, bottom: 40 }
    const pw = width - pad.left - pad.right
    const freqStart = zoom.centerHz - zoom.spanHz / 2
    const signals = propsRef.current.signals
    if (!signals) return null

    for (const sig of signals) {
      const sx = ((sig.f_center_hz - freqStart) / zoom.spanHz) * pw + pad.left
      if (Math.abs(sx - mx) < CLICK_TOLERANCE_PX) {
        return sig
      }
    }
    return null
  }, [width])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    zoomPanRef.current.onWheel(e, c.getBoundingClientRect())
    setTick((t) => t + 1)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    zoomPanRef.current.onMouseDown(e, c.getBoundingClientRect())
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    zoomPanRef.current.onMouseMove(e, c.getBoundingClientRect())
    setTick((t) => t + 1)

    // Hover detection for signal markers
    if (!zoomPanRef.current.zoom) return
    const sig = findSignal(e.clientX)
    setHoveredSignal(sig)
    if (sig) {
      const rect = c.getBoundingClientRect()
      setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 })
    } else {
      setTooltipPos(null)
    }
  }, [findSignal])

  const handleMouseUp = useCallback(() => zoomPanRef.current.onMouseUp(), [])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    zoomPanRef.current.onDoubleClick(e, c.getBoundingClientRect())
    setTick((t) => t + 1)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const sig = findSignal(e.clientX)
    if (sig) {
      window.location.href = `/signal/${sig.id}`
    }
  }, [findSignal])

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: hoveredSignal ? 'pointer' : 'crosshair', width, height }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
      />
      {hoveredSignal && tooltipPos && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            color: '#e2e8f0',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600, color: CLASSIFICATION_COLORS[hoveredSignal.classification] ?? '#3b82f6' }}>
            {hoveredSignal.signal_id || `#${hoveredSignal.id}`}
            {' — '}
            {(hoveredSignal.f_center_hz / 1e6).toFixed(4)} MHz
          </div>
          <div style={{ color: '#94a3b8' }}>
            {hoveredSignal.classification}
            {hoveredSignal.label ? ` · ${hoveredSignal.label}` : ''}
            {hoveredSignal.snr_db != null ? ` · SNR ${hoveredSignal.snr_db.toFixed(1)} dB` : ''}
          </div>
          <div style={{ color: '#64748b', fontSize: 10 }}>Click to view details</div>
        </div>
      )}
    </div>
  )
}
