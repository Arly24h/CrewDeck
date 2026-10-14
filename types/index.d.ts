// Crewdeck's state: the agents panel and progress bar (savvy-progress) and the file tree (filetree).

// ---- Agents panel and progress bar ----
export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** The developer job the crab dresses for: from the task's name, then from the tools it uses. */
  job?: string
  /** Steps in a row that only read; enough of them, before any work, make a code reviewer. */
  readSteps?: number
  /** Whether a step has shown clear work: editing, testing or data work. */
  hasWorked?: boolean
  /** Files the agent read or edited, newest first; the file tree lights the same ones in its tier's color. */
  files?: AgentFile[]
}

export type AgentFile = {
  path: string
  isEdit: boolean
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
  /** Agents whose card is open to the files they changed. */
  expanded?: string[]
}

// ---- File tree ----
export type FileNode = {
  id: string
  parent: string
  name: string
  kind: 'dir' | 'file' | 'link'
  hidden: boolean
  mtime: number
  size: number
  loaded: boolean
}

export type Branch = {
  head: string
  upstream: string
  ahead: number
  behind: number
}

export type Activity = {
  id: number
  kind: string
  label: string
  state: 'running' | 'done' | 'failed'
  detail: string
  at: number
  tone: string
  nerd: string
  plain: string
}

export type FileTree = {
  root: string
  nodes: FileNode[]
  expanded: string[]
  cursor: string
  selected: string
  query: string
  showHidden: boolean
  showSize: boolean
  dirSizes: Record<string, number>
  git: Record<string, string>
  diff: Record<string, [number, number]>
  ignored: string[]
  untrackedDirs: string[]
  top: string
  prefix: string
  branch: Branch | null
  counts: Record<string, [number, number, number]>
  flash: string[]
  flashDim: string[]
  flashOn: boolean
  flashTones: Record<string, string>
  scroll: number | null
  preview: string
  previewTop: number
  /** The crew view: every file the agents changed, by folder, instead of the whole tree. */
  crewView?: boolean
  /** What each lit row's pill says, where it is not what its tone says (`staged` for a green add). */
  flashLabels?: Record<string, string>
  /** Files Claude and the agents touched this session, newest first, for the card above the tree. */
  touched?: TouchedFile[]
}

export type TouchedFile = {
  path: string
  /** The shimmer tone it was last lit in: `purple`, `orange`, `green`, or an agent's `tier-<tier>(-read)`. */
  tone: string
  /** What the card's pill says: Opened, Edited, Committed... */
  label: string
  /** Committed outranks edited outranks opened: a file keeps the strongest. */
  rank: number
}

/** The tree's git status and lines changed, apart from the rest of the tree, for the agents pane. */
export type GitView = {
  root: string
  git: Record<string, string>
  diff: Record<string, [number, number]>
}

/** What the tree has lit right now, for the agents' open cards to shimmer the same files. */
export type LitView = {
  /** Files being read, written or committed now. */
  bright: string[]
  /** Their folders, shimmering dimmer. */
  dim: string[]
  /** Each one's shimmer tone: Claude's, or the agent's tier. */
  tones: Record<string, string>
  /** What a file's pill says, when it says more than its tone (`staged`, `pushed`). */
  labels: Record<string, string>
}

export type Theme = {
  fg: string
  accent: string
  muted: string
  urgent: string
  selection: string
  bg: string
}

declare module 'claude-code' {
  interface PluginState {
    crewdeck: {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      spend: number
      halt: boolean
      spentTokens: number
      span: { start: number; end: number }
      tree: FileTree
      theme: Theme
      activity: Activity[]
      gitview: GitView | null
      lit: LitView | null
    }
  }
}
