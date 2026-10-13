import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { completeOnboarding, resetWorkspaceCache } from '../lib/workspace'
import { secureFetch } from '../lib/api'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
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

import AppShell from './AppShell'

beforeEach(() => {
  window.localStorage.clear()
  resetWorkspaceCache()
  vi.mocked(secureFetch).mockReset()
  vi.mocked(secureFetch).mockImplementation(
    async () => ({ ok: true, json: async () => [] }) as unknown as Response,
  )
})

describe('workspace name in the shell', () => {
  test('the sidebar shows the name recorded at first run, and it survives a reload', () => {
    completeOnboarding('Acme Team')
    // A real reload starts from storage with an empty in-memory cache.
    resetWorkspaceCache()

    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    )

    expect(screen.getByText('Acme Team')).toBeInTheDocument()
  })

  test('the label updates when first run is completed in this session', () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    )

    expect(screen.queryByText('Beta Studio')).not.toBeInTheDocument()

    act(() => {
      completeOnboarding('Beta Studio')
    })

    expect(screen.getByText('Beta Studio')).toBeInTheDocument()
  })
})
