import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  test('says the feature is coming, names the page and describes what will live there', () => {
    render(
      <ComingSoon
        title="Goals"
        description="This page will track the outcomes you are working toward."
      />,
    )

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Goals' })).toBeInTheDocument()
    expect(
      screen.getByText('This page will track the outcomes you are working toward.'),
    ).toBeInTheDocument()
  })

  test('offers a way back to the tasks page', () => {
    render(<ComingSoon title="Team" description="This page will list the people you work with." />)

    expect(screen.getByRole('link', { name: /tasks/i })).toHaveAttribute('href', '/tasks')
  })
})
