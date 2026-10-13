import { describe, expect, test } from 'vitest'
import { NAV_GROUPS, isActiveNavItem } from './nav'

describe('navigation model', () => {
  test('exposes the agreed destinations in two groups', () => {
    expect(NAV_GROUPS.map(g => g.label)).toEqual(['Main', 'Manage'])
    expect(NAV_GROUPS[0].items.map(i => i.href)).toEqual(['/', '/tasks', '/my-tasks'])
    expect(NAV_GROUPS[1].items.map(i => i.href)).toEqual([
      '/goals',
      '/team',
      '/activity',
      '/settings',
    ])
    expect(NAV_GROUPS.flatMap(g => g.items).find(i => i.href === '/tasks')?.label).toBe('Tasks')
  })
})

describe('isActiveNavItem', () => {
  test('only the dashboard owns the root path', () => {
    expect(isActiveNavItem('/', '/')).toBe(true)
    expect(isActiveNavItem('/tasks', '/')).toBe(false)
  })

  test('matches a route exactly and its nested pages', () => {
    expect(isActiveNavItem('/tasks', '/tasks')).toBe(true)
    expect(isActiveNavItem('/tasks/42', '/tasks')).toBe(true)
    expect(isActiveNavItem('/my-tasks', '/tasks')).toBe(false)
  })

  test('does not treat a prefix sibling as active', () => {
    expect(isActiveNavItem('/tasks-archive', '/tasks')).toBe(false)
    expect(isActiveNavItem('/settings/theme', '/settings')).toBe(true)
  })
})
