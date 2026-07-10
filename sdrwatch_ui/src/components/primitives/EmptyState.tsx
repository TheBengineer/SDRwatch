import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionDef {
  label: string
  to: string
}

interface EmptyStateProps {
  /** Optional icon rendered above the title */
  icon?: ReactNode
  /** Bold title text */
  title: string
  /** Descriptive text shown below the title */
  description: string
  /** Primary CTA button (rendered as a react-router Link) */
  action?: ActionDef
  /** Secondary text link shown below the primary action (to is optional — omit to render as a button) */
  secondaryAction?: Omit<ActionDef, 'to'> & { to?: string; onClick?: () => void }
  className?: string
}

// ---------------------------------------------------------------------------
// Default icon — a stylised radar / target
// ---------------------------------------------------------------------------

function DefaultIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-12 h-12"
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx={24} cy={24} r={20} opacity={0.3} />
      {/* Middle ring */}
      <circle cx={24} cy={24} r={14} opacity={0.5} />
      {/* Crosshairs */}
      <line x1={24} y1={2} x2={24} y2={10} opacity={0.5} />
      <line x1={24} y1={38} x2={24} y2={46} opacity={0.5} />
      <line x1={2} y1={24} x2={10} y2={24} opacity={0.5} />
      <line x1={38} y1={24} x2={46} y2={24} opacity={0.5} />
      {/* Centre dot */}
      <circle cx={24} cy={24} r={3} fill="currentColor" stroke="none" opacity={0.6} />
      {/* Sweep arc */}
      <path d="M24 4 A20 20 0 0 1 40.14 16.76" opacity={0.6} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}
      style={{
        border: '1px dashed var(--border)',
        borderRadius: '1rem',
        background: 'var(--card-bordered-bg)',
      }}
    >
      {/* Icon */}
      <div className="mb-5" style={{ color: 'var(--text-muted)' }}>
        {icon ?? <DefaultIcon />}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm mb-6 max-w-md" style={{ color: 'var(--text-secondary)' }}>
        {description}
      </p>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        {action && (
          <Button as={Link} to={action.to}>
            {action.label}
          </Button>
        )}

        {secondaryAction &&
          (secondaryAction.to ? (
            <Link
              to={secondaryAction.to}
              className="text-sm transition-colors hover:underline inline-flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="text-sm transition-colors hover:underline bg-transparent border-none cursor-pointer inline-flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {secondaryAction.label}
            </button>
          ))}
      </div>
    </div>
  )
}

export type { EmptyStateProps, ActionDef }
