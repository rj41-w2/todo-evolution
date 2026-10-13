import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'vitest'

// --- read the token layer (single source of truth) -------------------------

const here = dirname(fileURLToPath(import.meta.url))
const frontend = join(here, '..')
const read = (p: string) => readFileSync(join(frontend, p), 'utf8')

const tokensCss = read('app/tokens.css')
const globalsCss = read('app/globals.css')

function extractBlock(css: string, selector: string): Map<string, string> {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(css)
  if (!block) throw new Error(`missing ${selector} block in tokens.css`)
  const map = new Map<string, string>()
  const re = /--([\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block[1])) !== null) map.set(`--${m[1]}`, m[2].trim())
  return map
}

const light = extractBlock(tokensCss, ':root')
const dark = extractBlock(tokensCss, '\\.dark')

// --- colour parsing + WCAG contrast (independent implementation) -----------

type Rgb = { r: number; g: number; b: number; a: number }

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(bl) * 255]
}
function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const o = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/i.exec(
    value.trim(),
  )
  if (!o) throw new Error(`unsupported colour: ${value}`)
  const L = parseFloat(o[1]) / 100
  const C = parseFloat(o[2])
  const H = (parseFloat(o[3]) * Math.PI) / 180
  const [r, g, b] = oklabToRgb(L, C * Math.cos(H), C * Math.sin(H))
  return { r, g, b, a: o[4] === undefined ? 1 : parseFloat(o[4]) }
}
function relativeLuminance({ r, g, b }: Rgb) {
  const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255)
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}
function contrast(a: Rgb, b: Rgb) {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// --- token expectations -----------------------------------------------------

const COLOR_TOKENS = [
  '--color-paper', '--color-paper-2', '--color-paper-3', '--color-card',
  '--color-ink', '--color-ink-2', '--color-neutral', '--color-muted',
  '--color-rule', '--color-rule-2',
  '--color-accent', '--color-accent-strong', '--color-accent-ink',
  '--color-accent-soft', '--color-focus',
  '--color-success', '--color-success-soft', '--color-warn', '--color-warn-soft',
  '--color-danger', '--color-danger-soft',
]
const SHADOW_TOKENS = [
  '--shadow-whisper', '--shadow-hairline', '--shadow-card',
  '--shadow-card-inset', '--shadow-float', '--glyph-chevron',
]
const SHARED_TOKENS = [
  '--font-display', '--font-body', '--font-mono',
  '--text-micro', '--text-meta', '--text-xs', '--text-sm', '--text-md',
  '--text-lg', '--text-xl', '--text-2xl', '--text-3xl', '--text-display',
  '--radius-card', '--radius-input', '--radius-panel', '--radius-pill',
]

// text/UI pairs that MUST reach WCAG AA for normal text (4.5:1);
// graphics (dots, fills, focus rings) only need 3:1.
const TEXT_PAIRS: Array<[string, string, string]> = [
  ['--color-ink', '--color-paper', 'body text on canvas'],
  ['--color-ink', '--color-card', 'body text on card'],
  ['--color-ink-2', '--color-paper', 'secondary text on canvas'],
  ['--color-ink-2', '--color-card', 'secondary text on card'],
  ['--color-muted', '--color-paper', 'muted meta on canvas'],
  ['--color-muted', '--color-card', 'muted meta on card'],
  ['--color-accent-strong', '--color-paper', 'accent text on canvas'],
  ['--color-accent-strong', '--color-card', 'accent text on card'],
  ['--color-accent-ink', '--color-accent-strong', 'label on accent fill'],
  ['--color-danger', '--color-paper', 'danger text on canvas'],
]
const GRAPHIC_PAIRS: Array<[string, string, string]> = [
  ['--color-accent', '--color-paper', 'accent graphic on canvas'],
]

function tokenPair(mode: Map<string, string>, fg: string, bg: string) {
  const fgVal = mode.get(fg)
  const bgVal = mode.get(bg)
  if (!fgVal || !bgVal) throw new Error(`missing token in pair ${fg} / ${bg}`)
  return { fg: parseColor(fgVal), bg: parseColor(bgVal) }
}

describe('design tokens — warm canvas contract', () => {
  test('co-locates every colour and elevation token for both themes', () => {
    for (const t of [...COLOR_TOKENS, ...SHADOW_TOKENS, ...SHARED_TOKENS]) {
      expect(light.has(t), `:root is missing ${t}`).toBe(true)
    }
    for (const t of [...COLOR_TOKENS, ...SHADOW_TOKENS]) {
      expect(dark.has(t), `.dark is missing a counterpart for ${t}`).toBe(true)
    }
  })

  test('uses DM Sans only — the previous font stack is gone', () => {
    for (const t of ['--font-display', '--font-body', '--font-mono']) {
      const value = light.get(t) ?? ''
      expect(value, `${t} must load DM Sans`).toContain('DM Sans')
      for (const old of ['Space Grotesk', 'Inter', 'JetBrains Mono']) {
        expect(value, `${t} still references ${old}`).not.toContain(old)
      }
    }
  })

  test('exposes micro-label sizes and pill radii', () => {
    expect(light.get('--text-micro')).toBeDefined()
    expect(light.get('--text-meta')).toBeDefined()
    expect(light.get('--radius-pill')).toContain('9999')
  })

  test('keeps the contrast function honest (a low-contrast pair fails)', () => {
    expect(contrast(parseColor('#999999'), parseColor('#EBE7E2'))).toBeLessThan(4.5)
  })

  describe.each([
    ['light', light],
    ['dark', dark],
  ])('%s mode meets WCAG AA', (_name, mode) => {
    test.each(TEXT_PAIRS)('%s on %s (%s) reaches 4.5:1', (fg, bg, label) => {
      const { fg: fgColor, bg: bgColor } = tokenPair(mode, fg, bg)
      expect(contrast(fgColor, bgColor), label).toBeGreaterThanOrEqual(4.5)
    })

    test.each(GRAPHIC_PAIRS)('%s on %s (%s) reaches 3:1', (fg, bg, label) => {
      const { fg: fgColor, bg: bgColor } = tokenPair(mode, fg, bg)
      expect(contrast(fgColor, bgColor), label).toBeGreaterThanOrEqual(3)
    })
  })
})

describe('primary CTA contrast (the shared class behind every page)', () => {
  const block = new RegExp('\\.btn-primary\\s*\\{([\\s\\S]*?)\\}').exec(globalsCss)?.[1] ?? ''

  test('fills with the AA-safe accent role, not the decorative graphic violet', () => {
    const background = /background:\s*([^;]+);/.exec(block)?.[1].trim()
    expect(background, '.btn-primary must use the AA-safe fill').toBe('var(--color-accent-strong)')
  })

  describe.each([
    ['light', light],
    ['dark', dark],
  ])('%s CTA label meets AA', (_name, mode) => {
    test('accent-ink on the accent-strong fill reaches 4.5:1', () => {
      const fill = mode.get('--color-accent-strong')
      const label = mode.get('--color-accent-ink')
      if (!fill || !label) throw new Error('missing accent tokens')
      expect(contrast(parseColor(label), parseColor(fill))).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('accent pairings', () => {
  // The decorative violet only reaches ~3:1 against `--color-accent-ink`, which
  // fails AA for a label, and only ~2:1 against `--color-accent-soft`, which
  // fails even the 3:1 bar for a meaningful glyph. Every accent fill with text
  // on it therefore goes through the shared `.accent-fill` class (accent-strong
  // fill + accent-ink label), and a glyph on `--color-accent-soft` uses the
  // `-strong` text role — the pairing the sidebar and settings avatars already
  // use. A bare `bg-accent` next to `text-accent-ink`, or `bg-accent-soft` next
  // to `text-accent`, is the defect.
  function inlinePairs(a: string, b: string): string[] {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (new RegExp(`\\b${a}(?![\\w-])`).test(line) && new RegExp(`\\b${b}(?![\\w-])`).test(line)) {
                offenders.push(`${p.replace(`${frontend}/`, '')}:${index + 1}`)
              }
            })
        }
      }
    }
    walk(join(frontend, 'components'))
    walk(join(frontend, 'app'))
    return offenders
  }

  test('never pairs the decorative fill with an accent-ink label inline', () => {
    const offenders = inlinePairs('bg-accent', 'text-accent-ink')
    expect(offenders, `use the shared .accent-fill class: ${offenders.join(', ')}`).toEqual([])
  })

  test('never puts an accent glyph on the soft accent surface inline', () => {
    const offenders = inlinePairs('bg-accent-soft', 'text-accent')
    expect(offenders, `use text-accent-strong: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('stylesheet hygiene', () => {
  test('no transition-all, glass, glow or blur', () => {
    for (const css of [tokensCss, globalsCss]) {
      expect(css).not.toMatch(/transition-all/)
      expect(css).not.toMatch(/backdrop-filter|backdrop-blur|blur\(/)
      expect(css).not.toMatch(/glass|glow/i)
    }
  })

  test('no raw colour literals outside the token layer', () => {
    expect(globalsCss, 'globals.css must consume tokens, not raw colours').not.toMatch(
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|%23[0-9a-f]{3,6}/i,
    )
  })

  test('loads only DM Sans — no previous font is imported', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain('DM_Sans')
    expect(layout).not.toMatch(/Space_Grotesk|JetBrains_Mono|\bInter\b/)
  })

  test('no component hardcodes a colour', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
          const src = readFileSync(p, 'utf8')
          if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(src)) offenders.push(p)
        }
      }
    }
    walk(join(frontend, 'components'))
    walk(join(frontend, 'app'))
    expect(offenders, `hardcoded colours in: ${offenders.join(', ')}`).toEqual([])
  })
})
