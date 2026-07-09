import { useEffect, useState, useCallback, useMemo } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import NavBar from './NavBar'
import { BaselineContext } from '../context/BaselineContext'

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

  // Fetch baselines on mount
  useEffect(() => {
    fetch('/api/baselines')
      .then(r => r.json())
      .then(data => {
        const list: Baseline[] = data.baselines ?? []
        setBaselines(list)
      })
      .catch(() => {
        // API unavailable — leave baselines empty
      })
  }, [])

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
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/70 border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <div className="text-xl font-semibold">📡 SDRwatch</div>
            <NavBar />
            <div className="ml-auto flex items-center gap-3">
              {/* Baseline Selector */}
              <select
                value={baselineId ?? ''}
                onChange={e => handleBaselineChange(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl border border-white/18 bg-white/8 text-slate-100 font-medium text-sm appearance-none cursor-pointer"
                disabled={baselines.length === 0}
              >
                {baselines.length === 0 && <option value="">Loading...</option>}
                {baselines.map(b => (
                  <option key={b.id} value={b.id} className="bg-slate-800 text-slate-100">
                    {b.name}
                  </option>
                ))}
              </select>

              {/* Auth Status */}
              <div className="relative">
                {existingToken ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg" title="Token configured">🔑</span>
                    <button
                      onClick={() => { setShowTokenInput(v => !v); setTokenInput(existingToken) }}
                      className="text-xs text-slate-400 hover:text-sky-400 underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTokenInput(v => !v)}
                    className="text-xs text-slate-400 hover:text-sky-400 underline"
                  >
                    Set Token
                  </button>
                )}
                {showTokenInput && (
                  <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-white/10 rounded-xl p-3 shadow-xl z-20 w-72">
                    <input
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      placeholder="SDRWATCH_TOKEN"
                      className="w-full px-3 py-1.5 rounded-lg border border-white/18 bg-slate-900 text-slate-100 text-sm mb-2"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveToken}
                        className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs"
                      >
                        Save
                      </button>
                      {existingToken && (
                        <button
                          onClick={handleClearToken}
                          className="px-3 py-1 rounded-lg bg-red-600/60 hover:bg-red-500 text-white text-xs"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => setShowTokenInput(false)}
                        className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs ml-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </main>
      </div>
    </BaselineContext.Provider>
  )
}
