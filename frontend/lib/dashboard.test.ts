import { describe, expect, test } from 'vitest'
import { formatClockTime, formatToday, greetingFor } from './dashboard'

/** A local-midnight-relative instant, so the assertions do not depend on TZ. */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 9, 14, hour, minute, 0) // Wed 14 Oct 2026, local time
}

describe('greetingFor — the greeting follows the visitor clock', () => {
  test('the small hours and the morning read Good morning', () => {
    expect(greetingFor(at(0))).toBe('Good morning')
    expect(greetingFor(at(9))).toBe('Good morning')
    expect(greetingFor(at(11, 59))).toBe('Good morning')
  })

  test('midday through the late afternoon read Good afternoon', () => {
    expect(greetingFor(at(12))).toBe('Good afternoon')
    expect(greetingFor(at(17, 59))).toBe('Good afternoon')
  })

  test('the evening reads Good evening', () => {
    expect(greetingFor(at(18))).toBe('Good evening')
    expect(greetingFor(at(23, 59))).toBe('Good evening')
  })
})

describe('formatToday — the date shown is the one passed in', () => {
  test('renders the full weekday, day, month and year', () => {
    expect(formatToday(at(9))).toBe('Wednesday, 14 October 2026')
  })

  test('is driven by the date, not by when the suite runs', () => {
    expect(formatToday(new Date(2026, 0, 1, 12, 0))).toBe('Thursday, 1 January 2026')
  })
})

describe('formatClockTime — a timestamp reads as a wall clock', () => {
  test('formats an ISO instant as 24h HH:mm', () => {
    expect(formatClockTime(new Date(2026, 9, 14, 9, 5).toISOString())).toBe('09:05')
  })
})
