import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'crewdeck'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } as const

type Blit = { requestId: string; key: string; cells: string }

// Workers, a mounted terminal pane, and every blit the crabs' ticker sends.
const crew = async ($: Engine, on: On, workers: readonly (readonly [id: string, type: string, description: string])[]) => {
  const clock = mock.clock(on)
  const blits: Blit[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.blit', (_$, e) => {
    blits.push(e as unknown as Blit)
    return { value: {} }
  })
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: String((e as { tool_use_id: string }).tool_use_id) }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  for (const [id, type, description] of workers) {
    await $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  }
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  return { clock, blits, ui }
}

const of = (blits: Blit[], id: string) => blits.filter(b => b.key === `crab-${id}`).map(b => b.cells)
const done = ($: Engine, agentId: string) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId, reason: 'answer', answer: 'ok', usage: { model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })

test('motion: a working crab is repainted a frame each eighth of a second, eight frames to a loop', async ($, on) => {
  const { clock, blits } = await crew($, on, [['w1', 'savvy-light', 'Build the API']])
  await clock.advance(125 * 16)
  const frames = of(blits, 'w1')
  expect(frames.length).toBeGreaterThanOrEqual(16)
  // Eight poses a second (the coder types and its code scrolls; its legs step), then the loop again.
  expect(new Set(frames.slice(0, 8)).size).toBeGreaterThanOrEqual(6)
  expect(frames[8]).toBe(frames[0])
  // Every blit is the pane's own crab at its mounted size.
  expect(blits.every(b => b.requestId === 'crewdeck-agents')).toBe(true)
})

test('motion: each job moves, and crabs side by side are a frame apart', async ($, on) => {
  const jobs = [
    ['lead', 'savvy-fable', 'Plan the sprint'],
    ['arch', 'savvy-heavy', 'Design the schema'],
    ['qa', 'savvy-careful', 'Test the checkout'],
    ['ux', 'savvy-medium', 'Design the landing page'],
    ['dev', 'savvy-light', 'Build the API'],
    ['rev', 'Explore', 'Review the diff'],
  ] as const
  const { clock, blits } = await crew($, on, jobs)
  await clock.advance(125 * 9)
  for (const [id] of jobs) {
    const frames = of(blits, id).slice(0, 9)
    expect(new Set(frames.slice(0, 8)).size, id).toBeGreaterThanOrEqual(6)
    // Every frame differs from the one before it: the crab never stands still for a frame while it works.
    for (let i = 1; i < frames.length; i++) expect(frames[i], `${id} frame ${i}`).not.toBe(frames[i - 1])
  }
  // The tick that paints one crab's frame 1 paints the next one's frame 2: not in step.
  const tick = blits.slice(0, jobs.length).map(b => b.key)
  expect(new Set(tick).size).toBe(jobs.length)
})

test('motion: a finished crab cheers for a moment, then stands still, and the ticker stops', async ($, on) => {
  const { clock, blits } = await crew($, on, [['w1', 'savvy-careful', 'Test the checkout']])
  await clock.advance(1000)
  await done($, 'w1')
  const before = blits.length
  await clock.advance(1500)
  const cheering = of(blits, 'w1').slice(-4)
  // Cheering: sparkles (a gold the costume does not hold) blink over its head.
  const words = (cells: string) => Array.from(new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer))
  expect(cheering.some(c => words(c).includes(0xf5c542))).toBe(true)
  await clock.advance(3000)
  const settled = blits.length
  expect(settled).toBeGreaterThan(before)
  // The last blit is the still pose, with no sparkle; then nothing more is sent.
  expect(words(of(blits, 'w1').at(-1) ?? '').includes(0xf5c542)).toBe(false)
  await clock.advance(5000)
  expect(blits.length).toBe(settled)
})

test('motion: with crab animation off nothing ticks', { options: { crabMotion: 'off' } }, async ($, on) => {
  const { clock, blits } = await crew($, on, [['w1', 'savvy-light', 'Build the API']])
  await clock.advance(3000)
  expect(blits.length).toBe(0)
})

test('motion: the desktop moves the same parts with CSS, and a crab that just finished hops', async ($, on) => {
  const { clock } = await crew($, on, [
    ['dev', 'savvy-light', 'Build the API'],
    ['arch', 'savvy-heavy', 'Design the schema'],
  ])
  await done($, 'arch')
  await clock.advance(100)
  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const sources = (await desk.findAll({ type: 'Svg' })).map(s => String(s.props.source))
  const dev = sources.find(s => s.includes('Build the API')) ?? ''
  const arch = sources.find(s => s.includes('Design the schema')) ?? ''
  // The working coder flips through eight whole pixel frames, the terminal's own pixels; no transforms.
  expect(dev).toContain('class="crab c-light run"')
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7]) expect(dev).toContain(`<g class="fr f${slot}">`)
  expect(dev).toContain('@keyframes crab-fr{0%{opacity:1}12.5%,100%{opacity:0}}')
  const frames = [0, 1, 2, 3, 4, 5, 6, 7].map(slot => dev.split(`<g class="fr f${slot}">`)[1]?.split('</g>')[0] ?? '')
  expect(new Set(frames).size).toBeGreaterThanOrEqual(6)
  for (let i = 1; i < 8; i++) expect(frames[i]).not.toBe(frames[i - 1])
  expect(dev.slice(dev.indexOf('<g class="crab'))).not.toMatch(/rotate\(|translateX|translateY/)
  // The architect that just finished cheers (sparkles in its frames) and then stands.
  expect(arch).toContain('class="crab c-heavy cheer"')
  expect(arch.toLowerCase()).toContain('fill="#f5c542"')
  // With reduced motion only the still pose shows.
  expect(dev).toContain('prefers-reduced-motion: reduce){.crab .fr{display:none}')
})
