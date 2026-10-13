import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement scrollIntoView, which the chat drawer calls on every
// new message. A no-op keeps component tests from throwing where a browser
// would simply scroll.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// React Testing Library does not auto-clean up when Vitest globals are off,
// so register teardown explicitly to keep each test isolated.
afterEach(() => {
  cleanup()
})
