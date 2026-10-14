import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'crewdeck'
const PROGRESS = 'mcp__crewdeck__progress'
const pane = (bodyColumns: number) =>
  ({ title: '', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as const

// Two savvy workers of different tiers are running, one task is planned and not started.
const crew = async ($: Engine, on: On) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: String((e as { tool_use_id: string }).tool_use_id) }) as never)
  for (const [id, type, description] of [
    ['t1', 'savvy-light', 'Build the landing page'],
    ['t2', 'savvy-careful', 'Research competitor launches'],
  ] as const) {
    await $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  }
  await $.tool.call({
    tool: PROGRESS,
    title: 'Launch kit',
    phase: 'delegate',
    tasks: [
      { title: 'Build the landing page', tier: 'light' },
      { title: 'Research competitor launches', tier: 'careful' },
      { title: 'Review the whole kit', tier: 'heavy', after: [1, 2] },
    ],
  } as never)
}

const mount = ($: Engine, surface: 'terminal' | 'desktop', columns: number) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'crewdeck-agents', props: pane(columns) })

// A Raster's `cells`: base64 of three 32-bit numbers a cell (character, color, background).
const cellsOf = (cells: unknown): number[] => Array.from(new Uint32Array(Uint8Array.from(atob(String(cells)), c => c.charCodeAt(0)).buffer))

test('crabs: a wide terminal pane draws a crab beside each agent, running or planned', async ($, on) => {
  await crew($, on)
  const ui = await mount($, 'terminal', 70)
  const crabs = await ui.findAll({ type: 'Raster' })
  // Two running workers and one planned task.
  expect(crabs).toHaveLength(3)

  for (const crab of crabs) {
    expect(crab.props.columns).toBe(20)
    expect(crab.props.rows).toBe(9)
    const words = cellsOf(crab.props.cells)
    expect(words).toHaveLength(20 * 9 * 3)
    // Every cell is a space, an upper half block or a lower half block.
    for (let i = 0; i < words.length; i += 3) expect([0x20, 0x2580, 0x2584]).toContain(words[i])
    // A crab has a body: not all of it is empty.
    expect(words.some((w, i) => i % 3 === 0 && w !== 0x20)).toBe(true)
  }

  // Each tier has its own costume, and a planned task's is washed out.
  const drawn = crabs.map(c => String(c.props.cells))
  expect(new Set(drawn).size).toBe(3)

  // The crab replaces the ▣ and ▢ markers; the text beside it is still there.
  expect(await ui.findAll({ type: 'Text', text: /[▣▢]/ })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /Build the landing page/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /4\. Review the whole kit|3\. Review the whole kit/ })).toBeDefined()
})

test('crabs: a narrow terminal pane keeps the ▣ and draws no crab', async ($, on) => {
  await crew($, on)
  const ui = await mount($, 'terminal', 56)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect((await ui.findAll({ type: 'Text', text: /▣/ })).length).toBeGreaterThan(0)
  expect(await ui.find({ type: 'Text', text: /Build the landing page/ })).toBeDefined()
})

test('crabs: the desktop keeps its Svg crabs and gets no Raster', async ($, on) => {
  await crew($, on)
  const ui = await mount($, 'desktop', 60)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
})

const bar = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never })

test('crabs: the terminal bar above the prompt has a little crab, claws up while working', async ($, on) => {
  await crew($, on)
  const ui = await bar($, 'terminal')
  const [crab, ...rest] = await ui.findAll({ type: 'Raster' })
  expect(rest).toHaveLength(0)
  expect(crab?.props.columns).toBe(11)
  expect(crab?.props.rows).toBe(2)
  const words = cellsOf(crab?.props.cells)
  expect(words).toHaveLength(11 * 2 * 3)
  expect(await ui.findAll({ type: 'Text', text: /▣/ })).toHaveLength(0)
  // The claws are the outer cells: raised (an upper pixel) while agents run.
  expect(words[0]).toBe(0x2580)
})

test('crabs: the desktop bar keeps its Svg and gets no Raster', async ($, on) => {
  await crew($, on)
  const ui = await bar($, 'desktop')
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
})
