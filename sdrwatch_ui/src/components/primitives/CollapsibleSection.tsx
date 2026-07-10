import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: React.ReactNode
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
  /** Controlled open state (default: uncontrolled) */
  open?: boolean
  onToggle?: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CollapsibleSection({
  title,
  defaultOpen = false,
  className = '',
  children,
  open: controlledOpen,
  onToggle,
}: CollapsibleSectionProps) {
  const isControlled = controlledOpen !== undefined
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState<number | undefined>(
    defaultOpen ? undefined : 0,
  )

  const isOpen = isControlled ? controlledOpen : internalOpen

  // Measure content height on mount and when children change
  React.useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [children])

  const handleToggle = () => {
    if (!isControlled) {
      setInternalOpen(prev => !prev)
    }
    onToggle?.(!isOpen)
  }

  const baseClasses =
    'rounded-xl overflow-hidden border'
  const combinedClasses = [baseClasses, className].filter(Boolean).join(' ')

  return (
    <div
      className={combinedClasses}
      style={{
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border)',
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold"
        aria-expanded={isOpen}
        style={{
          background: 'transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        {title}
        <svg
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        className="transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? (height != null ? `${height}px` : undefined) : '0px',
          overflow: 'hidden',
        }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}

export type { CollapsibleSectionProps }
