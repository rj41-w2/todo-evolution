import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { resetWorkspaceCache, readWorkspace, WORKSPACE_STORAGE_KEY } from '../lib/workspace'

const { replace, push, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh }),
}))

import { OnboardingView } from './OnboardingView'

function completeFirstRun() {
  window.localStorage.setItem(
    WORKSPACE_STORAGE_KEY,
    JSON.stringify({ onboarded: true, name: 'Acme Team' }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  resetWorkspaceCache()
  replace.mockReset()
})

describe('OnboardingView — first run', () => {
  test('asks for a workspace name in a form that can be submitted from the keyboard', () => {
    render(<OnboardingView />)

    const input = screen.getByLabelText('Workspace name')
    const form = input.closest('form')
    expect(form).not.toBeNull()
    expect(within(form as HTMLElement).getByRole('button')).toHaveAttribute('type', 'submit')
  })

  test('submitting records the name and returns to the dashboard', () => {
    render(<OnboardingView />)

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Acme Team' } })
    fireEvent.submit(screen.getByLabelText('Workspace name').closest('form') as HTMLFormElement)

    expect(readWorkspace()).toEqual({ onboarded: true, name: 'Acme Team' })
    expect(replace).toHaveBeenCalledWith('/')
  })

  test('skipping completes first-run without inventing a name and returns to the dashboard', () => {
    render(<OnboardingView />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(readWorkspace()).toEqual({ onboarded: true, name: '' })
    expect(replace).toHaveBeenCalledWith('/')
  })

  test('keeps the visitor on the step until they choose (no redirect while unnamed)', async () => {
    render(<OnboardingView />)

    await waitFor(() => expect(screen.getByLabelText('Workspace name')).toBeInTheDocument())
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('OnboardingView — returning', () => {
  test('a completed first run redirects to the dashboard instead of asking again', async () => {
    completeFirstRun()

    render(<OnboardingView />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(screen.queryByLabelText('Workspace name')).not.toBeInTheDocument()
  })

  test('blocked storage is treated as onboarded, so the step never traps the visitor', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    try {
      render(<OnboardingView />)

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    } finally {
      spy.mockRestore()
    }
  })
})
