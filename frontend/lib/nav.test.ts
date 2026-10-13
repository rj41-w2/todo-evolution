import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

  // Ticket 02 pointed the sidebar at destinations that did not exist yet. Every
  // one of them now has a route, and this keeps the model and the route tree
  // from drifting apart again: a nav entry whose page is missing is a 404 in
  // the primary navigation.
  test('every destination resolves to a page in the signed-in route group', () => {
    const routes = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '(app)')

    const missing = NAV_GROUPS.flatMap(g => g.items)
      .map(i => i.href)
      .filter(href => !existsSync(join(routes, href === '/' ? '' : href.slice(1), 'page.tsx')))

    expect(missing, `no page for: ${missing.join(', ')}`).toEqual([])
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
