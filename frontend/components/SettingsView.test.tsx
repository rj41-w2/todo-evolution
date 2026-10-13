import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { TasksProvider } from './TasksProvider'
import { secureFetch } from '../lib/api'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

// `authClient` is the session boundary; the signed-in identity is whatever the
// session reports, so that is what the page must show.
vi.mock('../lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: { user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' } },
    })),
    signOut: vi.fn(async () => ({})),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }))

beforeEach(() => {
  vi.mocked(secureFetch).mockReset()
  vi.mocked(secureFetch).mockImplementation(
    async () => ({ ok: true, json: async () => [] }) as unknown as Response,
  )
})

function renderSettings() {
  return render(
    <TasksProvider>
      <SettingsView />
    </TasksProvider>,
  )
}

describe('SettingsView', () => {
  test('names the page', () => {
    renderSettings()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  })

  test('shows the signed-in identity from the session, nothing invented', async () => {
    renderSettings()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  test('offers the theme control and a way to sign out', async () => {
    renderSettings()
    expect(await screen.findByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  test('renders no control the app cannot honour', () => {
    renderSettings()
    // The backend backs none of these, so they must be absent, not inert.
    expect(screen.queryByText(/working hours/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ping/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/tone/i)).not.toBeInTheDocument()
  })
})
