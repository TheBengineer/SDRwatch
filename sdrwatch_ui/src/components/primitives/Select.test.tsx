import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Select from './Select'

describe('Select', () => {
  it('renders options', () => {
    render(
      <Select>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('renders a label when provided', () => {
    render(
      <Select label="Frequency">
        <option value="1">1 GHz</option>
      </Select>,
    )
    expect(screen.getByLabelText('Frequency')).toBeInTheDocument()
  })

  it('renders hint text when provided', () => {
    render(
      <Select hint="Select a band">
        <option value="1">Band 1</option>
      </Select>,
    )
    expect(screen.getByText('Select a band')).toBeInTheDocument()
  })

  it('renders error text when provided', () => {
    render(
      <Select error="Please choose an option">
        <option value="">Select...</option>
      </Select>,
    )
    const errorEl = screen.getByRole('alert')
    expect(errorEl).toHaveTextContent('Please choose an option')
  })

  it('shows error over hint when both provided', () => {
    render(
      <Select hint="Pick one" error="Required field">
        <option value="">Select...</option>
      </Select>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Required field')
    expect(screen.queryByText('Pick one')).not.toBeInTheDocument()
  })

  it('sets aria-invalid when error is provided', () => {
    render(
      <Select error="Invalid choice">
        <option value="">Select...</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('allows selecting an option', async () => {
    const user = userEvent.setup()
    render(
      <Select>
        <option value="">Select...</option>
        <option value="a">Option A</option>
      </Select>,
    )
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'a')
    expect(select).toHaveValue('a')
  })
})
