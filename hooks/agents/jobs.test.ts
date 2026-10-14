import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'crewdeck'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const
type Use = { name: string; input: unknown }

// Workers that each report the tool calls `uses` holds for them on every model request.
const crew = async ($: Engine, on: On, workers: readonly (readonly [id: string, type: string, description: string])[]) => {
  const uses: Record<string, Use[]> = {}
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: String((e as { tool_use_id: string }).tool_use_id) }) as never)
  on('turn.step', async function* (_$, e) {
    const usage = { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { turnId: 'turn', index: 0, answer: '', toolUses: uses[(e as { agentId: string }).agentId] ?? [], stopReason: 'tool_use', usage } as never
  })
  for (const [id, type, description] of workers) {
    await $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  }
  // One model request of `agentId` that calls `calls`.
  return async (agentId: string, calls: Use[]) => {
    uses[agentId] = calls
    const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId })
    for await (const _ of stream) void _
  }
}

// The terminal crab drawn for each agent, by agent id.
const crabs = async ($: Engine): Promise<Record<string, string>> => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const drawn = await ui.findAll({ type: 'Raster' })
  await ui.unmount()
  return Object.fromEntries(drawn.map(c => [String(c.key).replace(/^crab-/, ''), String(c.props.cells)]))
}

const read = (file_path: string): Use => ({ name: 'Read', input: { file_path } })

test('jobs: the task name dresses the crab, and a test run dresses it the same way', { options: { crabMotion: 'off' } }, async ($, on) => {
  const step = await crew($, on, [
    ['named', 'savvy-light', 'Write the checkout tests'],
    ['live', 'savvy-light', 'Do the thing'],
    ['plain', 'savvy-light', 'Do the thing'],
  ])
  const before = await crabs($)
  // "tests" in the name makes a QA tester; the plain one stays the light tier's coder.
  expect(before.named).not.toBe(before.plain)
  expect(before.live).toBe(before.plain)

  await step('live', [{ name: 'Bash', input: { command: 'npm test -- checkout' } }])
  const after = await crabs($)
  expect(after.live).toBe(after.named)
  expect(after.plain).toBe(before.plain)
})

test('jobs: editing a file turns a reviewer into a coder, editing a stylesheet into a designer', { options: { crabMotion: 'off' } }, async ($, on) => {
  const step = await crew($, on, [
    ['reviewer', 'savvy-light', 'Review the pull request'],
    ['stylist', 'savvy-light', 'Review the pull request'],
    ['coder', 'savvy-light', 'Do the thing'],
    ['designer', 'savvy-light', 'Design the landing page'],
  ])
  const before = await crabs($)
  expect(before.reviewer).not.toBe(before.coder)

  await step('reviewer', [read('src/app.ts'), { name: 'Edit', input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' } }])
  await step('stylist', [{ name: 'Write', input: { file_path: 'src/styles/site.css', content: '' } }])
  const after = await crabs($)
  expect(after.reviewer).toBe(after.coder)
  expect(after.stylist).toBe(after.designer)
})

test('jobs: only a run of reading, before any work, makes a code reviewer', { options: { crabMotion: 'off' } }, async ($, on) => {
  const step = await crew($, on, [
    ['reader', 'savvy-light', 'Do the thing'],
    ['worker', 'savvy-light', 'Do the thing'],
    ['reviewer', 'savvy-light', 'Review the pull request'],
  ])
  const coder = (await crabs($)).reader

  await step('reader', [read('a.ts')])
  await step('reader', [{ name: 'Grep', input: { pattern: 'x' } }])
  expect((await crabs($)).reader).toBe(coder)
  await step('reader', [read('b.ts')])
  const third = await crabs($)
  expect(third.reader).toBe(third.reviewer)

  // A worker that already edited keeps coding while it reads.
  await step('worker', [{ name: 'Edit', input: { file_path: 'a.ts' } }])
  for (const file of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) await step('worker', [read(file)])
  expect((await crabs($)).worker).toBe(coder)
})

test('jobs: the tier still tints the job, and the desktop dresses the same', { options: { crabMotion: 'off' } }, async ($, on) => {
  await crew($, on, [
    ['light', 'savvy-light', 'Build the checkout API'],
    ['heavy', 'savvy-heavy', 'Build the checkout API'],
  ])
  const drawn = await crabs($)
  // Both are coders, their headphones in their own tier's colors.
  expect(drawn.light).not.toBe(drawn.heavy)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const sources = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.source))
  expect(sources.filter(src => src.includes('class="crab c-light')).length).toBeGreaterThanOrEqual(2)
  expect(sources.some(src => src.includes('class="crab c-heavy'))).toBe(false)
})
