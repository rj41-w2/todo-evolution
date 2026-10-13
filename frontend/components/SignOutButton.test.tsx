import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SignOutButton } from './SignOutButton'

// `authClient` is the external auth boundary — the only thing we mock.
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => ({})) }))
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock('../lib/auth-client', () => ({ authClient: { signOut } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeEach(() => {
  signOut.mockClear()
  push.mockClear()
  refresh.mockClear()
})

describe('SignOutButton', () => {
  test('clears the session and returns to the login page', async () => {
    render(<SignOutButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(push).toHaveBeenCalledWith('/login')
    expect(refresh).toHaveBeenCalled()
  })
})
