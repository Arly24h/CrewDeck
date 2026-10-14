import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type { AgentRun, Flow, Panel, Phase, PlannedTask } from '../../types'
import { AGENTS_PANE, baseName, colorTierOf, deck, DECK_PANE, DECK_TITLE, defaultJobOf, filePathOf, faint, mix, noteFiles, notesNothing, slashed, TIER_COLOR, TIERS, tierOfType } from '../crew'
import { changeRows, type ChangeLook, noteRow, sumLines, toggleRow } from '../files/changes'
import { SHIMMER } from '../files/git'
import { nativeRows } from '../files/native'
import { plainGlyphs } from '../files/register'
import type { RowSpec, Seg } from '../files/rows'
import { DEFAULT_THEME } from '../files/tree'

const flow = atom({ plugin: 'crewdeck', key: 'flow' } as const, null)
const agents = atom({ plugin: 'crewdeck', key: 'agents' } as const, [])
const panel = atom({ plugin: 'crewdeck', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'crewdeck', key: 'now' } as const, 0)
// The file tree's git status, lines changed and colors, which an agent's open card draws its files with.
const GITVIEW = { plugin: 'crewdeck', key: 'gitview' } as const
const THEME = { plugin: 'crewdeck', key: 'theme' } as const
// What the file tree has lit right now: an open card shimmers the same files.
const LIT = { plugin: 'crewdeck', key: 'lit' } as const

const TOOL = 'mcp__crewdeck__progress'
const STEP_TOOL = 'mcp__crewdeck__step'
// Added to the end of each savvy worker's brief. Their system prompt words step
// reporting as a condition ("if the step tool appears among your tools") and they
// skip it even with the tool listed; the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: if the \`${STEP_TOOL}\` tool is available to you, call it before any other work with \`total\` (your plan in 3-8 steps) and \`done: 0\`, then again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar; skip it if the tool is not there.`
const PANE = AGENTS_PANE
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
// The tools' schemas are advice to the model, not a check: what a call may ask
// the band and the panel to draw is bounded here.
const MAX_TASKS = 200
const MAX_AFTER = 20
const MAX_TITLE = 120
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Hebrew or Russian.

type Lang = 'en' | 'ru' | 'he'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Crewdeck panel opened.',
    closed: 'Crewdeck panel closed.',
    changedCount: 'changed',
    readCount: 'read',
    noChanges: 'no changes yet',
    keysIdle: 'ctrl+x tab: use the keyboard here',
    keysFocused: '1-9 files · tab/↑↓ next · PgUp PgDn scroll · esc back',
    crewDone: 'Crew done',
    idleTitle: "No agents running",
    idleHint: "They'll show up here when Claude starts one.",
    agentOne: 'agent',
    filesChanged: 'files changed',
    budgetNear: 'Agents have spent {cost} of your {budget} budget.',
    budgetOver: 'Agents are over your {budget} budget: {cost} spent.',
    budgetIs: "Budget: {budget} (US dollars) for this session's subagents.",
    budgetSpent: "Agents have spent {cost} so far ({pct}%).",
    budgetHow: "Change it with /crewdeck-budget 5, or /crewdeck-budget off.",
    budgetNone: "No budget set. Set one in US dollars, e.g. /crewdeck-budget 2 for $2.00. Agents have spent {cost} so far.",
    budgetBad: "The budget is in US dollars: give a number, like /crewdeck-budget 2 for $2.00 or /crewdeck-budget 0.50. \"{arg}\" isn't one.",
    budgetSet: "Budget set to {budget} (US dollars).",
    budgetOff: "Budget off.",
    budgetLocal: "(This session only: the setting could not be saved.)",
    budgetPast: "Already past it.",
    budgetNearNow: "Already near it.",
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    ctx: 'ctx',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель Crewdeck открыта.',
    closed: 'Панель Crewdeck закрыта.',
    changedCount: 'изменено',
    readCount: 'прочитано',
    noChanges: 'изменений пока нет',
    keysIdle: 'ctrl+x tab: управление с клавиатуры',
    keysFocused: '1-9 файлы · tab/↑↓ далее · PgUp PgDn прокрутка · esc назад',
    crewDone: 'Команда закончила',
    idleTitle: "Агенты не запущены",
    idleHint: "Они появятся здесь, когда Claude запустит агента.",
    agentOne: 'агент',
    filesChanged: 'файлов изменено',
    budgetNear: 'Агенты потратили {cost} из бюджета {budget}.',
    budgetOver: 'Агенты превысили бюджет {budget}: потрачено {cost}.',
    budgetIs: "Бюджет: {budget} (доллары США) на субагентов этой сессии.",
    budgetSpent: "Агенты уже потратили {cost} ({pct}%).",
    budgetHow: "Изменить: /crewdeck-budget 5, отключить: /crewdeck-budget off.",
    budgetNone: "Бюджет не задан. Задайте его в долларах США, например /crewdeck-budget 2 для $2.00. Агенты уже потратили {cost}.",
    budgetBad: "Бюджет задаётся в долларах США: укажите число, например /crewdeck-budget 2 для $2.00 или /crewdeck-budget 0.50. «{arg}» не подходит.",
    budgetSet: "Бюджет: {budget} (доллары США).",
    budgetOff: "Бюджет отключён.",
    budgetLocal: "(Только для этой сессии: настройку не удалось сохранить.)",
    budgetPast: "Он уже превышен.",
    budgetNearNow: "Он уже почти исчерпан.",
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    ctx: 'ctx',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    opened: 'חלונית Crewdeck נפתחה.',
    closed: 'חלונית Crewdeck נסגרה.',
    changedCount: 'שונו',
    readCount: 'נקראו',
    noChanges: 'עדיין אין שינויים',
    keysIdle: 'ctrl+x tab: שליטה במקלדת',
    keysFocused: '1-9 קבצים · tab/↑↓ הבא · PgUp PgDn גלילה · esc חזרה',
    crewDone: 'הצוות סיים',
    idleTitle: "אין סוכנים פעילים",
    idleHint: "הם יופיעו כאן כש-Claude יפעיל סוכן.",
    agentOne: 'סוכן',
    filesChanged: 'קבצים שונו',
    budgetNear: 'הסוכנים הוציאו {cost} מתוך תקציב של {budget}.',
    budgetOver: 'הסוכנים חרגו מתקציב של {budget}: הוצאו {cost}.',
    budgetIs: "תקציב: {budget} (דולר אמריקאי) לסוכני המשנה של הסשן הזה.",
    budgetSpent: "הסוכנים הוציאו עד כה {cost} ({pct}%).",
    budgetHow: "לשינוי: /crewdeck-budget 5, לכיבוי: /crewdeck-budget off.",
    budgetNone: "לא הוגדר תקציב. הגדירו אותו בדולר אמריקאי, למשל /crewdeck-budget 2 עבור $2.00. הסוכנים הוציאו עד כה {cost}.",
    budgetBad: "התקציב הוא בדולר אמריקאי: כתבו מספר, למשל /crewdeck-budget 2 עבור $2.00 או /crewdeck-budget 0.50. \"{arg}\" אינו מספר כזה.",
    budgetSet: "התקציב הוגדר ל-{budget} (דולר אמריקאי).",
    budgetOff: "התקציב כובה.",
    budgetLocal: "(לסשן הזה בלבד: לא ניתן היה לשמור את ההגדרה.)",
    budgetPast: "הוא כבר נחצה.",
    budgetNearNow: "הוא כבר קרוב.",
    done: 'הושלם',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    ctx: 'הקשר',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: crab and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Tier and effort words as shown; anything unknown shows as it came.
const tierWord = (tier: string): string => (tr().tier as Record<string, string>)[tier] ?? tier
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())
const isHebrew = (v: unknown): boolean => typeof v === 'string' && /^(he|iw|hebrew|עברית)/i.test(v.trim())
const langOf = (v: unknown): Lang => (isHebrew(v) ? 'he' : isRussian(v) ? 'ru' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru' || option === 'he') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

const blank = (): Flow => ({
  title: 'Plan',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

// With no plan reported, the bar follows the agents themselves: the batch running now (and those
// that finished since the oldest running one started), how many of it are done. Gone once all are.
const crewFlow = (list: readonly AgentRun[]): Flow | null => {
  const running = list.filter(a => a.status === 'running')
  if (!running.length) return null
  const since = Math.min(...running.map(a => a.startedAt))
  const batch = list.filter(a => a.status === 'running' || (a.endedAt ?? 0) >= since)
  return { ...blank(), title: tr().pane, total: batch.length, done: batch.length - running.length, running: running.length, phase: 'delegate' }
}

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

// Only a known tier is kept: the name is later a key into the tier tables.
const tierName = (v: string): string => {
  const t = v.replace(/^savvy-/, '').trim().toLowerCase()
  return TIERS.includes(t) ? t : ''
}

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TASKS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: tierName(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_AFTER),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TASKS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 22
const BAR_H = 16
const CRAB_W = 26
// The crab's drawing grid is 30 units wide, props included.
const CRAB_BOX = 30
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const rowSvg = (f: Flow, W: number, isWorking: boolean, tint?: string): string => {
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const color = tint ?? (f.isFinished ? DONE : ACCENT)
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0
  const dots: string[] = []
  // Positions are worked out left to right; right to left mirrors each box
  // inside the bar (`bx`) and across the row (`rx`). Text is never mirrored.
  const rtl = isRtl()
  const bx = (x: number, w: number): number => (rtl ? BAR_W - x - w : x)
  const rx = (x: number, w: number): number => (rtl ? W - x - w : x)

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${bx(c * CELL + 1, 2)}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${bx(c * CELL + 1, 1.7)}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${bx(x, 1.5)}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f)
  const pillW = Math.round(18 + text.length * 6.6)
  const pillX = bx(Math.max(0, Math.min(BAR_W - pillW, fillW - pillW)), pillW)
  const percent = `${Math.round(ratio(f) * 100)}%`
  // `direction="rtl"` puts Hebrew words and numbers in reading order; `start` is then the right edge.
  const titleAt = rtl ? `x="${W - 16}" direction="rtl" text-anchor="start"` : 'x="16"'
  const percentAt = rtl ? `x="${CRAB_W + 6}" y="${H / 2 + 4.5}"` : `x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end"`
  const crabW = CRAB_BOX * 0.8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="${rtl ? W - 5 : 5}" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" ${titleAt} y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${rx(BAR_X, BAR_W)},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
</g>
<text class="m" ${percentAt} font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${CRAB_CSS}${crab(rx(W - CRAB_W + 1, crabW), 0, 'other', false, isWorking, 0.8, rtl)}
</svg>`
}

const barText = (f: Flow, width: number): string => ctxBar(ratio(f) * 100, width)

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.


// What each savvy tier runs on, for planned tasks that have no run yet.
const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, [model: string, effort: string]> = {
  fable: ['Fable', 'high'],
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
}

// "Opus · xhigh", with the effort word in the panel's language; '' for an unknown tier.
const tierModel = (tier: string): string => {
  const m = TIER_MODEL[tier]
  return m ? `${m[0]} · ${effortWord(m[1])}` : ''
}

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model))

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

const tierOf = tierOfType

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

// The pane's backdrop: a dotted grid as tall as the content laid over it; the
// row SVGs are transparent, so it shows through between their marks.
const GRID_STEP = 16
// A Text or Button row on the desktop is about 20px; the grid errs taller.
const LINE_H = 24
// The engine refuses an Svg taller than 4096px, so a long grid is stacked from
// tiles of at most this height; a multiple of GRID_STEP keeps the dots aligned.
const GRID_TILE = 4096
const gridTiles = (H: number) => Array.from({ length: Math.ceil(H / GRID_TILE) }, (_, i) => Math.min(GRID_TILE, H - i * GRID_TILE))
const gridSvg = (W: number, H: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle class="d" cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// The desktop's crabs flip through the same pixel frames the terminal paints: eight poses a
// second while their agent works (walking and doing its job), each shown for an eighth of a
// second by CSS alone, no redraws; a crab that just finished cheers three times round, then stands.
// Whole frames, never a transform, so the pixel art stays crisp.
const CRAB_CSS = `<style>
.crab .fr{opacity:0}
.crab.run .still,.crab.cheer .still{opacity:0}
.crab.run .fr{animation:crab-fr 1s steps(1) infinite}
.crab.cheer .fr{animation:crab-fr 1s steps(1) 3}
.crab .f1{animation-delay:-.875s!important}.crab .f2{animation-delay:-.75s!important}.crab .f3{animation-delay:-.625s!important}.crab .f4{animation-delay:-.5s!important}.crab .f5{animation-delay:-.375s!important}.crab .f6{animation-delay:-.25s!important}.crab .f7{animation-delay:-.125s!important}
@keyframes crab-fr{0%{opacity:1}12.5%,100%{opacity:0}}
.crab.cheer .still{animation:crab-back 2.75s steps(1) forwards}
@keyframes crab-back{0%{opacity:0}100%{opacity:1}}
@media (prefers-reduced-motion: reduce){.crab .fr{display:none}.crab.run .still,.crab.cheer .still{opacity:1;animation:none}}
</style>`



// The crab dresses for the work: its job comes from the task's name when the agent starts, then
// from what the agent clearly does. A costume key is the job, with `+<tier>` when the agent's tier
// tints a job that is not its own, so a light coder and a heavy coder keep their tier's color.
const JOB_WORDS: readonly (readonly [job: string, words: RegExp])[] = [
  ['heavy', /\b(schemas?|databases?|db|sql|data models?|architecture|architect|er diagram|migrations?|quer(y|ies)|indexes|pipelines?|etl|warehouse)\b/],
  ['careful', /\b(tests?|testing|qa|verify|verification|validate|validation|e2e|regressions?|bugs?|repro|reproduce)\b/],
  ['explore', /\b(reviews?|audit|research|investigate|explore|search|find|look|read|analy[sz]e|analysis|understand|compare|survey)\b/],
  ['fable', /\b(plan|planning|roadmap|coordinate|organi[sz]e|prioriti[sz]e|scope|specs?|sprint|breakdown|estimate|lead)\b/],
  ['light', /\b(build|implement|code|coding|fix|refactor|write|add|create|wire|port|scaffold|integrate|ship|endpoints?|api|functions?|script|cli|backend|frontend|deploy)\b/],
  ['medium', /\b(designs?|ui|ux|css|styles?|styling|layout|landing|mockups?|figma|graphics?|icons?|theme|logo|branding|visuals?|illustrations?|animations?)\b/],
]

const jobFromText = (text: string): string | undefined => {
  const t = norm(text)
  return JOB_WORDS.find(([, words]) => words.test(t))?.[0]
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'LSP', 'WebSearch', 'WebFetch'])
const TEST_PATH = /(^|[./_-])(tests?|specs?)([./_-]|$)|__tests__/i
const DATA_PATH = /\.(sql|prisma|graphql|gql|dbml)$|schema|migrations?[/\\]/i
const DESIGN_PATH = /\.(css|scss|sass|less|svg|png|jpe?g|webp|fig|sketch)$|tailwind|theme|styles?[/\\]/i
const TEST_COMMAND = /\b(tests?|jest|vitest|pytest|mocha|playwright|cypress|rspec|phpunit|tox|ctest)\b/
const DATA_COMMAND = /\b(psql|sqlite3?|mysql|mongosh|prisma|knex|alembic|dbt|migrate)\b/

// What one model request's tool calls clearly show: a job, `read` when it only read, else nothing.
const jobFromStep = (uses: readonly { name: string; input: unknown }[]): string | undefined => {
  let isReading = uses.length > 0
  for (const use of uses) {
    const input = (use.input ?? {}) as Record<string, unknown>
    if (EDIT_TOOLS.has(use.name)) {
      const path = String(input.file_path ?? input.notebook_path ?? input.path ?? '')
      return TEST_PATH.test(path) ? 'careful' : DATA_PATH.test(path) ? 'heavy' : DESIGN_PATH.test(path) ? 'medium' : 'light'
    }
    if (use.name === 'Bash') {
      const command = String(input.command ?? '')
      if (TEST_COMMAND.test(command)) return 'careful'
      if (DATA_COMMAND.test(command)) return 'heavy'
    }
    if (/figma|penpot|canva/i.test(use.name)) return 'medium'
    if (!READ_TOOLS.has(use.name)) isReading = false
  }
  return isReading ? 'read' : undefined
}

// Steps of reading only, with no work seen yet, before a crab turns code reviewer.
const READS_TO_REVIEW = 3

const withStep = (a: AgentRun, seen: string | undefined): AgentRun => {
  if (seen === undefined) return a
  if (seen !== 'read') return { ...a, job: seen, readSteps: 0, hasWorked: true }
  const readSteps = (a.readSteps ?? 0) + 1
  return { ...a, readSteps, job: !a.hasWorked && readSteps >= READS_TO_REVIEW ? 'explore' : a.job }
}

const dressAs = (job: string | undefined, tier: string): string => (!job || job === tier ? tier : `${job}+${tier}`)
// An agent's crab: its job (from its name or tools, else its tier's own job, else its type's default)
// in the color its card and its file activity take (colorTierOf), so all three always agree.
const costumeFor = (a: AgentRun): string => {
  const tier = tierOf(a.type)
  return dressAs(a.job ?? (tier !== 'other' ? tier : defaultJobOf(a.type)), colorTierOf(a.type, a.job))
}
// The color an agent's card and file activity take: its tier's, or its job's when it has none.
const agentColor = (a: AgentRun): string => colorOf(colorTierOf(a.type, a.job))
const planCostume = (title: string, tier: string): string => dressAs(jobFromText(title), tier)


// An agent's card, opened: a row that opens and closes it, then the files it changed under their
// folders, drawn as the file tree draws them, and a line of what it only read.
const changesOf = (a: AgentRun, isOpen: boolean, look: ChangeLook): RowSpec[] => {
  const files = a.files ?? []
  if (!files.length) return []
  const edited = files.filter(f => f.isEdit).map(f => slashed(f.path))
  const reads = files.filter(f => !f.isEdit)
  const s = tr()
  const text = [edited.length ? `${edited.length} ${s.changedCount}` : '', reads.length ? `${reads.length} ${s.readCount}` : ''].filter(Boolean).join(' · ')
  const rows = [toggleRow(`toggle:${a.id}`, isOpen, text, sumLines(edited, look.diff), look)]
  if (!isOpen) return rows
  if (edited.length) rows.push(...changeRows(edited.map(path => ({ path })), { ...look, indent: (look.indent ?? 0) + 2 }))
  else rows.push(noteRow(`    ${s.noChanges}`, look))
  if (reads.length) {
    const names = reads.slice(0, 4).map(f => baseName(f.path)).join(', ')
    rows.push(noteRow(`    ◎ ${s.readCount} ${names}${reads.length > 4 ? ` +${reads.length - 4}` : ''}`, look))
  }
  return rows
}

const filesLine = (a: AgentRun): string => {
  const files = a.files ?? []
  const edited = files.filter(f => f.isEdit)
  const shown = edited.length ? edited : files
  if (!shown.length) return ''
  const more = shown.length > 2 ? ` +${shown.length - 2}` : ''
  return `${edited.length ? '✎' : '◎'} ${shown.slice(0, 2).map(f => baseName(f.path)).join(', ')}${more}`
}

const CRAB_SCALE = 1.1

// `mirror` flips the crab inside its own box (x .. x + CRAB_BOX * scale) so it faces left; `stagger`
// starts its loop that many frames on, so crabs side by side don't move in step.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, mirror = false, isCheering = false, stagger = 0): string => {
  const moving = isWalking || isCheering
  const frames = moving ? Array.from({ length: CRAB_FRAMES }, (_, slot) => `<g class="fr f${slot}">${pixelRects(costume, (isCheering ? 10 : 0) + ((slot + stagger) % CRAB_FRAMES))}</g>`).join('') : ''
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  const cls = `crab c-${costume.split('+')[0]}${isWalking ? ' run' : isCheering ? ' cheer' : ''}`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="${cls}"><g class="still">${pixelRects(costume, -1)}</g>${frames}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

// ---------------------------------------------------------------------------
// Terminal sprites: the same costumes, drawn as cells for a `Raster`.
// A costume is painted into its 30×28 grid in the order the SVG paints it (body and
// costume, then props, then legs), shrunk to SPRITE_W × (2 × SPRITE_ROWS) pixels, and
// written as half blocks: a cell holds two pixels, the upper as its character's color
// and the lower as its background.

const SPRITE_W = 20
const SPRITE_ROWS = 9
const SPRITE_PX = SPRITE_ROWS * 2
const CRAB_ROWS = 28
// A shrunk pixel shows when at least this much of its square is painted; the costume's
// own colors count ACCENT_BIAS times over the body's, so the eyes and the hat survive.
const MIN_COVER = 0.25
const ACCENT_BIAS = 2.4
const DEFAULT_CELL = 0x01000000
// The pane must be at least this many columns wide for a crab to sit beside an agent's text.
const CRAB_MIN_COLUMNS = 64

type Px = readonly [r: number, g: number, b: number]

const parseColor = (c: string): { px: Px; a: number } => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1] ?? ''
    const v = h.length === 3 ? [...h].map(x => x + x).join('') : h
    return { px: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)], a: 1 }
  }
  const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c)
  if (rgba) return { px: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], a: Number(rgba[4]) }
  return { px: [136, 135, 128], a: 1 }
}

const mixPx = (under: Px, over: Px, a: number): Px => [0, 1, 2].map(i => Math.round((under[i] ?? 0) * (1 - a) + (over[i] ?? 0) * a)) as unknown as Px

// The left pincer, from 3 columns outside the arm to the body's edge: two jaws open around a gap.
const PINCER = ['ccccc..', 'cccccc.', '...cccc', '...cccc', 'cccccc.', 'ccccc..']

// Open pincers in place of crabBody's square arms, on both surfaces.
const withPincers =
  (f: Fill): Fill =>
  (x, y, w, h, c, cls) => {
    if (c !== CLAY || w !== 4 || h !== 4 || (x !== 3 && x !== 23)) return f(x, y, w, h, c, cls)
    const rows = x === 3 ? PINCER : PINCER.map(r => [...r].reverse().join(''))
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => ch === 'c' && f(x - 3 + dx, y - 2 + dy, 1, 1, c, cls)))
  }

// Each tier's crab dressed for its developer job.
const dress = (f: Fill, costume: string, k = -1): void => {
  const [job = costume, tint = job] = costume.split('+')
  const own = JOB_COSTUMES[job]
  if (own) own(f, colorOf(tint), k)
  else crabBody(f)
}

// `k` is the animation frame, 0 to 7 at an eighth of a second each (a second to a loop), or -1 for
// the still pose. Each job moves its props a step a frame and back, so the loop never jumps.
type Costume = (f: Fill, t: string, k: number) => void
const CRAB_FRAMES = 8
const at = <T,>(list: readonly T[], k: number, still: T): T => (k < 0 ? still : (list[k % list.length] ?? still))
// A value held for two frames: things that change four times a second (a blink, a paint).
const slow = (k: number): number => (k < 0 ? k : k >> 1)

// The coder's monitor: lines of code that scroll up a row a frame.
const CODE_ROWS = ['ggkkk', 'kgggk', 'kkggk', 'gggkk', 'kggkk', 'ggggk']

const JOB_COSTUMES: Record<string, Costume> = {
  // Tech lead: a one-ear headset whose mic light blinks, holding up the sprint board, where a
  // ticket walks from to-do to done.
  fable: (f, t, k) => {
    crabBody(f, -4)
    stamp(f, 6, 6, ['....hhhhhhhhhh....', '..hh..........hh..', '.h................'], { h: '#3A3A3C' })
    f(5, 9, 3, 5, t); f(7, 16, 4, 1, '#3A3A3C')
    f(11, 15, 2, 2, at(['#3A3A3C', '#F87171'], slow(k), '#3A3A3C'), 'mic')
    stamp(f, 22, 3, ['ffffffff', 'fwwwwwwf', 'fwwwppwf', 'fwwwppwf', 'fwwwwwwf', 'fwggwwwf', 'fwggwwwf', 'ffffffff'], { f: '#7A4A26', w: '#F4F3EE', p: t, g: '#3DBE5A' }, 'it')
    // The ticket: it slides from the left column across and down into done, where it turns green.
    const Y = '#F5C542'
    const G = '#3DBE5A'
    const [nx, ny, nc] = at<[number, number, string]>([[23, 5, Y], [24, 5, Y], [25, 5, Y], [26, 6, Y], [27, 7, Y], [27, 8, Y], [27, 8, G], [27, 8, G]], k, [23, 5, Y])
    f(nx, ny, 2, 2, nc, 'note')
  },
  // Data architect: glasses and a tie, with a database whose bands light up in turn, like disk activity.
  heavy: (f, _t, k) => {
    crabBody(f, -4)
    f(7, 10, 6, 1, '#D8DAE0'); f(17, 10, 6, 1, '#D8DAE0'); f(13, 11, 4, 1, '#D8DAE0')
    if (k === 6 || k === 7) f(8, 10, 2, 1, '#FFFFFF', 'gl')
    f(14, 16, 2, 2, '#2C3E66'); f(13, 18, 4, 4, '#2C3E66')
    stamp(f, 22, 0, ['.cccccc.', 'cllllllc', 'cllllllc', 'cccccccc', 'kkkkkkkk', 'kkkkkkkk', 'cccccccc', 'cccccccc', 'kkkkkkkk', 'kkkkkkkk', 'cccccccc', '.cccccc.'], { c: '#5B7FA6', l: '#9CC0E6', k: '#2F4763' }, 'it')
    // The two bands' lights fade up and down in turn, like disk activity.
    const L = '#7CF0C8'
    const M = '#4FA595'
    const O = '#2F4763'
    f(23, 4, 2, 2, at([L, M, O, O, O, O, M, L], k, O), 'led1')
    f(23, 8, 2, 2, at([O, O, M, L, L, M, O, O], k, O), 'led2')
  },
  // QA tester: a cap and a net that sweeps back and forth, the bug in it wriggling.
  careful: (f, t, k) => {
    crabBody(f)
    stamp(f, 7, 6, ['...cccccccccc......', '..cccccccccccc.....', '.cccccccccccccvvvvv'], { c: t, v: '#8A5A12' })
    // The net sweeps out and back a pixel a frame.
    const dx = at([0, 1, 2, 3, 4, 3, 2, 1], k, 0)
    stamp(f, dx, 0, ['.rrrrrr.', 'r......r', 'r......r', 'r......r', 'r......r', '.rrrrrr.'], { r: '#C9CCD2' }, 'it')
    stamp(f, dx + 2, 2, at([['.bb.', 'bbbb'], ['b..b', '.bb.'], ['.bb.', 'bbbb'], ['bb..', '.bbb']], slow(k), ['.bb.', 'bbbb']), { b: '#3DBE5A' }, 'it')
    f(dx + 3, 2, 2, 1, INK, 'it'); f(4, 6, 1, 8, '#7A4A26', 'it')
  },
  // Designer: a beret, a brush that dabs (its tip taking each paint in turn) and a palette.
  medium: (f, t, k) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 4, ['........ss.......', '....bbbbbbbbb....', '..bbbbbbbbbbbbb..', '.bbbbbbbbbbbbbbbb'], { s: t, b: t })
    // The brush dabs down and lifts, a pixel a frame, taking a new paint each dab.
    const dy = at([0, 1, 2, 3, 3, 2, 1, 0], k, 0)
    f(1, 6 + dy, 2, 8, '#7A4A26', 'brush'); f(1, 3 + dy, 2, 3, at(['#E0457B', '#F5C542', '#3DBE5A', '#378ADD'], slow(k), '#E0457B'), 'brush')
    stamp(f, 22, 3, ['..wwwww.', '.wrrwyyw', 'wwrrwyyw', 'wwwwwww.', 'wggwbbw.', '.ggwbbw.', '..www...'], { w: '#E8D6B0', r: '#E0457B', y: '#F5C542', g: '#3DBE5A', b: '#378ADD' }, 'pan')
  },
  // Coder: headphones on, typing, the code on the monitor scrolling up.
  light: (f, t, k) => {
    // The claw taps the keys twice a second, the code scrolling up a row every two frames.
    crabBody(f, at([0, -1, -2, -1, 0, -1, -2, -1], k, 0))
    stamp(f, 6, 5, ['....hhhhhhhhhh....', '..hh..........hh..', '.h..............h.'], { h: '#3A3A3C' })
    f(5, 8, 3, 6, t); f(22, 8, 3, 6, t)
    stamp(f, 23, 6, ['mmmmmmm', 'mkkkkkm', 'mkkkkkm', 'mkkkkkm', 'mkkkkkm', 'mkkkkkm', 'mmmmmmm', '...m...', '..mmm..'], { m: '#8E929A', k: '#1B1B1B' }, 'it')
    const top = Math.max(0, slow(k))
    for (let r = 0; r < 5; r++) stamp(f, 24, 7 + r, [CODE_ROWS[(top + r) % CODE_ROWS.length] ?? 'kkkkk'], { g: '#3DBE5A' }, 'code')
  },
  // Code reviewer: a green visor and a magnifier sweeping along the diff, a glint crossing its lens.
  explore: (f, _t, k) => {
    crabBody(f, -4, 'it')
    f(7, 6, 16, 2, '#2E9E6A'); f(5, 8, 20, 2, '#1F6E4A')
    const dx = at([0, -1, -2, -3, -4, -3, -2, -1], k, 0)
    stamp(f, 22 + dx, 1, ['.kkkkk.', 'k.....k', 'k.....k', 'k.....k', 'k.....k', '.kkkkk.'], { k: '#C9CCD2' }, 'it')
    f(23 + dx, 2, 5, 4, 'rgba(169,214,245,.7)', 'it'); f(24 + dx + at([0, 1, 2, 3], slow(k), 0), 2, 1, 1, '#fff', 'glint'); f(27 + dx, 7, 2, 5, '#7A4A26', 'it')
  },
}

// A finished crab cheers for a moment: sparkles over its head, blinking between two places.
const CHEER_MS = 2500
const cheer = (f: Fill, k: number): void => {
  // Chunky enough to survive the shrink to the terminal's 20 × 18 pixels: a 4-unit plus.
  const spots = slow(k) % 2 === 0 ? [[1, 1], [13, 0]] : [[6, 0], [18, 1]]
  for (const [x = 0, y = 0] of spots) {
    f(x, y + 1, 4, 2, '#F5C542', 'cheer')
    f(x + 1, y, 2, 4, '#F5C542', 'cheer')
  }
}

// The costume at full size: CRAB_BOX × CRAB_ROWS pixels, null where nothing is painted.
// `pose`: -1 still, 0 to 7 a working frame (the legs step in turn), 10 to 17 a cheering one.
const crabGrid = (costume: string, pose = -1): (Px | null)[] => {
  const groups = new Map<string, [number, number, number, number, string][]>([['bd', []]])
  const k = pose >= 10 ? pose - 10 : pose
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    // Walking: one pair of legs lifts, all four stand, the other pair lifts, all stand: a step
    // each quarter second, as before, with the crab passing through standing in between.
    const step = k % 4
    const lift = pose >= 0 && pose < 10 && ((cls === 'la' && step === 0) || (cls === 'lb' && step === 2)) ? 2 : 0
    groups.get(cls)?.push([x, y, w, h - lift, c])
  }
  dress(withPincers(f), costume, pose >= 10 ? -1 : k)
  if (pose >= 10) cheer(f, k)
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const grid: (Px | null)[] = new Array(CRAB_BOX * CRAB_ROWS).fill(null)
  for (const cls of ['bd', ...props, 'la', 'lb']) {
    for (const [x, y, w, h, c] of groups.get(cls) ?? []) {
      const { px, a } = parseColor(c)
      for (let yy = Math.max(0, y); yy < Math.min(CRAB_ROWS, y + h); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(CRAB_BOX, x + w); xx++) {
          const under = grid[yy * CRAB_BOX + xx] ?? null
          // Faint glass is left out, and glass over nothing too: the terminal's background is not ours to tint.
          if (a >= 1) grid[yy * CRAB_BOX + xx] = px
          else if (a >= 0.5 && under) grid[yy * CRAB_BOX + xx] = mixPx(under, px, a)
        }
      }
    }
  }
  return grid
}

const CLAY_PX = parseColor(CLAY).px

// The grid shrunk to SPRITE_W × SPRITE_PX: each pixel takes the color that covers most of its square.
const shrinkGrid = (grid: (Px | null)[]): (Px | null)[] => {
  const sx = CRAB_BOX / SPRITE_W
  const sy = CRAB_ROWS / SPRITE_PX
  const out: (Px | null)[] = []
  for (let oy = 0; oy < SPRITE_PX; oy++) {
    for (let ox = 0; ox < SPRITE_W; ox++) {
      const x0 = ox * sx
      const y0 = oy * sy
      const seen = new Map<string, { px: Px; w: number }>()
      let painted = 0
      for (let yy = Math.floor(y0); yy < Math.min(CRAB_ROWS, Math.ceil(y0 + sy)); yy++) {
        for (let xx = Math.floor(x0); xx < Math.min(CRAB_BOX, Math.ceil(x0 + sx)); xx++) {
          const px = grid[yy * CRAB_BOX + xx]
          if (!px) continue
          const w = (Math.min(x0 + sx, xx + 1) - Math.max(x0, xx)) * (Math.min(y0 + sy, yy + 1) - Math.max(y0, yy))
          const key = px.join(',')
          const prev = seen.get(key)
          seen.set(key, { px, w: (prev?.w ?? 0) + w })
          painted += w
        }
      }
      if (painted < sx * sy * MIN_COVER) {
        out.push(null)
        continue
      }
      let best: Px | null = null
      let bestW = 0
      for (const { px, w } of seen.values()) {
        const score = w * (px.join(',') === CLAY_PX.join(',') ? 1 : ACCENT_BIAS)
        if (score > bestW) {
          best = px
          bestW = score
        }
      }
      out.push(best)
    }
  }
  return out
}

// A Raster's `cells`: three 32-bit numbers a cell (character, color, background), as base64.
const packCells = (px: (Px | null)[], width = SPRITE_W, rows = SPRITE_ROWS): string => {
  const rgb = (p: Px): number => ((p[0] << 16) | (p[1] << 8) | p[2]) >>> 0
  const words: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < width; col++) {
      const top = px[row * 2 * width + col] ?? null
      const bottom = px[(row * 2 + 1) * width + col] ?? null
      if (top && bottom) words.push(0x2580, rgb(top), rgb(bottom))
      else if (top) words.push(0x2580, rgb(top), DEFAULT_CELL)
      else if (bottom) words.push(0x2584, rgb(bottom), DEFAULT_CELL)
      else words.push(0x20, DEFAULT_CELL, DEFAULT_CELL)
    }
  }
  let bin = ''
  for (const b of new Uint8Array(Uint32Array.from(words).buffer)) bin += String.fromCharCode(b)
  return btoa(bin)
}

// A planned task's crab is washed out toward grey, as the desktop dims it with opacity.
const dimPx = (p: Px | null): Px | null => (p ? ([0, 1, 2].map(i => Math.round((p[i] ?? 0) * 0.45 + 100 * 0.55)) as unknown as Px) : null)

// The little crab in the bar above the prompt: 11 × 4 pixels, two cell rows tall, with open pincers.
// Its claws are up while an agent works and down once the crew is idle or finished.
// C body and eye stalks, L its lit top, D claws and legs, K eyes, . nothing.
const BAR_CRAB_W = 11
const BAR_CRAB_ROWS = 2
const BAR_CRAB: Record<'up' | 'down', string> = {
  up: 'DD..C.C..DD' + 'D..LKLKL..D' + '.DCCCCCCCD.' + '..D.D.D.D..',
  down: '....C.C....' + 'DD.LKLKL.DD' + 'D.CCCCCCC.D' + '..D.D.D.D..',
}
const BAR_CRAB_PX: Record<string, Px> = { C: CLAY_PX, L: [238, 150, 118], D: [194, 87, 58], K: [43, 33, 24] }

const barCrabCells = (isWorking: boolean): string =>
  packCells([...BAR_CRAB[isWorking ? 'up' : 'down']].map(ch => BAR_CRAB_PX[ch] ?? null), BAR_CRAB_W, BAR_CRAB_ROWS)

const spriteCache = new Map<string, string>()

// The terminal's crabs move a frame an eighth of a second while their agent works, each a quarter
// second behind the one above so they don't move in step, and cheer for a moment when it finishes.
// The ticker runs only while a crab moves; the desktop's crabs move by CSS and never tick.
const CRAB_TICK_MS = 125
let crabTicker: Timer | null = null
let crabTick = 0
let crabMotion = true

const poseOf = (a: AgentRun, i: number, at: number): number => {
  if (!crabMotion) return -1
  if (a.status === 'running') return (crabTick + 2 * i) % CRAB_FRAMES
  if (a.status === 'done' && a.endedAt !== undefined && at - a.endedAt < CHEER_MS) return 10 + ((crabTick + 2 * i) % CRAB_FRAMES)
  return -1
}


// Light from above: the body's top edge is lit, its underside in shadow, and each eye gets a glint.
const CLAY_LIT: Px = [238, 150, 118]
const CLAY_SHADE: Px = [178, 88, 60]
const INK_PX = parseColor(INK).px
const shade = (px: (Px | null)[]): (Px | null)[] => {
  const same = (a: Px | null | undefined, b: Px): boolean => !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  const at = (x: number, y: number): Px | null => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_PX ? null : (px[y * SPRITE_W + x] ?? null))
  return px.map((p, i) => {
    const x = i % SPRITE_W
    const y = Math.floor(i / SPRITE_W)
    if (same(p, CLAY_PX)) {
      if (!at(x, y + 1)) return CLAY_SHADE
      if (!at(x, y - 1)) return CLAY_LIT
    }
    // The upper left pixel of an eye at least two wide.
    if (same(p, INK_PX) && same(at(x + 1, y), INK_PX) && !same(at(x - 1, y), INK_PX) && !same(at(x, y - 1), INK_PX)) return [250, 248, 242]
    return p
  })
}

const spriteCells = (costume: string, dim: boolean, pose = -1): string => {
  const key = `${costume}${dim ? ':dim' : ''}@${pose}`
  let cells = spriteCache.get(key)
  if (cells === undefined) {
    const px = shade(shrinkGrid(crabGrid(costume, pose)))
    cells = packCells(dim ? px.map(dimPx) : px)
    spriteCache.set(key, cells)
  }
  return cells
}

// The same shaded pixels the terminal paints, as SVG rects in the crab's 30 × 28 box: the desktop's
// crabs are the terminal's, pixel for pixel. Runs of one color along a row are one rect.
const pixelCache = new Map<string, string>()
const pixelRects = (costume: string, pose: number): string => {
  const key = `${costume}@${pose}`
  const hit = pixelCache.get(key)
  if (hit !== undefined) return hit
  const px = shade(shrinkGrid(crabGrid(costume, pose)))
  const pw = CRAB_BOX / SPRITE_W
  const ph = CRAB_ROWS / SPRITE_PX
  const hex = (p: Px): string => '#' + p.map(v => v.toString(16).padStart(2, '0')).join('')
  const out: string[] = []
  for (let y = 0; y < SPRITE_PX; y++) {
    let x = 0
    while (x < SPRITE_W) {
      const p = px[y * SPRITE_W + x]
      if (!p) {
        x++
        continue
      }
      const color = hex(p)
      let end = x + 1
      while (end < SPRITE_W && px[y * SPRITE_W + end] && hex(px[y * SPRITE_W + end] as Px) === color) end++
      out.push(`<rect x="${+(x * pw).toFixed(3)}" y="${+(y * ph).toFixed(3)}" width="${+((end - x) * pw).toFixed(3)}" height="${+ph.toFixed(3)}" fill="${color}"/>`)
      x = end
    }
  }
  const svg = out.join('')
  pixelCache.set(key, svg)
  return svg
}

// When a terminal last drew crabs: the ticker runs only while one does (the desktop flips its own
// frames with CSS, and a closed or narrow pane has no crabs to repaint).
let crabsDrawnAt = -Infinity
// The pane they were drawn in: the deck, or the agents' own pane.
let crabPane = DECK_PANE
const CRABS_SHOWN_MS = 3000

function startCrabs($: EngineInterface): void {
  if (!crabMotion || crabTicker || crabsDrawnAt === -Infinity) return
  crabTicker = $.clock.every(CRAB_TICK_MS, () => void tickCrabs($))
}

async function tickCrabs($: EngineInterface): Promise<void> {
  crabTick += 1
  const list = await read($, agents)
  const at = await $.clock.now()
  let isMoving = false
  for (const [i, a] of list.entries()) {
    const pose = poseOf(a, i, at)
    if (pose >= 0) isMoving = true
    // A crab just done cheering gets one more blit, back to its still pose.
    const isSettling = pose < 0 && a.status === 'done' && a.endedAt !== undefined && at - a.endedAt < CHEER_MS + CRAB_TICK_MS * 2
    if (pose < 0 && !isSettling) continue
    const cells = spriteCells(costumeFor(a), false, pose)
    void $.ui.blit({ requestId: crabPane, key: `crab-${a.id}`, cells, columns: SPRITE_W, rows: SPRITE_ROWS }).catch(() => undefined)
  }
  const isShown = at - crabsDrawnAt < CRABS_SHOWN_MS
  if (!isShown || (!isMoving && !list.some(a => a.status === 'done' && a.endedAt !== undefined && at - a.endedAt < CHEER_MS + CRAB_TICK_MS * 2))) {
    crabTicker?.cancel()
    crabTicker = null
  }
}

// Panel rows are laid out left to right; in Hebrew each box mirrors across the
// row (`mx`) and text hugs the mirrored side. `words` text may hold Hebrew and
// takes `direction="rtl"` (whose `start` is the right edge); numbers stay
// left to right so "≈$0.25" keeps its order.
const mx = (W: number, x: number, w = 0): number => (isRtl() ? W - x - w : x)

// Text that starts at x: left-aligned, or right-aligned at the mirrored x.
const startText = (W: number, x: number, y: number, words = true): string =>
  !isRtl()
    ? `x="${x}" y="${y}"`
    : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="start"' : ' text-anchor="end"'}`

// Text that ends at x: right-aligned, or left-aligned at the mirrored x.
const endText = (W: number, x: number, y: number, words = false): string =>
  !isRtl() ? `x="${x}" y="${y}" text-anchor="end"` : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="end"' : ''}`

const crabWidth = (scale: number): number => Math.round(CRAB_BOX * scale * 100) / 100

// A panel crab at x in a row of width W: on the mirrored side and facing left in Hebrew.
const rowCrab = (W: number, x: number, y: number, costume: string, dim = false, isWalking = false, isCheering = false, scale = CRAB_SCALE, stagger = 0): string =>
  crab(mx(W, x, crabWidth(scale)), y, costume, dim, isWalking, scale, isRtl(), isCheering, stagger)

// An agent's row on the desktop draws its crab larger than the compact strip does, the text beside it.
const ROW_CRAB_SCALE = 1.7
const ROW_TEXT_X = 60
const staggerOf = (id: string): number => 2 * ([...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4)

// A one-pixel line: wide markup, which the app draws at the slot's width.
const HAIRLINE = (color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none"><rect width="4000" height="1" fill="${color}"/></svg>`

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

// The pane's own title already says "Agents": the header names the flow, if any.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${mx(W, i * (tw + gap), tw)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" ${startText(W, i * (tw + gap) + 9, top + 16)} font-family="${FONT}" font-size="11">${k}</text>
<text class="t" ${startText(W, i * (tw + gap) + 9, top + 33, false)} font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" ${startText(W, 0, 15)} font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

// `at` is the panel's clock (it moves while agents run); `clock` the real one, for the moment a cheer lasts.
const agentSvg = (W: number, a: AgentRun, at: number, clock = at): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const color = agentColor(a)
  const ctx = ctxOf(a)
  const textW = W - ROW_TEXT_X - 22
  const meta = [runModel(a)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const touching = filesLine(a)
  if (touching) meta.push(touching)
  const label = tier === 'other' ? a.type : tierWord(tier)
  const metaW = Math.max(40, textW - textWidth(label, 11) - 10)
  const barW = textW
  const progress = progressOf(a)
  const stats = `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  return svg(
    W,
    66,
    `${rowCrab(W, 0, 9, costumeFor(a), false, a.status === 'running', a.status === 'done' && a.endedAt !== undefined && clock - a.endedAt < CHEER_MS, ROW_CRAB_SCALE, staggerOf(a.id))}
<text class="t" ${startText(W, ROW_TEXT_X, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text ${startText(W, ROW_TEXT_X, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tierWord(tier))}</tspan><tspan class="s">  ${xml(fitText(meta.join('  ·  '), 11, metaW))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" ${startText(W, ROW_TEXT_X, 49)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" ${endText(W, ROW_TEXT_X + barW, 49, true)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="${mx(W, ROW_TEXT_X, barW)}" y="55" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="${mx(W, ROW_TEXT_X, fillW)}" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(mx(W, W - 8), 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - ROW_TEXT_X - 22
  const meta = [tierModel(tier)]
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${rowCrab(W, 0, 2, planCostume(p.title, tier), true, false, false, 1.5)}
<text class="s" ${startText(W, ROW_TEXT_X, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text ${startText(W, ROW_TEXT_X, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tierWord(tier))}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(mx(W, W - 8), 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeFor(a), c: agentColor(a), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeFor(a), c: agentColor(a), s: a.status, dim: false })),
    ...planned.map(p => ({ k: planCostume(p.title, p.tier in TIER_COLOR ? p.tier : 'other'), c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => rowCrab(W, i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${mx(W, i * 36 + 32)}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" ${startText(W, x, 21, false)} font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" ${endText(W, W, 21)} font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
// Opens or closes an agent's list of files. Opened from the keyboard, the list is then brought
// into view, once the pane has drawn it (a digit can open a card scrolled out of sight).
const REVEAL_MS = 60
async function toggleFiles($: EngineInterface, id: string, reveal: boolean): Promise<void> {
  let isOpen = false
  await update($, panel, prev => {
    const open = prev.expanded ?? []
    isOpen = !open.includes(id)
    return { ...prev, expanded: isOpen ? [...open, id] : open.filter(x => x !== id) }
  })
  if (!isOpen || !reveal) return
  // In the deck the agents' part keeps its own window: the card is brought into it on the next drawing.
  revealCard = id
  if (crabPane !== DECK_PANE) $.clock.after(REVEAL_MS, () => void $.ui.scroll({ to: { key: `files-${id}` }, in: crabPane }).catch(() => undefined))
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === DECK_PANE)
  if (isOpen) {
    await $.ui.close({ id: DECK_PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
  return true
}

// The deck's agents part, when its cards are more than its share of the panel: the first item shown,
// how far it can go, and a card to bring into view (opened from the keyboard).
let deckFrom = 0
let deckMaxFrom = 0
let revealCard = ''
// Where the window may start: the top, or a card (a section's heading scrolls with the card under it).
let deckStops: number[] = [0]
async function scrollDeck($: EngineInterface, by: number): Promise<void> {
  const stops = deckStops.filter(i => i <= deckMaxFrom)
  const at = by > 0 ? stops.find(i => i > deckFrom) : [...stops].reverse().find(i => i < deckFrom)
  const to = Math.max(0, Math.min(deckMaxFrom, at ?? deckFrom))
  if (to === deckFrom) return
  deckFrom = to
  $.ui.invalidate('ui.render')
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  void $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
}

// Crewdeck's two tools: the plan's progress for the main session, a step count for each subagent.
async function registerTools($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'progress',
    description:
      'Report the progress of a plan you are carrying out with subagents to the progress bar above the prompt and the agents panel; optional, use it only for a multi-task plan. ' +
      'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
      'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
      'For the main session only: a call from a subagent is ignored (workers report with `step`).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name of the overall task, a few words.' },
        total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
        done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
        phase: { type: 'string', enum: [...PHASES] },
        finished: { type: 'boolean', description: 'True once the flow is closed.' },
        tasks: {
          type: 'array',
          description:
            'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
              tier: { type: 'string', enum: [...TIERS] },
              after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
            },
            required: ['title', 'tier'],
          },
        },
      },
    },
  })
  await $.tool.register({
    name: 'step',
    description:
      'For subagents: report progress on your own task to the agents panel. ' +
      'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
      'call it again as each step finishes. Cheap and silent: it only draws a bar.',
    inputSchema: {
      type: 'object',
      properties: {
        done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
        total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
        note: { type: 'string', description: 'The step in progress, a few words.' },
      },
      required: ['done'],
    },
    // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
    isDeferred: false,
  })
}

// The app's Crewdeck panel draws its cards and rows natively; `classic` keeps the drawn cards.
let appPictures = true

// The crew: the agents started since none was running. When its last one ends it gets a summary
// (a toast, and a line in the panel until the next agent starts or /clear).
type CrewSummary = { agents: number; failed: number; cost: number; time: number; files: number }
let crewIds = new Set<string>()
let crewDone: CrewSummary | null = null

const summarize = (runs: AgentRun[]): CrewSummary => {
  const files = new Set(runs.flatMap(a => (a.files ?? []).filter(f => f.isEdit).map(f => f.path)))
  const start = Math.min(...runs.map(a => a.startedAt))
  const end = Math.max(...runs.map(a => a.endedAt ?? a.startedAt))
  return { agents: runs.length, failed: runs.filter(a => a.status === 'failed').length, cost: runs.reduce((n, a) => n + a.costUsd, 0), time: Math.max(0, end - start), files: files.size }
}

const crewLine = (c: CrewSummary): string => {
  const s = tr()
  return [
    `✓ ${s.crewDone}`,
    `${c.agents} ${c.agents === 1 ? s.agentOne : s.agentsCount}`,
    `≈${fmtCost(c.cost)}`,
    fmtTime(c.time),
    `${c.files} ${s.filesChanged}`,
    ...(c.failed ? [`${c.failed} ${s.failed}`] : []),
  ].join(' · ')
}

// The budget for the session's subagents together, in dollars (0: none). Near it (80%) the cost
// turns amber, past it red, and each crossing says so once in a toast.
let budgetUsd = 0
// The level already told; -1 until the first check after a load (a reload from /crewdeck-budget or
// /config), which only notes where the cost stands, so a change of budget repeats no toast.
let budgetWarned = -1
const NEAR = '#d9a03f'
const OVER = '#e5534b'
const budgetLevel = (cost: number): number => (budgetUsd <= 0 ? 0 : cost >= budgetUsd ? 2 : cost >= budgetUsd * 0.8 ? 1 : 0)
const costTint = (cost: number): string | undefined => [undefined, NEAR, OVER][budgetLevel(cost)]
const parseBudget = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? (readDollars(v) ?? NaN) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

// A budget as typed, always in US dollars: `2`, `$2`, `2.50`, `2,50`, `2 usd`, `US$2`. Anything
// naming another currency (`€2`, `20 kr`, `5 eur`) or no amount is null; `0` is no budget.
const readDollars = (text: string): number | null => {
  const t = text.trim().toLowerCase().replace(/^us\$|^\$|\$$|\s*usd$|^usd\s*/g, '').trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(t)) return null
  return Number.parseFloat(t.replace(',', '.'))
}

// The system's own notification for the moments worth looking up for (the crew done, the budget):
// on Windows a Windows notification, bottom right with its sound, sent through Windows PowerShell;
// elsewhere the person's terminal channel (iTerm2, kitty, Ghostty, or its bell).
let notifyOn = true
let windows = false
const WIN_TOAST = [
  "$ErrorActionPreference = 'Stop'",
  '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
  '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
  '$t = [Security.SecurityElement]::Escape($env:CREWDECK_TITLE)',
  '$b = [Security.SecurityElement]::Escape($env:CREWDECK_TEXT)',
  '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
  '$x.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$t</text><text>$b</text></binding></visual><audio src=`"ms-winsoundevent:Notification.Default`"/></toast>")',
  "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))',
].join('\n')

async function notifySystem($: EngineInterface, text: string): Promise<void> {
  if (!notifyOn) return
  if (windows) {
    await $.process
      .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', WIN_TOAST], { timeoutMs: 10_000, env: { CREWDECK_TITLE: 'Crewdeck', CREWDECK_TEXT: text } })
      .catch(() => undefined)
    return
  }
  await $.ui.notify(text, { title: 'Crewdeck' }).catch(() => undefined)
}

async function checkBudget($: EngineInterface): Promise<void> {
  if (budgetUsd <= 0) return
  const cost = (await read($, agents)).reduce((n, a) => n + a.costUsd, 0)
  const level = budgetLevel(cost)
  if (budgetWarned < 0) {
    budgetWarned = level
    return
  }
  if (level <= budgetWarned) return
  budgetWarned = level
  const s = tr()
  const text = (level === 2 ? s.budgetOver : s.budgetNear).replace('{cost}', `≈${fmtCost(cost)}`).replace('{budget}', fmtCost(budgetUsd))
  $.ui.toast(text)
  await notifySystem($, text)
}

// When the last running agent of the crew ends: its summary, once.
async function finishCrew($: EngineInterface): Promise<void> {
  const list = await read($, agents)
  if (crewIds.size === 0 || list.some(a => a.status === 'running')) return
  const runs = list.filter(a => crewIds.has(a.id))
  crewIds = new Set()
  if (!runs.length) return
  crewDone = summarize(runs)
  $.ui.toast(crewLine(crewDone))
  await notifySystem($, crewLine(crewDone))
}

export const register: Register = (on, options) => {
  crabMotion = options?.crabMotion !== 'off'
  budgetUsd = parseBudget(options?.budget)
  notifyOn = options?.notify !== 'off'
  appPictures = options?.appRows !== 'classic'
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // The command first, so nothing that fails below can take /crewdeck with it. It is the
    // panel's one command: the file tree's half answers it too, beneath this hook.
    await $.command.register({
      name: 'crewdeck',
      description: "Show or hide the Crewdeck panel: the subagents above the file tree; args: [folder] opens the tree on a folder in Claude's project",
    }).catch(() => undefined)
    await $.command.register({
      name: 'crewdeck-budget',
      description: "Set the agents' cost budget in US dollars (/crewdeck-budget 2), turn it off (off), or see it and what they spent",
      argumentHint: '[dollars | off]',
      immediate: true,
    }).catch(() => undefined)
    windows = (await $.env.get('OS').catch(() => undefined)) === 'Windows_NT'
    // A session starts with the budget's state as it stands: a toast only for a crossing from here.
    budgetWarned = budgetLevel((await read($, agents).catch(() => [] as AgentRun[])).reduce((n, a) => n + a.costUsd, 0))
    lang = await detectLang($, options.language).catch(() => 'en' as const)
    // The tools are optional: a session that refuses them still gets the panel and the crabs.
    try {
      await registerTools($)
    } catch {
      // Agents simply won't report steps.
    }

    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
        if (at - crabsDrawnAt < CRABS_SHOWN_MS) startCrabs($)
      })()
    })
    return started
  })

  // After /clear the panel starts over: no agents, no plan, and it opens again for the next subagent.
  on('classic.SessionStart', { source: 'clear' }, async ($, e, next) => {
    const result = await next(e)
    crabTicker?.cancel()
    crabTicker = null
    await update($, agents, () => [])
    await update($, flow, () => null)
    await update($, panel, prev => ({ ...prev, autoOpenedFor: '', expanded: [] }))
    crewIds = new Set()
    crewDone = null
    budgetWarned = budgetUsd > 0 ? 0 : -1
    return result
  })

  // The budget, set from the prompt: kept in the `budget` setting (/config shows it), in US dollars.
  on('command.run', { command: 'crewdeck-budget' }, async ($, e) => {
    const s = tr()
    const fill = (text: string, v: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)
    const arg = (e.args ?? '').trim()
    const spent = (await read($, agents)).reduce((n, a) => n + a.costUsd, 0)
    const cost = `≈${fmtCost(spent)}`
    const spentLine = (b: number) => fill(s.budgetSpent, { cost, pct: String(Math.round((spent / b) * 100)) })
    if (!arg) {
      return {
        text: budgetUsd > 0
          ? `${fill(s.budgetIs, { budget: fmtCost(budgetUsd) })} ${spentLine(budgetUsd)} ${s.budgetHow}`
          : fill(s.budgetNone, { cost }),
      }
    }
    const off = /^(off|none|clear|no|0+([.,]0+)?)$/i.test(arg)
    const dollars = off ? 0 : readDollars(arg)
    if (dollars === null) return { text: fill(s.budgetBad, { arg }) }
    budgetUsd = dollars
    budgetWarned = budgetLevel(spent)
    $.ui.invalidate('ui.render')
    // Kept as the setting, so the next session has it too; a refusal leaves it for this session.
    let kept = false
    try {
      const row = (await $.config.list()).find(r => /^crewdeck(@[\w.-]+)?\.budget$/.test(r.key))
      if (row) kept = !(await $.config.set({ key: row.key, value: dollars ? String(dollars) : '' })).deny
    } catch {
      kept = false
    }
    const local = kept ? '' : ` ${s.budgetLocal}`
    if (!dollars) return { text: `${s.budgetOff}${local}` }
    const level = budgetLevel(spent)
    const state = level === 2 ? ` ${s.budgetPast}` : level === 1 ? ` ${s.budgetNearNow}` : ''
    return { text: `${fill(s.budgetSet, { budget: fmtCost(dollars) })}${local} ${spentLine(dollars)}${state}` }
  })

  on('command.run', { command: 'crewdeck' }, async ($, e, next) => {
    const arg = (e.args ?? '').trim()
    // A folder is the tree's: it opens the panel on it.
    if (arg && arg !== 'open') return next(e)
    // The tree's half checks the layout and readies the tree; a refusal (no fullscreen) is shown as is.
    const ready = await next(e)
    if (ready.text) return ready
    // `/crewdeck open` opens the panel, or brings it forward from behind another tab, without toggling it.
    if (arg === 'open') {
      const at = await $.clock.now()
      await update($, now, () => at)
      await $.ui.open({ id: DECK_PANE, title: DECK_TITLE })
      return { text: tr().opened }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // The flow is the main session's: a call from a worker's loop carries its agentId
    // and changes nothing, or any subagent could rename, finish or reset the flow.
    if (e.agentId) return { result: 'ignored: only the main session reports the flow' }
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
    }
    const next = await update($, flow, p => merge(p, input))
    if (next && input.tasks?.length && options.autoOpen !== 'off') await autoOpen($, `plan:${next.title}`)
    return { result: `ok: ${label(next ?? blank())}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  // While a reported plan is open, its bar counts the agents running for it. Without a plan the bar
  // follows the agents by itself (crewFlow): no plan is ever made up here.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const open = await read($, flow)
    if (!open || open.isFinished) return next(e)

    await update($, flow, prev => (prev && !prev.isFinished ? { ...prev, running: prev.running + 1, phase: prev.phase === 'plan' ? 'delegate' : prev.phase } : prev))
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  // A press on an agent's open-and-close row; a press on one of its files is the file tree's to show.
  on('ui.message', { requestId: [PANE, DECK_PANE] }, async ($, e, next) => {
    const pressed = e.data && typeof e.data === 'object' ? (e.data as { press?: unknown }).press : undefined
    if (!e.element.startsWith('changes-') || typeof pressed !== 'string' || !pressed.startsWith('toggle:')) return next(e)
    await toggleFiles($, pressed.slice('toggle:'.length), false)
    return {}
  })

  // The files each subagent reads and edits, for its card; the file tree lights the same ones.
  on('tool.call', { tool: ['Read', 'Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    const agentId = e.agentId
    const path = filePathOf(e)
    if (!agentId || !path || result.deny || result.isError) return result
    const isEdit = e.tool !== 'Read'
    // The same file again, already first and the same kind: nothing to write (no redraw either).
    const run = (await read($, agents)).find(a => a.agentId === agentId)
    if (!run || notesNothing(run.files, [path], isEdit)) return result
    await update($, agents, list => list.map(a => (a.agentId === agentId ? { ...a, files: noteFiles(a.files, [path], isEdit) } : a)))
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const isUnbriefed = !e.prompt.includes(STEP_TOOL)
    const started = await next(isUnbriefed ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const id = started.agentId ?? e.tool_use_id
    // A new crew starts when none of the last one is still running.
    if (!(await read($, agents)).some(a => a.status === 'running')) crewIds = new Set()
    crewIds.add(id)
    crewDone = null
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        job: jobFromText(e.description),
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    startCrabs($)
    if (options.autoOpen !== 'off') {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? `plan:${f.title}` : 'any-agent')
    }
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    const seen = jobFromStep(result.toolUses ?? [])
    if (agentId && !usage && seen !== undefined) await update($, agents, list => list.map(a => (a.agentId === agentId ? withStep(a, seen) : a)))
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...withStep(a, seen),
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    await checkBudget($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
      startCrabs($)
      await checkBudget($)
      await finishCrew($)
    }
    return next(e)
  })

  // The agents, in their own pane or as the top of the deck. The deck's hook here runs before the
  // file tree's (hooks run in the order they are registered, and this half registers first): it
  // draws the agents, notes the rows they take, and puts the tree's part beneath them.
  on('ui.render', { component: 'Pane', requestId: [PANE, DECK_PANE] }, async ($, e, next) => {
    const isDeck = e.requestId === DECK_PANE
    const below = async (): Promise<RenderElement | null> => {
      const drawn = await Promise.resolve(next(e)).catch(() => null)
      return drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? (drawn as RenderElement) : null
    }
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    // The panel's clock stops with the last agent; a just-finished crab's cheer is timed on the real one.
    const clock = Math.max(at, await $.clock.now().catch(() => at))

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The cost, against the budget when one is set: amber near it, red past it.
    const tint = costTint(t.cost)
    const costText = budgetUsd > 0 ? `≈${fmtCost(t.cost)} / ${fmtCost(budgetUsd)}` : `≈${fmtCost(t.cost)}`
    const crewText = crewDone && !list.some(a => a.status === 'running') ? crewLine(crewDone) : ''
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const { value: tree } = await $.state.get(GITVIEW)
    const { value: theme = DEFAULT_THEME } = await $.state.get(THEME)
    const { value: lit } = await $.state.get(LIT)
    const look: ChangeLook = {
      root: tree?.root ?? '',
      git: tree?.git ?? {},
      diff: tree?.diff ?? {},
      theme,
      unicode: plainGlyphs(e.surface),
      width: Math.max(24, (e.props.bodyColumns || 40) - 2),
      prefix: 'file:',
      indent: 0,
      lit,
    }
    const opened = new Set(p.expanded ?? [])
    const Client = 'Client' in ui ? ui.Client : null
    const changes = (a: AgentRun) => {
      const rows = changesOf(a, opened.has(a.id), look)
      if (!rows.length || !Client) return null
      return (
        <Client
          key={`changes-${a.id}`}
          module="../files/rows.tsx"
          props={{ rows, active: '', activeBg: theme.selection, hoverBg: faint(theme.selection), tones: SHIMMER, pointer: true }}
        />
      )
    }
    const changeLines = (a: AgentRun) => changesOf(a, opened.has(a.id), look).length
    // The terminal draws the same rows as the engine's own Buttons, so the keyboard reaches them:
    // Tab and the arrows step through them, Enter presses one, and digits 1-9 open and close the
    // first nine cards' lists. A file's press is the file tree's to show (its `ui.press` hook).
    // A file being read or written right now is the tree's own animated row instead (a `rows.tsx`
    // Client, the shimmer running on the drawing's clock) until it settles back into a Button.
    const shownRuns = [...running, ...(p.isDoneCollapsed ? [] : finished)]
    const keyed = shownRuns.filter(a => (a.files ?? []).length > 0).slice(0, 9)
    const segs = (list: readonly Seg[]) =>
      list.map((g, i) => (
        <Text key={`s${i}`} color={g.c} backgroundColor={g.bg} bold={g.b} strikethrough={g.s} italic={g.i}>
          {g.t}
        </Text>
      ))
    const fileRows = (a: AgentRun, pictures = false) => {
      const rows = changesOf(a, opened.has(a.id), look)
      if (!rows.length) return null
      const n = keyed.indexOf(a)
      const isToggle = (r: RowSpec) => r.id.startsWith('toggle:')
      const opts = {
        pictures,
        tones: SHIMMER,
        keyOf: (r: RowSpec) => (isToggle(r) ? r.id : `${a.id}:${r.id}`),
        hoverBg: faint(theme.selection),
        cols: e.props.bodyColumns || 40,
        guide: mix('#262626', theme.muted, 0.6),
        onPress: (r: RowSpec) => (isToggle(r) ? void toggleFiles($, a.id, !pictures) : undefined),
        hotkey: (r: RowSpec) => (isToggle(r) && n >= 0 && !pictures ? String(n + 1) : undefined),
      }
      return (
        <Box key={`files-${a.id}`} flexDirection="column">
          {pictures
            ? nativeRows(ui as never, rows, opts)
            : rows.map((r, i) =>
                Client && !isToggle(r) && r.left.some(g => g.sh) ? (
                  <Client
                    key={`changes-${a.id}-lit-${i}`}
                    module="../files/rows.tsx"
                    props={{ rows: [r], active: '', activeBg: theme.selection, hoverBg: faint(theme.selection), tones: SHIMMER, pointer: true }}
                  />
                ) : (
                  nativeRows(ui as never, [r], { ...opts, keyOf: r2 => opts.keyOf(r2) })[0]
                ),
              )}
        </Box>
      )
    }

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? (isRtl() ? '◂' : '▸') : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      // In Hebrew the column hugs the right edge: section heads and buttons right-aligned.
      const align = isRtl() ? 'flex-end' : undefined
      // The deck: the agents' part, a line, then the file tree; the app scrolls the panel as one.
      const withTree = async (own: RenderElement): Promise<RenderElement> => {
        if (!isDeck) return own
        deck.agentsRows = 0
        const files = await below()
        return (
          <Box flexDirection="column" gap={1}>
            {own}
            {/* A picture of a line, not a row of dashes: the app's font is not its cells, so dashes
                wrap; a hairline as wide as the panel (it takes the slot's width) cannot. */}
            <Svg key="deck-line" source={HAIRLINE(faint(theme.muted))} alt="divider" height={1} />
            {files}
          </Box>
        )
      }
      // No agent yet, in the app's panel: a crab asleep, and where they will show up.
      if (isDeck && isEmpty && appPictures) {
        const zz = `<text x="40" y="12" font-family="${FONT}" font-size="9" font-weight="600" fill="#9a9a96">z<tspan dx="1" dy="-4" font-size="7">z</tspan></text>`
        return withTree(
          <Box key="agents-none" flexDirection="column" gap={1}>
            <Text bold color={theme.muted}>
              {s.pane.toUpperCase()}
            </Text>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Svg key="sleeper" source={svg(54, 42, rowCrab(54, 0, 0, planCostume('', 'light'), true, false, false, 1.5) + zz)} alt={s.idleTitle} width={54} height={42} />
              <Box flexDirection="column">
                <Text>{s.idleTitle}</Text>
                <Text color={theme.muted}>{s.idleHint}</Text>
              </Box>
            </Box>
          </Box>,
        )
      }
      if (isDeck && isEmpty) {
        return withTree(
          <Box key="agents-none" flexDirection="row" gap={1}>
            <Text bold color={theme.muted}>
              {s.pane.toUpperCase()}
            </Text>
            <Text dimColor>{s.empty}</Text>
          </Box>,
        )
      }
      if (p.isCompact) {
        return withTree(
          <Box flexDirection="column" gap={1} alignItems={align}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>,
        )
      }
      // The Crewdeck panel: the cards' words are the app's own Text, in the app's font, beside
      // pictures only where a picture is the point (the crab, its status, the bar).
      if (isDeck && appPictures) {
        const pic = (key: string, pw: number, ph: number, body: string, alt: string) => <Svg key={key} source={svg(pw, ph, body)} alt={alt} width={pw} height={ph} />
        const barW = Math.max(60, W - ROW_TEXT_X - 22)
        const muted = theme.muted
        const card = (a: AgentRun) => {
          const tier = tierOf(a.type)
          const color = agentColor(a)
          const ctx = ctxOf(a)
          const meta = [runModel(a)]
          if (a.round > 1) meta.push(`${s.round} ${a.round}`)
          if (a.status === 'failed') meta.push(s.failed)
          const touching = filesLine(a)
          if (touching) meta.push(touching)
          const progress = progressOf(a)
          const fillW = Math.round(barW * (progress ?? ctx / 100))
          const stats = `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
          const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
          const cheer = a.status === 'done' && a.endedAt !== undefined && clock - a.endedAt < CHEER_MS
          return (
            <Box key={`card-${a.id}`} flexDirection="column">
              <Box flexDirection="row" gap={1} alignItems="flex-start">
                {pic('crab', 52, 48, rowCrab(52, 0, 0, costumeFor(a), false, a.status === 'running', cheer, ROW_CRAB_SCALE, staggerOf(a.id)), a.description || a.type)}
                <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
                  <Box flexDirection="row" alignItems="center">
                    <Box flexShrink={1} overflow="hidden">
                      <Text bold wrap="truncate-end">
                        {a.description || a.type}
                      </Text>
                    </Box>
                    <Box flexGrow={1} />
                    {pic('mark', 14, 14, statusMark(7, 7, a.status, color), a.status === 'running' ? s.isRunning : s.isFinished)}
                  </Box>
                  <Text wrap="truncate-end">
                    <Text color={color}>{tier === 'other' ? a.type : tierWord(tier)}</Text>
                    <Text color={muted}>{`  ${meta.join('  ·  ')}`}</Text>
                  </Text>
                  <Box flexDirection="row">
                    {steps ? (
                      <Box flexShrink={1} overflow="hidden">
                        <Text wrap="truncate-end">{steps}</Text>
                      </Box>
                    ) : null}
                    <Box flexGrow={1} />
                    <Text color={muted}>{stats}</Text>
                  </Box>
                  {pic(
                    'bar',
                    barW,
                    4,
                    `<rect class="k" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ` fill="${color}"`} x="${mx(barW, 0, fillW)}" width="${fillW}" height="4" rx="2"/>`,
                    `${Math.round((progress ?? ctx / 100) * 100)}%`,
                  )}
                </Box>
              </Box>
              {fileRows(a, true)}
            </Box>
          )
        }
        const plan = (pl: Planned) => {
          const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
          const meta = [tierModel(tier)]
          if (pl.after.length) meta.push(`${s.after} ${pl.after.join(', ')}`)
          return (
            <Box key={`plan-${pl.n}`} flexDirection="row" gap={1} alignItems="center">
              {pic('crab', 46, 42, rowCrab(46, 0, 0, planCostume(pl.title, tier), true, false, false, 1.5), pl.title)}
              <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold color={muted} wrap="truncate-end">{`${pl.n}. ${pl.title}`}</Text>
                <Text wrap="truncate-end">
                  <Text color={colorOf(tier)}>{tierWord(tier)}</Text>
                  <Text color={muted}>{`  ${meta.filter(Boolean).join('  ·  ')}`}</Text>
                </Text>
              </Box>
            </Box>
          )
        }
        const tile = (k: string, v: string, color?: string) => (
          <Box key={`tile-${k}`} flexDirection="column" flexGrow={1} borderStyle="round" borderColor={color ?? faint(muted)} paddingX={1}>
            <Text color={muted}>{k}</Text>
            <Text bold color={color}>
              {v}
            </Text>
          </Box>
        )
        return withTree(
          <Box flexDirection="column" gap={1} alignItems={align}>
            <Box flexDirection="row" alignItems="center">
              <Text bold color={muted}>
                {(title || s.pane).toUpperCase()}
              </Text>
              <Box flexGrow={1} />
              {toggleCompact}
            </Box>
            <Box flexDirection="row" gap={1}>
              {tile(s.cost, costText, tint)}
              {tile(s.tokens, fmtTokens(t.tokens))}
              {tile(s.time, fmtTime(t.time))}
            </Box>
            {crewText && (
              <Text key="crew-done" color={DONE}>
                {crewText}
              </Text>
            )}
            {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
            {running.map(card)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(card)}
            {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
            {planned.map(plan)}
          </Box>,
        )
      }
      const shownDone = p.isDoneCollapsed ? 0 : finished.length
      const lines = 1 + (isEmpty ? 1 : 0) + (running.length > 0 ? 1 : 0) + (finished.length > 0 ? 1 : 0) + (planned.length > 0 ? 1 : 0)
      const gridH = headerHeight(title) + lines * LINE_H + (running.length + shownDone) * 66 + planned.length * 46 + shownRuns.reduce((n, a) => n + changeLines(a) * LINE_H, 0)
      return withTree(
        <Box flexDirection="column">
          {/* The grid sizes the pane; the content is placed over it, as an
              absolute Box paints over the siblings before it. */}
          {gridTiles(gridH).map((tileH, i) => (
            <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
          ))}
          <Box flexDirection="column" position="absolute" top={0} left={0} right={0} alignItems={align}>
            <Svg source={headerSvg(W, title, t)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
            {toggleCompact}
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
            {running.map(a => [
              <Svg key={a.id} source={agentSvg(W, a, at, clock)} alt={`${a.description}: ${modelName(a.model)}, ${s.isRunning}`} width={W} height={66} />,
              changes(a),
            ])}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed &&
              finished.map(a => [
                <Svg key={a.id} source={agentSvg(W, a, at, clock)} alt={`${a.description}: ${modelName(a.model)}, ${s.isFinished}`} width={W} height={66} />,
                changes(a),
              ])}
            {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
            {planned.map(pl => (
              <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
            ))}
          </Box>
        </Box>,
      )
    }

    // Terminal: the same content in text rows. In a pane wide enough, each agent gets its
    // crab, drawn as cells, beside its text; a narrower pane keeps the ▣ in the tier's color.
    // The Desktop's element table has no Raster, so the surface is tested as well.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const Raster = e.surface === 'terminal' && 'Raster' in ui && cols >= CRAB_MIN_COLUMNS ? ui.Raster : null
    if (Raster) {
      crabsDrawnAt = clock
      crabPane = e.requestId
      if (list.some((a, i) => poseOf(a, i, clock) >= 0)) startCrabs($)
    }
    const textCols = Raster ? cols - SPRITE_W - 1 : cols
    const barW = Math.max(6, Math.min(20, textCols - 34))
    // The lines under a card's title are indented past the ▣ when there is no crab to sit beside.
    const indent = Raster ? '' : '  '
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = agentColor(a)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = runModel(a)
      const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · ` : ''
      const stats = `${steps}${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)} ≈${fmtCost(a.costUsd)} ${fmtTime(elapsed(a, at))}`
      // Beside a crab the bar takes what the numbers leave of the text column, so the line is not cut off.
      const bar = Raster ? Math.max(6, Math.min(20, textCols - 1 - [...stats].length)) : barW
      const lines = [
        <Box key="title" flexDirection="row" gap={1}>
          {!Raster && <Text color={color}>▣</Text>}
          <Text bold wrap="truncate-end">
            {a.description || a.type}
          </Text>
          <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
        </Box>,
        <Text key="model" dimColor wrap="truncate-end">
          {indent}
          {tier === 'other' ? a.type : tierWord(tier)} · {model}
          {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
        </Text>,
        <Text key="progress" wrap="truncate-end">
          {indent}
          {progress === null ? <Text dimColor>{ctxBar(ctx, bar)}</Text> : <Text color={color}>{ctxBar(progress * 100, bar)}</Text>}
          <Text dimColor>
            {' '}
            {stats}
          </Text>
        </Text>,
      ]
      const touching = filesLine(a)
      if (touching)
        lines.push(
          <Text key="files" dimColor wrap="truncate-end">
            {indent}
            {touching}
          </Text>,
        )
      const card = Raster ? (
        <Box key={`card-${a.id}`} flexDirection="row" gap={1}>
          <Raster key={`crab-${a.id}`} columns={SPRITE_W} rows={SPRITE_ROWS} cells={spriteCells(costumeFor(a), false, poseOf(a, list.indexOf(a), clock))} />
          <Box flexDirection="column" width={textCols}>
            {lines}
          </Box>
        </Box>
      ) : (
        <Box key={`card-${a.id}`} flexDirection="column">
          {lines}
        </Box>
      )
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          {card}
          {fileRows(a)}
        </Box>
      )
    }

    // The list under the header, an item at a time with the rows each takes: the deck shows a
    // window of them when they are more than its share of the panel.
    type Item = { key: string; rows: number; el: RenderElement; card?: boolean }
    const items: Item[] = []
    const cardRows = (a: AgentRun) => (Raster ? Math.max(SPRITE_ROWS, 3 + (filesLine(a) ? 1 : 0)) : 3 + (filesLine(a) ? 1 : 0)) + changesOf(a, opened.has(a.id), look).length + 1
    if (isEmpty) items.push({ key: 'empty', rows: 1, el: <Text key="empty" dimColor>{s.empty}</Text> })
    if (running.length > 0) items.push({ key: 'h-run', rows: 1, el: <Text key="h-run" dimColor>{s.running} · {running.length}</Text> })
    for (const a of running) items.push({ key: a.id, rows: cardRows(a), el: row(a), card: true })
    if (finished.length > 0) items.push({ key: 'done', rows: 1, el: toggleDone })
    if (!p.isDoneCollapsed) for (const a of finished) items.push({ key: a.id, rows: cardRows(a), el: row(a), card: true })
    if (planned.length > 0) items.push({ key: 'h-plan', rows: 1, el: <Text key="h-plan" dimColor>{s.planned} · {planned.length}</Text> })
    for (const pl of planned) {
      const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
      const lines = [
        <Text key="title" dimColor wrap="truncate-end">
          {!Raster && <Text color={colorOf(tier)}>▢ </Text>}
          {pl.n}. {pl.title} ◷
        </Text>,
        <Text key="model" dimColor wrap="truncate-end">
          {indent}
          {tierWord(tier)} · {tierModel(tier)}
          {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
        </Text>,
      ]
      const el = Raster ? (
        <Box key={`plan-${pl.n}`} flexDirection="row" gap={1} marginBottom={1}>
          <Raster key={`crab-plan-${pl.n}`} columns={SPRITE_W} rows={SPRITE_ROWS} cells={spriteCells(planCostume(pl.title, tier), true)} />
          <Box flexDirection="column" width={textCols}>
            {lines}
          </Box>
        </Box>
      ) : (
        <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
          {lines}
        </Box>
      )
      items.push({ key: `plan-${pl.n}`, rows: (Raster ? SPRITE_ROWS : 2) + 1, el, card: true })
    }
    const compactLine = (
      <Text key="compact-line" wrap="truncate-end">
        {[...running, ...finished].map(a => (
          <Text key={a.id} color={agentColor(a)}>
            {STATUS_GLYPH[a.status]}{' '}
          </Text>
        ))}
        {planned.map(pl => (
          <Text key={`plan-${pl.n}`} dimColor>
            ◷{' '}
          </Text>
        ))}
      </Text>
    )
    const keysLine = !isEmpty && (
      <Text key="keys" dimColor wrap="truncate-end">
        {e.props.isFocused ? s.keysFocused : s.keysIdle}
      </Text>
    )

    if (!isDeck) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold wrap="truncate-end">
              {title}
            </Text>
            {toggleCompact}
          </Box>
          <Text wrap="truncate-end">
            <Text color={tint} dimColor={!tint}>
              {costText}
            </Text>
            <Text dimColor>{` · ${fmtTokens(t.tokens)} ${s.tokensWord} · ${fmtTime(t.time)}`}</Text>
          </Text>
          {crewText && (
            <Text key="crew-done" color={DONE} wrap="truncate-end">
              {crewText}
            </Text>
          )}
          {keysLine}
          {p.isCompact ? (
            compactLine
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {items.map(i => i.el)}
            </Box>
          )}
        </Box>
      )
    }

    // The deck: a header line like the tree's ALL FILES one, the keys, then as many items as fit in
    // about half the panel, with a way up and down when there are more; then a line and the tree.
    const bodyRows = e.props.scroll?.bodyRows ?? 40
    if (e.props.placement === 'inline' && isEmpty) {
      // Above the prompt, with no agent and no room for the tree, there is nothing to show; the panel
      // closes, unless an app following by Remote Control is drawing it beside its own transcript.
      const apps = (await $.session.surfaces().catch(() => [] as string[])).some(s => s !== 'terminal')
      if (!apps) void $.ui.close({ id: DECK_PANE }).catch(() => undefined)
      deck.agentsRows = 0
      return <Box />
    }
    const header = (
      <Box key="agents-head" flexDirection="row" gap={1}>
        <Text bold color={theme.muted}>
          {(title || s.pane).toUpperCase()}
        </Text>
        {isEmpty ? null : (
          <Text wrap="truncate-end">
            <Text color={tint} dimColor={!tint}>
              {costText}
            </Text>
            <Text dimColor>{` · ${fmtTokens(t.tokens)} ${s.tokensWord} · ${fmtTime(t.time)}`}</Text>
          </Text>
        )}
        <Box flexGrow={1} />
        {!isEmpty && toggleCompact}
      </Box>
    )
    // No agent yet: the bar's small crab, asleep, and where the agents will show up, as in the app.
    const idle = isEmpty ? (
      <Box key="agents-idle" flexDirection="row" gap={1}>
        {'Raster' in ui ? (
          <ui.Raster key="idle-crab" columns={BAR_CRAB_W} rows={BAR_CRAB_ROWS} cells={barCrabCells(false)} />
        ) : (
          <Text color={CLAY}>▣</Text>
        )}
        <Box flexDirection="column" flexShrink={1}>
          <Text wrap="truncate-end">
            {s.idleTitle}
            <Text color={theme.muted}> z</Text>
            <Text color={theme.muted} dimColor>
              z
            </Text>
          </Text>
          <Text color={theme.muted} wrap="truncate-end">
            {s.idleHint}
          </Text>
        </Box>
      </Box>
    ) : null
    const head = isEmpty ? 3 : 2 + (crewText ? 1 : 0)
    // A little over half: two crab cards fit in a common 46-row sidebar, the tree keeps the rest.
    const share = Math.max(8, Math.round(bodyRows * 0.55))
    let shown: RenderElement[] = []
    let used = 0
    if (isEmpty) {
      shown = []
    } else if (p.isCompact) {
      shown = [compactLine]
      used = 1
    } else {
      const avail = Math.max(3, share - head)
      const total = items.reduce((n, i) => n + i.rows, 0)
      if (total <= avail) {
        shown = items.map(i => i.el)
        used = total
        deckFrom = 0
        deckMaxFrom = 0
      } else {
        // Whole items from `start`, leaving a row for each way to more.
        const fit = (start: number) => {
          let rows = start > 0 ? 1 : 0
          let end = start
          while (end < items.length && rows + (items[end]?.rows ?? 0) + (end + 1 < items.length ? 1 : 0) <= avail) rows += items[end++]?.rows ?? 0
          return Math.max(end, Math.min(items.length, start + 1))
        }
        let from = Math.max(0, Math.min(deckFrom, items.length - 1))
        const want = revealCard ? items.findIndex(i => i.key === revealCard) : -1
        revealCard = ''
        if (want >= 0 && (want < from || want >= fit(from))) from = want
        while (from > 0 && fit(from - 1) === items.length) from--
        const end = fit(from)
        deckFrom = from
        deckStops = [...new Set(items.flatMap((i, n) => (i.card ? [n > 0 && !items[n - 1]?.card ? n - 1 : n] : [])))]
        deckMaxFrom = (() => {
          let m = from
          while (m < items.length - 1 && fit(m) < items.length) m++
          return m
        })()
        const cards = (a: number, b: number) => items.slice(a, b).filter(i => i.card).length
        const up = from > 0 && (
          <Button key="agents-up" plain dimColor label={`▲ ${cards(0, from) || from} ${s.agentsCount}`} onPress={() => void scrollDeck($, -1)} />
        )
        const down = end < items.length && (
          <Button key="agents-down" plain dimColor label={`▼ ${cards(end, items.length) || items.length - end} ${s.agentsCount}`} onPress={() => void scrollDeck($, 1)} />
        )
        shown = [...(up ? [up] : []), ...items.slice(from, end).map(i => i.el), ...(down ? [down] : [])]
        used = (up ? 1 : 0) + items.slice(from, end).reduce((n, i) => n + i.rows, 0) + (down ? 1 : 0)
      }
    }
    deck.agentsRows = head + used
    const files = await below()
    return (
      <Box flexDirection="column">
        {header}
        {idle}
        {!isEmpty && crewText && (
          <Text key="crew-done" color={DONE} wrap="truncate-end">
            {crewText}
          </Text>
        )}
        {keysLine}
        {shown}
        <Text key="deck-line" color={theme.muted} dimColor>
          {'─'.repeat(cols)}
        </Text>
        {files}
      </Box>
    )
  })

  // The wheel over the deck's agents part moves its window a card at a time; anywhere else, and the
  // scroll keys, are the file tree's.
  on('ui.scroll', { component: 'Pane', requestId: DECK_PANE }, async ($, e, next) => {
    if (!e.pointer || e.pointer.row < 0 || e.pointer.row >= deck.agentsRows) return next(e)
    if (deckMaxFrom > 0) await scrollDeck($, Math.sign(e.by))
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const planned = await read($, flow)
    const f = planned ?? crewFlow(await read($, agents))
    if (f === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const crew = list.length + plannedOf(f, list).length
    const isWorking = list.some(a => a.status === 'running')
    const crewButton = (
      <Button key="crew-count" label={`×${crew}`} plain onPress={() => void togglePane($)} />
    )
    const percent = `${Math.round(ratio(f) * 100)}%`
    // With a budget the bar takes the cost's color near and past it, and says the cost.
    const spent = list.reduce((n, a) => n + a.costUsd, 0)
    const tint = costTint(spent)
    const money = budgetUsd > 0 ? `≈${fmtCost(spent)}/${fmtCost(budgetUsd)}` : ''
    // A reported plan can be dismissed; the agents' own bar goes when they are done.
    const dismiss = planned ? (
      <Button
        key="plan-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    ) : null

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss
      // and their gaps. No floor above the slot: a row wider than it would wrap.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Svg source={rowSvg(f, width, isWorking, tint)} alt={`${f.title}: ${label(f)}, ${percent}`} width={width} height={H} />
            {money ? <Text color={tint}>{money}</Text> : null}
            {crewButton}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    // The bar takes what the rest of the row leaves: the count, the percent, the crab, the
    // crew button, the dismiss, and two cells between each, so a narrow terminal never wraps it.
    // Where even a short bar would not fit, the percent goes first.
    const room = (parts: number[]) => cols - titleW - parts.reduce((n, w) => n + w, 0) - 2 * (parts.length + 1)
    const rest = [label(f).length, 'Raster' in ui ? BAR_CRAB_W : 1, `×${crew}`.length, ...(money ? [money.length] : []), ...(dismiss ? [1] : [])]
    const showPercent = room([...rest, percent.length]) >= 6
    const width = Math.max(4, Math.min(40, room(showPercent ? [...rest, percent.length] : rest)))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} alignItems="center">
          <Box width={titleW} flexShrink={0}>
            <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={tint ?? (f.isFinished ? DONE : ACCENT)}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          {showPercent && <Text dimColor>{percent}</Text>}
          {'Raster' in ui ? (
            <ui.Raster key="bar-crab" columns={BAR_CRAB_W} rows={BAR_CRAB_ROWS} cells={barCrabCells(isWorking)} />
          ) : (
            <Text color={CLAY}>▣</Text>
          )}
          {money ? <Text color={tint} dimColor={!tint}>{money}</Text> : null}
          {crewButton}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
