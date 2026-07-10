import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Select({
  label,
  hint,
  error,
  className = '',
  wrapperClassName = '',
  id,
  children,
  ...rest
}: SelectProps) {
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  const hintId = hint ? `${selectId}-hint` : undefined
  const errorId = error ? `${selectId}-error` : undefined

  const borderColor = error
    ? 'var(--btn-danger-bg)'
    : 'var(--input-border)'

  const baseSelectClasses =
    'w-full rounded-xl border font-medium outline-none transition-colors px-3 py-2 text-sm appearance-none cursor-pointer'

  const selectClasses = [baseSelectClasses, className].filter(Boolean).join(' ')

  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          className={selectClasses}
          style={{
            background: 'var(--input-bg)',
            color: 'var(--input-text)',
            borderColor,
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hintId, errorId].filter(Boolean).join(' ') || undefined
          }
          {...rest}
        >
          {children}
        </select>
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg
            className="h-4 w-4"
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
        </span>
      </div>

      {hint && !error && (
        <p
          id={hintId}
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="text-xs"
          style={{ color: 'var(--btn-danger-bg)' }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export type { SelectProps }
