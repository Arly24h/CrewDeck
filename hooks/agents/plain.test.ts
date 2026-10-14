import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Crewdeck with Claude Code's own subagents only: no savvy-flow, no plan reported, no command run.
const PLUGIN = 'crewdeck'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const
const band = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 } as never

const session = async ($: Engine, on: On) => {
  mock.clock(on)
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(String((e as { id: string }).id))
    return { value: { isPlaced: true } }
  })
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: String((e as { tool_use_id: string }).tool_use_id) }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  // What Claude Code draws above the prompt when no plugin does: a placeholder the test can tell apart.
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['(engine)'] }) as never)
  const spawn = (id: string, subagentType: string, description: string) =>
    $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  const finish = (agentId: string) =>
    ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId, reason: 'answer', answer: 'ok', usage: { model: 'claude-sonnet-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
  return { opened, spawn, finish }
}

test('plain: the agents panel opens by itself when any subagent starts', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { opened, spawn } = await session($, on)
  await spawn('a1', 'general-purpose', 'Update the dependencies')
  expect(opened).toContain('crewdeck')
})

test('plain: the panel can be kept closed', { options: { crabMotion: 'off', autoOpen: 'off' } }, async ($, on) => {
  const { opened, spawn } = await session($, on)
  await spawn('a1', 'general-purpose', 'Update the dependencies')
  expect(opened).not.toContain('crewdeck')
})

test('plain: the bar above the prompt follows the agents, with no plan reported', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { spawn, finish } = await session($, on)
  const bar = async () => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => String((t as never as { text?: string }).text ?? ''))
    const crab = (await ui.findAll({ type: 'Raster' })).length
    await ui.unmount()
    return { texts, crab }
  }
  expect((await bar()).texts).not.toContain('Agents')

  await spawn('a1', 'general-purpose', 'Update the dependencies')
  await spawn('a2', 'Explore', 'Find the config loader')
  const two = await bar()
  expect(two.texts).toContain('Agents')
  expect(two.texts).toContain('Tasks 0/2')
  expect(two.crab).toBe(1)

  await finish('a2')
  expect((await bar()).texts).toContain('Tasks 1/2')

  // Once every agent is done the bar goes: there is nothing to dismiss.
  await finish('a1')
  expect((await bar()).texts).not.toContain('Agents')
})

test('plain: non-savvy agents wear a job and its color, not the grey of no tier', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { spawn } = await session($, on)
  await spawn('gp', 'general-purpose', 'Do the thing')
  await spawn('pl', 'Plan', 'Think it through')
  await spawn('ex', 'Explore', 'Look around')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const src = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  const card = (title: string) => src.find(s => s.includes(title)) ?? ''
  // A general-purpose agent codes until its name or tools say otherwise; a Plan agent leads; Explore reviews.
  expect(card('Do the thing')).toContain('class="crab c-light')
  expect(card('Think it through')).toContain('class="crab c-fable')
  expect(card('Look around')).toContain('class="crab c-explore')
  // Their labels take their job's color: the coder's green, the lead's violet.
  expect(card('Do the thing')).toContain('fill="#1D9E75">general-purpose')
  expect(card('Think it through')).toContain('fill="#7F77DD">Plan')
})

test('plain: a task name still picks the job for a non-savvy agent', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { spawn } = await session($, on)
  await spawn('gp', 'general-purpose', 'Write the checkout tests')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const src = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source)).find(s => s.includes('Write the checkout tests')) ?? ''
  expect(src).toContain('class="crab c-careful')
  expect(src).toContain('fill="#BA7517">general-purpose')
})

test('review: a finished crab cheers for a moment, not for good, even with nothing else running', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.blit', () => ({ value: {} }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: String((e as { tool_use_id: string }).tool_use_id) }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.agent.spawn({ tool_use_id: 'a1', prompt: 'p', description: 'Do the thing', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a1', reason: 'answer', answer: 'ok', usage: { model: 'claude-sonnet-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
  await clock.advance(60_000)
  const words = (cells: string) => Array.from(new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const [crab] = await ui.findAll({ type: 'Raster' })
  expect(words(String(crab?.props.cells)).includes(0xf5c542)).toBe(false)
  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  expect((await desk.findAll({ type: 'Svg' })).some(s => String(s.props.source).includes(' cheer"'))).toBe(false)
})

test('review: an Explore agent named for testing is amber everywhere, its crab included', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { spawn } = await session($, on)
  await spawn('ex', 'Explore', 'Write the checkout tests')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const src = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source)).find(s => s.includes('Write the checkout tests')) ?? ''
  expect(src).toContain('class="crab c-careful')
  expect(src).toContain('fill="#BA7517">Explore')
  // The QA tester's cap is drawn in the same amber, not the grey of no tier.
  expect(src.toLowerCase()).toMatch(/<rect [^>]*fill="#ba7517"\/>/)
})

test('review: with the panel set to stay closed, no kind of agent opens it, and no plan is made up', { options: { crabMotion: 'off', autoOpen: 'off' } }, async ($, on) => {
  const { opened, spawn } = await session($, on)
  on('tool.call', () => ({ result: 'done' }) as never)
  await $.tool.call({ tool: 'Agent', subagent_type: 'savvy-light', description: 'Fix it', prompt: 'p' } as never)
  await spawn('s1', 'savvy-light', 'Fix it')
  expect(opened).not.toContain('crewdeck')
  // The bar is the agents' own (no "savvy-flow" or "Plan" title from nowhere).
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => String((t as never as { text?: string }).text ?? ''))
  expect(texts).toContain('Agents')
  expect(texts.some(t => /savvy-flow|^Plan$/.test(t))).toBe(false)
})
