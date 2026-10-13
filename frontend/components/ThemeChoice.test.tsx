import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ThemeChoice } from './ThemeChoice'

// `next-themes` is the external theming boundary — the only thing we mock. The
// control's own logic runs for real.
const themeState = vi.hoisted(() => ({
  theme: 'light' as string | undefined,
  setTheme: vi.fn(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme: themeState.setTheme }),
}))

beforeEach(() => {
  themeState.theme = 'light'
  themeState.setTheme.mockReset()
})

describe('ThemeChoice', () => {
  test('offers exactly the themes the app can apply: light, dark and system', () => {
    render(<ThemeChoice />)

    const group = screen.getByRole('group', { name: 'Theme' })
    const options = within(group).getAllByRole('button')
    expect(options.map(option => option.textContent)).toEqual(['Light', 'Dark', 'System'])
  })

  test('marks the theme that is currently applied as selected', () => {
    themeState.theme = 'dark'
    render(<ThemeChoice />)

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('switches the theme immediately when an option is chosen', () => {
    render(<ThemeChoice />)

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(themeState.setTheme).toHaveBeenCalledWith('dark')

    fireEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(themeState.setTheme).toHaveBeenCalledWith('system')
  })
})
