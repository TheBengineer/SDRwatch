import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  label?: string
  hint?: string
  error?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  wrapperClassName?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Input({
  label,
  hint,
  error,
  prefix,
  suffix,
  className = '',
  wrapperClassName = '',
  id,
  ...rest
}: InputProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  const baseInputClasses =
    'w-full rounded-xl border font-medium outline-none transition-colors px-3 py-2 text-sm'

  const borderColor = error
    ? 'var(--btn-danger-bg)'
    : 'var(--input-border)'

  const inputClasses = [baseInputClasses, className].filter(Boolean).join(' ')

  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {prefix && (
          <span
            className="absolute left-3 flex items-center pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {prefix}
          </span>
        )}

        <input
          id={inputId}
          className={inputClasses}
          style={{
            background: 'var(--input-bg)',
            color: 'var(--input-text)',
            borderColor,
            paddingLeft: prefix ? '2.25rem' : undefined,
            paddingRight: suffix ? '2.25rem' : undefined,
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hintId, errorId].filter(Boolean).join(' ') || undefined
          }
          {...rest}
        />

        {suffix && (
          <span
            className="absolute right-3 flex items-center pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            {suffix}
          </span>
        )}
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

export type { InputProps }
