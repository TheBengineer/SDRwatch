import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Card from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    )
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders elevated variant by default', () => {
    render(<Card>Elevated</Card>)
    expect(screen.getByText('Elevated')).toBeInTheDocument()
  })

  it('renders bordered variant', () => {
    render(<Card variant="bordered">Bordered</Card>)
    expect(screen.getByText('Bordered')).toBeInTheDocument()
  })

  it('renders inset variant', () => {
    render(<Card variant="inset">Inset</Card>)
    expect(screen.getByText('Inset')).toBeInTheDocument()
  })

  it('toggles collapsible content with aria-expanded', async () => {
    const user = userEvent.setup()
    render(
      <Card collapsible title="Toggle me" defaultOpen={false}>
        <p>Collapsible content</p>
      </Card>,
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts open when defaultOpen is true', () => {
    render(
      <Card collapsible title="Open Card">
        <p>Open content</p>
      </Card>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows children in collapsible content area', () => {
    render(
      <Card collapsible title="Section" defaultOpen>
        <p>Visible content</p>
      </Card>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Section')
    expect(screen.getByText('Visible content')).toBeInTheDocument()
  })
})
