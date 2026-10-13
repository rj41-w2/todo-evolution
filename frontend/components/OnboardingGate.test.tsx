import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { resetWorkspaceCache, WORKSPACE_STORAGE_KEY, completeOnboarding } from '../lib/workspace'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}))

import { OnboardingGate } from './OnboardingGate'

beforeEach(() => {
  window.localStorage.clear()
  resetWorkspaceCache()
  replace.mockReset()
})

describe('OnboardingGate', () => {
  test('routes a first-time visitor through onboarding', async () => {
    render(
      <OnboardingGate>
        <div>dashboard</div>
      </OnboardingGate>,
    )

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'))
  })

  test('lets an onboarded visitor straight through to the app', async () => {
    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ onboarded: true, name: 'Acme Team' }),
    )

    render(
      <OnboardingGate>
        <div>dashboard</div>
      </OnboardingGate>,
    )

    expect(screen.getByText('dashboard')).toBeInTheDocument()
    await waitFor(() => expect(replace).not.toHaveBeenCalled())
  })

  test('never traps a visitor whose storage is blocked', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    try {
      render(
        <OnboardingGate>
          <div>dashboard</div>
        </OnboardingGate>,
      )

      expect(screen.getByText('dashboard')).toBeInTheDocument()
      await waitFor(() => expect(replace).not.toHaveBeenCalled())
    } finally {
      spy.mockRestore()
    }
  })

  // The realistic blocked-storage case: reads AND writes throw (private mode,
  // cookies disabled, quota). The visitor answers the first-run step, the write
  // fails, and the gate must still let them into the app rather than bounce them
  // back to /onboarding forever.
  test('lets a visitor through whose storage refuses the write too', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    try {
      completeOnboarding('Acme Team')

      render(
        <OnboardingGate>
          <div>dashboard</div>
        </OnboardingGate>,
      )

      expect(screen.getByText('dashboard')).toBeInTheDocument()
      await waitFor(() => expect(replace).not.toHaveBeenCalled())
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
