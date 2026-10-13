import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AppShell from './AppShell'
import { secureFetch } from '../lib/api'

const nav = vi.hoisted(() => ({ pathname: '/' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('../lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: { user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' } },
    })),
    signOut: vi.fn(async () => ({})),
  },
}))

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }))

beforeEach(() => {
  nav.pathname = '/'
  vi.mocked(secureFetch).mockReset()
  vi.mocked(secureFetch).mockImplementation(
    async () => ({ ok: true, json: async () => [] }) as unknown as Response,
  )
})

describe('AppShell', () => {
  test('renders the shared chrome: wordmark, both nav groups and the live status rail', async () => {
    render(<AppShell><div>page content</div></AppShell>)

    expect(screen.getAllByText(/^EVO$/).length).toBeGreaterThan(0)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Goals' })).toHaveAttribute('href', '/goals')
    expect(screen.getByRole('complementary', { name: 'Task status' })).toBeInTheDocument()
  })

  test('highlights the current route and leaves the others unmarked', () => {
    nav.pathname = '/tasks'
    render(<AppShell><div>page content</div></AppShell>)

    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  test('the sidebar drawer opens from a visible trigger, traps focus and closes on Escape', async () => {
    render(<AppShell><div>page content</div></AppShell>)

    const trigger = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()

    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    // Focus is trapped: Tab at the last control wraps to the first, Shift+Tab back.
    const closeButton = within(dialog).getByRole('button', { name: 'Close navigation menu' })
    const logout = within(dialog).getByRole('button', { name: 'Log out' })
    logout.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(logout)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
