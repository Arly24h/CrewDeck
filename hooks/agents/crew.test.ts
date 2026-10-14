import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'crewdeck'
const pane = { title: '', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const MODEL = 'claude-opus-5-5'
// One request of 100K input and 20K output on Opus 5.5: $0.40 + $0.40.
const REQUEST = { input_tokens: 100_000, output_tokens: 20_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const crew = (on: On) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined }) as never)
  on('agent.spawn', (_$, e) => ({ model: MODEL, agentId: String(e.tool_use_id) }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, ...REQUEST } } as never
  })
  return { clock, toasts }
}
const spawn = ($: Engine, id: string, description: string) =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: 'general-purpose', provider: 'engine', parentModel: MODEL, background: false, fork: false } as never)
const step = async ($: Engine, agentId: string) => {
  for await (const _ of ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: MODEL, messageCount: 1, agentId })) void _
}
const finish = ($: Engine, agentId: string) => ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId, reason: 'answer', answer: 'ok' })
const drawn = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const text = JSON.stringify(await ui.drawn())
  await ui.unmount()
  return text
}

test('crew: when the last agent of a crew finishes, a toast and a line in the panel sum it up, until the next one starts', async ($, on) => {
  const { clock, toasts } = crew(on)
  await spawn($, 'a1', 'Build the API')
  await spawn($, 'a2', 'Write the tests')
  await step($, 'a1')
  await step($, 'a2')
  await clock.advance(65_000)
  await finish($, 'a1')
  // One still runs: no summary yet.
  expect(toasts.some(t => t.includes('Crew done'))).toBe(false)
  expect(await drawn($)).not.toContain('Crew done')
  await finish($, 'a2')
  const done = toasts.find(t => t.includes('Crew done'))
  expect(done).toContain('2 agents')
  expect(done).toContain('≈$1.60')
  expect(done).toContain('0 files changed')
  expect(await drawn($)).toContain('Crew done')
  // A new agent: the line goes, and the next crew is only that agent.
  await spawn($, 'a3', 'Fix the bug')
  expect(await drawn($)).not.toContain('Crew done')
  await finish($, 'a3')
  expect(toasts.filter(t => t.includes('Crew done')).at(-1)).toContain('1 agent ·')
})

test('budget: near it the cost turns amber and a toast says so; past it red, once each', { options: { budget: '$2' } }, async ($, on) => {
  const { toasts } = crew(on)
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1')
  expect(toasts.filter(t => t.includes('budget'))).toHaveLength(0)
  expect(await drawn($)).toContain('≈$0.80 / $2.00')
  await step($, 'a1') // $1.60: 80%
  expect(toasts.filter(t => t.includes('budget'))).toEqual(['Agents have spent ≈$1.60 of your $2.00 budget.'])
  expect(await drawn($)).toContain('#d9a03f')
  await step($, 'a1') // $2.40: over
  await step($, 'a1')
  expect(toasts.filter(t => t.includes('budget'))).toHaveLength(2)
  expect(toasts.at(-1)).toContain('over your $2.00 budget')
  expect(await drawn($)).toContain('#e5534b')
  // The bar above the prompt says it too, in red.
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 } })
  const b = JSON.stringify(await band.drawn())
  expect(b).toContain('≈$3.20/$2.00')
  expect(b).toContain('#e5534b')
})

test('budget: none set, nothing changes color and no toast', async ($, on) => {
  const { toasts } = crew(on)
  await spawn($, 'a1', 'Build the API')
  for (let i = 0; i < 6; i++) await step($, 'a1')
  expect(toasts.filter(t => t.includes('budget'))).toHaveLength(0)
  const d = await drawn($)
  expect(d).not.toContain('#e5534b')
  expect(d).not.toContain(' / $')
})

const budget = (args: string) => ({ command: 'crewdeck-budget', args, origin: { kind: 'person' }, presentation: { isFullscreen: true, columns: 200 } }) as never
const said = async ($: Engine, args: string) => String(((await $.command.run(budget(args))) as { text?: string }).text ?? '')

test('/crewdeck-budget sets the budget in US dollars, keeps it as the setting, shows it, and turns it off', async ($, on) => {
  const { toasts } = crew(on)
  const set: unknown[] = []
  on('config.list', () => ({ value: [{ key: 'crewdeck@inline.budget', label: 'Agents: cost budget (USD)', kind: 'string', value: '', provider: { plugin: 'crewdeck', tier: 'user' } }] }) as never)
  on('config.set', (_$, e) => (set.push(e), { value: e.value }) as never)
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1') // $0.80
  expect(await said($, '')).toContain('No budget set')
  // Every way of writing dollars is the same budget; other currencies are refused.
  for (const typed of ['5', '$5', '5.00', '5,00', '5 usd', 'US$5']) expect(await said($, typed)).toContain('Budget set to $5.00 (US dollars). Agents have spent ≈$0.80 so far (16%).')
  expect(set.at(-1)).toMatchObject({ key: 'crewdeck@inline.budget', value: '5' })
  for (const typed of ['€5', '5 eur', '20 kr', 'lots']) expect(await said($, typed)).toContain('in US dollars')
  expect(await said($, '')).toContain('Budget: $5.00 (US dollars)')
  // Set below what was spent: the reply says so, the panel turns red, and no toast repeats it.
  expect(await said($, '0.50')).toContain('Already past it.')
  expect(toasts.filter(t => t.includes('budget'))).toHaveLength(0)
  expect(await drawn($)).toContain('#e5534b')
  await step($, 'a1')
  expect(toasts.filter(t => t.includes('budget'))).toHaveLength(0)
  // Raised again: the next crossing is told.
  await said($, '2')
  await step($, 'a1') // $2.40
  expect(toasts.filter(t => t.includes('budget')).at(-1)).toContain('over your $2.00 budget')
  expect(await said($, 'off')).toContain('Budget off.')
  expect(set.at(-1)).toMatchObject({ value: '' })
  expect(await drawn($)).not.toContain('#e5534b')
})

test('/crewdeck-budget still works for the session when the setting cannot be saved', async ($, on) => {
  crew(on)
  on('config.list', () => ({ value: [] }) as never)
  expect(await said($, '3')).toContain('This session only')
  expect(await said($, '')).toContain('Budget: $3.00')
})

const windowsSession = async ($: Engine, on: On) => {
  const runs: { argv: readonly string[]; env?: Record<string, string> }[] = []
  const notes: string[] = []
  mock.env(on, { OS: 'Windows_NT' })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('process.run', (_$, e) => (runs.push({ argv: e.argv, env: e.init?.env } as never), { value: { code: 0, stdout: '', stderr: '' } }) as never)
  on('ui.notify', (_$, e) => (notes.push(e.text), { value: { isSent: true, channel: 'kitty' } }) as never)
  await $.session.start({ cwd: '/c/proj', surface: 'terminal', isInteractive: true } as never)
  return { runs: () => runs.filter(r => r.argv[0] === 'powershell' && String(r.argv.at(-1)).includes('ToastNotificationManager')), notes }
}

test('notify: on Windows the crew done and the budget also send a Windows notification, through Windows PowerShell', { options: { budget: '1' } }, async ($, on) => {
  crew(on)
  const { runs, notes } = await windowsSession($, on)
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1') // $0.80: 80% of $1
  await finish($, 'a1')
  const sent = runs().map(r => r.env?.CREWDECK_TEXT)
  expect(sent).toEqual(['Agents have spent ≈$0.80 of your $1.00 budget.', expect.stringContaining('Crew done · 1 agent')])
  expect(runs()[0]?.env?.CREWDECK_TITLE).toBe('Crewdeck')
  // The text goes in the environment, never into the script: nothing the agents named can run.
  expect(String(runs()[0]?.argv.at(-1))).not.toContain('Agents have spent')
  expect(notes).toHaveLength(0)
})

test('notify: off keeps to the toasts', { options: { budget: '1', notify: 'off' } }, async ($, on) => {
  const { toasts } = crew(on)
  const { runs, notes } = await windowsSession($, on)
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1')
  await finish($, 'a1')
  expect(runs()).toHaveLength(0)
  expect(notes).toHaveLength(0)
  expect(toasts.some(t => t.includes('Crew done'))).toBe(true)
})
