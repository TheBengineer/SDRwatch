import { useEffect, useState, useCallback, useMemo } from 'react'
import { Outlet, useSearchParams, useNavigate } from 'react-router-dom'
import NavBar from './NavBar'
import NoBaselineCTA from './NoBaselineCTA'
import { BaselineContext } from '../context/BaselineContext'
import StartHereCTA from './StartHereCTA'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import CheatSheet from './CheatSheet'
import { Button } from './primitives'

interface Baseline {
  id: number
  name: string
}

export default function AppLayout() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [baselineId, setBaselineId] = useState<number | undefined>(() => {
    const urlId = searchParams.get('baseline_id')
    return urlId ? Number(urlId) : undefined
  })
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [usbWarning, setUsbWarning] = useState(false)
  const [usbDismissed, setUsbDismissed] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const navigate = useNavigate()

  const focusFirstInput = useCallback(() => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])',
    )
    input?.focus()
  }, [])

  const triggerRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('app:refresh'))
  }, [])

  const closeAllOverlays = useCallback(() => {
    setShowCheatSheet(false)
    setShowOnboarding(false)
    setShowTokenInput(false)
    window.dispatchEvent(new CustomEvent('app:close-overlay'))
  }, [])

  const shortcuts = useMemo(() => ({
    '?': () => setShowCheatSheet(v => !v),
    's': focusFirstInput,
    'r': triggerRefresh,
    'Escape': closeAllOverlays,
    '1': () => navigate('/'),
    '2': () => navigate('/control'),
    '3': () => navigate('/signals'),
    '4': () => navigate('/recordings'),
  }), [focusFirstInput, triggerRefresh, closeAllOverlays, navigate])

  useKeyboardShortcuts(shortcuts)

  // Poll USB device availability
  useEffect(() => {
    let cancelled = false
    async function checkDevices() {
      try {
        const r = await fetch('/ctl/devices')
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          setUsbWarning(Array.isArray(data) && data.length === 0)
        }
      } catch {
        if (!cancelled) setUsbWarning(true)
      }
    }
    checkDevices()
    const id = setInterval(checkDevices, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Fetch baselines on mount
  const refetchBaselines = useCallback(() => {
    fetch('/api/baselines')
      .then(r => r.json())
      .then(data => {
        const list: Baseline[] = data.baselines ?? []
        setBaselines(list)
      })
      .catch(() => {
        // API unavailable — leave baselines empty
      })
      .finally(() => setFetched(true))
  }, [])

  useEffect(() => {
    refetchBaselines()
  }, [refetchBaselines])

  // After baselines load, ensure baselineId is valid; fallback to first baseline
  useEffect(() => {
    if (baselines.length === 0) return

    const urlId = searchParams.get('baseline_id')
    if (urlId) {
      const parsed = Number(urlId)
      if (!Number.isNaN(parsed) && baselines.some(b => b.id === parsed)) {
        setBaselineId(parsed)
        return
      }
    }
    // Fallback to first baseline when none is selected
    const firstId = baselines[0].id
    setBaselineId(firstId)
    setSearchParams(prev => {
      prev.set('baseline_id', String(firstId))
      return prev
    }, { replace: true })
  }, [baselines, searchParams, setSearchParams])

  // Sync baselineId when URL changes (manual edits, back/forward)
  useEffect(() => {
    const urlId = searchParams.get('baseline_id')
    if (!urlId) return
    const parsed = Number(urlId)
    if (!Number.isNaN(parsed) && baselines.some(b => b.id === parsed) && parsed !== baselineId) {
      setBaselineId(parsed)
    }
  }, [searchParams, baselines, baselineId])

  const handleBaselineChange = useCallback((id: number) => {
    setBaselineId(id)
    setSearchParams(prev => {
      prev.set('baseline_id', String(id))
      return prev
    })
  }, [setSearchParams])

  const contextValue = useMemo(() => ({
    baselineId,
    setBaselineId: handleBaselineChange,
    baselines,
  }), [baselineId, handleBaselineChange, baselines])

  const existingToken = localStorage.getItem('SDRWATCH_TOKEN')

  const handleSaveToken = () => {
    localStorage.setItem('SDRWATCH_TOKEN', tokenInput)
    setTokenInput('')
    setShowTokenInput(false)
  }

  const handleClearToken = () => {
    localStorage.removeItem('SDRWATCH_TOKEN')
    setShowTokenInput(false)
  }

  return (
    <BaselineContext.Provider value={contextValue}>
      <div className="dark min-h-screen" style={{background:'var(--bg-page)', color:'var(--text-primary)'}}>
        <header className="sticky top-0 z-10 backdrop-blur" style={{background:'var(--bg-header)', borderBottom:'1px solid var(--bg-header-border)'}}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <div className="text-xl font-semibold">📡 SDRwatch</div>
            <NavBar />
            <div className="ml-auto flex items-center gap-3">
              {/* Keyboard shortcuts cheat sheet */}
              <button
                onClick={() => setShowCheatSheet(v => !v)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
                style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}
                aria-label="Show keyboard shortcuts"
                title="Keyboard shortcuts (?)"
              >
                ?
              </button>

              {/* Baseline Selector */}
              <select
                value={baselineId ?? ''}
                onChange={e => handleBaselineChange(Number(e.target.value))}
                className="input text-sm appearance-none cursor-pointer"
                disabled={baselines.length === 0}
              >
                {baselines.length === 0 && <option value="">Loading...</option>}
                {baselines.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              {/* Auth Status */}
              <div className="relative">
                {existingToken ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg" title="Token configured">🔑</span>
                    <button
                      onClick={() => { setShowTokenInput(v => !v); setTokenInput(existingToken) }}
                      className="text-xs text-slate-400 hover:text-sky-400 underline focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTokenInput(v => !v)}
                    className="text-xs text-slate-400 hover:text-sky-400 underline focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    Set Token
                  </button>
                )}
                {showTokenInput && (
                  <div className="absolute right-0 top-full mt-2 rounded-xl p-3 shadow-xl z-20 w-72" style={{background:'var(--bg-elevated)', border:'1px solid var(--border)'}}>
                    <input
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      placeholder="SDRWATCH_TOKEN"
                      className="input w-full text-sm mb-2"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveToken}
                        variant="primary"
                        size="sm"
                      >
                        Save
                      </Button>
                      {existingToken && (
                        <Button
                          onClick={handleClearToken}
                          variant="danger"
                          size="sm"
                        >
                          Clear
                        </Button>
                      )}
                      <Button
                        onClick={() => setShowTokenInput(false)}
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {/* USB warning banner */}
        {usbWarning && !usbDismissed && (
          <div className="bg-red-600/80 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-3">
            <span>⚠️ No SDR device detected. Connect the USB radio and refresh.</span>
            <button
              onClick={() => setUsbDismissed(true)}
              className="text-white/70 hover:text-white underline text-xs focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Dismiss
            </button>
          </div>
        )}
        <main className="max-w-7xl mx-auto px-4 py-6">
          {fetched && baselines.length === 0 ? (
            <NoBaselineCTA onBaselineCreated={refetchBaselines} />
          ) : (
            <Outlet />
          )}
        </main>

        <StartHereCTA isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
        <CheatSheet isOpen={showCheatSheet} onClose={() => setShowCheatSheet(false)} />
      </div>
    </BaselineContext.Provider>
  )
}
