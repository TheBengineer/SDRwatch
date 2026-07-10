import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardVariant = 'elevated' | 'inset' | 'bordered'

interface CardProps {
  variant?: CardVariant
  collapsible?: boolean
  defaultOpen?: boolean
  /** Header/title text for collapsible toggle button */
  title?: React.ReactNode
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const variantStyles: Record<CardVariant, React.CSSProperties> = {
  elevated: {
    background: 'var(--card-elevated-bg)',
    border: '1px solid var(--card-elevated-border)',
    boxShadow: 'var(--card-elevated-shadow)',
  },
  inset: {
    background: 'var(--card-inset-bg)',
    border: '1px solid var(--card-inset-border)',
  },
  bordered: {
    background: 'var(--card-bordered-bg)',
    border: '1px solid var(--card-bordered-border)',
  },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Card({
  variant = 'elevated',
  collapsible = false,
  defaultOpen = true,
  title,
  className = '',
  children,
  style,
}: CardProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // Measure content height when open state or children change
  React.useEffect(() => {
    if (contentRef.current) {
      // Force reflow to get the scrollHeight
      void contentRef.current.scrollHeight
    }
  }, [children, open])

  const handleToggle = () => {
    setOpen(prev => !prev)
  }

  const baseClasses = 'rounded-2xl'
  const combinedClasses = [baseClasses, className].filter(Boolean).join(' ')

  return (
    <div
      className={combinedClasses}
      style={{
        color: 'var(--text-primary)',
        ...variantStyles[variant],
        ...style,
      }}
    >
      {collapsible ? (
        <>
          <button
            type="button"
            onClick={handleToggle}
            className="flex w-full items-center justify-between gap-2 p-4 text-left"
            aria-expanded={open}
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <span className="font-semibold">{title ?? children}</span>
            <svg
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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
              maxHeight: open ? (contentRef.current?.scrollHeight ?? undefined) : '0px',
              overflow: 'hidden',
            }}
          >
            <div ref={contentRef} className="px-4 pb-4">
              {children}
            </div>
          </div>
        </>
      ) : (
        <div className="p-4">{children}</div>
      )}
    </div>
  )
}

export type { CardProps, CardVariant }
