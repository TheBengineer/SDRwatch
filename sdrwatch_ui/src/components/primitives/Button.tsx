import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonOwnProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

type ButtonAsProp<C extends React.ElementType = 'button'> = {
  as?: C
}

type ButtonProps<C extends React.ElementType = 'button'> =
  ButtonOwnProps &
  ButtonAsProp<C> &
  Omit<React.ComponentPropsWithoutRef<C>, keyof ButtonOwnProps | 'as'>

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
  },
  secondary: {
    background: 'var(--btn-secondary-bg)',
    color: 'var(--btn-secondary-text)',
  },
  danger: {
    background: 'var(--btn-danger-bg)',
    color: 'var(--btn-danger-text)',
  },
  ghost: {
    background: 'var(--btn-ghost-bg)',
    color: 'var(--btn-ghost-text)',
  },
  icon: {
    background: 'var(--btn-ghost-bg)',
    color: 'var(--btn-ghost-text)',
  },
}

const variantHoverStyles: Record<ButtonVariant, string> = {
  primary: 'var(--btn-primary-hover)',
  secondary: 'var(--btn-secondary-hover)',
  danger: 'var(--btn-danger-hover)',
  ghost: 'var(--btn-ghost-hover)',
  icon: 'var(--btn-ghost-hover)',
}

const sizePaddings: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-lg',
  md: 'px-3 py-2 text-sm rounded-xl',
  lg: 'px-4 py-2.5 text-base rounded-xl',
}

const iconSizePaddings: Record<ButtonSize, string> = {
  sm: 'p-1.5 text-xs',
  md: 'p-2 text-sm',
  lg: 'p-2.5 text-base',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ButtonInner(
  props: ButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    className = '',
    children,
    as,
    style,
    ...rest
  } = props

  const [hovered, setHovered] = React.useState(false)
  const isDisabled = disabled || loading

  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-colors outline-none'
  const sizeClass = variant === 'icon' ? iconSizePaddings[size] : sizePaddings[size]

  const variantBg = variantStyles[variant].background as string
  const variantText = variantStyles[variant].color as string
  const hoverBg = variantHoverStyles[variant]

  const combinedStyle: React.CSSProperties = {
    background: hovered && !isDisabled ? hoverBg : variantBg,
    color: variantText,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : undefined,
    ...style,
  }

  const classes = [baseClasses, sizeClass, 'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500', className]
    .filter(Boolean)
    .join(' ')

  const handleMouseEnter = () => setHovered(true)
  const handleMouseLeave = () => setHovered(false)

  if (as) {
    const Tag = as
    return React.createElement(
      Tag,
      {
        ref,
        className: classes,
        style: combinedStyle,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        'aria-disabled': isDisabled || undefined,
        'aria-busy': loading || undefined,
        ...rest,
      },
      loading ? (
        <>
          <Spinner />
          <span>{children}</span>
        </>
      ) : (
        children
      ),
    )
  }

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      style={combinedStyle}
      disabled={isDisabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...(rest as React.ComponentPropsWithoutRef<'button'>)}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

const Button = React.forwardRef(ButtonInner) as React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<HTMLButtonElement>
> & {
  <C extends React.ElementType = 'button'>(props: ButtonProps<C> & { ref?: React.ForwardedRef<HTMLElement> }): React.ReactElement
}

export default Button
export type { ButtonProps, ButtonVariant, ButtonSize }
