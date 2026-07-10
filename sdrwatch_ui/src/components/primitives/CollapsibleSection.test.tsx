import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollapsibleSection from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders title and children', () => {
    render(
      <CollapsibleSection title="Section Title">
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Section Title')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('starts closed by default (aria-expanded=false)', () => {
    render(
      <CollapsibleSection title="Closed Section">
        <p>Hidden content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts open when defaultOpen is true', () => {
    render(
      <CollapsibleSection title="Open Section" defaultOpen>
        <p>Visible content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles aria-expanded on click', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Toggle Section">
        <p>Toggle content</p>
      </CollapsibleSection>,
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('calls onToggle when controlled', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Controlled" open={false} onToggle={onToggle}>
        <p>Content</p>
      </CollapsibleSection>,
    )

    // Controlled: open is always false, so clicking always calls onToggle(true)
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle).toHaveBeenLastCalledWith(true)
  })
})
