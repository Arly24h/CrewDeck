import { expect, mock, test } from 'claude-code/testing'

import { LINUX_LAUNCH } from '../hooks/files/open'
import { age, ancestorsOf, formatSize, replaceChildren, toNodes } from '../hooks/files/tree'

type World = {
  os: 'darwin' | 'linux' | 'win32'
  env: Record<string, string>
  cwd: string
  top: string
  dirs: Record<string, [string, 'file' | 'dir'][]>
  status: string
  numstat: string
  exits?: Record<string, [number, string]>
  delays?: Record<string, number[]>
  denied?: string[]
  heads?: string[]
  tool?: (e: any) => unknown
  find?: string
  theme?: { toml: string; mtimeMs: number }
  du?: Record<string, string>
  duDelays?: number[]
  links?: string[]
  files?: Record<string, string>
  mtimes?: Record<string, number>
}
type Ran = string[][]
const opens: unknown[] = []
const closes: unknown[] = []
const envs: Record<string, string>[] = []

function world(on: any, w: World, ran: Ran) {
  mock.env(on, w.env)
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: w.cwd }))
  on('session.id', () => ({ value: 'test-session' }))
  on('command.register', () => ({ value: undefined }))
  // The panes the session shows, as `/crewdeck` asks before it opens or closes the panel.
  const shown = new Set<string>()
  on('ui.open', (_$: any, e: any) => {
    opens.push(e)
    shown.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    closes.push(e)
    shown.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...shown].map(id => ({ id })) }))
  on('ui.toast', (_$: any, e: any) => {
    ran.push(['toast', String(e.text ?? e.message ?? JSON.stringify(e))])
    return { value: undefined }
  })
  const isTheme = (p: string) => p.replace(/\\/g, '/').endsWith('/.local/state/omarchy/current/theme/colors.toml')
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^.*?(?=[A-Za-z]:\/)/, '')
  on('fs.read', (_$: any, e: any) => {
    if (w.theme && isTheme(e.path)) return { value: w.theme.toml }
    const file = norm(e.path).replace(/^[A-Za-z]:/, '')
    if (w.files && file in w.files) return { value: w.files[file] }
    throw new Error('no theme file')
  })
  const dirOf = (p: string) => w.dirs[p] ?? w.dirs[p.replace(/^[A-Za-z]:/, '')]
  on('fs.list', async (_$: any, e: any) => {
    const path = norm(e.path)
    const bare = path.replace(/^[A-Za-z]:/, '')
    if (w.denied?.includes(bare)) return { deny: `EACCES: permission denied, scandir '${path}'` }
    const kids = dirOf(path)
    if (!kids) throw new Error(`ENOENT ${e.path}`)
    const value = kids.map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: w.mtimes?.[`${bare}/${name}`] ?? 1_700_000_000_000, isLink: w.links?.includes(`${bare}/${name}`) ?? false }))
    const delay = w.delays?.[bare]?.shift()
    if (delay) await clock.sleep(delay)
    return { value }
  })
  on('fs.stat', (_$: any, e: any) => {
    if (isTheme(e.path)) {
      ran.push(['theme-stat'])
      if (!w.theme) throw new Error(`ENOENT ${e.path}`)
      return { value: { kind: 'file', size: w.theme.toml.length, mtimeMs: w.theme.mtimeMs, isLink: false } }
    }
    const p = norm(e.path)
    const parent = p.slice(0, p.lastIndexOf('/')) || '/'
    const name = p.slice(p.lastIndexOf('/') + 1)
    const hit = dirOf(p) ? 'dir' : dirOf(parent)?.find(([n]) => n === name)?.[1]
    if (!hit) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: hit, size: 1, mtimeMs: name === 'a.ts' ? 1_800_000_000_500 : 1_700_000_000_000, isLink: false } }
  })
  on('process.run', async (_$: any, e: any) => {
    const argv: string[] = [...e.argv]
    ran.push(argv)
    if (e.init?.env) envs.push(e.init.env)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const exit = w.exits?.[argv[0] ?? '']
    if (exit) return { value: { exitCode: exit[0], stdout: '', stderr: exit[1], isStdoutTruncated: false, isStderrTruncated: false } }
    if (argv[0] === 'find' && w.find !== undefined) return ok(w.find)
    if (argv[0] === 'du') {
      const delay = w.duDelays?.shift()
      if (delay) await clock.sleep(delay)
      return ok(w.du?.[argv.at(-1) ?? ''] ?? '')
    }
    if (argv[0] === 'uname') return ok(w.os === 'darwin' ? 'Darwin\n' : 'Linux\n')
    if (argv[0] === 'sh') return ok('missing\n')
    if (argv[0] === 'git') {
      const verb = argv.slice(4).find(a => !a.startsWith('-'))
      if (verb === 'rev-parse' && argv.at(-1) === 'HEAD') return ok(`${(w.heads && w.heads.length > 1 ? w.heads.shift() : w.heads?.[0]) ?? ''}\n`)
      if (verb === 'rev-parse') return w.top ? ok(`\n${w.top}\n`) : { value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
      if (verb === 'status') return ok(w.status)
      if (verb === 'diff') return ok(w.numstat)
      if (verb === 'ls-files') {
        const files: string[] = []
        for (const [dir, kids] of Object.entries(w.dirs)) for (const [name, kind] of kids) if (kind === 'file' && dir.startsWith(w.top)) files.push(`${dir}/${name}`.slice(w.top.length + 1))
        return ok(files.join('\0'))
      }
      return ok('')
    }
    return ok('')
  })
  on('tool.call', (_$: any, e: any) => (w.tool?.(e) ?? { result: { stdout: '', stderr: '' } }) as any)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, context: e.context }))
  return clock
}

const paneProps = (bodyColumns: number) => ({ title: 'Files', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as any

async function texts(ui: any): Promise<string> {
  const rows = JSON.stringify(await ui.drawn({ in: 'rows' }))
  return JSON.stringify(await ui.drawn()) + rows
}

const STAMP = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/
const NERD = /[\u{e000}-\u{f8ff}\u{f0000}-\u{fffff}]/u

test('macOS Claude Code app: desktop pane draws, selects, opens with open', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, {
    os: 'darwin', env: { HOME: '/Users/k', TMPDIR: '/var/folders/x/T/' }, cwd: root, top: root,
    dirs: { [root]: [['src', 'dir'], ['README.md', 'file'], ['notes.md', 'file']], [`${root}/src`]: [['a.ts', 'file']] },
    status: '## main...origin/main\0 M src/a.ts\0?? notes.md\0', numstat: '3\t1\tsrc/a.ts\0',
  }, ran)
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  const shown = await texts(ui)
  for (const word of ['README.md', 'notes.md', 'src', 'main', 'origin/main']) expect(shown).toContain(word)
  expect(NERD.test(shown)).toBe(false)
  await ui.post({ press: `${root}/README.md` }, { in: 'rows' })
  await clock.settle()
  expect(await texts(ui)).toContain('"selected: ","README.md"')
  const sent = await $.prompt.submit({ text: 'what is this?', wait: false } as any)
  expect(JSON.stringify(sent)).toContain(`${root}/README.md`)
  await ui.post({ press: `${root}/README.md` }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${root}/README.md`])
  expect(ran.some(a => a[0] === 'setsid' || a[0] === 'gio')).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'echo hi >> src/a.ts' } as any)
  await clock.settle()
  const finds = ran.filter(a => a[0] === 'find')
  expect(finds.length).toBeGreaterThan(0)
  expect(finds.every(f => f.includes('-newer') && !f.includes('-newermt'))).toBe(true)
  expect(ran.some(a => a[0] === 'touch' && a[1]?.startsWith('/var/folders/x/T/filetree-'))).toBe(true)
  expect(ran.some(a => a[0] === 'rm')).toBe(true)
  await ui.unmount()
})

test('macOS outside a repo: write scan uses find -newer marker, not GNU -newermt', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/scratch'
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'echo hi > a.ts' } as any)
  await clock.settle()
  const find = ran.find(a => a[0] === 'find')
  expect(find).toBeDefined()
  expect(find).toContain('-newer')
  expect(find).not.toContain('-newermt')
})

test('Windows: backslash paths shimmer, open hands the path to PowerShell as data, no find, sh or cmd', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = 'C:/Users/k/proj'
  const clock = world(on, {
    os: 'win32', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\k' }, cwd: 'C:\\Users\\k\\proj', top: root,
    dirs: { [root]: [['src', 'dir'], ['README.md', 'file'], ['a&calc&%USERNAME%.txt', 'file']], [`${root}/src`]: [['a.ts', 'file']] },
    status: '## main\0 M src/a.ts\0', numstat: '1\t0\tsrc/a.ts\0',
  }, ran)
  await $.session.start({ cwd: 'C:\\Users\\k\\proj', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toContain('README.md')
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\Users\\k\\proj\\src\\a.ts', old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  const shown = await texts(ui)
  expect(shown).toContain('a.ts')
  expect(shown).toContain('+1')
  await $.tool.call({ tool: 'Bash', command: 'echo x >> src/a.ts' } as any)
  await clock.settle()
  await ui.post({ press: `${root}/a&calc&%USERNAME%.txt` }, { in: 'rows' })
  await ui.post({ press: `${root}/a&calc&%USERNAME%.txt` }, { in: 'rows' })
  await clock.settle()
  // (The first PowerShell run looks for a Nerd Font; the opener is the one after it.)
  expect(ran.find(a => a[0] === 'powershell' && !String(a.at(-1)).includes('CurrentVersion\\Fonts'))?.at(-1)).toContain('UseShellExecute = $true')
  expect(envs.at(-1)).toEqual({ PANE_OPEN_TARGET: 'C:\\Users\\k\\proj\\a&calc&%USERNAME%.txt' })
  expect(ran.some(a => ['find', 'sh', 'uname', 'setsid', 'touch', 'cmd'].includes(a[0] ?? ''))).toBe(false)
  await ui.unmount()
})

test('Linux unchanged: GNU find -newermt outside a repo, xdg-open detached', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/scratch'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a\\b.txt', 'file'], ['c.txt', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toContain('a\\\\b.txt')
  await $.tool.call({ tool: 'Bash', command: 'echo hi > c.txt' } as any)
  await clock.settle()
  const find = ran.find(a => a[0] === 'find')
  expect(find).toContain('-newermt')
  expect(ran.some(a => a[0] === 'touch')).toBe(false)
  await ui.post({ press: `${root}/c.txt` }, { in: 'rows' })
  await ui.post({ press: `${root}/c.txt` }, { in: 'rows' })
  await clock.settle()
  const opener = ran.find(a => a[0] === 'sh' && a[2]?.includes('setsid -f -w'))
  expect(opener?.[2]).toContain('</dev/null >/dev/null 2>&1')
  expect(opener?.at(-1)).toBe(`${root}/c.txt`)
  await ui.unmount()
})

test('macOS app: every header button and the search box work on the desktop surface', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, {
    os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: root,
    dirs: { [root]: [['src', 'dir'], ['.env', 'file'], ['README.md', 'file']], [`${root}/src`]: [['a.ts', 'file']], '/Users/k': [['proj', 'dir']] },
    status: '## main\0', numstat: '',
  }, ran)
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toContain('.env')
  await ui.press({ key: 'hidden' })
  await clock.settle()
  expect(await texts(ui)).not.toContain('.env')
  await ui.press({ key: 'hidden' })
  await ui.input({ key: 'q', text: 'a.ts' })
  await clock.settle()
  const jumped = await texts(ui)
  expect(jumped).toContain('a.ts')
  expect(jumped).toContain('"value":""')
  await ui.press({ key: 'collapse' })
  await clock.settle()
  expect(await texts(ui)).not.toContain(`"id":"${root}/src/a.ts"`)
  // The tree shows Claude's project: at its top, ↑ is greyed and goes nowhere (its own test below).
  expect(await ui.find({ key: 'up' })).toBeUndefined()
  await $.command.run(fullscreen(`${root}/src`))
  await clock.settle()
  await ui.press({ key: 'up' })
  await clock.settle()
  expect(await texts(ui)).toContain('README.md')
  await $.command.run(fullscreen(`${root}/src`))
  await ui.press({ key: 'cwd' })
  await clock.settle()
  expect(await texts(ui)).toContain('README.md')
  await ui.unmount()
})

test('↑ climbs no higher than Claude’s project: its working folder, or a folder added with /add-dir', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '',
    dirs: { '/home/k': [['proj', 'dir'], ['shared', 'dir'], ['secret.txt', 'file']], [root]: [['src', 'dir'], ['a.ts', 'file']], [`${root}/src`]: [['b.ts', 'file']], '/home/k/shared': [['lib', 'dir'], ['c.ts', 'file']], '/home/k/shared/lib': [['d.ts', 'file']] },
    status: '', numstat: '',
  }, [])
  on('classic.DirectoryAdded', () => ({}))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  const header = async () => textOf(await ui.drawn())
  // At the working folder ↑ is drawn greyed (not a button), saying why when hovered.
  const up = async () => JSON.stringify(await ui.drawn({ in: 'button-up' }))
  expect(await up()).not.toContain('"type":"Button"')
  await ui.post({ over: true }, { in: 'button-up' })
  expect(await header()).toContain("top of Claude's project")
  // From a folder inside it, ↑ goes up to the project's top and stops there.
  await $.command.run(fullscreen(`${root}/src`))
  await clock.settle()
  expect(await up()).toContain('"type":"Button"')
  await ui.post({ press: true }, { in: 'button-up' })
  await clock.settle()
  expect(textOf(await ui.drawn({ in: 'rows' }))).toContain('a.ts')
  await ui.post({ press: true }, { in: 'button-up' })
  await clock.settle()
  expect(textOf(await ui.drawn({ in: 'rows' }))).not.toContain('secret.txt')
  // A folder outside the project is refused, until Claude is given it.
  const refused: any = await $.command.run(fullscreen('/home/k/shared/lib'))
  expect(String(refused?.text)).toContain('outside Claude')
  expect(String(refused?.text)).toContain('/add-dir')
  await $.classic.DirectoryAdded({ directory: '/home/k/shared', source: 'slash_command' } as any)
  await $.command.run(fullscreen('/home/k/shared/lib'))
  await clock.settle()
  expect(textOf(await ui.drawn({ in: 'rows' }))).toContain('d.ts')
  await ui.post({ press: true }, { in: 'button-up' })
  await clock.settle()
  expect(textOf(await ui.drawn({ in: 'rows' }))).toContain('c.ts')
  // …and no higher than the added folder.
  await ui.post({ press: true }, { in: 'button-up' })
  await clock.settle()
  expect(textOf(await ui.drawn({ in: 'rows' }))).not.toContain('secret.txt')
  await ui.unmount()
})

test('hovering a header button says what it does left of the buttons where it fits, and the buttons sit a column apart', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: root, dirs: { [root]: [['.env', 'file'], ['a.ts', 'file']] }, status: '## main\0', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'crewdeck', surface, component: 'Pane', requestId: 'filetree', props: paneProps(60) })
    await clock.settle()
    expect(JSON.stringify(await ui.drawn())).toContain('"gap":1')
    expect(await texts(ui)).not.toContain('reload tree and git')
    await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'button-refresh' })
    await clock.settle()
    expect(await texts(ui)).toContain('"reload tree and git "')
    await ui.pointer({ type: 'leave', x: 0, y: 0, in: 'button-refresh' })
    await clock.settle()
    expect(await texts(ui)).not.toContain('reload tree and git')
    await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'button-hidden' })
    await clock.settle()
    expect(await texts(ui)).toContain('"hide hidden files "')
    await ui.press({ key: 'hidden' })
    await clock.settle()
    expect(await texts(ui)).toContain('"show hidden files "')
    await ui.press({ key: 'hidden' })
    await ui.pointer({ type: 'leave', x: 0, y: 0, in: 'button-hidden' })
    await clock.settle()
    await ui.unmount()
  }
  const narrow = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(24) })
  await clock.settle()
  await narrow.pointer({ type: 'enter', x: 0, y: 0, in: 'button-refresh' })
  await clock.settle()
  expect(await texts(narrow)).not.toContain('reload tree and git')
  await narrow.pointer({ type: 'leave', x: 0, y: 0, in: 'button-refresh' })
  await narrow.unmount()
})

test('outside a repo only git rev-parse runs, never status, diff or ls-files', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/scratch'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['c.txt', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'echo hi > c.txt' } as any)
  await $.tool.call({ tool: 'Edit', file_path: `${root}/c.txt`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  const gits = ran.filter(a => a[0] === 'git').map(a => a.slice(4).find(x => !x.startsWith('-')))
  expect(gits.length).toBeGreaterThan(0)
  expect(gits.every(v => v === 'rev-parse')).toBe(true)
})

test('NotebookEdit refreshes git and lists the notebook folder', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['nb', 'dir']], [`${root}/nb`]: [['a.ipynb', 'file']] }, status: '## main\0 M nb/a.ipynb\0', numstat: '4\t2\tnb/a.ipynb\0' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  const before = ran.filter(a => a[0] === 'git' && a.includes('status')).length
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: `${root}/nb/a.ipynb`, new_source: 'x' } as any)
  await clock.settle()
  expect(ran.filter(a => a[0] === 'git' && a.includes('status')).length).toBeGreaterThan(before)
  const shown = await texts(ui)
  expect(shown).toContain('a.ipynb')
  expect(shown).toContain('+4')
  await ui.unmount()
})

test('long trees scroll: wheel, scrollbar drag, and a click does not jump the view', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/big'
  const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.txt`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const props = { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } }
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props })
  await clock.settle()
  const rowsOf = async () => ((await ui.drawn()) as any).children.find((c: any) => c.type === 'Client').props.props
  let p = await rowsOf()
  expect(p.bar).toBeDefined()
  expect(p.rows[0].id).toBe(`${root}/f00.txt`)
  expect(JSON.stringify(p.rows)).not.toContain('below')
  await $.ui.scroll({ component: 'Pane', requestId: 'filetree', by: 1 } as any)
  await clock.settle()
  p = await rowsOf()
  expect(p.rows[0].id).toBe(`${root}/f03.txt`)
  await ui.post({ scrollTo: 1 }, { in: 'rows' })
  await clock.settle()
  p = await rowsOf()
  expect(p.rows.at(-1).id).toBe(`${root}/f59.txt`)
  const first = p.rows[0].id
  await ui.post({ press: p.rows[5].id }, { in: 'rows' })
  await clock.settle()
  p = await rowsOf()
  expect(p.rows[0].id).toBe(first)
  expect(p.active).toBe(p.rows[5].id)
  await ui.unmount()
})

test('desktop: a long tree draws every row and leaves the wheel to the app', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/Users/k/big'
  const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.txt`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k', TMPDIR: '/var/folders/x/T/' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  const appScrolls: number[] = []
  on('ui.scroll', (_$: any, e: any) => (appScrolls.push(e.by), {}))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const props = { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } }
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props })
  await clock.settle()
  const rowsOf = async () => ((await ui.drawn()) as any).children.find((c: any) => c.type === 'Client').props.props
  let p = await rowsOf()
  expect(p.bar).toBeUndefined()
  expect(p.rows.length).toBe(60)
  expect(p.rows.at(-1).id).toBe(`${root}/f59.txt`)
  const wheel = { component: 'Pane', requestId: 'filetree', by: 1, offset: 1, bodyRows: 20, contentRows: 64, origin: { kind: 'person' } }
  expect(await $.ui.scroll(wheel as any)).toEqual({})
  expect(appScrolls).toEqual([1])
  await clock.settle()
  p = await rowsOf()
  expect(p.rows.length).toBe(60)
  expect(p.rows[0].id).toBe(`${root}/f00.txt`)
  await ui.unmount()
})

test('desktop: a very large open tree is cut with a note so the drawn tree stays within the engine bounds', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/Users/k/huge'
  const names = Array.from({ length: 5000 }, (_, i) => [`file-number-${String(i).padStart(5, '0')}.txt`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k', TMPDIR: '/var/folders/x/T/' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } } })
  await clock.settle()
  const client = ((await ui.drawn()) as any).children.find((c: any) => c.type === 'Client')
  const rows = client.props.props.rows as any[]
  expect(JSON.stringify(client.props.props).length).toBeLessThan(100_000)
  expect(rows.length).toBeLessThan(5000)
  expect(rows.at(-1).id).toBe('')
  expect(rows.at(-1).left[0].t).toContain('more rows')
  await ui.unmount()
})

async function scrolledTree($: any, on: any) {
  const root = '/home/k/big'
  const files = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.txt`, 'file'] as [string, 'file'])
  const kids = Array.from({ length: 5 }, (_, i) => [`a${i}.txt`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a', 'dir'], ...files], [`${root}/a`]: kids }, status: '', numstat: '' }, [])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } } })
  await clock.settle()
  await $.ui.scroll({ component: 'Pane', requestId: 'filetree', by: 1 } as any)
  await clock.settle()
  const ids = async () => (((await ui.drawn()) as any).children.find((c: any) => c.type === 'Client').props.props.rows as { id: string }[]).map(r => r.id)
  expect((await ids())[0]).toBe(`${root}/f02.txt`)
  return { root, clock, ui, ids }
}

test('follow on: the tree scrolls to the file Claude reads', { timeoutMs: 20_000 }, async ($, on) => {
  const { root, clock, ui, ids } = await scrolledTree($, on)
  await $.tool.call({ tool: 'Read', file_path: `${root}/f55.txt` } as any)
  await clock.settle()
  expect(await ids()).toContain(`${root}/f55.txt`)
  expect((await ids())[0]).not.toBe(`${root}/f02.txt`)
  await ui.unmount()
})

test('follow off: reads, writes and folders Claude opens above the view never move it', { timeoutMs: 20_000, options: { follow: 'off' } }, async ($, on) => {
  const { root, clock, ui, ids } = await scrolledTree($, on)
  await $.tool.call({ tool: 'Read', file_path: `${root}/f55.txt` } as any)
  await clock.settle()
  expect((await ids())[0]).toBe(`${root}/f02.txt`)
  expect(await ids()).not.toContain(`${root}/f55.txt`)
  await $.tool.call({ tool: 'Read', file_path: `${root}/f05.txt` } as any)
  await clock.settle()
  expect((await ids())[0]).toBe(`${root}/f02.txt`)
  expect(await texts(ui)).toContain(shimmer('f05.txt', 'purple'))
  await $.tool.call({ tool: 'Read', file_path: `${root}/a/a3.txt` } as any)
  await clock.settle()
  expect((await ids())[0]).toBe(`${root}/f02.txt`)
  await $.tool.call({ tool: 'Edit', file_path: `${root}/f40.txt`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  expect((await ids())[0]).toBe(`${root}/f02.txt`)
  await $.ui.scroll({ component: 'Pane', requestId: 'filetree', by: 1 } as any)
  await clock.settle()
  expect((await ids())[0]).toBe(`${root}/f05.txt`)
  await ui.unmount()
})

test('watches only git metadata, copies paths, clears search, Home and End', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['.git', 'dir'], ['a.txt', 'file'], ['b.txt', 'file'], ['c.txt', 'file']], [`${root}/.git`]: [['index', 'file'], ['HEAD', 'file']] }, status: '## main\0', numstat: '' }, ran)
  const copied: string[] = []
  on('ui.copy', (_$: any, e: any) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.FileChanged', () => ({}))
  const started = await $.classic.SessionStart({ source: 'startup', cwd: root } as any)
  expect((started as any).watchPaths).toEqual([`${root}/.git/index`, `${root}/.git/HEAD`])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  await ui.post({ copy: `${root}/b.txt` }, { in: 'rows' })
  await ui.post({ copy: `${root}/b.txt`, shift: true }, { in: 'rows' })
  await clock.settle()
  expect(copied).toEqual(['b.txt', `${root}/b.txt`])
  await ui.input({ key: 'q', text: 'b', kind: 'change' })
  await clock.settle()
  expect(await ui.find({ key: 'clear' })).toBeDefined()
  await ui.press({ key: 'clear' })
  await clock.settle()
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  await ui.post({ key: 'end' }, { in: 'rows' })
  await clock.settle()
  const rowsOf = async () => ((await ui.drawn()) as any).children.find((c: any) => c.type === 'Client').props.props
  expect((await rowsOf()).active).toBe(`${root}/c.txt`)
  await ui.post({ key: 'home' }, { in: 'rows' })
  await clock.settle()
  expect((await rowsOf()).active).toBe(`${root}/.git`)
  const before = ran.filter(a => a.includes('status')).length
  await $.classic.FileChanged({ file_path: `${root}/.git/index`, event: 'change' } as any)
  await clock.advance(400)
  expect(ran.filter(a => a.includes('status')).length).toBeGreaterThan(before)
  await ui.unmount()
})

test('sidebar only: no pane in the default layout, and an inline pane closes itself', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.txt', 'file']] }, status: '', numstat: '' }, ran)
  const opened = opens
  const closedBefore = closes.length
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const before = opened.length
  const r = await $.command.run({ command: 'crewdeck', args: '', origin: { kind: 'person' }, presentation: { isFullscreen: false, columns: 200 } } as any)
  expect(JSON.stringify(r)).toContain('/tui fullscreen')
  expect(opened.length).toBe(before)
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: { ...paneProps(60), placement: 'inline' } })
  await clock.settle()
  expect(closes.length).toBeGreaterThan(closedBefore)
  await ui.unmount()
})

test('in the desktop app /crewdeck opens the pane without the terminal layout checks', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.txt', 'file']] }, status: '', numstat: '' }, ran)
  on('session.surfaces', () => ({ value: ['desktop'] }))
  await $.session.start({ cwd: root, surface: null, isInteractive: false })
  await clock.settle()
  // The panel opened at the start: /crewdeck closes it, again opens it, and `/crewdeck src` opens the tree on a folder.
  const run = (args: string) => $.command.run({ command: 'crewdeck', args, origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 80 } } as any)
  expect(opens.at(-1)).toMatchObject({ id: 'crewdeck' })
  const closedBefore = closes.length
  expect(JSON.stringify(await run(''))).toContain('Crewdeck panel closed')
  expect(closes.length).toBe(closedBefore + 1)
  expect(closes.at(-1)).toMatchObject({ id: 'crewdeck' })
  const before = opens.length
  expect(JSON.stringify(await run(''))).toContain('Crewdeck panel opened')
  expect(opens.length).toBe(before + 1)
  expect(opens.at(-1)).toMatchObject({ id: 'crewdeck' })
  // `open` never closes it.
  expect(JSON.stringify(await run('open'))).toContain('Crewdeck panel opened')
  expect(closes.length).toBe(closedBefore + 1)
  const r = await run('.')
  await clock.settle()
  expect(JSON.stringify(r)).toContain('File tree on')
  expect(opens.at(-1)).toMatchObject({ id: 'crewdeck', focus: true })
})

const shimmer = (name: string, tone: string) => `"t":${JSON.stringify(name)},"sh":"${tone}"`
const fullscreen = (args: string) => ({ command: 'crewdeck', args, origin: { kind: 'person' }, presentation: { isFullscreen: true, columns: 200 } }) as any

test('after /clear the tree rebuilds itself, keeps a pinned folder, and an empty root never loops', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['sub', 'dir']], [`${root}/sub`]: [['b.ts', 'file']] }, status: '', numstat: '' }, ran)
  on('classic.SessionStart', () => ({}))
  expect(ancestorsOf('/repo/a.ts', '')).toEqual([])
  expect(ancestorsOf('/repo2/a.ts', '/repo')).toEqual([])
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'Read', file_path: `${root}/a.ts` } as any)
  await clock.settle()
  await $.classic.SessionStart({ source: 'clear', cwd: root } as any)
  await clock.settle()
  expect(await texts(ui)).toContain(`"id":"${root}/a.ts"`)
  await $.command.run(fullscreen(`${root}/sub`))
  await clock.settle()
  await $.classic.SessionStart({ source: 'clear', cwd: root } as any)
  await clock.settle()
  const shown = await texts(ui)
  expect(shown).toContain(`"id":"${root}/sub/b.ts"`)
  expect(shown).not.toContain(`"id":"${root}/a.ts"`)
  await ui.unmount()
})

test('opener failures show a toast instead of failing silently', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', dirs: { [root]: [['a.xyz', 'file']] }, status: '', numstat: '', exits: { open: [1, 'No application knows how to open a.xyz\n'] } }, ran)
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${root}/a.xyz` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.xyz` }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${root}/a.xyz`])
  expect(ran.some(a => a[0] === 'toast' && (a[1] ?? '').includes('No application knows how to open a.xyz'))).toBe(true)
  await ui.unmount()
})

test('macOS: space on a file opens Quick Look, space on a folder still toggles it', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', dirs: { [root]: [['a b.png', 'file'], ['sub', 'dir']], [`${root}/sub`]: [['c.txt', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${root}/a b.png` }, { in: 'rows' })
  await clock.settle()
  await ui.post({ key: ' ' }, { in: 'rows' })
  await clock.settle()
  const look = ran.find(a => a[0] === 'sh' && (a[2] ?? '').includes('qlmanage -p'))
  expect(look?.at(-1)).toBe(`${root}/a b.png`)
  expect(ran.some(a => a[0] === 'open')).toBe(false)
  await ui.post({ press: `${root}/sub` }, { in: 'rows' })
  await clock.settle()
  await ui.post({ key: ' ' }, { in: 'rows' })
  await clock.settle()
  expect(ran.filter(a => a[0] === 'sh' && (a[2] ?? '').includes('qlmanage')).length).toBe(1)
  await ui.unmount()
})

test('open with: a double-click and Enter run the configured command instead of the default app', { timeoutMs: 20_000, options: { open: 'glow -p {path} --dir "{dir}"' } }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/my proj'
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', dirs: { [root]: [['a b.md', 'file'], ['c.md', 'file']] }, status: '', numstat: '', exits: { glow: [1, 'glow: no such file\n'] } }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${root}/a b.md` }, { in: 'rows' })
  await ui.post({ press: `${root}/a b.md` }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['glow', '-p', `${root}/a b.md`, '--dir', root])
  expect(ran.some(a => a[0] === 'open')).toBe(false)
  expect(ran.some(a => a[0] === 'toast' && (a[1] ?? '').includes('glow: no such file'))).toBe(true)
  await ui.post({ key: 'down' }, { in: 'rows' })
  await ui.post({ key: 'return' }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['glow', '-p', `${root}/c.md`, '--dir', root])
  await ui.unmount()
})

test('open with preview: a double-click shows the file in the pane, left goes back to the tree, arrows scroll, ↗ opens the default app, a binary file shows a note', { timeoutMs: 20_000, options: { open: 'preview' } }, async ($, on) => {
  const ran: Ran = []
  const root = '/Users/k/proj'
  const clock = world(on, {
    os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', status: '', numstat: '',
    dirs: { [root]: [['notes.md', 'file'], ['a.ts', 'file'], ['blob.bin', 'file']] },
    files: { [`${root}/notes.md`]: '# Title\r\n\nSome *notes*\u0007', [`${root}/a.ts`]: `const a = 1\n${'a++\n'.repeat(60)}`, [`${root}/blob.bin`]: 'PK\u0000\u0003' },
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${root}/notes.md` }, { in: 'rows' })
  await ui.post({ press: `${root}/notes.md` }, { in: 'rows' })
  await clock.settle()
  let shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('# Title\\n\\nSome *notes*"')
  expect(shown).not.toContain('a.ts')
  expect(ran.some(a => a[0] === 'open')).toBe(false)
  const sent = await $.prompt.submit({ text: 'what is this?', wait: false } as any)
  expect(JSON.stringify(sent)).toContain(`${root}/notes.md`)
  await ui.press({ key: 'back' })
  await clock.settle()
  expect(await texts(ui)).toContain('a.ts')
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await clock.settle()
  shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('const a = 1')
  expect(shown).toContain('"startLine":1')
  await ui.post({ key: 'down' }, { in: 'rows' })
  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).toContain('"startLine":2')
  await ui.post({ key: 'q' }, { in: 'rows' })
  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).toContain('"startLine":2')
  await ui.post({ key: 'left' }, { in: 'rows' })
  await clock.settle()
  expect(await texts(ui)).toContain('notes.md')
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await clock.settle()
  await ui.press({ key: 'external' })
  await clock.settle()
  expect(ran).toContainEqual(['open', '--', `${root}/a.ts`])
  await ui.press({ key: 'back' })
  await ui.post({ press: `${root}/blob.bin` }, { in: 'rows' })
  await ui.post({ press: `${root}/blob.bin` }, { in: 'rows' })
  await clock.settle()
  shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('binary file')
  expect(shown).not.toContain('PK')
  await ui.post({ key: 'left' }, { in: 'rows' })
  await clock.settle()
  expect(await texts(ui)).toContain('notes.md')
  await ui.unmount()
})

test('open with on linux: the command runs detached, like the default opener', { timeoutMs: 20_000, options: { open: 'evince {path}' } }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.pdf', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${root}/a.pdf` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.pdf` }, { in: 'rows' })
  await clock.settle()
  expect(ran).toContainEqual(['sh', '-c', LINUX_LAUNCH, 'sh', 'evince', `${root}/a.pdf`])
  await ui.unmount()
})

test('open with preview: End shows the last screen, an edit reloads the file, a fence the window starts in is reopened, and a new session starts on the tree', { timeoutMs: 20_000, options: { open: 'preview' } }, async ($, on) => {
  const root = '/Users/k/proj'
  const body = Array.from({ length: 60 }, (_, i) => `line ${i}`)
  const doc = ['# Doc', '~~~sh', '```', ...body, '~~~', 'after'].join('\n')
  const w: World = { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', status: '', numstat: '', dirs: { [root]: [['a.ts', 'file'], ['doc.md', 'file']] }, files: { [`${root}/a.ts`]: body.join('\n'), [`${root}/doc.md`]: doc } }
  const clock = world(on, w, [])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const props = { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } }
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await clock.settle()
  await ui.post({ key: 'end' }, { in: 'rows' })
  await clock.settle()
  let shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('"startLine":42')
  expect(shown).toContain('line 59')
  w.files![`${root}/a.ts`] = 'changed\n'
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).toContain('changed')
  await ui.post({ key: 'left' }, { in: 'rows' })
  await ui.post({ press: `${root}/doc.md` }, { in: 'rows' })
  await ui.post({ press: `${root}/doc.md` }, { in: 'rows' })
  await clock.settle()
  await ui.post({ key: 'down' }, { in: 'rows' })
  await ui.post({ key: 'down' }, { in: 'rows' })
  await ui.post({ key: 'down' }, { in: 'rows' })
  await ui.post({ key: 'down' }, { in: 'rows' })
  await clock.settle()
  shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('"text":"~~~sh\\nline 1')
  await ui.unmount()
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const again = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props })
  await clock.settle()
  expect(await texts(again)).toContain('doc.md')
  await again.unmount()
})

test('open with preview on desktop: the whole file is drawn and the wheel goes to the app', { timeoutMs: 20_000, options: { open: 'preview' } }, async ($, on) => {
  const root = '/Users/k/proj'
  const body = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
  const clock = world(on, { os: 'darwin', env: { HOME: '/Users/k' }, cwd: root, top: '', status: '', numstat: '', dirs: { [root]: [['a.ts', 'file']] }, files: { [`${root}/a.ts`]: body } }, [])
  const appScrolls: number[] = []
  on('ui.scroll', (_$: any, e: any) => (appScrolls.push(e.by), {}))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const props = { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } }
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await ui.post({ press: `${root}/a.ts` }, { in: 'rows' })
  await clock.settle()
  const shown = JSON.stringify(await ui.drawn())
  expect(shown).toContain('line 0')
  expect(shown).toContain('line 199')
  const wheel = { component: 'Pane', requestId: 'filetree', by: 5, offset: 5, bodyRows: 20, contentRows: 202, origin: { kind: 'person' } }
  expect(await $.ui.scroll(wheel as any)).toEqual({})
  expect(appScrolls).toEqual([5])
  await ui.unmount()
})

test('an older directory listing never overwrites a newer one', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/scratch'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['old.txt', 'file']] }, status: '', numstat: '', delays: {} }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  w.delays = { [root]: [1_000] }
  await ui.press({ key: 'refresh' })
  w.dirs[root] = [['new.txt', 'file']]
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(await texts(ui)).toContain('new.txt')
  await clock.advance(1_500)
  const shown = await texts(ui)
  expect(shown).toContain('new.txt')
  expect(shown).not.toContain('old.txt')
  await ui.unmount()
})

test('a listing error keeps the cached rows and says so', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/scratch'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.txt', 'file']] }, status: '', numstat: '' }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  w.denied = [root]
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(await texts(ui)).toContain(`"id":"${root}/a.txt"`)
  expect(ran.some(a => a[0] === 'toast' && (a[1] ?? '').includes('could not list'))).toBe(true)
  await ui.unmount()
})

test('replacing many folders in one batch keeps unchanged nodes and drops what vanished', async () => {
  const dir = (id: string, loaded: boolean) => ({ id, parent: id.slice(0, id.lastIndexOf('/')) || '/', name: id.slice(id.lastIndexOf('/') + 1), kind: 'dir' as const, hidden: false, mtime: 0, loaded })
  const file = (id: string) => ({ ...dir(id, false), kind: 'file' as const })
  const nodes = [dir('/r/a', true), dir('/r/b', true), file('/r/a/x'), dir('/r/b/y', true), file('/r/b/y/z')]
  const out = replaceChildren(nodes, new Map([
    ['/r/a', toNodes('/r/a', [{ name: 'w', kind: 'file', mtimeMs: 0, isLink: false }])],
    ['/r/b', []],
    ['/r/b/y', toNodes('/r/b/y', [{ name: 'z', kind: 'file', mtimeMs: 0, isLink: false }])],
  ]))
  expect(out.map(n => n.id).sort()).toEqual(['/r/a', '/r/a/w', '/r/b'])
  expect(out.find(n => n.id === '/r/b')?.loaded).toBe(true)
})

test('a cwd change moves the tree and drops the old selection before the next prompt', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const a = '/home/k/repo-a'
  const b = '/home/k/repo-b'
  const c = '/home/k/repo-c'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: a, top: '', dirs: { [a]: [['a.txt', 'file']], [b]: [['b.txt', 'file']], [c]: [['c.txt', 'file']] }, status: '', numstat: '' }
  const clock = world(on, w, ran)
  on('classic.CwdChanged', () => ({}))
  await $.session.start({ cwd: a, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.post({ press: `${a}/a.txt` }, { in: 'rows' })
  await clock.settle()
  w.cwd = b
  const sent = await $.prompt.submit({ text: 'what is this?', wait: false } as any)
  expect(JSON.stringify(sent)).not.toContain(`${a}/a.txt`)
  await clock.settle()
  expect(await texts(ui)).toContain('b.txt')
  w.cwd = c
  await $.classic.CwdChanged({ old_cwd: b, new_cwd: c } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('c.txt')
  await ui.unmount()
})

test('open at start off: no pane at start, on a cwd change or a prompt, until /crewdeck opens it', { timeoutMs: 20_000, options: { start: 'off' } }, async ($, on) => {
  const ran: Ran = []
  const a = '/home/k/repo-a'
  const b = '/home/k/repo-b'
  const c = '/home/k/repo-c'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: a, top: '', dirs: { [a]: [['a.txt', 'file']], [b]: [['b.txt', 'file']], [c]: [['c.txt', 'file']] }, status: '', numstat: '' }
  const clock = world(on, w, ran)
  on('classic.CwdChanged', () => ({}))
  const before = opens.length
  await $.session.start({ cwd: a, surface: 'terminal', isInteractive: true })
  await clock.settle()
  w.cwd = b
  await $.prompt.submit({ text: 'look at @b.txt', wait: false } as any)
  await clock.settle()
  w.cwd = c
  await $.classic.CwdChanged({ old_cwd: b, new_cwd: c } as any)
  await clock.settle()
  await $.session.start({ cwd: c, surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(opens.length).toBe(before)
  await $.command.run(fullscreen(''))
  await clock.settle()
  expect(opens.slice(before)).toContainEqual(expect.objectContaining({ id: 'crewdeck' }))
  const shown = opens.length
  w.cwd = a
  await $.classic.CwdChanged({ old_cwd: c, new_cwd: a } as any)
  await clock.settle()
  expect(opens.length).toBeGreaterThan(shown)
})

test('a background git push stays running until its task notification arrives', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['a.txt', 'file']] }, status: '## main\0', numstat: '',
    tool: e => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: e.command === 'git push' ? 'b1' : 'b2' } }),
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'Bash', command: 'git push', run_in_background: true } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('pushing…')
  expect(await texts(ui)).not.toContain('pushed')
  await $.prompt.submit({ text: '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "git push" completed (exit code 0)</summary>\n</task-notification>', wait: false } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('pushed')
  await $.tool.call({ tool: 'Bash', command: 'git pull', run_in_background: true } as any)
  await clock.settle()
  await $.prompt.submit({ text: '<task-notification>\n<task-id>b2</task-id>\n<status>failed</status>\n<summary>Background command "git pull" failed with exit code 1</summary>\n</task-notification>', wait: false } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('pull failed')
  await ui.unmount()
})

test('a failed Bash command still refreshes what it changed before failing', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['a.txt', 'file'], ['b.txt', 'file']] }, status: '## main\0', numstat: '', tool: () => ({ isError: true, result: 'Exit code 1' }) }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  expect(await texts(ui)).toContain(`"id":"${root}/a.txt"`)
  const before = ran.filter(a => a.includes('status')).length
  w.dirs[root] = [['b.txt', 'file']]
  await $.tool.call({ tool: 'Bash', command: 'rm a.txt && false' } as any)
  await clock.settle()
  expect(ran.filter(a => a.includes('status')).length).toBeGreaterThan(before)
  expect(await texts(ui)).not.toContain(`"id":"${root}/a.txt"`)
  await ui.unmount()
})

test('git activity is only certified by evidence: HEAD for commits, the exit code only for plain && chains', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['a.txt', 'file']] }, status: '## main\0', numstat: '', heads: ['abc1234def0'] }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m test || true' } as any)
  await clock.settle()
  let shown = await texts(ui)
  expect(shown).toContain('commit failed')
  expect(shown).not.toContain('committed')
  expect(ran.some(a => a.includes('diff-tree'))).toBe(false)
  w.heads = ['abc1234def0', 'fed4321cba9']
  await $.tool.call({ tool: 'Bash', command: 'git commit -m real' } as any)
  await clock.settle()
  shown = await texts(ui)
  expect(shown).toContain('committed')
  expect(shown).toContain('fed4321')
  await $.tool.call({ tool: 'Bash', command: 'git push; echo done' } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('ran git push')
  await $.tool.call({ tool: 'Bash', command: 'git fetch && git status' } as any)
  await clock.settle()
  expect(await texts(ui)).toContain('fetched')
  await ui.unmount()
})

test('unknown git verbs count as writers and read-only commands skip git work', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['README.md', 'file'], ['gone.txt', 'file']] }, status: '## main\0', numstat: '' }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  const statuses = () => ran.filter(a => a[0] === 'git' && a.includes('status')).length
  let before = statuses()
  await $.tool.call({ tool: 'Bash', command: 'cat README.md' } as any)
  await $.tool.call({ tool: 'Bash', command: 'git status' } as any)
  await clock.settle()
  expect(statuses()).toBe(before)
  expect(ran.some(a => a[0] === 'find')).toBe(false)
  w.dirs[root] = [['README.md', 'file']]
  before = statuses()
  await $.tool.call({ tool: 'Bash', command: 'git clean -fd' } as any)
  await clock.settle()
  expect(statuses()).toBeGreaterThan(before)
  expect(ran.some(a => a[0] === 'find')).toBe(true)
  expect(await texts(ui)).not.toContain('gone.txt')
  await ui.unmount()
})

test('search matches relative paths, and a refresh or a click in the tree picks up files added since the index was built', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root, dirs: { [root]: [['src', 'dir'], ['alpha.txt', 'file']], [`${root}/src`]: [['a.ts', 'file']] }, status: '## main\0', numstat: '' }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await ui.input({ key: 'q', text: 'src/a.ts', kind: 'change' })
  await clock.settle()
  expect(await texts(ui)).toContain(`"id":"${root}/src/a.ts"`)
  await ui.input({ key: 'q', text: 'alpha', kind: 'change' })
  await clock.settle()
  w.dirs[`${root}/src`] = [['a.ts', 'file'], ['beta.ts', 'file']]
  await ui.press({ key: 'refresh' })
  await ui.input({ key: 'q', text: 'beta', kind: 'change' })
  await clock.settle()
  expect(await texts(ui)).toContain(`"id":"${root}/src/beta.ts"`)
  w.dirs[`${root}/src`] = [['a.ts', 'file'], ['beta.ts', 'file'], ['gamma.ts', 'file']]
  await clock.advance(2_500)
  await ui.post({ key: 'down' }, { in: 'rows' })
  await clock.settle()
  await ui.input({ key: 'q', text: 'gamma', kind: 'change' })
  await clock.settle()
  expect(await texts(ui)).toContain(`"id":"${root}/src/gamma.ts"`)
  await ui.unmount()
})

test('a pinned path with dot segments resolves to the same folder', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: '/home/k', top: '', dirs: { [root]: [['a.ts', 'file']], [`${root}/src`]: [] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: '/home/k', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const r = await $.command.run(fullscreen(`${root}/./src/..`))
  expect(JSON.stringify(r)).toContain('File tree on ~/proj.')
})

test('a written file whose name holds a newline still shimmers', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/scratch'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a\nb.ts', 'file'], ['c.txt', 'file']] }, status: '', numstat: '', find: `${root}/a\nb.ts\0` }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'Bash', command: 'touch "a\nb.ts"' } as any)
  await clock.settle()
  expect(ran.find(a => a[0] === 'find')).toContain('-print0')
  expect(await texts(ui)).toContain(shimmer('a\nb.ts', 'orange'))
  await ui.unmount()
})

test('the pane takes its background from the Omarchy theme and follows a theme switch', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '', theme: { toml: 'background = "#1e1e2e"\ndark_background = "#161622"\n', mtimeMs: 1 } }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toContain('"backgroundColor":"#161622"')
  w.theme = { toml: 'background = "#fafafa"\n', mtimeMs: 2 }
  await clock.advance(2_000)
  await clock.settle()
  const shown = await texts(ui)
  expect(shown).toContain('"backgroundColor":"#fafafa"')
  expect(shown).not.toContain('#161622')
  await ui.unmount()
})

test('without an Omarchy theme the pane keeps the terminal background and nothing polls', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  const stats = ran.filter(a => a[0] === 'theme-stat').length
  await clock.advance(10_000)
  await clock.settle()
  expect(ran.filter(a => a[0] === 'theme-stat').length).toBe(stats)
  // No box, the pane or a row, takes a background; a file's type badge is a chip of its own.
  expect(await texts(ui)).not.toMatch(/"type":"Box","props":\{[^}]*"backgroundColor":"#/)
  await ui.unmount()
})

test('formatSize: bytes, binary units, one decimal under 100, ? for unknown', async () => {
  expect(formatSize(0)).toBe('0 B')
  expect(formatSize(1023)).toBe('1023 B')
  expect(formatSize(1536)).toBe('1.5 K')
  expect(formatSize(412 * 1024)).toBe('412 K')
  expect(formatSize(6.2 * 1024 * 1024)).toBe('6.2 M')
  expect(formatSize(-1)).toBe('?')
})

test('age: now, minutes, hours and days, then the day past a week and the year past a year', async () => {
  const now = new Date(2026, 9, 12, 10, 42).getTime()
  const ago = (s: number) => now - s * 1000
  expect(age(0, now)).toBe('')
  expect(age(ago(30), now)).toBe('now')
  expect(age(now + 20_000, now)).toBe('now')
  expect(age(ago(12 * 60), now)).toBe('12m')
  expect(age(ago(3600 - 1), now)).toBe('59m')
  expect(age(ago(3 * 3600 + 59), now)).toBe('3h')
  expect(age(ago(5 * 86_400), now)).toBe('5d')
  expect(age(new Date(2026, 9, 3, 9).getTime(), now)).toBe('Oct 3')
  expect(age(new Date(2025, 10, 20).getTime(), now)).toBe('Nov 20')
  expect(age(new Date(2025, 9, 9).getTime(), now)).toBe('2025')
  expect(age(new Date(2027, 0, 1).getTime(), now)).toBe('Jan 1')
})

test('size column: the toggle swaps dates for sizes, folders are sized with du, an edit re-sizes its folders', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root,
    dirs: { [root]: [['src', 'dir'], ['README.md', 'file']], [`${root}/src`]: [['a.ts', 'file']] },
    status: '## main\0', numstat: '',
    du: { [`${root}/src`]: `2048\t${root}/src\n` },
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toMatch(STAMP)
  expect(ran.some(a => a[0] === 'du')).toBe(false)
  await ui.press({ key: 'size' })
  await clock.settle()
  const sized = await texts(ui)
  expect(sized).not.toMatch(STAMP)
  expect(sized).toContain(' 1 B')
  expect(sized).toContain(' 2.0 M')
  expect(ran).toContainEqual(['du', '-skxH', `${root}/src`])
  const before = ran.filter(a => a[0] === 'du').length
  await $.tool.call({ tool: 'Edit', file_path: `${root}/src/a.ts`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(ran.filter(a => a[0] === 'du').length).toBeGreaterThan(before)
  await ui.press({ key: 'size' })
  await clock.settle()
  expect(await texts(ui)).toMatch(STAMP)
  await ui.unmount()
})

test('size column on Windows sums file sizes with fs.list instead of du', { timeoutMs: 20_000, options: { column: 'size' } }, async ($, on) => {
  const ran: Ran = []
  const root = 'C:/Users/k/proj'
  const clock = world(on, {
    os: 'win32', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\k' }, cwd: root, top: '',
    dirs: { [root]: [['src', 'dir']], [`${root}/src`]: [['a.ts', 'file'], ['b.ts', 'file'], ['lib', 'dir']], [`${root}/src/lib`]: [['c.ts', 'file']] },
    status: '', numstat: '',
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  expect(await texts(ui)).toContain(' 3 B')
  expect(ran.some(a => a[0] === 'du')).toBe(false)
  await ui.unmount()
})

test('a folder whose size job goes stale mid-run is sized again instead of waiting forever', { timeoutMs: 20_000, options: { column: 'size' } }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root,
    dirs: { [root]: [['src', 'dir']], [`${root}/src`]: [['a.ts', 'file']] },
    status: '## main\0', numstat: '',
    du: { [`${root}/src`]: `2048\t${root}/src\n` },
    duDelays: [1_000],
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  await $.tool.call({ tool: 'Edit', file_path: `${root}/src/a.ts`, old_string: 'a', new_string: 'b' } as any)
  await clock.settle()
  await clock.advance(1_500)
  await clock.settle()
  expect(await texts(ui)).toContain(' 2.0 M')
  await ui.unmount()
})

test('on Windows a folder size does not walk into linked folders, like du', { timeoutMs: 20_000, options: { column: 'size' } }, async ($, on) => {
  const ran: Ran = []
  const root = 'C:/Users/k/proj'
  const clock = world(on, {
    os: 'win32', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\k' }, cwd: root, top: '',
    dirs: { [root]: [['src', 'dir']], [`${root}/src`]: [['a.ts', 'file'], ['b.ts', 'file'], ['back', 'dir']], [`${root}/src/back`]: [['x', 'file'], ['y', 'file'], ['z', 'file'], ['w', 'file']] },
    links: ['/Users/k/proj/src/back'],
    status: '', numstat: '',
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  const shown = await texts(ui)
  expect(shown).toContain(' 2 B')
  expect(shown).not.toContain(' 6 B')
  await ui.unmount()
})

test('age column: files show how long ago they changed, the toggle swaps ages for sizes and back, and the ages move on with the clock', { timeoutMs: 20_000, options: { column: 'age' } }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const now = 1_800_000_000_000
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root,
    dirs: { [root]: [['fresh.md', 'file'], ['recent.ts', 'file'], ['README.md', 'file']] },
    mtimes: { [`${root}/fresh.md`]: now - 30_000, [`${root}/recent.ts`]: now - 12 * 60_000 },
    status: '## main\0', numstat: '',
  }, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  let shown = await texts(ui)
  expect(shown).not.toMatch(STAMP)
  for (const label of [' now', ' 12m', ' 2023']) expect(shown).toContain(label)
  await ui.press({ key: 'size' })
  await clock.settle()
  shown = await texts(ui)
  expect(shown).toContain(' 1 B')
  expect(shown).not.toContain(' 12m')
  await ui.press({ key: 'size' })
  await clock.settle()
  expect(await texts(ui)).toContain(' 12m')
  await clock.advance(3 * 60_000)
  await clock.settle()
  shown = await texts(ui)
  expect(shown).toContain(' 3m')
  expect(shown).toContain(' 15m')
  await ui.unmount()
})

for (const hints of ['on', 'off'] as const) {
  test(`hints ${hints}: outside a repo the git init line ${hints === 'on' ? 'shows' : 'is hidden and the tree takes its row'}`, { timeoutMs: 20_000, options: { hints } }, async ($, on) => {
    const root = '/home/k/big'
    const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.txt`, 'file'] as [string, 'file'])
    const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
    await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } } })
    await clock.settle()
    const drawn = (await ui.drawn()) as any
    expect(JSON.stringify(drawn).includes('git init')).toBe(hints === 'on')
    // 20 rows less the header, the search, the hint when on, and Crewdeck's ALL FILES line.
    expect(drawn.children.find((c: any) => c.type === 'Client' && c.props.key === 'rows').props.props.rows.length).toBe(hints === 'on' ? 14 : 15)
    await ui.unmount()
  })
}

for (const os of ['linux', 'win32'] as const) {
  test(`${os}: a failed file opener is visible`, { timeoutMs: 20_000 }, async ($, on) => {
    const ran: Ran = []
    const root = os === 'linux' ? '/home/k/proj' : 'C:/Users/k/proj'
    const clock = world(on, {
      os, env: os === 'win32' ? { OS: 'Windows_NT' } : { HOME: '/home/k' }, cwd: root, top: root,
      dirs: { [root]: [['dax.ts', 'file']] }, status: '', numstat: '',
      exits: { [os === 'linux' ? 'sh' : 'powershell']: [7, ''] },
    }, ran)
    await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
    await clock.settle()
    await ui.post({ press: `${root}/dax.ts` }, { in: 'rows' })
    await ui.post({ press: `${root}/dax.ts` }, { in: 'rows' })
    await clock.settle()
    expect(ran.some(a => a[0] === 'toast' && a[1]?.includes(`could not open ${root}/dax.ts`) && a[1]?.includes('exit 7'))).toBe(true)
    await ui.unmount()
  })
}

test('Windows: a commit run through the PowerShell tool shows as git activity', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = 'C:/Users/k/proj'
  const w: World = { os: 'win32', env: { OS: 'Windows_NT', USERPROFILE: 'C:\Users\k' }, cwd: 'C:\Users\k\proj', top: root, dirs: { [root]: [['a.txt', 'file']] }, status: '## main\0', numstat: '', heads: ['abc1234def0', 'fed4321cba9'] }
  const clock = world(on, w, ran)
  await $.session.start({ cwd: 'C:\Users\k\proj', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'PowerShell', command: 'git commit -m real' } as any)
  await clock.settle()
  const shown = await texts(ui)
  expect(shown).toContain('committed')
  expect(shown).toContain('fed4321')
  await ui.unmount()
})

test('files a Grep or Glob search returns shimmer as reads, relative names resolved against the cwd', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['sub', 'dir']], [`${root}/sub`]: [['b.ts', 'file']] }, status: '', numstat: '' }
  w.tool = e => (e.tool === 'Grep' ? { result: { numFiles: 1, filenames: ['sub/b.ts'] } } : e.tool === 'Glob' ? { result: { numFiles: 1, filenames: [`${root}/a.ts`] } } : undefined)
  const clock = world(on, w, ran)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  await $.tool.call({ tool: 'Grep', pattern: 'x' } as any)
  await clock.settle()
  expect(await texts(ui)).toContain(shimmer('b.ts', 'purple'))
  await $.tool.call({ tool: 'Glob', pattern: '*.ts' } as any)
  await clock.settle()
  expect(await texts(ui)).toContain(shimmer('a.ts', 'purple'))
  await ui.unmount()
})

// ---- crewdeck: the agents half and the file tree, connected ----

// The text of a drawing, its shimmered names (drawn a character at a time) joined back up; and of
// the row drawn with the tree's selection color behind it.
const textOf = (n: any): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' ? textOf(n.children ?? []) : '')
const rowsOf = (drawn: any): any[] => drawn?.children ?? []
const activeRow = (drawn: any): string => textOf(rowsOf(drawn).find((r: any) => r?.props?.backgroundColor === '#4c5058') ?? '')

test('crewdeck: a subagent shimmers the files it touches in its tier color, and its card lists them', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['site.css', 'file'], ['notes.md', 'file']] }, status: '', numstat: '' }, ran)
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ tool_use_id: 'w1', prompt: 'p', description: 'Design the landing page', subagentType: 'savvy-medium', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()

  // The worker's read is its tier's paler tone, its write the tier's own; Claude's own read stays purple.
  await $.tool.call({ tool: 'Read', file_path: `${root}/notes.md`, agentId: 'w1' } as any)
  await clock.settle()
  expect(await texts(tree)).toContain(shimmer('notes.md', 'tier-medium-read'))
  await $.tool.call({ tool: 'Write', file_path: `${root}/site.css`, content: 'a{}', agentId: 'w1' } as any)
  await clock.settle()
  expect(await texts(tree)).toContain(shimmer('site.css', 'tier-medium'))
  await $.tool.call({ tool: 'Read', file_path: `${root}/a.ts` } as any)
  await clock.settle()
  expect(await texts(tree)).toContain(shimmer('a.ts', 'purple'))
  await tree.unmount()

  // The worker's card names what it edited (the read is left out once it has edited something).
  const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as any
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  expect(await card.find({ type: 'Text', text: /✎ site\.css$/ })).toBeDefined()
  await card.unmount()
  const desk = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const sources = (await desk.findAll({ type: 'Svg' })).map((s: any) => String(s.props.source))
  expect(sources.some(src => src.includes('✎ site.css'))).toBe(true)
  await desk.unmount()
})

test('crewdeck: before any edit an agent card lists what it read, and a Claude read lists nothing', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['b.ts', 'file'], ['c.ts', 'file']] }, status: '', numstat: '' }, ran)
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ tool_use_id: 'r1', prompt: 'p', description: 'Review the diff', subagentType: 'Explore', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  for (const f of ['a.ts', 'b.ts', 'c.ts']) await $.tool.call({ tool: 'Read', file_path: `${root}/${f}`, agentId: 'r1' } as any)
  await $.tool.call({ tool: 'Read', file_path: `${root}/a.ts` } as any)
  await clock.settle()
  const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as any
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  // Newest first: c.ts and b.ts shown, a.ts counted.
  expect(await card.find({ type: 'Text', text: /◎ c\.ts, b\.ts \+1$/ })).toBeDefined()
  await card.unmount()
})

test('crewdeck: pressing an agent card opens it to the files it changed, drawn as tree rows; a file press shows it in the tree', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, {
    os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: root,
    dirs: { [root]: [['src', 'dir'], ['notes.md', 'file']], [`${root}/src`]: [['app.ts', 'file'], ['styles', 'dir']], [`${root}/src/styles`]: [['site.css', 'file']] },
    status: '## main\0 M src/app.ts\0 M src/styles/site.css\0', numstat: '7\t2\tsrc/app.ts\0' + '3\t0\tsrc/styles/site.css\0',
  }, ran)
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ tool_use_id: 'w1', prompt: 'p', description: 'Build the landing page', subagentType: 'savvy-light', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  await $.tool.call({ tool: 'Read', file_path: `${root}/notes.md`, agentId: 'w1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: `${root}/src/app.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await $.tool.call({ tool: 'Write', file_path: `${root}/src/styles/site.css`, content: 'a{}', agentId: 'w1' } as any)
  await clock.settle()
  // Past the tree's flash: the files are settled (a lit one shimmers instead; its own test).
  await clock.advance(3000)

  const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as any
  const looks = (closed: string, open: string) => {
    // Closed: one row, what it changed and read, the lines on the right; no file yet.
    expect(closed).toContain('2 changed · 1 read')
    expect(closed).toContain(' +10')
    expect(closed).not.toContain('app.ts')
    expect(open).toContain('app.ts')
    expect(open).toContain('site.css')
    expect(open).toContain('src/styles')
    expect(open).toContain('◎ read notes.md')
    // Modified files take the tree's git color and badge.
    expect(open).toContain('"children":[" M"]')
  }
  // The terminal draws the rows as the engine's own Buttons, so the keyboard reaches them: the
  // card's first is pressed by its digit. It finds the card closed and opens it.
  const term = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const toggle = await term.find({ key: 'toggle:w1' })
  expect(toggle?.type).toBe('Button')
  expect(toggle?.props.hotkey).toBe('1')
  const closed = JSON.stringify(await term.find({ key: 'files-w1' }))
  await term.press({ key: 'toggle:w1' })
  looks(closed, JSON.stringify(await term.find({ key: 'files-w1' })))
  expect((await term.find({ key: `w1:file:${root}/src/app.ts` }))?.type).toBe('Button')
  await term.unmount()
  // The desktop draws them in the tree's own rows: it finds the card open and closes it.
  const desk = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  const open = JSON.stringify(await desk.drawn({ in: 'changes-w1' }))
  await desk.post({ press: 'toggle:w1' }, { in: 'changes-w1' })
  looks(JSON.stringify(await desk.drawn({ in: 'changes-w1' })), open)
  await desk.unmount()

  // A file press on the card (a press of its Button in the terminal) opens the tree on that file.
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: pane })
  await card.press({ key: 'toggle:w1' })
  await card.press({ key: `w1:file:${root}/src/styles/site.css` })
  await clock.settle()
  await card.unmount()
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  const rows = await tree.drawn({ in: 'rows' })
  // The tree's cursor (the selection color behind its row) is on the file.
  expect(activeRow(rows)).toContain('site.css')
  await tree.unmount()
})

test('crewdeck: the crew view lists every file the agents changed, a dot per agent, and goes back to the tree', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['b.ts', 'file'], ['c.ts', 'file']] }, status: '', numstat: '' }, ran)
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ tool_use_id: 'w1', prompt: 'p', description: 'Build it', subagentType: 'savvy-light', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  await $.agent.spawn({ tool_use_id: 'w2', prompt: 'p', description: 'Style it', subagentType: 'savvy-medium', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, agentId: 'w1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, agentId: 'w2' } as any)
  await $.tool.call({ tool: 'Write', file_path: `${root}/b.ts`, content: '', agentId: 'w2' } as any)
  await $.tool.call({ tool: 'Read', file_path: `${root}/c.ts`, agentId: 'w1' } as any)
  await clock.settle()
  await clock.advance(3000)
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await tree.post({ press: true }, { in: 'button-crew' })
  await clock.settle()
  const crew = JSON.stringify(await tree.drawn({ in: 'rows' }))
  expect(crew).toContain('2 agents · 2 files changed')
  // a.ts: light's dot then medium's; b.ts medium's alone; c.ts was only read.
  expect(crew).toContain('{"type":"Text","props":{"color":"#1D9E75"},"children":[" ●"]},{"type":"Text","props":{"color":"#378ADD"},"children":["●"]}')
  expect(crew).toContain('b.ts')
  expect(crew).not.toContain('c.ts')
  await tree.post({ press: `file:${root}/b.ts` }, { in: 'rows' })
  await clock.settle()
  const back = await tree.drawn({ in: 'rows' })
  expect(textOf(back)).toContain('c.ts')
  expect(activeRow(back)).toContain('b.ts')
  await tree.unmount()
})

test('crewdeck look: a file being read or written gets a pill and a tinted row, every file a type badge, and the touched card keeps them', { timeoutMs: 20_000 }, async ($, on) => {
  const ran: Ran = []
  const root = '/home/k/tax-return-2026'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['receipts', 'dir'], ['deductions.csv', 'file'], ['notes.md', 'file']], [`${root}/receipts`]: [['laptop.pdf', 'file'], ['desk-chair.pdf', 'file']] }, status: '', numstat: '' }, ran)
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.agent.spawn({ tool_use_id: 'w1', prompt: 'p', description: 'Fill in the deductions', subagentType: 'savvy-light', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()

  // Claude reads a receipt, the worker edits the sheet: both lit at once.
  await $.tool.call({ tool: 'Read', file_path: `${root}/receipts/laptop.pdf` } as any)
  await $.tool.call({ tool: 'Write', file_path: `${root}/deductions.csv`, content: 'x', agentId: 'w1' } as any)
  const rows = await ui.drawn({ in: 'rows' })
  const row = (name: string) => rowsOf(rows).find((r: any) => textOf(r).includes(name))
  expect(textOf(row('laptop.pdf'))).toContain(' reading ')
  expect(textOf(row('deductions.csv'))).toContain(' editing ')
  // The row behind a lit file is tinted; a quiet one is not.
  expect(row('laptop.pdf')?.props?.backgroundColor).toMatch(/^#/)
  expect(row('notes.md')?.props?.backgroundColor).toBeUndefined()
  // Badges: PDF, CSV, MD.
  for (const [name, badge] of [['laptop.pdf', ' PDF '], ['deductions.csv', ' CSV '], ['notes.md', ' MD ']]) expect(textOf(row(name))).toContain(badge)
  // The worker's pill is its tier's color (light: green-teal), Claude's own read purple.
  expect(JSON.stringify(row("deductions.csv"))).toMatch(/"color":"#[0-9a-fA-F]{6}","backgroundColor":"#[0-9a-f]{6}","bold":true\},"children":\[" editing "\]/)
  expect(JSON.stringify(row('laptop.pdf'))).toMatch(/"color":"#[0-9a-fA-F]{6}","backgroundColor":"#[0-9a-f]{6}","bold":true\},"children":\[" reading "\]/)
  // The pills pulse in the row's shimmer: the light tier's palette for the worker, purple for Claude.
  const pillColor = (name: string, label: string) => JSON.stringify(row(name)).match(new RegExp(`"color":"(#[0-9a-fA-F]{6})","backgroundColor":"#[0-9a-f]{6}","bold":true\\},"children":\\[" ${label} "\\]`))?.[1]?.toLowerCase()
  expect(['#1d9e75', '#56b698', '#8ecfba', '#ddf0ea']).toContain(pillColor('deductions.csv', 'editing'))
  expect(['#a855f7', '#c084fc', '#d8b4fe', '#f3e8ff']).toContain(pillColor('laptop.pdf', 'reading'))

  // Once the shimmer is gone, the card above the tree still says who touched what.
  await clock.advance(5_000)
  await clock.settle()
  const card = textOf(await ui.drawn({ in: 'touched' }))
  expect(card).toContain('deductions.csv')
  expect(card).toContain(' Edited ')
  expect(card).toContain('laptop.pdf')
  expect(card).toContain('receipts')
  expect(card).toContain(' Opened ')
  const whole = textOf(await ui.drawn())
  expect(whole).toContain('CLAUDE & CREW TOUCHED')
  expect(whole).toContain('2 FILES')
  expect(whole).toContain('ALL FILES')
  expect(whole).toContain('TAX-RETURN-2026')
  // And the pills are gone from the tree.
  expect(textOf(await ui.drawn({ in: 'rows' }))).not.toContain(' reading ')

  // A press on the card shows the file in the tree.
  await ui.post({ press: `file:${root}/deductions.csv` }, { in: 'touched' })
  await clock.settle()
  expect(activeRow(await ui.drawn({ in: 'rows' }))).toContain('deductions.csv')
  await ui.unmount()
})

// ---- crewdeck: regressions from the review of the merged mod ----

const agentPane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } as any
const spawnAgent = ($: any, id: string, type: string, description: string) =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as any)

test('review: the touched card and ALL FILES line are counted, so the tree still fits its pane', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const names = Array.from({ length: 30 }, (_, i) => [`f${String(i).padStart(2, '0')}.txt`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: { ...paneProps(60), scroll: { offset: 0, bodyRows: 20 } } })
  for (const n of names.slice(0, 7)) await $.tool.call({ tool: 'Read', file_path: `${root}/${n[0]}` } as any)
  await clock.advance(5_000)
  await clock.settle()
  const drawn = (await ui.drawn()) as any
  const rows = drawn.children.find((c: any) => c.type === 'Client' && c.props.key === 'rows').props.props.rows.length
  // Header, hint and the search box with its two borders (5), the card (5 files, "+2 more", a title,
  // two borders and a gap: 10), ALL FILES (1): 16 rows; the tree gets the rest, at least 5.
  expect(textOf(await ui.drawn({ in: 'touched' }))).toContain('+2 more')
  expect(rows).toBe(Math.max(5, 20 - 16))
  await ui.unmount()
})

test('review: a search does not put its hits in the touched card; reading does', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const w: World = { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['b.ts', 'file']] }, status: '', numstat: '' }
  w.tool = e => (e.tool === 'Grep' ? { result: { numFiles: 2, filenames: ['a.ts', 'b.ts'] } } : undefined)
  const clock = world(on, w, [])
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await $.tool.call({ tool: 'Grep', pattern: 'x' } as any)
  await clock.advance(5_000)
  await clock.settle()
  expect(textOf(await ui.drawn())).not.toContain('CLAUDE TOUCHED')
  await $.tool.call({ tool: 'Read', file_path: `${root}/b.ts` } as any)
  await clock.settle()
  const card = textOf(await ui.drawn({ in: 'touched' }))
  expect(card).toContain('b.ts')
  expect(card).not.toContain('a.ts')
  await ui.unmount()
})

test("review: a subagent's shell edit shimmers in its color and lands on its card and in the crew view", { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['b.ts', 'file']] }, status: '', numstat: '', find: `${root}/a.ts\0` }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Rename the helper')
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await clock.settle()
  await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' a.ts", agentId: 'w1' } as any)
  await clock.settle()
  // The coder's green, not Claude's orange.
  expect(await texts(tree)).toContain(shimmer('a.ts', 'tier-light'))
  await tree.unmount()
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  expect(await card.find({ type: 'Text', text: /✎ a\.ts$/ })).toBeDefined()
  await card.unmount()
})

test('review: reading many files never pushes an edit off the card', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const names = Array.from({ length: 80 }, (_, i) => [`r${i}.ts`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['keep.ts', 'file'], ...names] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Do the thing')
  await $.tool.call({ tool: 'Edit', file_path: `${root}/keep.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  for (const n of names) await $.tool.call({ tool: 'Read', file_path: `${root}/${n[0]}`, agentId: 'w1' } as any)
  await clock.settle()
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  const rows = textOf(await card.find({ key: 'files-w1' }))
  expect(rows).toContain('1 changed')
  // Reads are capped on their own; the edit stays.
  expect(rows).toContain('40 read')
  await card.unmount()
})

test('review: /clear empties the agents panel and the touched card, and the panel opens again', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Before the clear')
  await $.tool.call({ tool: 'Read', file_path: `${root}/a.ts` } as any)
  await clock.settle()
  const before = opens.length
  await $.classic.SessionStart({ source: 'clear', cwd: root } as any)
  await clock.settle()
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  expect(await card.find({ type: 'Text', text: /Before the clear/ })).toBeUndefined()
  await card.unmount()
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  expect(textOf(await tree.drawn())).not.toContain('CLAUDE TOUCHED')
  await tree.unmount()
  // The next subagent opens the panel again.
  await spawnAgent($, 'w2', 'general-purpose', 'After the clear')
  expect(opens.slice(before).some((o: any) => o.id === 'crewdeck')).toBe(true)
})

test('review: a crew-view row copies its path, not its press id', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, [])
  const copied: string[] = []
  on('ui.copy', (_$: any, e: any) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Do the thing')
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.settle()
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  await tree.post({ press: true }, { in: 'button-crew' })
  await clock.settle()
  await tree.post({ copy: `file:${root}/a.ts`, shift: false }, { in: 'rows' })
  expect(copied).toEqual(['a.ts'])
  await tree.unmount()
})

// Keyboard: the agents pane is the engine's own Buttons in the terminal, the crew view scrolls.

test('keyboard: digits 1-9 open the first nine cards with files, in the order they are drawn', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const ids = Array.from({ length: 11 }, (_, i) => `w${String(i).padStart(2, '0')}`)
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: ids.map(id => [`${id}.ts`, 'file'] as [string, 'file']) }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  // Ten agents edit a file; the last one only spawns.
  for (const id of ids) await spawnAgent($, id, 'general-purpose', `Task ${id}`)
  for (const id of ids.slice(0, 10)) await $.tool.call({ tool: 'Edit', file_path: `${root}/${id}.ts`, old_string: 'a', new_string: 'b', agentId: id } as any)
  await clock.settle()
  await clock.advance(3000)
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  const hotkeys = (await card.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('toggle:')).map(b => [b.key, b.props.hotkey])
  // Running cards are drawn newest first: w09 is 1, w01 is 9, w00 (the tenth) has none.
  expect(hotkeys[0]).toEqual(['toggle:w09', '1'])
  expect(hotkeys[8]).toEqual(['toggle:w01', '9'])
  expect(hotkeys[9]).toEqual(['toggle:w00', undefined])
  expect(hotkeys.length).toBe(10)
  // A digit presses the toggle: the list opens (and the pane brings it into view, which the kit
  // leaves to the engine); pressed again it closes.
  await card.press({ key: 'toggle:w05' })
  expect(textOf(await card.find({ key: 'files-w05' }))).toContain('w05.ts')
  await clock.advance(100)
  await card.press({ key: 'toggle:w05' })
  await clock.advance(100)
  expect(textOf(await card.find({ key: 'files-w05' }))).not.toContain('w05.ts')
  await card.unmount()
})

test('keyboard: the agents pane says how to take the keyboard, and once it has it, which keys do what', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const idle = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  // With no agent there is nothing to say.
  expect(await idle.find({ text: /ctrl\+x tab|PgUp/ })).toBeUndefined()
  await idle.unmount()
  await spawnAgent($, 'w1', 'general-purpose', 'Do the thing')
  const away = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  expect(await away.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeDefined()
  await away.unmount()
  const held = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: { ...agentPane, isFocused: true } })
  const keys = (await held.find({ type: 'Text', text: /PgUp/ }))?.text ?? ''
  expect(await held.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeUndefined()
  expect(keys).toContain('1-9')
  expect(keys).toContain('PgUp PgDn')
  expect(keys).toContain('esc')
  await held.unmount()
})

test('keyboard: the crew view scrolls in the terminal under its summary, by the wheel, page keys and arrows', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.ts`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Do the thing')
  for (const [name] of names) await $.tool.call({ tool: 'Edit', file_path: `${root}/${name}`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.settle()
  const tree = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(80) })
  await tree.post({ press: true }, { in: 'button-crew' })
  await clock.settle()
  const first = async () => {
    const p: any = (await tree.find({ key: 'rows' }))?.props.props
    return { head: p.rows[0].left.map((g: any) => g.t).join(''), top: p.rows[2]?.id as string, count: p.rows.length, bar: p.bar }
  }
  let at = await first()
  // The summary line stays on top; the window starts at the folder and its first files.
  expect(at.head).toContain('1 agent · 60 files changed')
  expect(at.top).toBe(`file:${root}/f00.ts`)
  expect(at.count).toBeLessThan(40)
  expect(at.count).toBeGreaterThan(10)
  expect(at.bar).toBeDefined()
  expect(JSON.stringify(await tree.drawn({ in: 'rows' }))).not.toContain('more')
  // A wheel tick moves three rows.
  await $.ui.scroll({ component: 'Pane', requestId: 'filetree', by: 1 } as any)
  await clock.settle()
  at = await first()
  expect(at.top).toBe(`file:${root}/f03.ts`)
  // A page key moves about a window.
  await $.ui.scroll({ component: 'Pane', requestId: 'filetree', by: 40, bodyRows: 40, contentRows: 40, offset: 0, origin: { kind: 'person' } } as any)
  await clock.settle()
  const paged = await first()
  expect(Number(paged.top.slice(-5, -3))).toBeGreaterThan(20)
  // Once the list has the keys (a click), the arrows and End and Home move it too.
  await tree.post({ key: 'up' }, { in: 'rows' })
  await clock.settle()
  expect(Number((await first()).top.slice(-5, -3))).toBe(Number(paged.top.slice(-5, -3)) - 1)
  await tree.post({ key: 'end' }, { in: 'rows' })
  await clock.settle()
  const end: any = (await tree.find({ key: 'rows' }))?.props.props
  expect(end.rows.at(-1).id).toBe(`file:${root}/f59.ts`)
  await tree.post({ key: 'home' }, { in: 'rows' })
  await clock.settle()
  expect((await first()).top).toBe(`file:${root}/f00.ts`)
  // Back to the tree, the tree's own window comes back.
  await tree.post({ press: true }, { in: 'button-crew' })
  await clock.settle()
  expect(textOf(await tree.drawn({ in: 'rows' }))).not.toContain('files changed')
  await tree.unmount()
})

test('keyboard: while the file tree holds the keyboard its header buttons are the engine’s own', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, [])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const away = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(80) })
  expect(await away.find({ key: 'key-crew' })).toBeUndefined()
  await away.unmount()
  const held = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: { ...paneProps(80), isFocused: true } })
  const crew = await held.find({ key: 'key-crew' })
  expect(crew?.type).toBe('Button')
  expect(crew?.props.label).toBe('◈')
  // Enter on it opens the crew view, as a click on the glyph does.
  await held.press({ key: 'key-crew' })
  await clock.settle()
  expect(textOf(await held.drawn({ in: 'rows' }))).toContain('no agent has changed a file yet')
  await held.unmount()
})

test('crewdeck: a file being edited shimmers on its agent’s open card as in the tree, then settles', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file'], ['b.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Do the thing')
  await $.tool.call({ tool: 'Edit', file_path: `${root}/b.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.advance(4000)
  const card = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  await card.press({ key: 'toggle:w1' })
  const litRows = async () => (await card.findAll({ type: 'Client' })).filter(c => String(c.key).startsWith('changes-w1-lit-'))
  // Settled: b.ts is a Button the keyboard reaches.
  expect(await litRows()).toHaveLength(0)
  expect((await card.find({ key: `w1:file:${root}/b.ts` }))?.type).toBe('Button')
  // The coder edits a.ts: on the open card it is the tree's own animated row, in the coder's tone,
  // with the tree's pill, while b.ts stays a Button.
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.advance(100)
  const lit = await litRows()
  expect(lit).toHaveLength(1)
  const row = (lit[0]?.props.props as any).rows[0]
  expect(row.id).toBe(`file:${root}/a.ts`)
  expect(row.left.some((g: any) => g.sh === 'tier-light' && g.t === 'a.ts')).toBe(true)
  expect(row.right.some((g: any) => g.t === ' editing ' && g.sh === 'tier-light')).toBe(true)
  expect(row.bg).toBeDefined()
  expect(Object.keys((lit[0]?.props.props as any).tones)).toContain('tier-light')
  expect((await card.find({ key: `w1:file:${root}/b.ts` }))?.type).toBe('Button')
  // The shimmer runs on the drawing's own clock: the name's colors move from frame to frame.
  const colors = async () => JSON.stringify(await card.drawn({ in: String(lit[0]?.key) }))
  const before = await colors()
  await card.advance(270)
  expect(await colors()).not.toBe(before)
  // Once the tree's flash is over, a.ts is a Button again.
  await clock.advance(3000)
  expect(await litRows()).toHaveLength(0)
  expect((await card.find({ key: `w1:file:${root}/a.ts` }))?.type).toBe('Button')
  await card.unmount()
  // The desktop's card is one Client already: its rows carry the same shimmer and tones.
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.advance(100)
  const desk = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'crewdeck-agents', props: agentPane })
  const rows = ((await desk.find({ key: 'changes-w1' }))?.props.props as any)
  expect(rows.rows.some((r: any) => r.left.some((g: any) => g.sh === 'tier-light'))).toBe(true)
  expect(Object.keys(rows.tones)).toContain('tier-light')
  await desk.unmount()
})

// The deck: one panel, the agents on top and the file tree below, both on screen at once.
const deckPane = (rows: number) => ({ title: 'Crewdeck', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} }) as any

test('deck: one panel draws the agents above the file tree, the tree taking the rows the agents leave', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.ts`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  const blits: any[] = []
  on('ui.blit', (_$: any, e: any) => (blits.push(e), { value: {} }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  // No agent yet: the header, the bar's crab asleep with where agents will show up (three rows), a
  // divider, and the tree with nearly the whole panel.
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck', props: deckPane(40) })
  let text = textOf(await ui.drawn())
  expect(text).toContain('AGENTS')
  expect(text).toContain('No agents running')
  expect(text).toContain("They'll show up here when Claude starts one.")
  expect(await ui.find({ key: 'idle-crab' })).toBeDefined()
  expect(text).toContain('ALL FILES')
  const treeRows = async () => ((await ui.find({ key: 'rows' }))?.props.props as any).rows.length
  const roomAlone = await treeRows()
  expect(roomAlone).toBeGreaterThan(25)
  // An agent: its card and crab on top, the tree a card shorter, still all in the one panel.
  await spawnAgent($, 'w1', 'general-purpose', 'Build the API')
  await clock.settle()
  text = textOf(await ui.drawn())
  expect(text).toContain('Build the API')
  expect(text).toContain('ALL FILES')
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(1)
  const roomWithAgent = await treeRows()
  expect(roomWithAgent).toBeLessThan(roomAlone)
  expect(roomWithAgent).toBeGreaterThan(12)
  // The crab moves in this panel: its repaints go to the deck.
  await clock.advance(300)
  expect(blits.some(b => b.requestId === 'crewdeck' && b.key === 'crab-w1')).toBe(true)
  await ui.unmount()
})

test('deck: more agents than half the panel holds show a window of cards the wheel moves, and the tree keeps its half', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const names = Array.from({ length: 60 }, (_, i) => [`f${String(i).padStart(2, '0')}.ts`, 'file'] as [string, 'file'])
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: names }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await spawnAgent($, id, 'general-purpose', `Task ${id}`)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'crewdeck', props: deckPane(44) })
  const cards = async () => (await ui.findAll({ type: 'Raster' })).map(r => String(r.key))
  const first = await cards()
  // Running cards are newest first: a5 on top; the rest wait below a "▼" that scrolls to them.
  expect(first[0]).toBe('crab-a5')
  expect(first.length).toBeLessThan(5)
  expect(await ui.find({ key: 'agents-down' })).toBeDefined()
  const treeAt = async () => ((await ui.find({ key: 'rows' }))?.props.props as any).rows[0].id
  const treeTop = await treeAt()
  expect(((await ui.find({ key: 'rows' }))?.props.props as any).rows.length).toBeGreaterThan(10)
  // The wheel over the agents moves their window a card; the tree stays put.
  await $.ui.scroll({ component: 'Pane', requestId: 'crewdeck', by: 1, pointer: { column: 10, row: 3 } } as any)
  await clock.settle()
  const moved = await cards()
  expect(moved[0]).not.toBe('crab-a5')
  expect(await ui.find({ key: 'agents-up' })).toBeDefined()
  expect(await treeAt()).toBe(treeTop)
  // Below the line, the wheel is the tree's.
  await $.ui.scroll({ component: 'Pane', requestId: 'crewdeck', by: 1, pointer: { column: 10, row: 40 } } as any)
  await clock.settle()
  expect(await treeAt()).not.toBe(treeTop)
  expect((await cards())[0]).toBe(moved[0])
  // ▲ goes back up.
  await ui.press({ key: 'agents-up' })
  expect((await cards())[0]).toBe('crab-a5')
  await ui.unmount()
})

test('deck: the app draws the agents’ cards above the tree’s rows in the one panel', { timeoutMs: 20_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['a.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Build the API')
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'crewdeck', props: deckPane(40) })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.indexOf('Build the API')).toBeGreaterThan(-1)
  expect(drawn.indexOf('ALL FILES')).toBeGreaterThan(drawn.indexOf('Build the API'))
  // The tree's part is laid out bottom up (its header drawn last, so its tips are painted over the
  // rows): the rows come first in the drawing, then ALL FILES, then the header.
  expect(drawn).toContain('"flexDirection":"column-reverse"')
  expect(drawn.indexOf('a.ts')).toBeLessThan(drawn.indexOf('ALL FILES'))
  expect(drawn.indexOf('"key":"head-row"')).toBeGreaterThan(drawn.indexOf('ALL FILES'))
  await ui.unmount()
})

test('glyphs: files always wear their type badge; with a Nerd Font (Windows Terminal set to one) folders get its folder icons', { timeoutMs: 20_000 }, async ($, on) => {
  const root = 'C:/Users/k/proj'
  const wt = 'C:/Users/k/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
  const clock = world(on, {
    os: 'win32', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\k', LOCALAPPDATA: 'C:\\Users\\k\\AppData\\Local', WT_SESSION: 'x' }, cwd: root, top: '',
    dirs: { [root]: [['src', 'dir'], ['app.ts', 'file']], [`${root}/src`]: [['b.ts', 'file']] }, status: '', numstat: '',
    files: { [wt.replace(/^[A-Za-z]:/, '')]: '{ "profiles": { "defaults": { "font": { "face": "CaskaydiaCove Nerd Font" } } } }' },
  }, [])
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'terminal', component: 'Pane', requestId: 'filetree', props: paneProps(60) })
  const rows = JSON.stringify(await ui.drawn({ in: 'rows' }))
  // The folder takes the Nerd Font's icon, not the plain square; the file keeps its TS badge.
  expect(rows).not.toContain('"■ "')
  expect(rows).toMatch(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}]/u)
  expect(rows).toContain(' TS  ')
  await ui.unmount()
})

test('deck: in the app the rows are drawn natively, with outline folders, rounded chips and a shimmering name', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['src', 'dir'], ['a.ts', 'file']], [`${root}/src`]: [['b.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  await $.session.start({ cwd: root, surface: 'desktop', isInteractive: true })
  await clock.settle()
  await spawnAgent($, 'w1', 'general-purpose', 'Build the API')
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.advance(4000)
  const ui = await $.ui.mount({ plugin: 'crewdeck', surface: 'desktop', component: 'Pane', requestId: 'crewdeck', props: deckPane(40) })
  // No Client draws the deck's rows (only the header's small buttons are Clients): they are Boxes, Buttons and pictures.
  expect((await ui.findAll({ type: 'Client' })).filter(c => !String(c.key).startsWith('button-')).length).toBe(0)
  const svgs = (await ui.findAll({ type: 'Svg' })).map(x => x.props as any)
  expect(svgs.some(p => p.alt === 'folder' && /stroke=/.test(p.source))).toBe(true)
  expect(svgs.some(p => p.alt === 'TS' && /rx="5"/.test(p.source))).toBe(true)
  // The card's words are the app's own Text, not drawn into the picture.
  expect(textOf(await ui.drawn())).toContain('Build the API')
  expect(svgs.some(p => /Build the API/.test(p.source))).toBe(false)
  // A folder's row: drawn as it looks, with one blank Button laid over the whole of it (caret, icon
  // and name), so a click anywhere on it opens the folder; the name itself is plain text.
  const cover = await ui.find({ key: 'row-' + `${root}/src` })
  expect(cover?.type).toBe('Button')
  // It draws nothing: no label (the app would show it over the row), only blank children.
  expect(String((cover?.props as any).label ?? '').trim()).toBe('')
  expect(JSON.stringify((cover as any)?.children ?? [])).not.toContain('src')
  const drawnAll = JSON.stringify(await ui.drawn())
  expect(drawnAll).toContain('"position":"absolute","top":0,"left":0,"right":0,"bottom":0')
  // The header's buttons are the app's own, a toggle that is on drawn as the main one, with a tip.
  const crewChip = await ui.find({ key: 'chip-crew' })
  expect(crewChip?.type).toBe('Button')
  expect((crewChip?.props as any).variant).toBe('secondary')
  expect(drawnAll).toContain('what\u00a0the\u00a0agents\u00a0changed')
  // Its tip: one line, as wide as its words, shown while the pointer is on the button (one hover group).
  expect(drawnAll).toContain('"hover":{"display":"flex"}')
  // As wide as the words in the app's font plus the padding either side, the words centred.
  expect(drawnAll).toContain('what\u00a0the\u00a0agents\u00a0changed')
  const tipWidth = Number(/"minWidth":(\d+),"flexDirection":"row","justifyContent":"center"/.exec(drawnAll)?.[1])
  expect(tipWidth).toBeGreaterThan(10)
  expect(tipWidth).toBeLessThan('what the agents changed'.length + 3)
  // The divider is a picture of a line, at the panel's width whatever the font; no row of dashes.
  expect(drawnAll).toContain('"alt":"divider"')
  expect(drawnAll).not.toMatch(/─{20,}/)
  // The Button over a row holds blank of half the row, so the app never cuts it with an ellipsis.
  expect(String((cover?.props as any).label).length).toBeLessThan(80)
  await ui.press({ key: 'row-' + `${root}/src` })
  await clock.settle()
  expect(textOf(await ui.drawn())).toContain('b.ts')
  // The card's files open and close; while the agent edits a.ts its name is the shimmer's picture.
  await ui.press({ key: 'toggle:w1' })
  await $.tool.call({ tool: 'Edit', file_path: `${root}/a.ts`, old_string: 'a', new_string: 'b', agentId: 'w1' } as any)
  await clock.advance(100)
  const lit = (await ui.findAll({ type: 'Svg' })).map(x => x.props as any).filter(p => /animateTransform/.test(p.source))
  expect(lit.some(p => p.alt === 'a.ts')).toBe(true)
  await ui.unmount()
})

test('remote control: an app joining the session gets the panel, and a phone draws it without a field or a Client', { timeoutMs: 30_000 }, async ($, on) => {
  const root = '/home/k/proj'
  const clock = world(on, { os: 'linux', env: { HOME: '/home/k' }, cwd: root, top: '', dirs: { [root]: [['src', 'dir'], ['a.ts', 'file']], [`${root}/src`]: [['b.ts', 'file']] }, status: '', numstat: '' }, [])
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: String(e.tool_use_id) }))
  on('session.attach', (_$: any, e: any) => ({ clientId: e.clientId }))
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const before = opens.length
  await ($.session as any).attach({ surface: 'desktop', clientId: 'desktop:default', viewport: { columns: 60, rows: 40, isFullscreen: true } })
  await clock.settle()
  expect(opens.slice(before)).toContainEqual(expect.objectContaining({ id: 'crewdeck' }))
  // A command typed in the app skips the terminal's layout checks.
  const r: any = await $.command.run({ command: 'crewdeck', args: 'open', origin: { kind: 'bridge' }, presentation: { isFullscreen: false, columns: 80 } } as any)
  expect(String(r.text)).not.toContain('fullscreen')
  // The phone: no Input, no Client, still the agents and the tree.
  await spawnAgent($, 'w1', 'general-purpose', 'Build the API')
  const phone = await $.ui.mount({ plugin: 'crewdeck', surface: 'mobile', component: 'Pane', requestId: 'crewdeck', props: deckPane(40) })
  const text = textOf(await phone.drawn())
  expect(text).toContain('Build the API')
  expect(text).toContain('a.ts')
  expect((await phone.findAll({ type: 'Client' })).length).toBe(0)
  expect((await phone.findAll({ type: 'Input' })).length).toBe(0)
  await phone.unmount()
})
