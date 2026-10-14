import type { Register } from 'claude-code'

import { register as agents } from './agents/register'
import { register as files } from './files/register'

// Crewdeck: the agents panel and progress bar (from savvy-progress) and the file tree (from filetree),
// loaded as one mod so each can see what the other knows.
export const register: Register = (on, options) => {
  agents(on, options)
  files(on, options)
}
