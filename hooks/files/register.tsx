import { type BuiltinToolResults, type EngineInterface, type Register, type Timer, update } from 'claude-code'
import { LINUX_LAUNCH, openCommand, openWithCommand } from './open'
import type { ButtonProps, ChipLook } from './button'

import type { Activity, FileNode, FileTree, LitView, Theme, TouchedFile } from '../../types'
import { AGENTS_PANE, colorTierOf, deck, DECK_PANE, DECK_TITLE, filePathOf, faint, mix, noteFiles, soft, TIER_COLOR, UI_FONT } from '../crew'
import { ADD as ADD_COLOR, changeRows, type ChangedFile, DEL as DEL_COLOR, fileIconSegs, noteRow } from './changes'
import { activityOf, badgeSegs, pillSegs, tint } from './badges'
import { BRANCH_ICON, chainOf, type GitAction, gitActions, readOnly, readTargets, resolve, SHIMMER, TONES } from './git'
import { nativeRows } from './native'
import type { RowSpec, RowsProps, Seg } from './rows'
import { CHEVRON_CLOSED, CHEVRON_OPEN, fileIcon, GIT_COLOR } from './icons'
import {
  age,
  ancestorsOf,
  type Change,
  DEFAULT_THEME,
  dirname,
  emptyTree,
  formatSize,
  inside,
  isAbsolute,
  join,
  mapper,
  parseGit,
  parseNumstat,
  parseTheme,
  posix,
  relative,
  dropBelow,
  useDrives,
  rollCounts,
  replaceChildren,
  rollUp,
  stamp,
  toNodes,
  underAny,
  visibleRows,
} from './tree'

const TREE = { plugin: 'crewdeck', key: 'tree' } as const
const THEME = { plugin: 'crewdeck', key: 'theme' } as const
const ACTIVITY = { plugin: 'crewdeck', key: 'activity' } as const
const AGENTS = { plugin: 'crewdeck', key: 'agents' } as const
// Just the git status and line counts, for the agents pane's open cards: it reads this, not the
// whole tree, so a scroll or a keystroke in search doesn't redraw it.
const GITVIEW = { plugin: 'crewdeck', key: 'gitview' } as const
let lastGit: { root: string; git: FileTree['git']; diff: FileTree['diff'] } | null = null
// What is lit, apart too: an agent's open card shimmers the files the tree shimmers.
const LIT = { plugin: 'crewdeck', key: 'lit' } as const
const UNLIT: LitView = { bright: [], dim: [], tones: {}, labels: {} }
let lastLit: LitView | null = null
const litOf = (t: FileTree): LitView => (t.flashOn ? { bright: t.flash, dim: t.flashDim, tones: t.flashTones, labels: t.flashLabels ?? {} } : UNLIT)
const PANE = 'filetree'
const BRANCH_ROW = '#branch'
const FLASH_MS = 2700
const RUNNING_MAX_MS = 600_000
const NO_REPO_DEPTH = 4
const DOUBLE_MS = 450
const FIND_LIMIT = 200
const ROWS_BUDGET = 80_000
const READ_REVEAL_LIMIT = 12
// Files the touched card remembers, and how many it shows before "+N more".
const TOUCHED_KEEP = 60
const TOUCHED_SHOWN = 5
const SEARCH_REVEAL_LIMIT = 60
const ACTIVITY_TTL_MS = 45_000
const THEME_FILE = '.local/state/omarchy/current/theme/colors.toml'
const THEME_POLL_MS = 2000
const FONT_SCRIPT =
  'if command -v fc-list >/dev/null 2>&1; then f=$(fc-list ":charset=$1" file | head -n1 | cut -d: -f1); ' +
  'else f=$(ls "$HOME"/Library/Fonts/*Nerd* /Library/Fonts/*Nerd* 2>/dev/null | head -n1); fi; ' +
  '[ -n "$f" ] || { echo missing; exit 0; }; m=$(stat -c %Z "$f" 2>/dev/null || stat -f %c "$f"); p=$PPID; ' +
  'while [ -n "$p" ] && [ "$p" -gt 1 ]; do c=$(ps -o comm= -p "$p" 2>/dev/null); c=$(basename "$c" 2>/dev/null | tr -d " "); case "$c" in ' +
  'ghostty|kitty|alacritty|Alacritty|foot|footclient|wezterm-gui|konsole|gnome-terminal-|xterm|urxvt|st|Terminal|iTerm2) ' +
  'e=$(ps -o etime= -p "$p" 2>/dev/null | awk -F\'[-:]\' \'{n=NF; s=$n+60*$(n-1); if (n>2) s+=3600*$(n-2); if (n>3) s+=86400*$(n-3); print s}\'); [ -n "$e" ] && [ $(( $(date +%s) - e )) -lt "$m" ] && echo stale || echo ok; exit 0;; esac; ' +
  'p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d " "); done; echo ok'
const PRUNE = ['.git', 'node_modules', 'target', '.venv', '__pycache__', 'dist', '.next']
const HOME_PRUNE = ['Library', 'AppData', '.Trash']
const SIZE_TIMEOUT_MS = 15_000
const SIZE_JOBS = 2
const SIZE_WALK_LIMIT = 50_000
const AGE_TICK_MS = 60_000

let blink: Timer | null = null
let themePoll: Timer | null = null
let ageTick: Timer | null = null
let themeMtime: number | null = null
let generation = 0
let lastPress = { key: '', at: 0 }
let noNerd = false
let glyphSetting = 'auto'
// The app's Crewdeck panel draws its rows natively, with pictures; `classic` keeps the cell rows.
let appPictures = true
// A tip's ground in the app: a little lighter than the panel.
const TIP_BG = '#2c2c2f'
// The header buttons that switch something on and off.
const TOGGLES = new Set(['cwd', 'hidden', 'size', 'crew'])
// The few pixels between a button and its tip, under the row the tip is moved down by.
const TIP_GAP_PX = 8
const TIP_GAP = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${TIP_GAP_PX}"/>`
// The app's branch pill: a branch mark in `mark`, the name, then ↑ ahead and ↓ behind.
const branchPill = (name: string, ahead: number, behind: number, mark: string, fg: string): { source: string; w: number; h: number } => {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const h = 20
  const textPx = (t: string) => (tipCells(t) / 1.53) * 11.5
  const extra = `${ahead > 0 ? ` ↑${ahead}` : ''}${behind > 0 ? ` ↓${behind}` : ''}`
  const w = Math.round(26 + textPx(name) + textPx(extra) + 12)
  const icon = `<g fill="none" stroke="${mark}" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="6" r="1.7"/><circle cx="11" cy="14" r="1.7"/><circle cx="17" cy="7" r="1.7"/><path d="M11 7.7v4.6M17 8.7c0 2.6-6 1.6-6 3.6"/></g>`
  const parts = `<tspan fill="${fg}">${esc(name)}</tspan>${ahead > 0 ? `<tspan fill="${TONES.teal?.solid ?? '#2bb3a0'}"> ↑${ahead}</tspan>` : ''}${behind > 0 ? `<tspan fill="${TONES.blue?.solid ?? '#5b9bd5'}"> ↓${behind}</tspan>` : ''}`
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="10" fill="${mix('#262626', mark, 0.22)}"/>${icon}<text x="26" y="14" font-family="${UI_FONT}" font-size="11.5" font-weight="600">${parts}</text></svg>`,
    w,
    h,
  }
}

// How wide a tip's words are in the app's font, in the cells a width is given in: a sans font's
// letters by their rough widths in em (about 12px, against cells about 8px wide).
const tipCells = (text: string): number => {
  let em = 0
  for (const ch of text) em += " ijl.,:;'|!ftrI".includes(ch) ? 0.3 : 'mwMW'.includes(ch) ? 0.85 : ch !== ch.toLowerCase() ? 0.66 : 0.55
  return em * 1.53
}
let openWithSetting = ''
let previewed: { path: string; text: string; note: string } | null = null
let previewRows = 20
let follow = true
let followClaude = true
let scanning: Promise<void> | null = null
let scanJobs: Job[] = []
let gitRun: Promise<void> | null = null
let gitNext: Promise<void> | null = null
// Files a shell command read, each with the tone of whoever ran it (Claude's purple, or an agent's).
let queuedReads: (readonly [path: string, tone: string])[] = []
let showReads = true
let showWrites = true
let searchIndex: { root: string; paths: Promise<string[]> } | null = null
let activityId = 0
let pointer = true
let hovered = ''
// The window the terminal draws over the tree's rows, or the crew view's: its first row, its
// last first row, and the rows a page key moves.
let view = { from: 0, max: 0, page: 10 }
let nativeScroll = false
let lastSync = 0
let noDock = false
// The person's own choice (Open at start: off), which an app joining never overrides.
let startOff = false
let home = ''
let platform: Promise<'linux' | 'darwin' | 'win32'> | null = null
let dirty: { root: string; files: Record<string, Change> } = { root: '', files: {} }
let markId = 0
let listSeq = 0
let lastRoot = ''
let sizeDefault = false
let showAge = false
let showHints = true
let sizeEpoch = 0
let sizeActive = 0
let sizeQueue: string[] = []
const sizing = new Set<string>()
const listLatest = new Map<string, number>()
const unreadable = new Set<string>()
const background = new Map<string, Background>()

function osName($: EngineInterface): Promise<'linux' | 'darwin' | 'win32'> {
  platform ??= (async () => {
    if ((await $.env.get('OS')) === 'Windows_NT') return 'win32'
    try {
      return (await $.process.run(['uname', '-s'], { timeoutMs: 3_000 })).stdout.trim() === 'Darwin' ? 'darwin' : 'linux'
    } catch {
      return 'linux'
    }
  })()
  return platform
}

async function cwdOf($: EngineInterface): Promise<string> {
  return posix(await $.session.cwd())
}

function clean(segs: Seg[]): Seg[] {
  for (const seg of segs) for (const k of Object.keys(seg) as (keyof Seg)[]) if (seg[k] === undefined) delete seg[k]
  return segs
}


async function get($: EngineInterface): Promise<FileTree> {
  return { ...emptyTree(''), ...(await $.state.get(TREE)).value }
}

async function put($: EngineInterface, fn: (t: FileTree) => FileTree): Promise<void> {
  let written: FileTree | null = null
  await update($, TREE, cur => (written = fn({ ...emptyTree(''), ...cur })))
  const t = written as FileTree | null
  if (!t) return
  if (!lastGit || lastGit.root !== t.root || lastGit.git !== t.git || lastGit.diff !== t.diff) {
    const view = { root: t.root, git: t.git, diff: t.diff }
    lastGit = view
    await update($, GITVIEW, () => view)
  }
  const lit = litOf(t)
  if (!lastLit || lastLit.bright !== lit.bright || lastLit.dim !== lit.dim || lastLit.tones !== lit.tones || lastLit.labels !== lit.labels) {
    lastLit = lit
    await update($, LIT, () => lit)
  }
}

function patch($: EngineInterface, fn: (t: FileTree) => Partial<FileTree>) {
  return put($, t => ({ ...t, ...fn(t) }))
}

async function activities($: EngineInterface): Promise<Activity[]> {
  return (await $.state.get(ACTIVITY)).value ?? []
}

async function setActivities($: EngineInterface, fn: (list: Activity[]) => Activity[]): Promise<void> {
  await update($, ACTIVITY, cur => fn(cur ?? []).slice(-6))
}

async function list($: EngineInterface, dir: string): Promise<FileNode[] | null> {
  try {
    const entries = await $.fs.list(dir)
    const resolved = await Promise.all(
      entries.map(async e => {
        if (!e.isLink) return { name: e.name, kind: e.kind, mtimeMs: e.mtimeMs, size: e.size, isLink: false }
        try {
          const target = await $.fs.stat(join(dir, e.name))
          return target.kind === 'dir'
            ? { name: e.name, kind: 'dir' as const, mtimeMs: target.mtimeMs, size: 0, isLink: false }
            : { name: e.name, kind: 'file' as const, mtimeMs: target.mtimeMs, size: target.size, isLink: true }
        } catch {
          return { name: e.name, kind: 'other' as const, mtimeMs: 0, size: 0, isLink: true }
        }
      }),
    )
    unreadable.delete(dir)
    return toNodes(dir, resolved)
  } catch (err) {
    if (!(await exists($, dir))) return []
    if (!unreadable.has(dir)) {
      unreadable.add(dir)
      $.ui.toast(`could not list ${shortPath(dir)}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return null
  }
}

async function loadDirs($: EngineInterface, dirs: string[]): Promise<Map<string, FileNode[]>> {
  const root = (await get($)).root
  const seq = ++listSeq
  for (const dir of dirs) listLatest.set(dir, seq)
  const results = await Promise.all(dirs.map(async dir => [dir, await list($, dir)] as const))
  const listed = new Map<string, FileNode[]>()
  for (const [dir, kids] of results) {
    if (listLatest.get(dir) !== seq) continue
    listLatest.delete(dir)
    if (kids) listed.set(dir, kids)
  }
  await patch($, t => (t.root === root ? { nodes: replaceChildren(t.nodes, listed) } : {}))
  return listed
}

async function git($: EngineInterface, cwd: string, args: string[], timeoutMs = 20_000) {
  return $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs, env: { GIT_OPTIONAL_LOCKS: '0' } })
}

async function detectRepo($: EngineInterface): Promise<void> {
  const t = await get($)
  if (!t.root) return
  let top = ''
  let prefix = ''
  try {
    const run = await git($, t.root, ['rev-parse', '--show-prefix', '--show-toplevel'], 5_000)
    const [p = '', tl = ''] = run.exitCode === 0 ? run.stdout.split('\n') : []
    prefix = p.trim()
    top = tl.trim()
  } catch {
    top = ''
  }
  await patch($, cur => (cur.root === t.root ? { top, prefix } : {}))
}

async function readGit($: EngineInterface): Promise<void> {
  const t = await get($)
  if (!t.root || !t.top) return
  const root = t.root
  try {
    const status = await git($, root, ['status', '--porcelain=v1', '-b', '-z', '--ignored=traditional', '--untracked-files=normal', '--', '.'])
    if (status.exitCode !== 0) return
    const parsed = parseGit(status.stdout, root, t.prefix)
    const diff: Record<string, [number, number]> = {}
    const head = await git($, root, ['diff', 'HEAD', '--numstat', '-z', '--', '.'])
    if (head.exitCode === 0) parseNumstat(head.stdout, root, t.prefix, diff)
    const files = { ...parsed.files }
    if (parsed.untrackedDirs.length) {
      const others = await git($, root, ['ls-files', '-o', '--exclude-standard', '-z', '--', ...parsed.untrackedDirs.map(d => d.slice(root.length + 1) || '.')])
      if (others.exitCode === 0) for (const rel of others.stdout.split('\0').filter(Boolean)) files[join(root, rel)] = 'new'
    }
    for (const path of Object.keys(diff)) if (files[path] === 'new') delete diff[path]
    dirty = { root, files }
    await patch($, cur =>
      cur.root === root
        ? {
            git: parsed.git,
            ignored: parsed.ignored,
            untrackedDirs: parsed.untrackedDirs,
            branch: parsed.branch,
            counts: rollCounts(files, root),
            diff: rollUp(diff, root),
          }
        : {},
    )
  } catch {
    return
  }
}

function refreshGit($: EngineInterface): Promise<void> {
  if (!gitRun) {
    gitRun = readGit($).finally(() => {
      gitRun = null
    })
    return gitRun
  }
  const rerun = () => {
    gitNext = null
    return refreshGit($)
  }
  gitNext ??= gitRun.then(rerun, rerun)
  return gitNext
}

async function reset($: EngineInterface, root: string, focus = false): Promise<void> {
  const prev = await get($)
  generation += 1
  blink?.cancel()
  blink = null
  lastRoot = root
  searchIndex = null
  sizeEpoch += 1
  sizeQueue = []
  await put($, () => ({ ...emptyTree(root), showHidden: prev.showHidden, showSize: prev.root ? prev.showSize : sizeDefault }))
  // The tree opens as the bottom of the one Crewdeck panel, under the agents.
  if (focus) await $.ui.open({ id: DECK_PANE, title: DECK_TITLE, focus: true })
  else if (!noDock) await $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
  await loadDirs($, [root])
  await detectRepo($)
  await refreshGit($)
}

async function revealPaths($: EngineInterface, paths: string[]): Promise<void> {
  const tried = new Set<string>()
  for (let pass = 0; pass < 32; pass++) {
    const t = await get($)
    const loaded = new Set(t.nodes.filter(n => n.loaded).map(n => n.id))
    if (t.nodes.some(n => n.parent === t.root)) loaded.add(t.root)
    const need = new Set<string>()
    for (const p of paths) {
      for (const dir of [t.root, ...ancestorsOf(p, t.root).reverse()]) {
        if (!loaded.has(dir)) {
          if (!tried.has(dir)) need.add(dir)
          break
        }
      }
    }
    if (need.size === 0) return
    for (const dir of need) tried.add(dir)
    await loadDirs($, [...need])
  }
}

function pruneArgs(root: string, ignored: string[] = []): string[] {
  const names = broad(root) ? [...PRUNE, ...HOME_PRUNE] : PRUNE
  return ['(', ...names.flatMap((name, i) => (i === 0 ? ['-name', name] : ['-o', '-name', name])), ...ignored.flatMap(p => ['-o', '-path', p]), ')', '-prune', '-o']
}

async function newer($: EngineInterface, paths: string[], sinceMs: number): Promise<string[]> {
  const stats = await Promise.all(
    paths.map(async p => {
      try {
        return (await $.fs.stat(p)).mtimeMs > sinceMs ? p : ''
      } catch {
        return ''
      }
    }),
  )
  return stats.filter(Boolean)
}

function broad(root: string): boolean {
  return root === home || root === '/' || /^[A-Za-z]:\/$/.test(root)
}

function rootOfDisk(root: string): boolean {
  return root === '/' || /^[A-Za-z]:\/$/.test(root)
}

async function changedSince($: EngineInterface, root: string, since: Since, depth: number, ignored: string[] = []): Promise<string[]> {
  if (rootOfDisk(root)) return []
  const test = since.mark ? ['-newer', since.mark] : ['-newermt', `@${(since.ms / 1000).toFixed(3)}`]
  try {
    const run = await $.process.run(['find', '-H', root, '-xdev', ...(depth ? ['-maxdepth', String(depth)] : []), ...pruneArgs(root, ignored.filter(p => inside(root, p)).slice(0, 40)), ...test, '-print0'], { timeoutMs: 8_000 })
    return run.stdout.split('\0').filter(p => p && p !== root)
  } catch {
    return []
  }
}

async function changedInRepo($: EngineInterface, root: string, since: Since, before: Record<string, Change>, ignored: string[]): Promise<{ hits: string[]; gone: string[] }> {
  if (since.os !== 'win32') return { hits: await changedSince($, root, since, 0, ignored), gone: [] }
  if (dirty.root !== root) return { hits: [], gone: [] }
  const entries = Object.entries(dirty.files)
  const gone = entries.filter(([p, c]) => c === 'del' && before[p] !== 'del').map(([p]) => p)
  const live = entries.filter(([, c]) => c !== 'del').map(([p]) => p)
  return { hits: await newer($, live.slice(0, 4_000), since.ms), gone }
}

type Since = { ms: number; mark: string; os: 'linux' | 'darwin' | 'win32' }

async function sinceNow($: EngineInterface, writes: boolean): Promise<Since> {
  const ms = await $.clock.now()
  const os = await osName($)
  if (os !== 'darwin' || !writes) return { ms, mark: '', os }
  const mark = `${((await $.env.get('TMPDIR')) || '/tmp').replace(/\/+$/, '')}/filetree-${await $.session.id()}-${++markId}.mark`
  try {
    await $.process.run(['touch', mark], { timeoutMs: 3_000 })
    return { ms, mark, os }
  } catch {
    return { ms, mark: '', os }
  }
}

async function walkSize($: EngineInterface, dir: string): Promise<number> {
  let total = 0
  let seen = 0
  let level = [dir]
  while (level.length) {
    const next: string[] = []
    for (const d of level) {
      let entries
      try {
        entries = await $.fs.list(d)
      } catch {
        continue
      }
      for (const e of entries) {
        if (++seen > SIZE_WALK_LIMIT) return -1
        if (e.kind === 'dir' && !e.isLink) next.push(join(d, e.name))
        else if (e.kind === 'file') total += e.size
      }
    }
    level = next
  }
  return total
}

async function dirSize($: EngineInterface, dir: string): Promise<number> {
  if (rootOfDisk(dir)) return -1
  if ((await osName($)) === 'win32') return walkSize($, dir)
  try {
    const run = await $.process.run(['du', '-skxH', dir], { timeoutMs: SIZE_TIMEOUT_MS })
    const kb = Number(run.stdout.trim().split(/\s/)[0] || NaN)
    return Number.isFinite(kb) ? kb * 1024 : -1
  } catch {
    return -1
  }
}

function pumpSizes($: EngineInterface): void {
  while (sizeActive < SIZE_JOBS && sizeQueue.length) {
    const dir = sizeQueue.shift() ?? ''
    const epoch = sizeEpoch
    sizing.add(dir)
    sizeActive += 1
    void dirSize($, dir)
      .then(async bytes => {
        if (epoch === sizeEpoch) return patch($, cur => (inside(cur.root, dir) ? { dirSizes: { ...cur.dirSizes, [dir]: bytes } } : {}))
        const cur = await get($)
        if (cur.showSize && inside(cur.root, dir) && !(dir in cur.dirSizes) && !sizeQueue.includes(dir)) sizeQueue.push(dir)
      })
      .catch(() => undefined)
      .finally(() => {
        sizing.delete(dir)
        sizeActive -= 1
        pumpSizes($)
      })
  }
}

function wantSizes($: EngineInterface, dirs: string[]): void {
  for (const dir of dirs) if (!sizing.has(dir) && !sizeQueue.includes(dir)) sizeQueue.push(dir)
  pumpSizes($)
}

async function staleSizes($: EngineInterface, paths?: string[]): Promise<void> {
  sizeEpoch += 1
  sizeQueue = []
  await patch($, cur => {
    if (!paths) return { dirSizes: {} }
    const keep: Record<string, number> = {}
    for (const [dir, bytes] of Object.entries(cur.dirSizes)) if (!paths.some(p => inside(dir, p))) keep[dir] = bytes
    return { dirSizes: keep }
  })
}

function openDirs(t: FileTree): string[] {
  const open = new Set(t.expanded)
  return t.nodes.filter(n => n.kind === 'dir' && n.loaded && open.has(n.id)).map(n => n.id)
}

function keepTop(cur: FileTree, expanded: string[]): Partial<FileTree> {
  if (followClaude) return { scroll: null }
  const top = visibleRows(cur)[cur.scroll ?? view.from]?.node.id
  const at = top ? visibleRows({ ...cur, expanded }).findIndex(r => r.node.id === top) : -1
  return at < 0 ? {} : { scroll: at }
}

async function flash($: EngineInterface, tones: Record<string, string>, labels: Record<string, string> = {}, unrecorded: readonly string[] = []): Promise<void> {
  const unique = Object.keys(tones)
  if (unique.length === 0) return
  const mine = ++generation
  const root = (await get($)).root
  blink?.cancel()
  blink = null
  await patch($, cur => {
    if (cur.root !== root) return {}
    const open = new Set(cur.expanded)
    const bright = new Set([...(cur.flashOn ? cur.flash.filter(id => !unique.includes(id)) : []), ...unique])
    const dim = new Set<string>()
    const all: Record<string, string> = cur.flashOn ? { ...cur.flashTones } : {}
    if (cur.flashOn) {
      for (const id of cur.flashDim) dim.add(id)
    }
    for (const id of unique) {
      const tone = tones[id] ?? 'orange'
      all[id] = tone
      if (id === BRANCH_ROW) continue
      const chain = ancestorsOf(id, cur.root)
      if (!chain.some(a => !open.has(a))) continue
      for (const a of chain) {
        if (!open.has(a)) {
          dim.add(a)
          all[a] = all[a] ?? tone
        }
        open.add(a)
      }
    }
    for (const id of bright) dim.delete(id)
    // The card above the tree keeps every file touched, newest first, at the strongest it was touched.
    const touchedNow: TouchedFile[] = [...(cur.touched ?? [])]
    const isDir = new Set(cur.nodes.filter(n => n.kind === 'dir').map(n => n.id))
    const skip = new Set(unrecorded)
    for (const id of unique) {
      if (id === BRANCH_ROW || id === cur.root || isDir.has(id) || skip.has(id)) continue
      const tone = tones[id] ?? 'orange'
      const act = activityOf(tone)
      const said = labels[id]
      const label = said ? said.charAt(0).toUpperCase() + said.slice(1) : act.past
      const at = touchedNow.findIndex(x => x.path === id)
      const prev = at >= 0 ? touchedNow.splice(at, 1)[0] : undefined
      touchedNow.unshift(prev && prev.rank > act.rank ? prev : { path: id, tone, label, rank: act.rank })
    }
    return {
      flash: [...bright],
      flashDim: [...dim],
      flashOn: true,
      flashTones: all,
      flashLabels: { ...(cur.flashOn ? (cur.flashLabels ?? {}) : {}), ...labels },
      touched: touchedNow.slice(0, TOUCHED_KEEP),
      expanded: [...open],
      ...keepTop(cur, [...open]),
    }
  })
  if (generation !== mine) return
  blink = $.clock.after(FLASH_MS, () => {
    if (generation !== mine) return
    blink = null
    void patch($, cur => (generation === mine ? { flash: [], flashDim: [], flashOn: false, flashTones: {}, flashLabels: {} } : {}))
  })
}

async function followCwd($: EngineInterface): Promise<boolean> {
  if (!follow) return false
  const cwd = await cwdOf($)
  const t = await get($)
  if (t.root === cwd) return false
  await reset($, cwd)
  return true
}

type Pending = { actions: GitAction[]; ids: number[]; command: string; head: string }
// `agentId`, `tone` and `readTone`: the subagent that ran the command, if one did, and its tones.
type Job = { actions: GitAction[]; since: Since; initRepo: boolean; readOnly: boolean; agentId?: string; tone?: string; readTone?: string }
type Background = { p: Pending | null; job: Job; reads: string[] }
type GitOperation = NonNullable<BuiltinToolResults['Bash']['gitOperation']>
type Outcome = { state: 'done' | 'failed'; label: string; detail: string }

const PROOF: Record<string, (op: GitOperation) => boolean> = {
  push: op => Boolean(op.push),
  merge: op => op.branch?.action === 'merged',
  rebase: op => op.branch?.action === 'rebased',
  'pr create': op => op.pr?.action === 'created',
  'pr merge': op => op.pr?.action === 'merged',
  'pr comment': op => op.pr?.action === 'commented',
}

async function startGit($: EngineInterface, actions: GitAction[]): Promise<number[]> {
  const now = await $.clock.now()
  const ids = actions.map(() => ++activityId)
  await setActivities($, cur => [
    ...cur.filter(a => a.state === 'running' || now - a.at < ACTIVITY_TTL_MS),
    ...actions.map((a, i) => ({
      id: ids[i] ?? 0,
      kind: a.kind,
      label: a.running,
      state: 'running' as const,
      detail: '',
      at: now,
      tone: a.tone,
      nerd: a.icon.nerd,
      plain: a.icon.plain,
    })),
  ])
  return ids
}

async function headOf($: EngineInterface, cwd: string): Promise<string> {
  try {
    const run = await git($, cwd, ['rev-parse', 'HEAD'], 5_000)
    return run.exitCode === 0 ? run.stdout.trim() : ''
  } catch {
    return ''
  }
}

async function outcomes($: EngineInterface, p: Pending, ok: boolean, op: GitOperation | undefined): Promise<Outcome[]> {
  const chain = chainOf(p.command)
  const after = p.actions.some(a => a.verb === 'commit') && !op?.commit ? await headOf($, (await get($)).root || (await cwdOf($))) : ''
  return p.actions.map(a => {
    if (a.verb === 'commit') {
      const sha = op?.commit?.sha || (after && after !== p.head ? after : '')
      return sha ? { state: 'done', label: a.done, detail: sha.slice(0, 7) } : { state: 'failed', label: `${a.verb} failed`, detail: '' }
    }
    if ((op && PROOF[a.verb]?.(op)) || (ok && chain.and)) return { state: 'done', label: a.done, detail: '' }
    if (!ok && chain.and && chain.size === 1) return { state: 'failed', label: `${a.verb} failed`, detail: '' }
    return { state: 'done', label: `ran ${a.kind}`, detail: '' }
  })
}

async function finishGit($: EngineInterface, p: Pending, results: Outcome[]): Promise<void> {
  const now = await $.clock.now()
  await setActivities($, cur =>
    cur.map(a => {
      const i = p.ids.indexOf(a.id)
      const result = i < 0 ? undefined : results[i]
      return result ? { ...a, ...result, at: now } : a
    }),
  )
  $.clock.after(ACTIVITY_TTL_MS + 500, () => void setActivities($, cur => cur.filter(a => a.state === 'running' || a.at > now)))
}

function failAll(p: Pending): Outcome[] {
  return p.actions.map(a => ({ state: 'failed', label: `${a.verb} failed`, detail: '' }))
}

function proven(p: Pending | null, results: Outcome[]): GitAction[] {
  return p ? p.actions.filter((_, i) => results[i]?.state !== 'failed') : []
}

function taskEnds(text: string): [string, string][] {
  return [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].flatMap(m => {
    const id = /<task-id>([^<]*)<\/task-id>/.exec(m[1] ?? '')?.[1]?.trim()
    const status = /<status>([^<]*)<\/status>/.exec(m[1] ?? '')?.[1]?.trim()
    return id && status ? [[id, status] as [string, string]] : []
  })
}

async function settleBackground($: EngineInterface, text: string): Promise<void> {
  if (background.size === 0 || !text.includes('<task-notification>')) return
  for (const [id, status] of taskEnds(text)) {
    const task = background.get(id)
    if (!task) continue
    background.delete(id)
    const ok = status === 'completed'
    const results = task.p ? await outcomes($, task.p, ok, undefined) : []
    if (task.p) await finishGit($, task.p, results)
    if (showReads) queuedReads.push(...task.reads.map(r => [r, task.job.readTone ?? 'purple'] as const))
    scheduleScan($, { ...task.job, actions: proven(task.p, results) })
  }
}

async function gitPaths($: EngineInterface, root: string, prefix: string, committed: boolean): Promise<string[]> {
  const map = mapper(root, prefix)
  try {
    const run = committed
      ? await git($, root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], 5_000)
      : await git($, root, ['diff', '--cached', '--name-only', '-z'], 5_000)
    return run.exitCode === 0 ? run.stdout.split('\0').filter(Boolean).flatMap(rel => map(rel) ?? []) : []
  } catch {
    return []
  }
}

async function gitDir($: EngineInterface, cwd: string): Promise<string> {
  for (let dir = cwd, i = 0; i < 64; i++) {
    try {
      const dot = join(dir, '.git')
      const st = await $.fs.stat(dot)
      if (st.kind === 'dir') return dot
      const ref = /^gitdir:\s*(.+)$/m.exec(String(await $.fs.read(dot)))?.[1]?.trim()
      if (ref) return resolve(dir, ref, home)
    } catch {
      const up = dirname(dir)
      if (up === dir) return ''
      dir = up
      continue
    }
    return ''
  }
  return ''
}

async function sync($: EngineInterface, force = false): Promise<void> {
  const now = await $.clock.now()
  if (!force && now - lastSync < 2_000) return
  lastSync = now
  searchIndex = null
  const t = await get($)
  if (!t.root) return
  await loadDirs($, [t.root, ...openDirs(t)])
  if (t.top) await refreshGit($)
}

async function copyPath($: EngineInterface, id: string, absolute: boolean, surface?: string): Promise<void> {
  const t = await get($)
  const text = !absolute && id !== t.root && inside(t.root, id) ? id.slice(t.root.endsWith('/') ? t.root.length : t.root.length + 1) : id
  const done = await $.ui.copy({ text, ...(surface ? { surface: surface as 'terminal' } : {}) })
  $.ui.toast(done.isCopied ? `Copied ${text}` : 'Could not copy the path')
}

async function exists($: EngineInterface, path: string): Promise<boolean> {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

async function afterBash($: EngineInterface, jobs: Job[]): Promise<void> {
  const reads = queuedReads
  queuedReads = []
  if (await followCwd($)) return
  const t = await get($)
  if (!t.root) return
  const actions = jobs.flatMap(j => j.actions)
  const writers = jobs.filter(j => !j.readOnly)
  const since = (writers.length ? writers : jobs).reduce((a, j) => (j.since.ms < a.ms ? j.since : a), (writers[0] ?? jobs[0])?.since ?? { ms: 0, mark: '', os: 'linux' as const })
  const writes = !jobs.every(j => j.readOnly)
  const before = dirty.root === t.root ? dirty.files : {}
  if (jobs.some(j => j.initRepo)) await detectRepo($)
  else if (!t.top && (await exists($, join(t.root, '.git')))) await detectRepo($)
  const probed = await get($)
  if (probed.top && (writes || probed.top !== t.top)) await refreshGit($)
  if (writes) {
    searchIndex = null
    await staleSizes($)
  }
  const fresh = await get($)
  const ignored = new Set(fresh.ignored)
  const tones: Record<string, string> = {}
  const labels: Record<string, string> = {}
  if (writes) {
    const found = fresh.top
      ? await changedInRepo($, t.root, since, before, fresh.ignored)
      : { hits: since.os === 'win32' ? [] : await changedSince($, t.root, since, NO_REPO_DEPTH), gone: [] }
    const hits = found.hits.filter(x => inside(t.root, x) && !underAny(x, ignored, t.root)).slice(0, FIND_LIMIT)
    await revealPaths($, hits)
    const loaded = await get($)
    const dirs = [...new Set([loaded.root, ...openDirs(loaded), ...hits.map(dirname), ...found.gone.map(dirname)])].filter(d => inside(loaded.root, d))
    const listed = await loadDirs($, dirs)
    if (!fresh.top && since.os === 'win32')
      for (const kids of listed.values()) for (const n of kids) if (n.mtime > since.ms && hits.length < FIND_LIMIT) hits.push(n.id)
    await patch($, cur => {
      const ids = new Set(cur.nodes.map(n => n.id))
      return { expanded: cur.expanded.filter(id => ids.has(id)) }
    })
    const present = new Set((await get($)).nodes.map(n => n.id))
    // Changes a scan finds belong to whoever ran the commands, when one agent (or Claude) ran them all.
    const owner = writers.length && writers.every(j => j.agentId === writers[0]?.agentId) ? writers[0] : undefined
    const touchTone = actions.find(a => !['commit', 'push', 'add'].includes(a.verb))?.tone ?? owner?.tone ?? 'orange'
    if (showWrites) for (const id of hits) if (present.has(id)) tones[id] = touchTone
    // A subagent's shell edits (sed -i, a codegen, a formatter) go on its card and in the crew view too.
    const changed = hits.filter(id => present.has(id) && !(loaded.nodes.find(n => n.id === id)?.kind === 'dir'))
    if (owner?.agentId && changed.length) {
      const agentId = owner.agentId
      await update($, AGENTS, list => (list ?? []).map(a => (a.agentId === agentId ? { ...a, files: noteFiles(a.files, changed, true) } : a)))
    }
  }
  if (showReads) {
    const found: string[] = []
    const readTone = new Map<string, string>()
    for (const [r, tone] of reads) {
      if (found.length >= READ_REVEAL_LIMIT) break
      if (r !== t.root && inside(t.root, r) && !underAny(r, ignored, t.root) && (await exists($, r))) {
        found.push(r)
        readTone.set(r, tone)
      }
    }
    if (found.length) {
      await revealPaths($, found)
      const shown = new Set((await get($)).nodes.map(n => n.id))
      for (const r of found) if (shown.has(r) && !tones[r]) tones[r] = readTone.get(r) ?? 'purple'
    }
  }
  if (showWrites && actions.length) {
    const final = await get($)
    const committed = actions.some(a => a.verb === 'commit')
    if ((committed || actions.some(a => a.verb === 'add')) && final.top) {
      const paths = (await gitPaths($, final.root, final.prefix, committed)).filter(x => !underAny(x, ignored, final.root)).slice(0, READ_REVEAL_LIMIT)
      await revealPaths($, paths)
      const shown = new Set((await get($)).nodes.map(n => n.id))
      for (const x of paths)
        if (shown.has(x)) {
          tones[x] = 'green'
          labels[x] = committed ? 'committed' : 'staged'
        }
    }
    const pushLike = actions.find(a => ['push', 'pull', 'fetch', 'checkout', 'switch', 'branch', 'merge', 'rebase', 'tag'].includes(a.verb) || a.kind.startsWith('gh '))
    if (pushLike) tones[BRANCH_ROW] = pushLike.tone
    else if (committed) tones[BRANCH_ROW] = 'green'
  }
  await flash($, tones, labels)
}

function scheduleScan($: EngineInterface, job: Job): void {
  scanJobs.push(job)
  if (scanning) return
  scanning = (async () => {
    while (scanJobs.length) {
      const jobs = scanJobs
      scanJobs = []
      try {
        await afterBash($, jobs)
      } finally {
        const marks = jobs.map(j => j.since.mark).filter(Boolean)
        if (marks.length) await $.process.run(['rm', '-f', ...marks], { timeoutMs: 3_000 }).catch(() => undefined)
      }
    }
  })().finally(() => {
    scanning = null
  })
}

// A subagent's reads and writes shimmer in its tier's color (the agents half keeps the runs);
// Claude's own stay purple for reads and orange for writes.
async function toneOf($: EngineInterface, agentId: string | undefined, isRead: boolean): Promise<string> {
  const own = isRead ? 'purple' : 'orange'
  if (!agentId) return own
  const { value: runs = [] } = await $.state.get(AGENTS)
  const run = runs.find(a => a.agentId === agentId)
  if (!run) return own
  return `tier-${colorTierOf(run.type, run.job)}${isRead ? '-read' : ''}`
}

// `record`: whether the touched card keeps these files (a search's hits were not opened, so no).
async function touched($: EngineInterface, paths: string[], tone: string, show: boolean, isRead = tone === 'purple', record = true): Promise<void> {
  if (!isRead && previewed && paths.map(posix).includes(previewed.path)) previewed = null
  if (await followCwd($)) return
  const t = await get($)
  if (!t.root) return
  const within = paths.map(posix).filter(p => inside(t.root, p))
  if (within.length === 0) return
  if (!isRead) {
    searchIndex = null
    await staleSizes($, within)
    await revealPaths($, within.map(dirname))
    await loadDirs($, [...new Set(within.map(dirname))].filter(d => inside(t.root, d)))
    await refreshGit($)
  } else await revealPaths($, within)
  if (!show) return
  const tones: Record<string, string> = {}
  for (const p of within) tones[p] = tone
  await flash($, tones, {}, record ? [] : within)
}

async function reveal($: EngineInterface, paths: string[]): Promise<void> {
  if (await followCwd($)) return
  await revealPaths($, paths)
  await patch($, cur => {
    const open = new Set(cur.expanded)
    for (const p of paths) for (const a of ancestorsOf(p, cur.root)) open.add(a)
    return { expanded: [...open], cursor: paths[paths.length - 1] ?? cur.cursor, scroll: null }
  })
}

async function walk($: EngineInterface, root: string, depth: number, limit: number): Promise<string[]> {
  const out: string[] = []
  let level = [root]
  for (let d = 0; d < depth && level.length && out.length < limit; d++) {
    const next: string[] = []
    for (const dir of level) {
      for (const n of (await list($, dir)) ?? []) {
        if (n.kind === 'dir') {
          if (!PRUNE.includes(n.name)) next.push(n.id)
        } else out.push(n.id)
      }
      if (out.length >= limit) break
    }
    level = next
  }
  return out
}

async function listAll($: EngineInterface, t: FileTree): Promise<string[] | null> {
  try {
    if (!t.top && (await osName($)) === 'win32') return await walk($, t.root, rootOfDisk(t.root) ? 3 : 6, 20_000)
    const run = t.top
      ? await git($, t.root, ['ls-files', '-co', '--exclude-standard', '-z'], 10_000)
      : await $.process.run(['find', '-H', t.root, '-xdev', '-maxdepth', rootOfDisk(t.root) ? '3' : '6', ...pruneArgs(t.root), '-type', 'f', '-print0'], { timeoutMs: 10_000 })
    if (t.top && run.exitCode !== 0) return null
    const paths = run.stdout.split('\0').filter(Boolean)
    if (run.isStdoutTruncated) paths.pop()
    return paths.map(p => (isAbsolute(p) ? p : join(t.root, p)))
  } catch {
    return null
  }
}

function indexPaths($: EngineInterface, t: FileTree): Promise<string[]> {
  if (searchIndex?.root !== t.root) {
    const index: { root: string; paths: Promise<string[]> } = {
      root: t.root,
      paths: listAll($, t).then(paths => {
        if (paths === null && searchIndex === index) searchIndex = null
        return paths ?? []
      }),
    }
    searchIndex = index
  }
  return searchIndex.paths
}

async function search($: EngineInterface, query: string): Promise<string[]> {
  if (!(await get($)).query.trim()) searchIndex = null
  await patch($, () => ({ query }))
  const q = query.trim().toLowerCase()
  if (!q) return []
  const t = await get($)
  const hits = (await indexPaths($, t)).filter(p => relative(t.root, p).toLowerCase().includes(q)).slice(0, SEARCH_REVEAL_LIMIT)
  if ((await get($)).query !== query) return []
  await revealPaths($, hits)
  const shown = await get($)
  const ids = new Set(shown.nodes.map(n => n.id))
  const stale = [...new Set(hits.filter(p => !ids.has(p)).map(dirname))].filter(d => inside(shown.root, d))
  if (stale.length) await loadDirs($, stale)
  return hits
}

async function jump($: EngineInterface, query: string): Promise<void> {
  const hits = (await search($, query)).slice(0, 10)
  await patch($, cur => {
    const open = new Set(cur.expanded)
    for (const p of hits) for (const a of ancestorsOf(p, cur.root)) open.add(a)
    return { query: '', expanded: [...open], cursor: hits[0] ?? cur.cursor, scroll: null }
  })
}

// Windows has no fc-list: Windows Terminal's own settings say which font it draws with; elsewhere,
// a Nerd Font installed for this user or the machine is the best guess.
const NERD_FACE = /Nerd Font|\bNF[MP]?\b/i
const WIN_FONTS =
  "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSObject.Properties.Name }"
async function windowsNerd($: EngineInterface): Promise<boolean> {
  const local = await $.env.get('LOCALAPPDATA')
  if ((await $.env.get('WT_SESSION')) && local) {
    for (const pkg of ['Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe']) {
      try {
        return NERD_FACE.test(String(await $.fs.read(`${posix(local)}/Packages/${pkg}/LocalState/settings.json`)))
      } catch {
        continue
      }
    }
  }
  try {
    const out = (await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', WIN_FONTS], { timeoutMs: 5_000 })).stdout
    return NERD_FACE.test(out)
  } catch {
    return false
  }
}

async function fontState($: EngineInterface, charset: string): Promise<'ok' | 'stale' | 'missing'> {
  try {
    const out = (await $.process.run(['sh', '-c', FONT_SCRIPT, 'sh', charset], { timeoutMs: 5_000 })).stdout.trim()
    return out === 'stale' || out === 'missing' ? out : 'ok'
  } catch {
    return 'missing'
  }
}

async function finePointerOk($: EngineInterface): Promise<boolean> {
  if (!(await $.env.get('HERDR_ENV'))) return true
  try {
    const out = (await $.process.run([(await $.env.get('HERDR_BIN_PATH')) || 'herdr', '--version'], { timeoutMs: 3_000 })).stdout
    const [major = 0, minor = 0, fix = 0] = (/(\d+)\.(\d+)\.(\d+)/.exec(out) ?? []).slice(1).map(Number)
    return major * 1e6 + minor * 1e3 + fix >= 9_001
  } catch {
    return false
  }
}

const PREVIEW_CHARS = 90_000
const PREVIEW_LINE = 2_000

function fitSerialized(lines: string[], max: number): string[] {
  let size = 0
  for (let i = 0; i < lines.length; i++) {
    size += JSON.stringify(lines[i]).length
    if (size > max) return lines.slice(0, i)
  }
  return lines
}

async function loadPreview($: EngineInterface, path: string): Promise<void> {
  let text = ''
  let note = ''
  try {
    const stat = await $.fs.stat(path)
    if (stat.size > 4_000_000) note = `${formatSize(stat.size)}, too large to preview`
    else {
      text = await $.fs.read(path)
      if (text.slice(0, 8000).includes('\0')) {
        text = ''
        note = `binary file, ${formatSize(stat.size)}`
      }
    }
  } catch (err) {
    note = `could not read: ${String((err as Error)?.message ?? err).split('\n')[0]}`
  }
  const total = text.length
  let lines = text.slice(0, PREVIEW_CHARS).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').split('\n')
  if (total > PREVIEW_CHARS && lines.length > 1) lines.pop()
  lines = lines.map(l => (l.length > PREVIEW_LINE ? `${l.slice(0, PREVIEW_LINE)}…` : l))
  const fit = fitSerialized(lines, PREVIEW_CHARS)
  if (total > PREVIEW_CHARS || fit.length < lines.length) note = `first ${fit.length.toLocaleString('en')} lines of ${total.toLocaleString('en')} characters`
  previewed = { path, text: fit.join('\n'), note }
}

async function showPreview($: EngineInterface, path: string): Promise<void> {
  await loadPreview($, path)
  await patch($, () => ({ preview: path, previewTop: 0, selected: path }))
}

async function closePreview($: EngineInterface): Promise<void> {
  await patch($, () => ({ preview: '', previewTop: 0 }))
}

async function scrollPreview($: EngineInterface, by: number): Promise<void> {
  const t = await get($)
  const last = Math.max(0, (previewed?.text.split('\n').length ?? 1) - previewRows)
  const top = Math.max(0, Math.min(last, t.previewTop + by))
  if (top !== t.previewTop) await patch($, () => ({ previewTop: top }))
}

function previewLines(text: string, top: number, rows: number, markdown: boolean): { text: string; top: number } {
  const lines = text.split('\n')
  const from = Math.max(0, Math.min(top, lines.length - 1))
  let shown = lines.slice(from, from + rows)
  if (markdown) {
    // Reopen a code fence the window starts inside, so the rest is not read as prose.
    let fence = ''
    let opener = ''
    for (const line of lines.slice(0, from)) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
      if (!m) continue
      const mark = m[1] ?? ''
      if (!fence) {
        fence = mark
        opener = line.trimStart()
      } else if (mark[0] === fence[0] && mark.length >= fence.length && !(m[2] ?? '').trim()) fence = ''
    }
    if (fence) shown = [opener, ...shown]
  }
  return { text: shown.join('\n'), top: from }
}

async function openFile($: EngineInterface, path: string, external = false): Promise<void> {
  if (!external && openWithSetting.trim() === 'preview') return showPreview($, path)
  const os = await osName($)
  const native = (p: string) => (os === 'win32' ? p.replace(/\//g, '\\') : p)
  const custom = external ? null : openWithCommand(openWithSetting, native(path), native(dirname(path)))
  const { argv, init } = custom ? { argv: os === 'linux' ? ['sh', '-c', LINUX_LAUNCH, 'sh', ...custom] : custom, init: { timeoutMs: 10_000 } } : openCommand(os, path)
  try {
    const run = await $.process.run(argv, init)
    if (run.exitCode !== 0) $.ui.toast(`could not open ${path} with ${custom?.[0] ?? argv[0]}: ${run.stderr.trim().split('\n')[0] || `exit ${run.exitCode}`}`)
  } catch {
    $.ui.toast(`could not open ${path} with ${custom?.[0] ?? argv[0]}`)
  }
}

async function quickLook($: EngineInterface, path: string): Promise<void> {
  try {
    await $.process.run(['sh', '-c', '(nohup qlmanage -p "$1" >/dev/null 2>&1 &); sleep 0.4; osascript -e \'tell application "System Events" to set frontmost of first process whose name is "qlmanage" to true\' >/dev/null 2>&1 || true', 'sh', path], { timeoutMs: 10_000 })
  } catch {
    $.ui.toast(`could not preview ${path} with Quick Look`)
  }
}

async function toggle($: EngineInterface, n: FileNode): Promise<void> {
  if (n.kind === 'dir' && !(await get($)).expanded.includes(n.id)) await loadDirs($, [n.id])
  await patch($, t => {
    const open = new Set(t.expanded)
    if (n.kind === 'dir') open.has(n.id) ? open.delete(n.id) : open.add(n.id)
    return { expanded: [...open], cursor: n.id, selected: n.kind === 'dir' ? t.selected : n.id }
  })
}

async function press($: EngineInterface, n: FileNode): Promise<void> {
  const now = await $.clock.now()
  const isDouble = lastPress.key === n.id && now - lastPress.at < DOUBLE_MS
  lastPress = { key: isDouble ? '' : n.id, at: now }
  if (!isDouble) {
    await toggle($, n)
    return
  }
  await openNode($, n)
}

async function openNode($: EngineInterface, n: FileNode): Promise<void> {
  if (n.kind === 'dir') {
    follow = false
    await reset($, n.id)
  } else await openFile($, n.id)
}

async function loadTheme($: EngineInterface): Promise<void> {
  const path = `${(await $.env.get('HOME')) ?? ''}/${THEME_FILE}`
  try {
    const stat = await $.fs.stat(path)
    if (stat.kind !== 'file') throw new Error('no theme file')
    if (stat.mtimeMs === themeMtime) return
    await $.state.set(THEME, parseTheme(String(await $.fs.read(path))))
    themeMtime = stat.mtimeMs
  } catch {
    if (themeMtime === 0) return
    await $.state.set(THEME, DEFAULT_THEME)
    themeMtime = 0
  }
}

// Claude's project: the folder it was started in (or has moved to) and the folders added with
// /add-dir. The tree climbs no higher than the top of the one it shows: what Claude can see and edit.
const addedDirs = new Set<string>()
async function projectTop($: EngineInterface, path: string): Promise<string> {
  const tops = [await cwdOf($), ...addedDirs].filter(top => top && inside(top, path))
  return tops.sort((a, b) => b.length - a.length)[0] ?? ''
}

async function pressHeader($: EngineInterface, id: string): Promise<void> {
  const t = await get($)
  if (id === 'up') {
    const top = await projectTop($, t.root)
    if (!top || t.root === top) return
    follow = false
    await reset($, dirname(t.root))
  } else if (id === 'cwd') {
    follow = true
    await reset($, await cwdOf($))
  } else if (id === 'refresh') {
    searchIndex = null
    await staleSizes($)
    await loadDirs($, [t.root, ...t.expanded])
    await detectRepo($)
    await refreshGit($)
    if (t.query.trim()) await search($, t.query)
  } else if (id === 'hidden') await patch($, cur => ({ showHidden: !cur.showHidden }))
  else if (id === 'size') await patch($, cur => ({ showSize: !cur.showSize }))
  else if (id === 'collapse') await patch($, cur => ({ expanded: [], nodes: dropBelow(cur.nodes, cur.nodes.filter(x => x.parent === cur.root && x.kind === 'dir').map(x => x.id)) }))
  else if (id === 'unselect') await patch($, () => ({ selected: '' }))
  else if (id === 'crew') await patch($, cur => ({ crewView: !cur.crewView, scroll: null }))
  else if (id === 'external' && t.preview) await openFile($, t.preview, true)
}

// A file pressed on an agent's card or in the crew view: the tree comes back, opened if the press
// came from the agents pane, and shows it.
async function showFile($: EngineInterface, path: string, openPane: boolean): Promise<void> {
  await patch($, () => ({ crewView: false, scroll: null }))
  if (openPane) {
    const t = await get($)
    await $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
  }
  await reveal($, [path])
}

function shortPath(path: string): string {
  return home && inside(home, path) ? `~${path.slice(home.length)}` : path
}

// Whether rows draw plain Unicode glyphs rather than Nerd Font icons, as the tree decides it.
export const plainGlyphs = (surface: string): boolean => glyphSetting === 'plain' || (glyphSetting === 'auto' && (noNerd || surface !== 'terminal'))

export const register: Register = (on, options) => {
  glyphSetting = typeof options?.glyphs === 'string' ? options.glyphs : 'auto'
  appPictures = options?.appRows !== 'classic'
  const activity = typeof options?.activity === 'string' ? options.activity : 'reads and writes'
  showReads = activity.includes('reads')
  showWrites = activity.includes('writes')
  followClaude = options?.follow !== 'off'
  sizeDefault = options?.column === 'size'
  showAge = options?.column === 'age'
  showHints = options?.hints !== 'off'
  openWithSetting = typeof options?.open === 'string' ? options.open : ''
  noDock = options?.start === 'off'
  startOff = noDock
  // A plugin may hook session.start once without a matcher, and the agents half does: this one names
  // every session, interactive or not, so both halves start.
  on('session.start', { isInteractive: [true, false] }, async ($, e, next) => {
    const windows = (await $.env.get('OS')) === 'Windows_NT'
    useDrives(windows)
    home = posix(((await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '').replace(/[\\/]+$/, ''))
    activityId = Math.max(activityId, ...(await activities($)).map(a => a.id))
    void (async () => {
      pointer = await finePointerOk($)
      try {
        const remote = Boolean((await $.env.get('SSH_CONNECTION')) || (await $.env.get('SSH_TTY')))
        noNerd = !remote && (windows ? !(await windowsNerd($)) : (await fontState($, 'f04eb')) !== 'ok')
      } catch {
        noNerd = true
      }
      await loadTheme($)
      themePoll?.cancel()
      themePoll = themeMtime ? $.clock.every(THEME_POLL_MS, () => void loadTheme($)) : null
      ageTick?.cancel()
      ageTick = showAge ? $.clock.every(AGE_TICK_MS, () => $.ui.invalidate('ui.render')) : null
      const t = await get($)
      if (t.flashOn) await patch($, () => ({ flash: [], flashDim: [], flashOn: false, flashTones: {}, flashLabels: {} }))
      if (t.preview) await patch($, () => ({ preview: '', previewTop: 0 }))
      await setActivities($, cur => cur.map(a => (a.state === 'running' ? { ...a, state: 'failed', label: `${a.kind} interrupted` } : a)))
      const cwd = await cwdOf($)
      if (!t.root || t.nodes.length === 0 || (follow && t.root !== cwd)) await reset($, cwd)
      else if (!noDock) await $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
    })().catch(() => undefined)
    return next(e)
  })

  // An app joins this session by Remote Control: the panel, if it is open, is announced again so
  // the newcomer places it beside its transcript too, and every surface draws it afresh.
  on('session.attach', async ($, e, next) => {
    const joined = await next(e)
    const isOpen = (await $.ui.panes().catch(() => [])).some(p => p.id === DECK_PANE)
    // An app that docks panes beside its transcript (the desktop; not the phone) gets the panel even
    // where the terminal had no room for it (not in fullscreen), unless it is set not to open.
    const docks = e.surface !== 'mobile' && e.viewport?.isFullscreen !== false
    if (isOpen || (docks && !startOff)) await $.ui.open({ id: DECK_PANE, title: DECK_TITLE }).catch(() => undefined)
    $.ui.invalidate('ui.render')
    return joined
  })

  // `/crewdeck` is registered by the agents' half, which runs first and toggles the panel: this
  // half checks the layout, readies the tree, and opens it on a folder when one is given.
  on('command.run', { command: 'crewdeck' }, async ($, e) => {
    // The layout checks are the terminal's: the desktop app docks the pane itself and
    // reports no fullscreen layout, so a session no terminal draws skips them.
    // Typed in an app following this session by Remote Control, the answer shows there: the
    // terminal's layout is not the one to check.
    const terminal = e.origin.kind !== 'bridge' && (await $.session.surfaces().then(s => s.includes('terminal'), () => true))
    if (terminal && !e.presentation.isFullscreen) return { text: 'Crewdeck shows in the sidebar, which needs the fullscreen layout. Run /tui fullscreen, then /crewdeck.' }
    if (terminal && e.presentation.columns < 110) return { text: 'Crewdeck shows in the sidebar, which needs a terminal at least 110 columns wide. Widen it, then run /crewdeck.' }
    noDock = false
    const arg = (e.args ?? '').trim()
    const cwd = await cwdOf($)
    // No folder: the agents' half opens or closes the panel; the tree only needs to exist.
    if (!arg || arg === 'open') {
      const t = await get($)
      if (!t.root || t.nodes.length === 0) {
        noDock = true
        await reset($, cwd)
        noDock = false
      }
      return {}
    }
    const root = resolve(cwd, arg, home)
    // Only Claude's project: a folder outside it waits until Claude is given it.
    if (!(await projectTop($, root))) return { text: `${shortPath(root)} is outside Claude's project (${shortPath(cwd)}). Add it with /add-dir to show it here.` }
    // The tree follows the cwd again from its own folder (`/crewdeck .`, or the ⌂ button).
    follow = root === cwd
    await reset($, root, true)
    return { text: `File tree on ${shortPath(root)}${follow ? ' (follows the cwd)' : ''}.` }
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'] }, async ($, e, next) => {
    const shell = e.tool === 'Bash' || e.tool === 'PowerShell'
    if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit' && !shell) return next(e)
    const command = e.tool === 'Bash' || e.tool === 'PowerShell' ? e.command : ''
    const cwd = shell ? await cwdOf($) : ''
    const actions = gitActions(command)
    const quiet = !actions.length && readOnly(command)
    const since = await sinceNow($, shell && !quiet)
    const before = actions.some(a => a.verb === 'commit') ? await get($) : null
    const head = before?.top ? await headOf($, before.root) : ''
    const pending: Pending | null = actions.length ? { actions, ids: await startGit($, actions), command, head } : null
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } catch (err) {
      if (pending) await finishGit($, pending, failAll(pending))
      if (since.mark) void $.process.run(['rm', '-f', since.mark], { timeoutMs: 3_000 }).catch(() => undefined)
      throw err
    }
    if (pending && result.deny) {
      const ids = pending.ids
      void setActivities($, cur => cur.filter(a => !ids.includes(a.id)))
    }
    if (result.deny || (result.isError && !shell)) {
      if (since.mark) void $.process.run(['rm', '-f', since.mark], { timeoutMs: 3_000 }).catch(() => undefined)
      return result
    }
    if (shell) {
      const out: Partial<BuiltinToolResults['Bash']> = !result.isError && result.result && typeof result.result === 'object' ? (result.result as Partial<BuiltinToolResults['Bash']>) : {}
      const reads = showReads ? readTargets(command, cwd, typeof out.stdout === 'string' ? out.stdout : '', home) : []
      const job: Job = {
        actions: [],
        since,
        initRepo: actions.some(a => a.init),
        readOnly: quiet || result.isReadOnly === true,
        agentId: e.agentId,
        tone: await toneOf($, e.agentId, false),
        readTone: await toneOf($, e.agentId, true),
      }
      if (out.backgroundTaskId) background.set(out.backgroundTaskId, { p: pending, job, reads })
      else void (async () => {
        const results = pending ? await outcomes($, pending, !result.isError, out.gitOperation) : []
        if (pending) await finishGit($, pending, results)
        queuedReads.push(...reads.map(r => [r, job.readTone ?? 'purple'] as const))
        scheduleScan($, { ...job, actions: proven(pending, results) })
      })()
      if (follow && /(^|[;&|\s])(cd|pushd|popd)(\s|$)/.test(command)) $.clock.after(400, () => void followCwd($))
    } else {
      const file = filePathOf(e)
      if (file) void touched($, [file], await toneOf($, e.agentId, false), showWrites, false)
    }
    return result
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny || result.isError || e.tool !== 'Read' || !showReads) return result
    void touched($, [posix(e.file_path)], await toneOf($, e.agentId, true), true, true)
    return result
  })

  for (const tool of ['Grep', 'Glob'] as const)
    on('tool.call', { tool }, async ($, e, next) => {
      const result = await next(e)
      if (result.deny || result.isError || !showReads) return result
      const names = (result.result as Partial<BuiltinToolResults['Grep']> | undefined)?.filenames
      if (!Array.isArray(names) || names.length === 0) return result
      const cwd = await cwdOf($)
      void touched($, names.slice(0, SEARCH_REVEAL_LIMIT).map(f => resolve(cwd, posix(f), home)), await toneOf($, e.agentId, true), true, true, false)
      return result
    })

  on('ui.message', async ($, e, next) => {
    // A file on an agent's card, or in the crew view: show it in the tree.
    const pressed = e.data && typeof e.data === 'object' ? (e.data as { press?: unknown }).press : undefined
    const fromCard = (e.requestId === AGENTS_PANE || e.requestId === DECK_PANE) && e.element.startsWith('changes-')
    const fromCrew = (e.requestId === PANE || e.requestId === DECK_PANE) && (e.element === 'rows' || e.element === 'touched')
    if ((fromCard || fromCrew) && typeof pressed === 'string' && pressed.startsWith('file:')) {
      await showFile($, pressed.slice('file:'.length), fromCard)
      return {}
    }
    if ((e.requestId === PANE || e.requestId === DECK_PANE) && e.element.startsWith('button-') && e.data && typeof e.data === 'object') {
      const id = e.element.slice('button-'.length)
      const data = e.data as { over?: unknown; press?: unknown }
      if (data.press) await pressHeader($, id)
      else if (data.over === true || hovered === id) {
        hovered = data.over === true ? id : ''
        void $.ui.invalidate('ui.render')
      }
      return {}
    }
    if ((e.requestId !== PANE && e.requestId !== DECK_PANE) || e.element !== 'rows' || !e.data || typeof e.data !== 'object') return next(e)
    const data = e.data as { press?: unknown; key?: unknown; ctrl?: unknown; shift?: unknown; scrollTo?: unknown; copy?: unknown }
    void sync($)
    const t = await get($)
    if (typeof data.copy === 'string') {
      await copyPath($, data.copy.replace(/^file:/, ''), Boolean(data.shift), e.surface)
      return {}
    }
    if (typeof data.scrollTo === 'number') {
      const to = Math.round(Math.max(0, Math.min(1, data.scrollTo)) * view.max)
      if (to !== t.scroll) await patch($, () => ({ scroll: to }))
      return {}
    }
    if (typeof data.press === 'string') {
      const n = t.nodes.find(x => x.id === data.press)
      if (!n) return {}
      if (t.scroll === null) await patch($, () => ({ scroll: view.from }))
      if (data.ctrl || data.shift) await openNode($, n)
      else await press($, n)
      return {}
    }
    if (typeof data.key !== 'string') return {}
    // In the crew view the tree is hidden: its cursor stays put and the keys scroll the list.
    if (t.crewView) {
      const by: Record<string, number> = { up: -1, k: -1, down: 1, j: 1, pageup: -view.page, pagedown: view.page, home: -Infinity, end: Infinity }
      const step = by[data.key]
      if (step === undefined || nativeScroll) return {}
      const to = Math.max(0, Math.min(view.max, (t.scroll ?? view.from) + step))
      if (to !== t.scroll) await patch($, () => ({ scroll: to }))
      return {}
    }
    if (t.preview) {
      const page = Math.max(1, previewRows - 2)
      const by: Record<string, number> = { up: -1, k: -1, down: 1, j: 1, pageup: -page, pagedown: page, home: -Infinity, end: Infinity }
      if (data.key === 'left' || data.key === 'h') await closePreview($)
      else if (data.key in by) await scrollPreview($, by[data.key] ?? 0)
      return {}
    }
    const rows = visibleRows(t)
    const at = rows.findIndex(r => r.node.id === t.cursor)
    const cur = rows[at]?.node
    const move = (d: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, (at < 0 ? 0 : at) + d))]
      return target ? patch($, () => ({ cursor: target.node.id, scroll: null })) : Promise.resolve()
    }
    if (data.key === 'up' || data.key === 'k') await move(-1)
    else if (data.key === 'down' || data.key === 'j') await move(1)
    else if (data.key === 'pageup') await move(-10)
    else if (data.key === 'pagedown') await move(10)
    else if (data.key === 'home') await move(-rows.length)
    else if (data.key === 'end') await move(rows.length)
    else if (cur && (data.key === 'y' || data.key === 'Y')) await copyPath($, cur.id, data.key === 'Y' || Boolean(data.shift), e.surface)
    else if (cur && (data.key === 'right' || data.key === 'l') && cur.kind === 'dir' && !t.expanded.includes(cur.id)) await toggle($, cur)
    else if (cur && (data.key === 'left' || data.key === 'h')) {
      if (cur.kind === 'dir' && t.expanded.includes(cur.id)) await toggle($, cur)
      else if (cur.parent !== t.root) await patch($, () => ({ cursor: cur.parent }))
    } else if (cur && data.key === 'return') await (cur.kind !== 'dir' ? openNode($, cur) : toggle($, cur))
    else if (cur && (data.key === ' ' || data.key === 'space')) await (cur.kind !== 'dir' && (await osName($)) === 'darwin' ? quickLook($, cur.id) : toggle($, cur))
    return {}
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') {
      void (async () => {
        await loadTheme($)
        const root = follow || !lastRoot ? await cwdOf($) : lastRoot
        const t = await get($)
        if (t.root !== root || t.nodes.length === 0) await reset($, root)
        // A new conversation: the touched card starts over and the tree comes back from the crew view.
        else if (e.source === 'clear') await patch($, () => ({ touched: [], crewView: false }))
      })()
    }
    const gd = await gitDir($, posix(e.cwd))
    return gd ? { ...result, watchPaths: [...(result.watchPaths ?? []), join(gd, 'index'), join(gd, 'HEAD')] } : result
  })

  on('classic.DirectoryAdded', async ($, e, next) => {
    const result = await next(e)
    addedDirs.add(posix(e.directory).replace(/\/$/, ''))
    void $.ui.invalidate('ui.render')
    return result
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    void followCwd($)
    return result
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    if (/[\\/]\.git[\\/]|[\\/](index|HEAD)$/.test(e.file_path)) $.clock.after(300, () => void sync($, true))
    return result
  })

  // The terminal draws an agent's files as Buttons keyed `<agent>:file:<path>`, for the keyboard.
  on('ui.press', { requestId: [AGENTS_PANE, DECK_PANE] }, async ($, e, next) => {
    const at = e.element.indexOf(':file:')
    if (at > 0) await showFile($, e.element.slice(at + ':file:'.length), true)
    return next(e)
  })

  on('ui.focus', { component: 'Pane', requestId: [PANE, DECK_PANE] }, async ($, e, next) => {
    const result = await next(e)
    void sync($)
    return result
  })

  on('ui.scroll', { component: 'Pane', requestId: [PANE, DECK_PANE] }, async ($, e, next) => {
    if (nativeScroll) return next(e)
    const t = await get($)
    if (t.preview) {
      await scrollPreview($, Math.sign(e.by) * Math.max(3, Math.abs(e.by)))
      return {}
    }
    // A page key asks for the pane's whole body; the window under the header is a little shorter.
    const step = e.bodyRows && Math.abs(e.by) >= e.bodyRows ? view.page : Math.max(3, Math.abs(e.by))
    const to = Math.max(0, Math.min(view.max, (t.scroll ?? view.from) + Math.sign(e.by) * step))
    if (to !== t.scroll) await patch($, () => ({ scroll: to }))
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    void settleBackground($, e.text)
    if (!(await followCwd($))) void sync($)
    const t = await get($)
    const context = [...(e.context ?? [])]
    if (t.selected && (await exists($, t.selected))) context.push(`The user has this file selected in the file tree; "this" or "it" in the prompt likely refers to it: ${t.selected}`)
    const mentions = [...e.text.matchAll(/@([^\s"'`]+)/g)]
      .map(m => (m[1] ?? '').replace(/[.,;:!?)]+$/, ''))
      .filter(Boolean)
      .map(p => resolve(t.root, p, home))
      .filter(p => inside(t.root, p))
    if (mentions.length) {
      void (async () => {
        const found: string[] = []
        for (const p of mentions) {
          try {
            await $.fs.stat(p)
            found.push(p.replace(/\/$/, ''))
          } catch {
            continue
          }
        }
        if (found.length) await reveal($, found)
      })()
    }
    return next(context.length ? { ...e, context } : e)
  })

  on('prompt.attachment', async ($, e, next) => {
    void settleBackground($, e.text)
    return next(e)
  })

  // The tree, in its own pane or as the bottom of the deck, under the agents' part (whose hook drew
  // first and left `deck.agentsRows` and a line above this).
  on('ui.render', { component: 'Pane', requestId: [PANE, DECK_PANE] }, async ($, e, next) => {
    // Every surface draws it: the terminal in cells, and any app (the desktop's own session, or one
    // following this session by Remote Control: desktop, phone, editor) with its own elements.
    const isDeck = e.requestId === DECK_PANE
    if (e.surface === 'terminal' && e.props.placement === 'inline') {
      // Above the prompt there is no room for a tree: the deck keeps its agents, a pane of its own closes.
      noDock = true
      if (!isDeck) void $.ui.close({ id: PANE }).catch(() => undefined)
      const { Box: Empty } = $.ui.resolve(e)
      return <Empty />
    }
    const bodyRows = Math.max(isDeck ? 8 : 1, (e.props.scroll?.bodyRows ?? 40) - (isDeck && e.surface === 'terminal' ? deck.agentsRows + 1 : 0))
    const unicode = plainGlyphs(e.surface)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The phone has no field yet and only the desktop runs a Client: what a surface lacks is left out.
    const Input = 'Input' in ui ? ui.Input : null
    const Client = 'Client' in ui ? ui.Client : null
    const t = await get($)
    const theme: Theme = (await $.state.get(THEME)).value ?? DEFAULT_THEME
    // The desktop tab never hands the wheel or the scrollbar drag to the pane, so
    // there it draws every row and lets the engine scroll the body.
    nativeScroll = e.surface !== 'terminal'
    // While the terminal pane holds the keyboard (ctrl+x tab or a click) the header buttons are
    // the engine's own, which Tab reaches and Enter presses; the same glyph, drawn the same way.
    const keyboard = e.surface === 'terminal' && e.props.isFocused
    // The terminal draws the search line in a rounded box, as the app draws its field.
    const searchBox = e.surface === 'terminal'
    const chipText = (label: string) => ` ${label} `
    // In the app's Crewdeck panel the header buttons are the app's own small buttons, a toggle that
    // is on drawn as the main one, each saying what it does in a tip while the pointer is over it.
    const remote = e.surface !== 'terminal'
    const chips = (appPictures || !Client) && isDeck && remote && 'Svg' in ui
    const Svg = 'Svg' in ui ? ui.Svg : null
    // Tips hang below the buttons, except over a file's preview (drawn after the header, it
    // would be painted over them), where they stand above.
    let tipAbove = false
    // Each button's Box holds its tip, so the app shows the tip while the pointer is on it. The tip
    // goes above the button: drawn after what is above it, it is never painted over, and it moves
    // nothing. As wide as its words and the padding either side: its words are joined by
    // no-break spaces, so the line cannot break and the box grows with it.
    const toolChip = (b: ButtonProps & { hint?: string }) => (
      <Box key={`chip-box-${b.id}`}>
        <Button
          key={`chip-${b.id}`}
          label={b.label}
          variant={TOGGLES.has(b.id) && !b.dim ? 'primary' : 'secondary'}
          {...(b.off ? { dimColor: true } : {})}
          onPress={() => void pressHeader($, b.id)}
        />
        {b.hint ? (
          // Unkeyed: the keyed Box around it is what the pointer is over. A row down (a cell is a
          // little shorter than the button) and a few pixels more, so it never touches the button.
          <Box position="absolute" top={tipAbove ? -2 : 1} right={0} flexDirection="column" alignItems="flex-end" display="none" hover={{ display: 'flex' }}>
            {tipAbove || !Svg ? null : <Svg key="tip-gap" source={TIP_GAP} alt="gap" width={1} height={TIP_GAP_PX} />}
            <Box
              minWidth={Math.ceil(tipCells(b.hint) + 2.4)}
              flexDirection="row"
              justifyContent="center"
              backgroundColor={TIP_BG}
              borderStyle="round"
              borderColor={faint(theme.muted)}
              paddingX={1}
            >
              {/* One line, never broken between words: the tip takes the line's own width. */}
              <Text color={theme.fg || undefined}>{b.hint.replace(/ /g, '\u00a0')}</Text>
            </Box>
          </Box>
        ) : null}
      </Box>
    )
    // The terminal's header buttons as chips, the app's small buttons in cells: a toggle that is on
    // filled in, the rest on a faint ground.
    const look: ChipLook = { bg: mix('#262626', theme.muted, 0.22), hover: mix('#262626', theme.muted, 0.45), fg: theme.fg || '#d8d6d0', onBg: '#e6e4de', onFg: '#1b1b1b' }
    const isOn = (b: ButtonProps) => TOGGLES.has(b.id) && !b.dim
    const button = (b: ButtonProps & { hint?: string }) =>
      chips ? (
        toolChip(b)
      ) : keyboard && !b.off ? (
        <Button key={`key-${b.id}`} plain label={b.label} onPress={() => void pressHeader($, b.id)}>
          <Text color={isOn(b) ? look.onFg : look.fg} backgroundColor={isOn(b) ? look.onBg : look.bg} bold={isOn(b)}>
            {chipText(b.label)}
          </Text>
        </Button>
      ) : keyboard ? (
        <Text key={`key-${b.id}`} color={look.fg} dimColor backgroundColor={look.bg}>
          {chipText(b.label)}
        </Text>
      ) : Client ? (
        <Client
          key={`button-${b.id}`}
          module="./button.tsx"
          props={{ id: b.id, label: b.label, dim: b.dim, ...(b.off ? { off: b.off } : {}), on: isOn(b), chip: look } satisfies ButtonProps}
        />
      ) : (
        <Button key={`key-${b.id}`} plain label={b.label} onPress={() => void pressHeader($, b.id)} />
      )
    // What the hovered header button does, left of the buttons, when it fits beside a title that
    // long; the buttons are Clients only so that they can say when the pointer is over them.
    const hint = (buttons: { id: string; hint: string }[], title: number) => {
      if (chips) return null
      const text = buttons.find(b => b.id === hovered)?.hint
      if (!text) return null
      const room = e.props.bodyColumns - title - buttons.length * 4 - 2
      return text.length <= room ? <Text color={theme.muted}>{`${text} `}</Text> : null
    }
    if (t.preview) {
      if (previewed?.path !== t.preview) await loadPreview($, t.preview)
      const p = previewed
      const markdown = /\.(md|markdown|mdx)$/i.test(t.preview)
      const all = (p?.text ?? '').split('\n').length
      previewRows = nativeScroll ? all : Math.max(4, bodyRows - (p?.note ? 2 : 1))
      const win = previewLines(p?.text ?? '', nativeScroll ? 0 : Math.min(t.previewTop, Math.max(0, all - previewRows)), previewRows, markdown)
      const name = t.preview !== t.root && inside(t.root, t.preview) ? relative(t.root, t.preview) : shortPath(t.preview)
      const external = { id: 'external', label: unicode ? '↗' : '\u{f08e}', dim: true, hint: 'open in default app' }
      tipAbove = true
      return (
        <Box flexDirection="column" minHeight={nativeScroll && isDeck ? 1 : bodyRows} backgroundColor={theme.bg || undefined}>
          <Box flexDirection="row">
            <Button key="back" plain label={unicode ? '← files' : '\u{f004d} files'} onPress={() => void closePreview($)} />
            <Text> </Text>
            <Box flexShrink={1} flexGrow={1}>
              <Text bold wrap="truncate-start">{name}</Text>
            </Box>
            {hint([external], 8 + name.length)}
            {button(external)}
          </Box>
          {p?.note ? <Text dimColor>{p.note}</Text> : null}
          {Client ? (
            <Client
              key="rows"
              module="./rows.tsx"
              props={{ rows: [], active: '', activeBg: theme.selection, hoverBg: faint(theme.selection), tones: SHIMMER, pointer: false, preview: { text: win.text, path: t.preview, startLine: win.top + 1, markdown } } satisfies RowsProps}
            />
          ) : (
            <Text key="rows">{win.text}</Text>
          )}
        </Box>
      )
    }
    const now = await $.clock.now()
    const live = (await activities($)).filter(a => now - a.at < (a.state === 'running' ? RUNNING_MAX_MS : ACTIVITY_TTL_MS))
    const latest = [...live].reverse().find(a => a.state === 'running') ?? live[live.length - 1]
    const bright = new Set(t.flashOn ? t.flash : [])
    const dimmed = new Set(t.flashOn ? t.flashDim : [])
    const ignored = new Set(t.ignored)
    const untracked = new Set(t.untrackedDirs)
    const width = Math.max(24, e.props.bodyColumns)
    const rows = visibleRows(t)
    // The rows above and below the tree: header, branch or hint, search, footer, and what Crewdeck
    // adds, the touched card (its rows, a title, two borders and a gap) and the ALL FILES line.
    const touchedCount = t.crewView || t.preview ? 0 : (t.touched ?? []).filter(x => inside(t.root, x.path)).length
    const cardRows = touchedCount ? Math.min(touchedCount, TOUCHED_SHOWN) + (touchedCount > TOUCHED_SHOWN ? 1 : 0) + 4 : 0
    // The header, and the search box: a rounded border around it in the terminal.
    const fixed = 2 + (searchBox ? 2 : 0) + (t.top ? (t.branch ? 1 : 0) : showHints ? 1 : 0) + (t.selected || latest ? 1 : 0) + cardRows + (t.crewView ? 0 : 1)
    const room = nativeScroll ? Math.max(1, rows.length) : Math.max(5, bodyRows - fixed)
    const isLit = (id: string) => bright.has(id) || dimmed.has(id)
    const focus = followClaude && t.flashOn ? ([...t.flash].reverse().find(id => id !== BRANCH_ROW) ?? t.cursor) : t.cursor
    const at = Math.max(0, rows.findIndex(r => r.node.id === focus))
    const lit = followClaude && t.flashOn ? rows.findIndex(r => isLit(r.node.id)) : -1
    const cap = Math.max(1, Math.floor(room / 3))
    let from = Math.max(0, Math.min(lit >= 0 && at - lit < room - 2 ? Math.max(0, lit - 1) : at - Math.floor(room / 2), rows.length - room))
    let pinned = !nativeScroll && followClaude && t.flashOn ? rows.slice(0, from).filter(r => isLit(r.node.id)).slice(-cap) : []
    if (pinned.length) {
      const rest = Math.max(3, room - pinned.length)
      from = Math.max(0, Math.min(at - Math.floor(rest / 2), rows.length - rest))
      pinned = rows.slice(0, from).filter(r => isLit(r.node.id)).slice(-cap)
    }
    const max = Math.max(0, rows.length - room)
    if (t.scroll !== null) {
      from = Math.max(0, Math.min(t.scroll, max))
      pinned = []
    }
    view = { from, max, page: Math.max(1, room - 2) }
    const shown = rows.slice(from, from + room - pinned.length)
    if (t.showSize) wantSizes($, [...pinned, ...shown].filter(r => r.node.kind === 'dir' && !(r.node.id in t.dirSizes)).map(r => r.node.id))
    const totals: [number, number] = t.top ? (t.diff[t.root] ?? [0, 0]) : [0, 0]
    const countSegs = (c: [number, number, number] | undefined): Seg[] => {
      if (!c) return []
      const out: Seg[] = []
      if (c[0] > 0) out.push({ t: ` ?:${c[0]}`, c: GIT_COLOR['?'] ?? ADD_COLOR })
      if (c[1] > 0) out.push({ t: ` M:${c[1]}`, c: GIT_COLOR.M ?? '#e5c07b' })
      if (c[2] > 0) out.push({ t: ` D:${c[2]}`, c: theme.urgent })
      return out
    }
    const rootCounts = t.top ? countSegs(t.counts[t.root]) : []
    // ↑ is greyed out at the top of Claude's project (or outside it): the tree goes no higher.
    const top = await projectTop($, t.root)
    const atTop = !top || t.root === top
    const buttons = [
      { id: 'up', label: unicode ? '↑' : '\u{f005d}', dim: true, hint: atTop ? "top of Claude's project" : 'parent folder', ...(atTop ? { off: faint(theme.muted) } : {}) },
      { id: 'cwd', label: unicode ? '⌂' : '\u{f02dc}', dim: !follow, hint: 'follow the cwd' },
      { id: 'refresh', label: unicode ? '↻' : '\u{f0450}', dim: true, hint: 'reload tree and git' },
      { id: 'hidden', label: unicode ? (t.showHidden ? '◉' : '○') : t.showHidden ? '\u{f0208}' : '\u{f0209}', dim: !t.showHidden, hint: t.showHidden ? 'hide hidden files' : 'show hidden files' },
      { id: 'size', label: unicode ? 'Σ' : '\u{f02ca}', dim: !t.showSize, hint: t.showSize ? 'show dates' : 'show sizes' },
      { id: 'collapse', label: unicode ? '⊟' : '\u{eac5}', dim: true, hint: 'collapse all' },
      { id: 'crew', label: unicode ? '◈' : '\u{f0849}', dim: !t.crewView, hint: t.crewView ? 'back to the whole tree' : 'what the agents changed' },
      ...(t.selected ? [{ id: 'unselect', label: unicode ? '×' : '\u{f0777}', dim: false, hint: 'clear selection' }] : []),
    ]
    const header = t.top ? [t.top.split('/').pop() ?? t.top, t.prefix.replace(/\/$/, '')].filter(Boolean).join('/') : t.root.split('/').pop() || t.root

    // The terminal's own rows (a Client of cells): indent guides, and plain folders without a Nerd Font.
    const cellRows = e.surface === 'terminal'
    const guide = mix('#262626', theme.muted, 0.6)
    const rowSpec = (r: (typeof rows)[number]): RowSpec => {
      const n = r.node
      const own = t.git[n.id]
      const status = own ?? (underAny(dirname(n.id), untracked, t.root) ? '?' : undefined)
      const isIgnored = !status && underAny(n.id, ignored, t.root)
      const gitColor = status === 'D' || status === 'U' ? theme.urgent : status ? (GIT_COLOR[status] ?? theme.muted) : undefined
      const isBright = bright.has(n.id)
      const isDim = !isBright && dimmed.has(n.id)
      const tone = t.flashTones[n.id] ?? 'orange'
      const iconColor = isIgnored ? theme.muted : (gitColor ?? (n.hidden ? theme.muted : n.kind === 'dir' ? theme.accent : theme.muted))
      const nameColor = isIgnored ? theme.muted : (gitColor ?? (n.hidden ? theme.muted : theme.fg || undefined))
      const loc = t.diff[n.id]
      const meta = t.showSize
        ? n.kind === 'dir'
          ? n.id in t.dirSizes
            ? formatSize(t.dirSizes[n.id] ?? -1)
            : '…'
          : n.kind === 'file' || (n.kind === 'link' && n.size > 0)
            ? formatSize(n.size)
            : ''
        : loc
          ? ''
          : n.kind === 'file'
            ? showAge
              ? age(n.mtime, now)
              : stamp(n.mtime)
            : ''
      const locText = loc ? `${loc[0] ? ` +${loc[0]}` : ''}${loc[1] ? ` -${loc[1]}` : ''}` : ''
      const dirCounts = n.kind === 'dir' ? countSegs(t.counts[n.id]) : []
      // A file being read, written or committed right now: its row tinted, a pill saying so in place of its date.
      const isNow = isBright && n.kind !== 'dir'
      const toneColor = TONES[tone]?.solid ?? theme.accent
      const pill = isNow ? pillSegs(t.flashLabels?.[n.id] ?? activityOf(tone).now, toneColor, theme.bg || undefined, tone) : []
      const pillText = pill.map(p => p.t).join('')
      const badge = isNow ? '' : dirCounts.length ? '' : status ? ` ${status}` : isIgnored ? (unicode ? ' ⊘' : ' \u{f05e}') : '  '
      const countsText = dirCounts.map(c => c.t).join('')
      const shownMeta = isNow ? '' : meta
      // A file's type badge (JS, PDF...) takes five cells and a space where an icon takes two.
      const hasBadge = n.kind !== 'dir'
      const cols = Math.max(4, width - r.depth * 2 - 6 - (hasBadge ? 4 : 0) - (shownMeta ? shownMeta.length + 1 : 0) - locText.length - badge.length - countsText.length - pillText.length)
      const name = n.name.length > cols ? n.name.slice(0, cols - 1) + '…' : n.name
      const caret = n.kind === 'dir' ? (unicode ? (r.open ? '▾' : '▸') : r.open ? CHEVRON_OPEN : CHEVRON_CLOSED) + ' ' : '  '
      const isRepo = n.kind === 'dir' && n.id === t.top
      const glyph = unicode ? (n.kind === 'dir' ? '■' : '·') : fileIcon(n, r.open, isRepo)
      const lit = isBright || isDim
      // Without a Nerd Font the terminal draws no square for a folder: its name, bold, in the
      // folder's color, is what tells it from the files beside it (their type chips).
      const bareDir = cellRows && unicode && n.kind === 'dir'
      const left: Seg[] = [
        // The terminal's indent guides: a faint line under each open folder above, down its contents.
        cellRows && r.depth > 0 ? { t: '│ '.repeat(r.depth), c: guide } : { t: '  '.repeat(r.depth) },
        { t: caret, c: theme.muted },
        ...(hasBadge
          ? badgeSegs(n.name, theme.bg || undefined)
          : bareDir
            ? []
            : [{ ...(lit ? { t: glyph + ' ', sh: tone, dim: isDim, one: true } : { t: glyph + ' ', c: iconColor }), folder: r.open ? ('open' as const) : ('closed' as const) }]),
        lit
          ? { t: name, sh: tone, dim: isDim, b: isBright || bareDir }
          : bareDir
            ? { t: name, c: isIgnored || n.hidden ? theme.muted : (gitColor ?? theme.accent), b: true }
            : { t: name, c: nameColor, b: n.id === t.selected, s: status === 'D' && n.kind !== 'dir' },
      ]
      const right: Seg[] = []
      if (shownMeta) right.push({ t: ` ${shownMeta}`, c: theme.muted })
      if (loc && loc[0] > 0) right.push({ t: ` +${loc[0]}`, c: ADD_COLOR })
      if (loc && loc[1] > 0) right.push({ t: ` -${loc[1]}`, c: DEL_COLOR })
      right.push(...dirCounts)
      if (badge) right.push({ t: badge, c: status ? gitColor : theme.muted, b: true })
      right.push(...pill)
      const spec: RowSpec = { id: n.id, left: clean(left), right: clean(right) }
      if (isNow) spec.bg = tint(toneColor, 0.13, theme.bg || undefined)
      return spec
    }

    const note = (text: string): RowSpec => noteRow(text, { theme })
    let specs: RowSpec[] = [
      ...(rows.length === 0 ? [note('empty')] : []),
      ...pinned.map(rowSpec),
      ...(pinned.length > 0 ? [note('  ⋮')] : []),
      ...shown.map(rowSpec),
    ]
    if (nativeScroll) {
      let size = 0
      const cut = specs.findIndex(r => (size += JSON.stringify(r).length + 1) > ROWS_BUDGET)
      if (cut >= 0) specs.splice(cut, specs.length - cut, note(`  … ${specs.length - cut} more rows, collapse folders or use search`))
    }
    // The crew view: every file the agents changed, under its folder, a dot for each agent that touched it.
    const { value: runs = [] } = t.crewView ? await $.state.get(AGENTS) : { value: [] }
    let crewBar: RowsProps['bar']
    if (t.crewView) {
      const byFile = new Map<string, ChangedFile>()
      for (const run of runs)
        for (const f of run.files ?? []) {
          if (!f.isEdit) continue
          const path = posix(f.path)
          const who = byFile.get(path)?.who ?? []
          const color = TIER_COLOR[colorTierOf(run.type, run.job)] ?? TIER_COLOR.other ?? theme.muted
          byFile.set(path, { path, who: [...who, { color, label: run.description }] })
        }
      const crew = runs.filter(run => (run.files ?? []).some(f => f.isEdit)).length
      const body = changeRows([...byFile.values()], { root: t.root, git: t.git, diff: t.diff, theme, unicode, width: width - (nativeScroll ? 0 : 1), prefix: 'file:', lit: litOf(t) })
      const head = byFile.size
        ? noteRow(`${crew} agent${crew === 1 ? '' : 's'} · ${byFile.size} file${byFile.size === 1 ? '' : 's'} changed`, { theme })
        : noteRow('no agent has changed a file yet', { theme })
      // The terminal shows a window of it under its summary line, as the tree is shown: the
      // wheel, the page keys and (once clicked) the arrows scroll it. The desktop scrolls the pane.
      const fit = nativeScroll ? body.length : Math.max(1, room - 1)
      const crewMax = Math.max(0, body.length - fit)
      const crewFrom = Math.max(0, Math.min(t.scroll ?? 0, crewMax))
      if (!nativeScroll) view = { from: crewFrom, max: crewMax, page: Math.max(1, fit - 1) }
      specs = [head, ...body.slice(crewFrom, crewFrom + fit)]
      crewBar =
        crewMax > 0
          ? (() => {
              const size = Math.max(1, Math.round((fit * fit) / body.length))
              return { pos: 1 + Math.round((crewFrom / crewMax) * (fit - size)), size, thumb: theme.accent, track: theme.muted }
            })()
          : undefined
    }
    const barSize = Math.max(1, Math.round((specs.length * shown.length) / Math.max(1, rows.length)))
    const bar = t.crewView
      ? crewBar
      : !nativeScroll && rows.length > shown.length + pinned.length
        ? { pos: max ? Math.round((from / max) * (specs.length - barSize)) : 0, size: barSize, thumb: theme.accent, track: theme.muted }
        : undefined

    // In the app's Crewdeck panel the rows are drawn natively, with pictures: outline folders,
    // rounded chips, a lit name's shimmer. A press reaches the node, or shows a touched file.
    const pictures = (appPictures || !Client) && isDeck && remote && 'Svg' in ui
    const nativeOpts = {
      pictures: true,
      tones: SHIMMER,
      active: t.cursor,
      activeBg: soft(theme.selection),
      hoverBg: faint(theme.selection),
      cols: width,
      guide,
      keyOf: (r: RowSpec, i: number) => `row-${r.id || i}`,
      onPress: (r: RowSpec) => {
        if (r.id.startsWith('file:')) return void showFile($, r.id.slice('file:'.length), false)
        const n = t.nodes.find(x => x.id === r.id)
        if (n) void press($, n)
      },
    }
    // The card above the tree: the files Claude and the agents touched, each with a pill saying how.
    const ground = theme.bg || undefined
    const touchedList = t.crewView || t.preview ? [] : (t.touched ?? []).filter(x => inside(t.root, x.path))
    const byCrew = touchedList.some(x => x.tone.startsWith('tier-'))
    const touchedRows: RowSpec[] = touchedList.slice(0, TOUCHED_SHOWN).map(x => {
      const name = x.path.split('/').pop() || x.path
      const folder = relative(t.root, dirname(x.path))
      const color = TONES[x.tone]?.solid ?? theme.accent
      const pill = pillSegs(x.label, color, ground)
      const room = Math.max(4, width - 6 - 6 - pill.reduce((n, p) => n + p.t.length, 0))
      const shortName = name.length > room ? name.slice(0, room - 1) + '…' : name
      const rest = room - shortName.length - 2
      const where = folder && rest > 3 ? (folder.length > rest ? '…' + folder.slice(-(rest - 1)) : folder) : ''
      const icon = fileIconSegs(x.path, { theme })
      return {
        id: `file:${x.path}`,
        left: clean([...icon, { t: shortName, c: theme.fg || undefined, b: true }, ...(where ? [{ t: `  ${where}`, c: theme.muted }] : [])]),
        right: clean(pill),
      }
    })
    if (touchedList.length > TOUCHED_SHOWN) touchedRows.push({ id: '', left: [{ t: `+${touchedList.length - TOUCHED_SHOWN} more`, c: theme.muted }], right: [] })
    const rootName = (t.top ? t.top.split('/').pop() : t.root.split('/').pop()) || t.root
    const touchedCard =
      touchedRows.length > 0 ? (
        <Box key="touched-card" flexDirection="column" borderStyle="round" borderColor={faint(theme.muted)} paddingX={1} marginBottom={1}>
          <Box flexDirection="row">
            <Text bold color={theme.muted}>
              {byCrew ? 'CLAUDE & CREW TOUCHED' : 'CLAUDE TOUCHED'}
            </Text>
            <Box flexGrow={1} />
            <Text bold color={theme.muted}>{`${touchedList.length} FILE${touchedList.length === 1 ? '' : 'S'}`}</Text>
          </Box>
          {pictures || !Client ? (
            <Box key="touched" flexDirection="column">
              {nativeRows(ui as never, touchedRows, { ...nativeOpts, active: '' })}
            </Box>
          ) : (
            <Client key="touched" module="./rows.tsx" props={{ rows: touchedRows, active: '', activeBg: theme.selection, hoverBg: faint(theme.selection), tones: SHIMMER, pointer } satisfies RowsProps} />
          )}
        </Box>
      ) : null

    const branchRow = () => {
      if (!t.top || !t.branch) return null
      const b = t.branch
      const isFlash = bright.has(BRANCH_ROW)
      const tone = t.flashTones[BRANCH_ROW] ?? 'teal'
      const label = b.head
      // In the terminal the branch is a chip of cells: its mark, name, and how far ahead and behind.
      if (cellRows) {
        const ground = mix('#262626', theme.accent, 0.22)
        const mark = isFlash ? (TONES[tone]?.solid ?? theme.accent) : theme.accent
        return (
          <Box key="branch" flexDirection="row" height={1} overflow="hidden" paddingRight={2}>
            <Box flexDirection="row" flexShrink={0}>
              <Text color={mark} backgroundColor={ground}>{` ${unicode ? BRANCH_ICON.plain : BRANCH_ICON.nerd} `}</Text>
              <Text bold color={theme.fg || undefined} backgroundColor={ground}>
                {label}
              </Text>
              {b.ahead > 0 && <Text color={TONES.teal?.solid} backgroundColor={ground}>{` ↑${b.ahead}`}</Text>}
              {b.behind > 0 && <Text color={TONES.blue?.solid} backgroundColor={ground}>{` ↓${b.behind}`}</Text>}
              <Text backgroundColor={ground}> </Text>
            </Box>
            {b.upstream && (
              <Box flexShrink={1} overflow="hidden">
                <Text color={theme.muted} wrap="truncate-end">
                  {` ${b.upstream}`}
                </Text>
              </Box>
            )}
            <Box flexGrow={1} />
            <Box flexDirection="row" flexShrink={0}>
              {totals[0] > 0 && <Text color={ADD_COLOR}>{` +${totals[0]}`}</Text>}
              {totals[1] > 0 && <Text color={DEL_COLOR}>{` -${totals[1]}`}</Text>}
              {rootCounts.map(c => (
                <Text color={c.c}>{c.t}</Text>
              ))}
              {rootCounts.length === 0 && totals[0] === 0 && totals[1] === 0 && <Text color={theme.muted}> clean</Text>}
            </Box>
          </Box>
        )
      }
      // In the app's panel the branch is a pill: a branch mark, its name, how far ahead and behind.
      if (chips && Svg) {
        const pill = branchPill(label, b.ahead, b.behind, isFlash ? (TONES[tone]?.solid ?? theme.accent) : theme.accent, theme.fg || '#e4e2dc')
        return (
          <Box key="branch" flexDirection="row" alignItems="center" gap={1}>
            <Svg key="branch-pill" source={pill.source} alt={`branch ${label}`} width={pill.w} height={pill.h} />
            {b.upstream ? (
              <Box flexShrink={1} overflow="hidden">
                <Text color={theme.muted} wrap="truncate-end">
                  {b.upstream}
                </Text>
              </Box>
            ) : null}
            <Box flexGrow={1} />
            <Box flexDirection="row" flexShrink={0}>
              {totals[0] > 0 && <Text color={ADD_COLOR}>{` +${totals[0]}`}</Text>}
              {totals[1] > 0 && <Text color={DEL_COLOR}>{` -${totals[1]}`}</Text>}
              {rootCounts.map(c => (
                <Text color={c.c}>{c.t}</Text>
              ))}
              {rootCounts.length === 0 && totals[0] === 0 && totals[1] === 0 && <Text color={theme.muted}> clean</Text>}
            </Box>
          </Box>
        )
      }
      return (
        <Box key="branch" flexDirection="row" height={1} overflow="hidden">
          <Box flexDirection="row" flexShrink={0}>
            <Text color={isFlash ? (TONES[tone]?.solid ?? theme.accent) : theme.accent}>{(unicode ? BRANCH_ICON.plain : BRANCH_ICON.nerd) + ' '}</Text>
            <Text bold color={isFlash ? (TONES[tone]?.solid ?? (theme.fg || undefined)) : theme.fg || undefined}>
              {label}
            </Text>
            {b.ahead > 0 && <Text color={TONES.teal?.solid}>{` ↑${b.ahead}`}</Text>}
            {b.behind > 0 && <Text color={TONES.blue?.solid}>{` ↓${b.behind}`}</Text>}
          </Box>
          {b.upstream && (
            <Box flexShrink={1} overflow="hidden">
              <Text color={theme.muted} wrap="truncate-end">
                {` ${b.upstream}`}
              </Text>
            </Box>
          )}
          <Box flexGrow={1} />
          <Box flexDirection="row" flexShrink={0}>
            {totals[0] > 0 && <Text color={ADD_COLOR}>{` +${totals[0]}`}</Text>}
            {totals[1] > 0 && <Text color={DEL_COLOR}>{` -${totals[1]}`}</Text>}
            {rootCounts.map(c => (
              <Text color={c.c}>{c.t}</Text>
            ))}
            {rootCounts.length === 0 && totals[0] === 0 && totals[1] === 0 && <Text color={theme.muted}> clean</Text>}
          </Box>
        </Box>
      )
    }

    const chip = (a: Activity) => {
      const tone = a.state === 'failed' ? 'red' : a.tone
      const color = TONES[tone]?.solid ?? theme.accent
      const icon = unicode ? a.plain : a.nerd
      const hash = a.state === 'done' && a.kind === 'git commit' ? a.detail.split(' ')[0] ?? '' : ''
      return (
        <Box flexDirection="row" marginLeft={2}>
          <Text color={color}>{icon + ' '}</Text>
          <Text bold={a.state === 'running'} color={color}>
            {a.state === 'running' ? `${a.label}…` : a.label}
          </Text>
          {hash && <Text color={theme.muted}>{` ${hash}`}</Text>}
        </Box>
      )
    }

    const headRow = (
      <Box key="head-row" flexDirection="row">
        <Text bold color={theme.accent} wrap="truncate-start">
          {header}
        </Text>
        <Box flexGrow={1} />
        {hint(buttons, header.length)}
        <Box key="toolbar" flexDirection="row" gap={1}>
          {buttons.map(button)}
          {chips ? null : <Text> </Text>}
        </Box>
      </Box>
    )
    // In the app a few pixels of air between the header's lines: a cell is too tall a step.
    const air = (key: string, px: number) => (chips && Svg ? <Svg key={key} source={`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${px}"/>`} alt="space" width={1} height={px} /> : null)
    // Everything under the header, in order.
    const body = [
      air('air-head', 6),
      branchRow(),
      !t.top && showHints ? (
        chips && Svg ? (
          <Box key="no-git" flexDirection="row" alignItems="center" gap={1}>
            <Svg key="no-git-pill" {...(() => { const p = branchPill('no git repo', 0, 0, theme.muted, theme.muted); return { source: p.source, width: p.w, height: p.h } })()} alt="no git repo" />
            <Text color={theme.muted}>git status starts after git init</Text>
          </Box>
        ) : cellRows ? (
          <Box key="no-git" flexDirection="row">
            <Text color={theme.muted} backgroundColor={mix('#262626', theme.muted, 0.22)}>{` ${unicode ? '±' : '\u{e702}'} no git repo `}</Text>
            <Text color={theme.muted} wrap="truncate-end">
              {' git status starts after git init'}
            </Text>
          </Box>
        ) : (
          <Text key="no-git" color={theme.muted}>
            {unicode ? '± ' : '\u{e702} '}no git repo · git status starts after git init
          </Text>
        )
      ) : null,
      air('air-git', 8),
      // The phone draws no field yet: no search there.
      Input ? (
        <Box key="search-row" flexDirection="row" {...(searchBox ? { borderStyle: 'round', borderColor: faint(theme.muted), paddingX: 1 } : {})}>
          <Box flexGrow={1}>
            <Input
              key="q"
              {...(searchBox || chips ? {} : { label: '/ ' })}
              placeholder={searchBox ? '⌕ search files…' : chips ? '⌕  Search files' : 'search'}
              submitLabel={chips ? '↵' : 'jump'}
              autoFocus
              value={t.query}
              onInput={(v: string) => void search($, v)}
              onSubmit={(v: string) => void jump($, v)}
            />
          </Box>
          {t.query ? <Button key="clear" plain dimColor label={unicode ? '×' : '\u{f0156}'} onPress={() => void search($, '')} /> : null}
        </Box>
      ) : null,
      air('air-search', 10),
      touchedCard,
      !t.crewView ? (
        // In the terminal the right end stops two cells short, in line with the rows' dates (the
        // scroll bar's cell and a space follow them), not against the panel's edge.
        <Box key="all-files" flexDirection="row" {...(cellRows ? { paddingRight: 2 } : {})}>
          <Text bold color={theme.muted}>
            ALL FILES
          </Text>
          <Box flexGrow={1} />
          <Text bold color={theme.muted} wrap="truncate-start">
            {rootName.toUpperCase()}
          </Text>
        </Box>
      ) : null,
      pictures || !Client ? (
        <Box key="rows" flexDirection="column">
          {nativeRows(ui as never, specs, nativeOpts)}
        </Box>
      ) : (
        <Client
          key="rows"
          module="./rows.tsx"
          props={{ rows: specs, active: t.cursor, activeBg: soft(theme.selection), hoverBg: faint(theme.selection), tones: SHIMMER, pointer, ...(bar ? { bar } : {}) } satisfies RowsProps}
        />
      ),
      <Box key="rest" flexGrow={1} />,
      t.selected || latest ? (
        <Box key="selected" flexDirection="row">
          {t.selected ? (
            <Box flexShrink={1}>
              <Text dimColor wrap="truncate-start">
                selected: {t.selected !== t.root && inside(t.root, t.selected) ? t.selected.slice(t.root.endsWith('/') ? t.root.length : t.root.length + 1) : shortPath(t.selected)}
              </Text>
            </Box>
          ) : null}
          <Box flexGrow={1} />
          {latest && chip(latest)}
        </Box>
      ) : null,
    ].filter(Boolean)
    const rootStyle = { minHeight: nativeScroll && isDeck ? 1 : bodyRows, backgroundColor: theme.bg || undefined }
    // In the app the header's tips hang below its buttons, over the tree: the app paints a later
    // element over an earlier one, so the header is drawn last and shown first (column-reverse).
    if (chips) {
      return (
        <Box flexDirection="column-reverse" {...rootStyle}>
          {[...body].reverse()}
          {headRow}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" {...rootStyle}>
        {headRow}
        {body}
      </Box>
    )
  })
}
