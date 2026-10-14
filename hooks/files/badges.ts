import { mix } from '../crew'
import { fileTypeOf } from './filetypes'
import type { Seg } from './rows'

// The tree's app look: a short colored badge for each file's type (JS, PDF, CSV...) and a pill for
// what is happening to a file right now (reading, editing, committed) or what happened to it.

/** `color` laid thinly over a dark ground: the fill behind a badge, a pill or a lit row. */
export const tint = (color: string, amount = 0.2, ground = '#1d1d1c'): string =>
  mix(/^#[0-9a-f]{6}$/i.test(ground) ? ground : '#1d1d1c', color, amount)

export const badgeOf = (name: string): readonly [label: string, color: string] => fileTypeOf(name)

/** A file's badge, three cells of label centered in a five-cell chip, then a space. */
export const badgeSegs = (name: string, ground?: string): Seg[] => {
  const [label, color] = badgeOf(name)
  const w = 3
  const left = Math.floor((w - [...label].length) / 2)
  const text = ' ' + ' '.repeat(Math.max(0, left)) + label + ' '.repeat(Math.max(0, w - [...label].length - left)) + ' '
  return [{ t: text, c: color, bg: tint(color, 0.16, ground), b: true, chip: true }, { t: ' ' }]
}

/** A pill on a row's right: what is happening (`reading`) or happened (`Opened`). Given the row's
 * shimmer `tone`, its text pulses with the shimmer passing over the name. */
export const pillSegs = (label: string, color: string, ground?: string, tone?: string): Seg[] => [
  { t: ' ' },
  tone ? { t: ` ${label} `, sh: tone, one: true, bg: tint(color, 0.24, ground), b: true, chip: true } : { t: ` ${label} `, c: color, bg: tint(color, 0.24, ground), b: true, chip: true },
]

// What a shimmer tone means for a file, as the pill says it now and as the touched card keeps it.
export const activityOf = (tone: string): { now: string; past: string; rank: number } => {
  if (tone === 'purple' || tone.endsWith('-read')) return { now: 'reading', past: 'Opened', rank: 1 }
  if (tone === 'green') return { now: 'committed', past: 'Committed', rank: 3 }
  if (tone === 'teal') return { now: 'pushed', past: 'Pushed', rank: 3 }
  if (tone === 'blue') return { now: 'synced', past: 'Synced', rank: 2 }
  if (tone === 'red') return { now: 'reverted', past: 'Reverted', rank: 2 }
  return { now: 'editing', past: 'Edited', rank: 2 }
}
