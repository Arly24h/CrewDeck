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
  expect(toasts.at(-1)).toContain('reached your $2.00 budget')
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
  expect(toasts.filter(t => t.includes('budget')).at(-1)).toContain('reached your $2.00 budget')
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

test('crew: agents started at the same moment are one crew', async ($, on) => {
  const { toasts } = crew(on)
  await Promise.all([spawn($, 'p1', 'Audit names'), spawn($, 'p2', 'Plan the release'), spawn($, 'p3', 'Run the tests')])
  await finish($, 'p1')
  await finish($, 'p2')
  expect(toasts.some(t => t.includes('Crew done'))).toBe(false)
  await finish($, 'p3')
  expect(toasts.find(t => t.includes('Crew done'))).toContain('3 agents')
})

test('crew: an agent that ends before its last reported step is not finished: an amber !, "stopped early", no cheer, and the summary says so', async ($, on) => {
  const { toasts } = crew(on)
  await spawn($, 'q1', 'Write the tests')
  await spawn($, 'q2', 'Plan the release')
  await $.tool.call({ tool: 'mcp__crewdeck__step', done: 1, total: 4, note: 'Writing test files', agentId: 'q1' } as never)
  await $.tool.call({ tool: 'mcp__crewdeck__step', done: 3, total: 3, note: 'Plan ready', agentId: 'q2' } as never)
  await finish($, 'q1')
  await finish($, 'q2')
  const text = await drawn($)
  expect(text).toContain('1/4 Writing test files · stopped early')
  expect(text).toContain('"children":["!"]')
  expect(text).not.toContain('3/3 Plan ready · stopped early')
  expect(toasts.find(t => t.includes('Crew done'))).toContain('2 agents')
  expect(toasts.find(t => t.includes('Crew done'))).toContain('1 stopped early')
})

// The pause at the budget: the engine's question answered as the person would, and a tool beneath.
const paused = (on: On, answers: string[]) => {
  const asked: string[] = []
  const ran: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const q = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    asked.push(`${q.question} [${q.options.map(o => o.label).join(' | ')}]`)
    const answer = answers.shift()
    if (answer === undefined) throw new Error('dismissed')
    return { result: { questions: [q], answers: { [q.question]: answer } } } as never
  })
  on('tool.call', { tool: 'Glob' }, (_$, e) => (ran.push(String((e as unknown as { pattern: string }).pattern)), { result: { filenames: [], durationMs: 0, numFiles: 0, truncated: false } }) as never)
  on('config.list', () => ({ value: [{ key: 'crewdeck@inline.budget', label: 'Agents: cost budget (USD)', kind: 'string', value: '2', provider: { plugin: 'crewdeck', tier: 'user' } }] }) as never)
  on('config.set', (_$, e) => ({ value: e.value }) as never)
  return { asked, ran }
}
const glob = async ($: Engine, pattern: string) => {
  const r = (await $.tool.call({ tool: 'Glob', pattern } as never)) as { isError?: boolean; text?: string; deny?: string }
  return { isRefused: Boolean(r.isError || r.deny), text: String(r.text ?? r.deny ?? '') }
}
const overBudget = async ($: Engine) => {
  await spawn($, 'a1', 'Build the API')
  for (let i = 0; i < 3; i++) await step($, 'a1') // $2.40 of $2.00
}

test('pause: under the budget nothing is asked; at it the next tool call waits for Continue, which raises the budget', { options: { budget: '2' } }, async ($, on) => {
  const { toasts } = crew(on)
  const { asked, ran } = paused(on, ['Continue (+$1.40)'])
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1')
  expect((await glob($, 'early')).isRefused).toBe(false)
  expect(asked).toHaveLength(0)
  await step($, 'a1')
  await step($, 'a1') // $2.40
  expect(toasts.at(-1)).toContain('pauses at its next step')
  const r = await glob($, 'late')
  expect(asked).toEqual(['Budget reached: agents spent ≈$2.40 of $2.00, and the session is paused. Carry on, stop here, or type a new budget (e.g. 7)? [Continue (+$1.40) | Stop here]'])
  expect(r.isRefused).toBe(false)
  expect(ran).toEqual(['early', 'late'])
  expect(toasts.at(-1)).toBe('Budget raised to $3.40: carrying on.')
  expect(await said($, '')).toContain('Budget: $3.40')
  // Under the new budget: no more questions.
  await glob($, 'again')
  expect(asked).toHaveLength(1)
})

test('pause: Stop here refuses the call and every one after it, holds typed prompts back, and /crewdeck-budget continue lifts it', { options: { budget: '2' } }, async ($, on) => {
  const { toasts } = crew(on)
  const { asked, ran } = paused(on, ['Stop here'])
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  await overBudget($)
  const r = await glob($, 'held')
  expect(r.isRefused).toBe(true)
  expect(r.text).toContain('stopped this session at its cost budget ($2.00)')
  expect(toasts.at(-1)).toContain('Stopped at the $2.00 budget')
  // Stopped: refused at once, nothing asked again.
  expect((await glob($, 'next')).isRefused).toBe(true)
  expect(asked).toHaveLength(1)
  expect(ran).toEqual([])
  const typed = (await $.prompt.submit({ text: 'keep going', wait: false, origin: { kind: 'composer' } } as never)) as { drop?: string }
  expect(typed.drop).toContain('paused at its $2.00 budget (≈$2.40 spent)')
  expect(typed.drop).toContain('/crewdeck-budget continue (+$1.40)')
  expect(await said($, 'continue')).toContain('Budget set to $3.40')
  expect((await glob($, 'after')).isRefused).toBe(false)
  expect(ran).toEqual(['after'])
})

test('pause: a budget typed under Other is taken; one not above the spending is asked again', { options: { budget: '2' } }, async ($, on) => {
  crew(on)
  const { asked } = paused(on, ['lots', '2', '5'])
  await overBudget($)
  expect((await glob($, 'x')).isRefused).toBe(false)
  expect(asked).toHaveLength(3)
  expect(asked[1]).toMatch(/^"lots" isn't a dollar amount above what's spent \(≈\$2\.40\)\. Budget reached/)
  expect(asked[2]).toMatch(/^"2" isn't/)
  expect(await said($, '')).toContain('Budget: $5.00')
})

test('pause: a dismissed question stops, as the budget says', { options: { budget: '2' } }, async ($, on) => {
  crew(on)
  paused(on, [])
  await overBudget($)
  expect((await glob($, 'x')).isRefused).toBe(true)
})

test('pause: off, the budget only warns', { options: { budget: '2', budgetPause: 'off' } }, async ($, on) => {
  const { toasts } = crew(on)
  const { asked } = paused(on, [])
  await overBudget($)
  expect(toasts.at(-1)).toContain('over your $2.00 budget')
  expect((await glob($, 'x')).isRefused).toBe(false)
  expect(asked).toHaveLength(0)
})

test('pause: calls that reach the budget together share one question, the others waiting for its answer', { options: { budget: '2' } }, async ($, on) => {
  crew(on)
  const { asked, ran } = paused(on, ['Continue (+$1.40)'])
  let naps = 0
  on('process.run', () => (naps++, { value: { code: 0, stdout: '', stderr: '' } }) as never)
  await overBudget($)
  const all = await Promise.all([glob($, 'a'), glob($, 'b'), glob($, 'c')])
  expect(all.map(r => r.isRefused)).toEqual([false, false, false])
  expect(asked).toHaveLength(1)
  expect(ran.sort()).toEqual(['a', 'b', 'c'])
  expect(naps).toBeGreaterThan(0)
})

test('budget: a new plan clears finished agents from the list but not from the spend, so the budget still counts them', { options: { budget: '2' } }, async ($, on) => {
  crew(on)
  const { asked } = paused(on, ['Stop here'])
  await spawn($, 'a1', 'Build the API')
  await step($, 'a1')
  await step($, 'a1') // $1.60
  await finish($, 'a1')
  await $.tool.call({ tool: 'mcp__crewdeck__progress', title: 'Second run', tasks: [{ title: 'Write the tests' }] } as never)
  expect(await drawn($)).not.toContain('Build the API')
  // The panel's cost is still the session's: $1.60 of $2.00.
  expect(await drawn($)).toContain('≈$1.60 / $2.00')
  await spawn($, 'a2', 'Write the tests')
  await step($, 'a2') // $2.40 in all
  expect((await glob($, 'x')).isRefused).toBe(true)
  expect(asked[0]).toContain('agents spent ≈$2.40 of $2.00')
  // Raised again: the stop lifts and the call goes on.
  expect(await said($, '5')).toContain('Budget set to $5.00')
  expect((await glob($, 'y')).isRefused).toBe(false)
})

test('budget: a run whose steps went unseen is priced from its turn, even with token counts missing', { options: { budget: '2' } }, async ($, on) => {
  crew(on)
  await spawn($, 'a1', 'Build the API')
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a1', reason: 'answer', answer: 'ok', usage: { model: MODEL, input_tokens: 100_000, output_tokens: 20_000 } })
  const d = await drawn($)
  expect(d).toContain('≈$0.80 / $2.00')
  expect(d).not.toContain('NaN')
})

test('tokens: the panel counts what each request adds and writes, not its re-read of the conversation', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('agent.spawn', (_$, e) => ({ model: MODEL, agentId: String(e.tool_use_id) }))
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, input_tokens: 2_000, output_tokens: 1_000, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 7_000 } } as never
  })
  await spawn($, 'a1', 'Build the API')
  for (let i = 0; i < 10; i++) await step($, 'a1')
  // Ten steps of 10k new each: 100k, where the re-reads would have made it 1.1M.
  const d = await drawn($)
  expect(d).toContain('100k')
  expect(d).not.toContain('1.1M')
})
