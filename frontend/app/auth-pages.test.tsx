import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// `authClient` is the external auth boundary — the only thing we mock. The
// pages' own logic runs for real.
const { signInEmail, signUpEmail } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
}))

vi.mock('../lib/auth-client', () => ({
  authClient: {
    signIn: { email: signInEmail },
    signUp: { email: signUpEmail },
  },
}))

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import LoginPage from './login/page'
import RegisterPage from './register/page'

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function submit() {
  fireEvent.submit(screen.getByRole('button').closest('form')!)
}

describe('login page — visible states', () => {
  test('shows a validation error when the credentials are rejected', async () => {
    signInEmail.mockResolvedValue({ error: { message: 'Invalid email or password.' } })

    render(<LoginPage />)
    fill('Email address', 'someone@example.com')
    fill('Password', 'wrong-password')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  test('marks the form busy while signing in', async () => {
    signInEmail.mockImplementation(() => new Promise(() => {}))

    render(<LoginPage />)
    fill('Email address', 'someone@example.com')
    fill('Password', 'correct-password')
    submit()

    const button = screen.getByRole('button')
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).toBeDisabled()
  })
})

describe('register page — visible states', () => {
  test('shows a validation error when sign-up is rejected', async () => {
    signUpEmail.mockResolvedValue({ error: { message: 'Email already registered.' } })

    render(<RegisterPage />)
    fill('Full name', 'Ada Lovelace')
    fill('Email address', 'ada@example.com')
    fill('Password', 'correct-password')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered.')
  })

  test('marks the form busy while creating the account', async () => {
    signUpEmail.mockImplementation(() => new Promise(() => {}))

    render(<RegisterPage />)
    fill('Full name', 'Ada Lovelace')
    fill('Email address', 'ada@example.com')
    fill('Password', 'correct-password')
    submit()

    const button = screen.getByRole('button')
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).toBeDisabled()
  })
})
