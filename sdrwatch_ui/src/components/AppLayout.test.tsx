import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from './AppLayout'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.pathname : url.url
    if (path === '/api/baselines') {
      return Promise.resolve(new Response(JSON.stringify({ baselines: [{ id: 1, name: 'Roof Discone' }] })))
    }
    return Promise.resolve(new Response(JSON.stringify([])))
  })
})

describe('AppLayout', () => {
  it('renders without crashing and shows the app title', () => {
    render(
      <MemoryRouter initialEntries={['/?baseline_id=1']}>
        <AppLayout />
      </MemoryRouter>,
    )

    expect(screen.getByText('📡 SDRwatch')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/?baseline_id=1']}>
        <AppLayout />
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Control')).toBeInTheDocument()
    expect(screen.getByText('Signals')).toBeInTheDocument()
  })

  it('shows baselines loaded from the API', async () => {
    render(
      <MemoryRouter initialEntries={['/?baseline_id=1']}>
        <AppLayout />
      </MemoryRouter>,
    )

    // The fetch resolves asynchronously, populating the <select>
    await expect(screen.findByText('Roof Discone')).resolves.toBeInTheDocument()
  })
})
