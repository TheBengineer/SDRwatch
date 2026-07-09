import { useCallback, useRef } from 'react'

export interface ZoomState {
  centerHz: number
  spanHz: number
  minDb: number
  maxDb: number
}

export interface UseZoomPanReturn {
  zoom: ZoomState
  isReady: boolean
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>, canvasRect: DOMRect) => void
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>, canvasRect: DOMRect) => void
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>, canvasRect: DOMRect) => void
  onMouseUp: () => void
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>, canvasRect: DOMRect) => void
  resetView: (freqMinHz?: number, freqMaxHz?: number) => void
  xScale: (freqHz: number, canvasWidth: number) => number
  yScale: (powerDb: number, canvasHeight: number) => number
  pixelToFreq: (px: number, canvasWidth: number) => number
  autoScaleY: (powerData: number[]) => void
  forceRender: () => void
  renderVersion: number
}

export function useZoomPan(initialMinDb = -120, initialMaxDb = -20): UseZoomPanReturn {
  const zoomRef = useRef<ZoomState>({
    centerHz: 0,
    spanHz: 1,
    minDb: initialMinDb,
    maxDb: initialMaxDb,
  })
  const isReadyRef = useRef(false)
  const renderRef = useRef(0)
  const dragRef = useRef<{ startX: number; startCenter: number; isDragging: boolean }>({
    startX: 0,
    startCenter: 0,
    isDragging: false,
  })
  const autoScaleYRef = useRef(true)

  const forceRender = useCallback(() => {
    renderRef.current++
  }, [])

  const xScale = useCallback((freqHz: number, canvasWidth: number): number => {
    const z = zoomRef.current
    return ((freqHz - (z.centerHz - z.spanHz / 2)) / z.spanHz) * canvasWidth
  }, [])

  const yScale = useCallback((powerDb: number, canvasHeight: number): number => {
    const z = zoomRef.current
    return (1 - (powerDb - z.minDb) / (z.maxDb - z.minDb)) * canvasHeight
  }, [])

  const pixelToFreq = useCallback((px: number, canvasWidth: number): number => {
    const z = zoomRef.current
    return z.centerHz - z.spanHz / 2 + (px / canvasWidth) * z.spanHz
  }, [])

  const autoScaleY = useCallback((powerData: number[]) => {
    if (!powerData.length || !autoScaleYRef.current) return
    const sorted = [...powerData].sort((a, b) => a - b)
    const p1 = sorted[Math.floor(sorted.length * 0.01)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    const margin = Math.max((p99 - p1) * 0.1, 3)
    zoomRef.current.minDb = p1 - margin
    zoomRef.current.maxDb = p99 + margin
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>, canvasRect: DOMRect) => {
      e.preventDefault()
      const z = zoomRef.current
      const scale = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const mx = e.clientX - canvasRect.left
      const freqAtMouse = pixelToFreq(mx, canvasRect.width)
      const newSpan = Math.max(z.spanHz * scale, 1000)
      z.centerHz = freqAtMouse - (mx / canvasRect.width - 0.5) * newSpan
      z.spanHz = newSpan
      renderRef.current++
    },
    [pixelToFreq],
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, _canvasRect: DOMRect) => {
      dragRef.current = {
        startX: e.clientX,
        startCenter: zoomRef.current.centerHz,
        isDragging: true,
      }
    },
    [],
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, canvasRect: DOMRect) => {
      if (!dragRef.current.isDragging) return
      const dx =
        ((e.clientX - dragRef.current.startX) / canvasRect.width) *
        zoomRef.current.spanHz
      zoomRef.current.centerHz = dragRef.current.startCenter - dx
      renderRef.current++
    },
    [],
  )

  const onMouseUp = useCallback(() => {
    dragRef.current.isDragging = false
  }, [])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, canvasRect: DOMRect) => {
      const mx = e.clientX - canvasRect.left
      const freq = pixelToFreq(mx, canvasRect.width)
      zoomRef.current.centerHz = freq
      zoomRef.current.spanHz = Math.max(zoomRef.current.spanHz * 0.25, 1000)
      renderRef.current++
    },
    [pixelToFreq],
  )

  const resetView = useCallback((freqMinHz?: number, freqMaxHz?: number) => {
    if (freqMinHz !== undefined && freqMaxHz !== undefined) {
      zoomRef.current.centerHz = (freqMinHz + freqMaxHz) / 2
      zoomRef.current.spanHz = freqMaxHz - freqMinHz
    }
    isReadyRef.current = true
    renderRef.current++
  }, [])

  return {
    zoom: zoomRef.current,
    isReady: isReadyRef.current,
    onWheel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
    resetView,
    xScale,
    yScale,
    pixelToFreq,
    autoScaleY,
    forceRender,
    renderVersion: renderRef.current,
  }
}
