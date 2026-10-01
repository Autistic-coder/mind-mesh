import type { Workspace } from '../state/types'

export function emptyWorkspace(): Workspace {
  return { version: 2, displayName: 'Vaibhav', projects: [], datasets: [] }
}
