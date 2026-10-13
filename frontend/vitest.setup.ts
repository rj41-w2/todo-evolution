import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library does not auto-clean up when Vitest globals are off,
// so register teardown explicitly to keep each test isolated.
afterEach(() => {
  cleanup()
})
