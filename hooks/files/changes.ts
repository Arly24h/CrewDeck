import type { FileNode, LitView, Theme } from '../../types'
import { CHEVRON_CLOSED, CHEVRON_OPEN, fileIcon, GIT_COLOR } from './icons'
import { activityOf, badgeSegs, pillSegs, tint } from './badges'
import { TONES } from './git'
import type { RowSpec, Seg } from './rows'
import { dirname, inside, relative } from './tree'

// Files grouped under their folders, drawn the way the file tree draws its rows (same glyphs,
// git colors, +N -N and status badge), for an agent's expanded card and the tree's crew view.

export type ChangedFile = {
  /** Absolute, forward-slashed. */
  path: string
  /** One dot per agent that touched it, in that agent's tier color. */
  who?: { color: string; label: string }[]
}

export type ChangeLook = {
  root: string
  git: Record<string, string>
  diff: Record<string, [number, number]>
  theme: Theme
  unicode: boolean
  /** Cells the rows may take. */
  width: number
  /** Row ids are `<prefix><path>`: what a press posts back. */
  prefix: string
  /** Cells of indent before every row. */
  indent?: number
  /** What the tree has lit now: those files shimmer here too, with the tree's pill and tint. */
  lit?: LitView | null
}

export const ADD = '#98c379'
export const DEL = '#e06c75'

const node = (path: string, kind: 'dir' | 'file'): FileNode => ({
  id: path,
  parent: dirname(path),
  name: path.split('/').pop() || path,
  kind,
  hidden: (path.split('/').pop() ?? '').startsWith('.'),
  mtime: 0,
  size: 0,
  loaded: true,
})

// Rows props hold no undefined values: drop the keys left unset.
const clean = (segs: Seg[]): Seg[] => segs.map(seg => Object.fromEntries(Object.entries(seg).filter(([, v]) => v !== undefined)) as Seg)
const tidy = (r: RowSpec): RowSpec => ({ id: r.id, left: clean(r.left), right: clean(r.right), ...(r.bg ? { bg: r.bg } : {}) })

const cut = (s: string, max: number): string => ([...s].length > max ? [...s].slice(0, Math.max(1, max - 1)).join('') + '…' : s)

const lines = (loc: [number, number] | undefined): Seg[] => {
  const out: Seg[] = []
  if (loc && loc[0] > 0) out.push({ t: ` +${loc[0]}`, c: ADD })
  if (loc && loc[1] > 0) out.push({ t: ` -${loc[1]}`, c: DEL })
  return out
}

export const sumLines = (paths: readonly string[], diff: Record<string, [number, number]>): [number, number] =>
  paths.reduce<[number, number]>((acc, p) => [acc[0] + (diff[p]?.[0] ?? 0), acc[1] + (diff[p]?.[1] ?? 0)], [0, 0])


/** A file's type badge (JS, PDF...), as the tree draws it: every glyph set keeps them, a Nerd Font
 * only changes the folders' icons. */
export const fileIconSegs = (path: string, o: Pick<ChangeLook, 'theme'>): Seg[] => badgeSegs(path.split('/').pop() || path, o.theme.bg || undefined)

export function changeRows(files: readonly ChangedFile[], o: ChangeLook): RowSpec[] {
  const pad = ' '.repeat(o.indent ?? 0)
  const byDir = new Map<string, ChangedFile[]>()
  for (const f of files) {
    const dir = dirname(f.path)
    byDir.set(dir, [...(byDir.get(dir) ?? []), f])
  }
  const rows: RowSpec[] = []
  const bright = new Set(o.lit?.bright ?? [])
  const dim = new Set(o.lit?.dim ?? [])
  const toneOf = (path: string) => o.lit?.tones[path] ?? 'orange'
  for (const dir of [...byDir.keys()].sort()) {
    const kids = (byDir.get(dir) ?? []).sort((a, b) => a.path.localeCompare(b.path))
    const label = inside(o.root, dir) ? relative(o.root, dir) || o.root.split('/').pop() || dir : dir
    const caret = o.unicode ? '▾ ' : CHEVRON_OPEN + ' '
    const glyph = o.unicode ? '■ ' : fileIcon(node(dir, 'dir'), true, false) + ' '
    const dirRight = lines(sumLines(kids.map(k => k.path), o.diff))
    const room = Math.max(4, o.width - pad.length - 4 - dirRight.reduce((n, s) => n + s.t.length, 0))
    // A folder whose file is lit shimmers dimmer, as the tree draws it.
    const dirLit = dim.has(dir) || bright.has(dir)
    rows.push({
      id: '',
      left: [
        { t: pad },
        { t: caret, c: o.theme.muted },
        dirLit ? { t: glyph, sh: toneOf(dir), dim: true, one: true, folder: 'open' } : { t: glyph, c: o.theme.accent, folder: 'open' },
        dirLit ? { t: cut(label, room), sh: toneOf(dir), dim: true } : { t: cut(label, room), c: o.theme.fg || undefined },
      ],
      right: dirRight,
    })
    for (const f of kids) {
      const status = o.git[f.path]
      const color = status === 'D' || status === 'U' ? o.theme.urgent : status ? (GIT_COLOR[status] ?? o.theme.muted) : undefined
      // Being read, written or committed now: the tree's shimmer on its name, its pill in place of
      // the status letter, and the row tinted in the color of whoever is at it.
      const isNow = bright.has(f.path)
      const tone = toneOf(f.path)
      const toneColor = TONES[tone]?.solid ?? o.theme.accent
      const ground = o.theme.bg || undefined
      const tail: Seg[] = isNow ? pillSegs(o.lit?.labels[f.path] ?? activityOf(tone).now, toneColor, ground, tone) : [{ t: status ? ` ${status}` : '  ', c: color ?? o.theme.muted, b: true }]
      const right: Seg[] = [...(f.who ?? []).map((w, i): Seg => ({ t: i === 0 ? ' ●' : '●', c: w.color })), ...lines(o.diff[f.path]), ...tail]
      const used = right.reduce((n, s) => n + [...s.t].length, 0)
      const name = f.path.split('/').pop() || f.path
      const icon = fileIconSegs(f.path, o)
      const shown = cut(name, Math.max(4, o.width - pad.length - 6 - 4 - used))
      rows.push({
        id: o.prefix + f.path,
        left: [{ t: pad + '    ' }, ...icon, isNow ? { t: shown, sh: tone, b: true } : { t: shown, c: color ?? (o.theme.fg || undefined), s: status === 'D' }],
        right,
        ...(isNow ? { bg: tint(toneColor, 0.13, ground) } : {}),
      })
    }
  }
  return rows.map(tidy)
}

// The row that opens and closes a list: `▸ 3 changed · 2 read` with the lines changed on the right.
export function toggleRow(id: string, isOpen: boolean, text: string, loc: [number, number], o: Pick<ChangeLook, 'theme' | 'unicode' | 'indent'>): RowSpec {
  const caret = o.unicode ? (isOpen ? '▾ ' : '▸ ') : (isOpen ? CHEVRON_OPEN : CHEVRON_CLOSED) + ' '
  return tidy({
    id,
    left: [{ t: ' '.repeat(o.indent ?? 0) }, { t: caret, c: o.theme.muted }, { t: text, c: o.theme.accent, b: isOpen }],
    right: lines(loc),
  })
}

export const noteRow = (text: string, o: Pick<ChangeLook, 'theme' | 'indent'>): RowSpec => ({
  id: '',
  left: [{ t: ' '.repeat(o.indent ?? 0) + text, c: o.theme.muted }],
  right: [],
})
