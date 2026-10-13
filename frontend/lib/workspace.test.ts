import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  WORKSPACE_STORAGE_KEY,
  completeOnboarding,
  readWorkspace,
  resetWorkspaceCache,
  skipOnboarding,
  subscribeWorkspace,
} from './workspace'

describe('workspace storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetWorkspaceCache()
  })

  test('a first-time visitor is not onboarded and has no name', () => {
    expect(readWorkspace()).toEqual({ onboarded: false, name: '' })
  })

  test('completing onboarding records the choice and stores the chosen name', () => {
    completeOnboarding('Acme Team')

    expect(readWorkspace()).toEqual({ onboarded: true, name: 'Acme Team' })
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? '{}')).toEqual({
      onboarded: true,
      name: 'Acme Team',
    })
  })

  test('the chosen name survives a reload (a fresh read of storage)', () => {
    completeOnboarding('  Studio Nine  ')

    // Simulate a reload: drop every in-memory cache, keep localStorage.
    resetWorkspaceCache()

    expect(readWorkspace().name).toBe('Studio Nine')
  })

  test('skipping records the choice without inventing a name', () => {
    skipOnboarding()

    expect(readWorkspace()).toEqual({ onboarded: true, name: '' })
  })

  test('repeated reads return the same snapshot, so subscribers cannot loop', () => {
    completeOnboarding('Acme Team')

    expect(readWorkspace()).toBe(readWorkspace())
  })

  test('subscribers are notified when the choice is recorded', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeWorkspace(listener)

    completeOnboarding('Acme Team')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    skipOnboarding()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('storage that throws is treated as onboarded, so the gate can never trap the visitor', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    try {
      expect(readWorkspace()).toEqual({ onboarded: true, name: '' })
    } finally {
      spy.mockRestore()
    }
  })

  test('a write that is blocked is remembered for the session instead of bouncing the visitor back', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    try {
      completeOnboarding('Acme Team')

      expect(readWorkspace()).toEqual({ onboarded: true, name: 'Acme Team' })
    } finally {
      spy.mockRestore()
    }
  })
})
