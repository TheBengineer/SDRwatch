/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface CheatSheetProps {
  isOpen: boolean
  onClose: () => void
}

/* ------------------------------------------------------------------ */
/* Shortcut definitions                                                */
/* ------------------------------------------------------------------ */

interface ShortcutEntry {
  key: string
  label: string
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: '?', label: 'Toggle this cheat sheet' },
  { key: 's', label: 'Focus first filter / search input' },
  { key: 'r', label: 'Refresh current view' },
  { key: 'Escape', label: 'Close modals / expanded rows' },
  { key: '1', label: 'Navigate to Dashboard' },
  { key: '2', label: 'Navigate to Control' },
  { key: '3', label: 'Navigate to Signals' },
  { key: '4', label: 'Navigate to Recordings' },
]

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CheatSheet({ isOpen, onClose }: CheatSheetProps) {
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
        className="relative rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
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
          aria-label="Close keyboard shortcuts"
        >
          ✕
        </button>

        {/* Title */}
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Keyboard Shortcuts
        </h2>
        <p className="text-sm mt-1 mb-6" style={{ color: 'var(--text-secondary)' }}>
          Press <kbd className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}>?</kbd> to toggle this overlay at any time
        </p>

        {/* Shortcut list */}
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map(sc => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-2.5 rounded-xl"
              style={{ background: 'var(--bg-card)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {sc.label}
              </span>
              <kbd
                className="ml-4 px-2 py-0.5 rounded text-xs font-mono font-semibold shrink-0"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {sc.key === 'Escape' ? 'Esc' : sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Hint */}
        <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
          Shortcuts are disabled while typing in input fields
        </p>
      </div>
    </div>
  )
}
