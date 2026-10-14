import type { RenderElement } from 'claude-code'

import { UI_FONT } from '../crew'
import type { RowSpec, Seg } from './rows'

// The tree's rows drawn as the surface's own elements rather than in a `rows.tsx` Client. The
// terminal uses them where the keyboard must reach every row (an agent's card); the app uses them
// everywhere, because only here can a row hold pictures: an outline folder, a rounded chip, a name
// whose shimmer is an animated picture. Pure: no `$`, the caller hands the presses in.

// The element constructors this draws with; `Svg` only where the surface has it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = (props: any) => RenderElement
export type NativeUi = { Box: El; Text: El; Button: El; Svg?: El }

export type NativeOpts = {
  /** The app: folders, chips and lit names as pictures. */
  pictures: boolean
  tones: Record<string, { bright: string[]; dim: string[] }>
  /** The selected row, drawn on `activeBg`. */
  active?: string
  activeBg?: string
  /** The row under the pointer (the app only). */
  hoverBg?: string
  /** The rows' width in cells: how much blank the Button over an app row may hold. */
  cols?: number
  /** The indent guides' color, in the app; absent, none. */
  guide?: string
  /** Each row's Button key: what a press is addressed by. */
  keyOf: (r: RowSpec, i: number) => string
  onPress?: (r: RowSpec) => void
  hotkey?: (r: RowSpec, i: number) => string | undefined
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A rounded chip with a word on it: a file's TS badge (fixed width, so names line up) or a pill.
 * Given a tone's palette, its word pulses through it, as the tree's pill does. */
export const chipSvg = (text: string, fg: string, bg: string, width?: number, pulse?: readonly string[]): { source: string; w: number; h: number } => {
  const h = 18
  const w = width ?? Math.round([...text].length * 6.3 + 16)
  const anim = pulse?.length ? `<animate attributeName="fill" values="${[...pulse, ...[...pulse].reverse()].join(';')}" dur="1.2s" repeatCount="indefinite"/>` : ''
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="5" fill="${bg}"/><text x="${w / 2}" y="12.6" text-anchor="middle" font-family="${UI_FONT}" font-size="10.5" font-weight="700" fill="${fg}">${xml(text)}${anim}</text></svg>`,
    w,
    h,
  }
}

// One level of the app's indent, in pixels, and a row's height: the indent and the caret are one
// picture, so a guide falls exactly under the caret of the folder it belongs to, row after row.
const INDENT_PX = 12
const ROW_PX = 19

/** The indent of a row `depth` folders deep, a line down each level, then its caret (▾, ▸ or none). */
export const leadSvg = (depth: number, caret: '' | 'open' | 'closed', caretColor: string, guide?: string): { source: string; w: number; h: number } => {
  const w = depth * INDENT_PX + INDENT_PX
  const h = ROW_PX
  const lines = guide ? Array.from({ length: depth }, (_, k) => `<rect x="${k * INDENT_PX + 5}" y="0" width="1" height="${h}" fill="${guide}"/>`).join('') : ''
  const x = depth * INDENT_PX + 5.5
  const y = h / 2
  const mark =
    caret === 'open'
      ? `<path d="M${x - 3.5} ${y - 2}L${x + 3.5} ${y - 2}L${x} ${y + 2.5}Z" fill="${caretColor}"/>`
      : caret === 'closed'
        ? `<path d="M${x - 2} ${y - 3.5}L${x - 2} ${y + 3.5}L${x + 2.5} ${y}Z" fill="${caretColor}"/>`
        : ''
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines}${mark}</svg>`, w, h }
}

/** An outline folder, open or closed, in `color`. */
export const folderSvg = (open: boolean, color: string): { source: string; w: number; h: number } => {
  const line = `fill="none" stroke="${color}" stroke-width="1.35" stroke-linejoin="round"`
  const body = open
    ? `<path d="M1.6 11V3.3c0-.7.5-1.2 1.2-1.2h3.3l1.6 1.6h5c.7 0 1.2.5 1.2 1.2V6" ${line}/><path d="M1.6 11.5l1.8-4.6c.2-.5.6-.8 1.1-.8h10.1c.6 0 1 .6.8 1.1l-1.7 4.3c-.2.5-.6.8-1.1.8H2.5c-.6 0-1-.4-.9-.8z" ${line}/>`
    : `<path d="M1.6 3.3c0-.7.5-1.2 1.2-1.2h3.3l1.6 1.6h5.6c.7 0 1.2.5 1.2 1.2v6.4c0 .7-.5 1.2-1.2 1.2H2.8c-.7 0-1.2-.5-1.2-1.2z" ${line}/>`
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="14" viewBox="0 0 17 14">${body}</svg>`, w: 18, h: 14 }
}

/** A name with the tree's shimmer running over it: a bright band sweeping through its tone. */
export const shimmerSvg = (text: string, palette: readonly string[], bold: boolean): { source: string; w: number; h: number } => {
  const h = 18
  const w = Math.round([...text].length * 7.4 + 6)
  const [base = '#888', , mid = base, top = mid] = palette
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${base}"/><stop offset=".38" stop-color="${base}"/><stop offset=".5" stop-color="${top}"/><stop offset=".62" stop-color="${base}"/><stop offset="1" stop-color="${base}"/><animateTransform attributeName="gradientTransform" type="translate" values="-1 0;1 0" dur="1.6s" repeatCount="indefinite"/></linearGradient></defs><text x="1" y="13" font-family="${UI_FONT}" font-size="13" font-weight="${bold ? 600 : 400}" fill="url(#s)">${xml(text)}</text></svg>`,
    w,
    h,
  }
}

const textEl = (ui: NativeUi, g: Seg, key: string): RenderElement => (
  <ui.Text key={key} color={g.c} backgroundColor={g.bg} bold={g.b} strikethrough={g.s} italic={g.i}>
    {g.t}
  </ui.Text>
)

export function nativeRows(ui: NativeUi, rows: readonly RowSpec[], o: NativeOpts): RenderElement[] {
  const { Box, Text, Button, Svg } = ui
  const pictures = o.pictures && Svg !== undefined
  const palette = (g: Seg) => (g.sh ? (g.dim ? o.tones[g.sh]?.dim : o.tones[g.sh]?.bright) : undefined)
  const solid = (g: Seg) => g.c ?? palette(g)?.[0] ?? '#9ca3af'
  return rows.map((r, i) => {
    const bg = r.id && r.id === o.active ? o.activeBg : r.bg
    const key = o.keyOf(r, i)
    const press = r.id && o.onPress ? () => o.onPress?.(r) : undefined
    // In the app the right side's runs sit a gap apart, so their own leading spaces go.
    const right = r.right
      .filter(g => !pictures || g.t.trim())
      .map((g, n) =>
        pictures && g.chip ? (
          <Svg key={`c${n}`} {...pic(chipSvg(g.t.trim(), solid(g), g.bg ?? '#2a2a2a', undefined, palette(g)), g.t.trim())} />
        ) : (
          textEl(ui, pictures ? { ...g, t: g.t.trim() } : g, `t${n}`)
        ),
      )
    if (!pictures) {
      // The terminal: the whole left side is one Button, its runs Text, so Tab, Enter and a digit reach it.
      const left = r.left.map((g, n) => textEl(ui, g, `s${n}`))
      return (
        <Box key={`r${i}`} flexDirection="row" height={1} overflow="hidden" backgroundColor={bg}>
          <Box flexShrink={1} overflow="hidden">
            {press ? (
              <Button key={key} plain hotkey={o.hotkey?.(r, i)} onPress={press}>
                {left}
              </Button>
            ) : (
              <Text wrap="truncate-end">{left}</Text>
            )}
          </Box>
          <Box flexGrow={1} />
          {right.length > 0 && <Text>{right}</Text>}
        </Box>
      )
    }
    // The app: indent and caret, the icon (a folder or the file's chip), then the name, or while
    // it is lit the shimmering picture of itself. Only a Button takes a press and it holds only
    // text, so the row is drawn as it looks and an empty Button is laid over all of it: a click
    // anywhere on the row, caret, icon and name included, is the row's.
    const iconAt = r.left.findIndex(g => g.folder || g.chip)
    const lead = r.left.slice(0, Math.max(0, iconAt))
    const icon = iconAt >= 0 ? r.left[iconAt] : undefined
    const rest = r.left.slice(iconAt + 1).filter(g => g.t.trim() || !icon)
    const lit = rest.find(g => g.sh)
    const name = rest.map(g => g.t).join('').trim()
    // The indent (spaces, two to a level) and the caret, drawn as one picture with the guides.
    const indent = lead[0] && /^[ │]*$/.test(lead[0].t) ? lead[0] : undefined
    const caretSeg = indent ? lead[1] : lead[0]
    const caret = caretSeg && /[▾⌄]/.test(caretSeg.t) ? 'open' : caretSeg && /[▸◂›]/.test(caretSeg.t) ? 'closed' : ''
    const depth = indent ? Math.round(indent.t.length / 2) : 0
    const leadEl =
      lead.length > 0 ? (
        <Svg key="lead" {...pic(leadSvg(depth, caret, caretSeg?.c ?? '#808a96', o.guide), caret ? (caret === 'open' ? 'open' : 'closed') : 'indent')} />
      ) : null
    const label = lit ? (
      <Svg key="lit" {...pic(shimmerSvg(name, palette(lit) ?? ['#888'], Boolean(lit.b)), name)} />
    ) : (
      <Text key="name" wrap="truncate-end">
        {rest.map((g, n) => textEl(ui, g, `n${n}`))}
      </Text>
    )
    const cover = press ? (
      <Box key="press" position="absolute" top={0} left={0} right={0} bottom={0} flexDirection="column" alignItems="stretch">
        {/* No label (the app would draw it over the row) and blank children: stretched across
            the row by its column, and never wider than it, so the app has nothing to cut short
            with an ellipsis. */}
        <Button key={key} plain hotkey={o.hotkey?.(r, i)} onPress={press} hover={{ color: 'transparent', backgroundColor: 'transparent' }}>
          <Text color="transparent">{blankOf(o.cols)}</Text>
        </Button>
      </Box>
    ) : null
    return (
      <Box
        key={`row:${key}`}
        flexDirection="row"
        alignItems="center"
        overflow="hidden"
        backgroundColor={bg}
        {...(press && o.hoverBg && !bg ? { hover: { backgroundColor: o.hoverBg } } : {})}
      >
        <Box flexDirection="row" alignItems="center" flexShrink={1} overflow="hidden" gap={1}>
          {leadEl}
          {icon?.folder && <Svg key="icon" {...pic(folderSvg(icon.folder === 'open', solid(icon)), 'folder')} />}
          {icon?.chip && <Svg key="icon" {...pic(chipSvg(icon.t.trim(), solid(icon), icon.bg ?? '#2a2a2a', 30), icon.t.trim())} />}
          {label}
        </Box>
        <Box flexGrow={1} />
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          {right}
        </Box>
        {cover}
      </Box>
    )
  })
}

// What fills the Button over an app row: blank, about half the row, so it never runs past it.
const blankOf = (cols = 40): string => '\u2007'.repeat(Math.max(4, Math.floor(cols * 0.5)))

const pic = (p: { source: string; w: number; h: number }, alt: string) => ({ source: p.source, alt: alt || 'icon', width: p.w, height: p.h })
