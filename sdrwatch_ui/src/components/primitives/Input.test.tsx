import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Input from './Input'

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders a label when provided', () => {
    render(<Input label="Username" />)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('renders hint text when provided', () => {
    render(<Input hint="Enter your username" />)
    expect(screen.getByText('Enter your username')).toBeInTheDocument()
  })

  it('renders error text when provided', () => {
    render(<Input error="This field is required" />)
    const errorEl = screen.getByRole('alert')
    expect(errorEl).toHaveTextContent('This field is required')
  })

  it('shows error over hint when both provided', () => {
    render(<Input hint="Helpful hint" error="Error message" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Error message')
    expect(screen.queryByText('Helpful hint')).not.toBeInTheDocument()
  })

  it('sets aria-invalid when error is provided', () => {
    render(<Input error="Invalid" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders prefix element', () => {
    render(<Input prefix="$" />)
    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('renders suffix element', () => {
    render(<Input suffix="kg" />)
    expect(screen.getByText('kg')).toBeInTheDocument()
  })

  it('accepts typed input', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Type here" />)
    const input = screen.getByPlaceholderText('Type here')
    await user.type(input, 'Hello')
    expect(input).toHaveValue('Hello')
  })
})
