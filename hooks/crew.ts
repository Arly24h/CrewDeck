// What the two halves of crewdeck share: pane ids, the agent tiers and their colors, color math,
// and the files an agent touched. Pure: no `$` here (the validator only follows `$` within a file).

import type { AgentFile } from '../types'

/** The agents panel's own pane id; the file tree's is `filetree`. Both draw as halves of the `crewdeck` pane. */
export const AGENTS_PANE = 'crewdeck-agents'
export const FILES_PANE = 'filetree'
/** The one panel the commands open: the agents on top, the file tree below. Claude Code shows one
 * panel of a sidebar at a time, the rest as tabs; one panel keeps both on screen. */
export const DECK_PANE = 'crewdeck'
export const DECK_TITLE = 'Crewdeck'

/** The split of the deck's body, as the agents' part was last drawn: the file tree below takes the
 * rows it leaves (and a divider). Set by the agents' render, which runs first, then the tree's. */
export const deck = { agentsRows: 0 }

export const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

// A tier is named by a `savvy-<tier>` agent type (`savvy-careful`, or `plugin:savvy-careful`); any other
// agent type has none (`other`) and is colored by its job instead (colorTierOf).
export const tierOfType = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return Object.hasOwn(TIER_COLOR, t) && bare.startsWith('savvy-') ? t : 'other'
}

/** The tiers a plan can name, in order from the strongest. */
export const TIERS: readonly string[] = Object.keys(TIER_COLOR).filter(t => t !== 'other')

const hex = (c: string): number[] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) || 0)
const css = (rgb: number[]): string => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** `a` moved toward `b` by `t` (0 to 1). */
export const mix = (a: string, b: string, t: number): string => {
  const x = hex(a)
  const y = hex(b)
  return css(x.map((v, i) => v + ((y[i] ?? 0) - v) * t))
}

// The file tree's shimmer tones for each tier: `tier-<tier>` for an agent's writes, and the paler
// `tier-<tier>-read` for its reads, built the way the tree's own tones are (bright to white, dim to dark).
export const TIER_TONES: Record<string, { bright: string[]; dim: string[]; solid: string }> = Object.fromEntries(
  Object.entries(TIER_COLOR).flatMap(([tier, c]) => {
    const read = mix(c, '#ffffff', 0.35)
    const tone = (base: string) => ({
      bright: [base, mix(base, '#ffffff', 0.25), mix(base, '#ffffff', 0.5), mix(base, '#ffffff', 0.85)],
      dim: [mix(base, '#000000', 0.55), mix(base, '#000000', 0.4), mix(base, '#000000', 0.25), mix(base, '#000000', 0.1)],
      solid: base,
    })
    return [
      [`tier-${tier}`, tone(c)],
      [`tier-${tier}-read`, tone(read)],
    ]
  }),
)

// Basename of a path, for the short file list on an agent's card.
export const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p

// An agent that is not a savvy worker (Explore, Plan, general-purpose, one of your own) has no tier:
// its job until its name or its tools say otherwise, and the color it is drawn in, its job's.
export const defaultJobOf = (type: string): string => (/explore|review/i.test(type) ? 'explore' : /plan/i.test(type) ? 'fable' : 'light')

/** The tier key an agent is colored by: its savvy tier, or else its job's (the reviewer's grey). */
export const colorTierOf = (type: string, job?: string): string => {
  const tier = tierOfType(type)
  if (tier !== 'other') return tier
  const j = job ?? defaultJobOf(type)
  return Object.hasOwn(TIER_COLOR, j) ? j : 'other'
}

/** A color laid faintly over the pane's dark ground: the hover behind a row. */
/** The selected row's ground: the selection color, softened toward the panel. */
export const soft = (color: string): string => mix('#262626', /^#[0-9a-f]{6}$/i.test(color) ? color : '#6b7280', 0.55)

export const faint = (color: string): string => mix('#262626', /^#[0-9a-f]{6}$/i.test(color) ? color : '#6b7280', 0.3)

/** A path with forward slashes, as the file tree keys its rows. */
export const slashed = (p: string): string => p.replace(/\\/g, '/')

/** The file a Read, Write, Edit or NotebookEdit call names, or an empty string for any other call. */
export const filePathOf = (e: unknown): string => {
  const input = (e ?? {}) as { file_path?: unknown; notebook_path?: unknown }
  return typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
}

// The files on an agent's card, newest first. Edits are what the card and the crew view are for,
// so they are never pushed out by reading: reads keep only the newest few.
const MAX_EDITS = 500
const MAX_READS = 40
export const noteFiles = (files: readonly AgentFile[] = [], paths: readonly string[], isEdit: boolean): AgentFile[] => {
  let out = [...files]
  for (const raw of paths) {
    const path = slashed(raw)
    const prev = out.find(f => f.path === path)
    out = [{ path, isEdit: isEdit || prev?.isEdit === true }, ...out.filter(f => f.path !== path)]
  }
  const edits = out.filter(f => f.isEdit).slice(0, MAX_EDITS)
  const reads = out.filter(f => !f.isEdit).slice(0, MAX_READS)
  const keep = new Set([...edits, ...reads])
  return out.filter(f => keep.has(f))
}

/** Whether noting these paths would change nothing: each already first among them, with that kind. */
export const notesNothing = (files: readonly AgentFile[] = [], paths: readonly string[], isEdit: boolean): boolean =>
  paths.length === 1 && files[0]?.path === slashed(paths[0] ?? '') && (files[0]?.isEdit || !isEdit)

/** The app's UI font, for the few words drawn inside pictures (chips); the rest is the app's own text. */
export const UI_FONT = "'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
