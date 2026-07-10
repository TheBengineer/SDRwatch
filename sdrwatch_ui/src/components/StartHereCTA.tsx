import { useState, useEffect, useCallback } from 'react'

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: 'step-1', label: 'Connect SDR', description: 'Plug in your RTL-SDR or compatible device' },
  { key: 'step-2', label: 'Start Scan', description: 'Begin a wideband sweep to detect signals' },
  { key: 'step-3', label: 'Browse Results', description: 'Explore detected signals and recordings' },
]

const LS_DISMISSED = 'sdrwatch-onboarding-dismissed'

function lsStepKey(key: string): string {
  return `sdrwatch-onboarding-${key}`
}

function loadStepStates(): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const step of STEPS) {
    state[step.key] = localStorage.getItem(lsStepKey(step.key)) === 'true'
  }
  return state
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface StartHereCTAProps {
  isOpen: boolean
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/* Check icon                                                          */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function StartHereCTA({ isOpen, onClose }: StartHereCTAProps) {
  const [stepState, setStepState] = useState<Record<string, boolean>>(loadStepStates)

  // Re-load from localStorage each time the overlay opens (in case other tabs changed it)
  useEffect(() => {
    if (isOpen) {
      setStepState(loadStepStates())
    }
  }, [isOpen])

  const toggleStep = useCallback((key: string) => {
    setStepState(prev => {
      const next = !prev[key]
      localStorage.setItem(lsStepKey(key), next ? 'true' : 'false')
      return { ...prev, [key]: next }
    })
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors hover:opacity-80"
          style={{ color: 'var(--text-secondary)', background: 'var(--chip-bg)' }}
          aria-label="Close onboarding"
        >
          ✕
        </button>

        {/* Title */}
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Getting Started
        </h2>
        <p className="text-sm mt-1 mb-6" style={{ color: 'var(--text-secondary)' }}>
          Complete these steps to start monitoring
        </p>

        {/* Checklist */}
        <div className="flex flex-col gap-3">
          {STEPS.map((step, idx) => {
            const done = stepState[step.key] ?? false
            return (
              <button
                key={step.key}
                onClick={() => toggleStep(step.key)}
                className="flex items-start gap-3 p-3 rounded-xl text-left w-full transition-colors hover:opacity-90"
                style={{ background: 'var(--bg-card)' }}
              >
                {/* Checkbox */}
                <div className="mt-0.5 shrink-0">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center transition-colors"
                    style={{
                      background: done ? '#0ea5e9' : 'var(--input-bg)',
                      border: done ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {done && <CheckIcon />}
                  </div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {idx + 1}. {step.label}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {step.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export { LS_DISMISSED }
