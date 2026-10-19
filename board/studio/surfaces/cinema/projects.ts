/**
 * Cinema's project bookkeeping: which results and running jobs belong to a project,
 * and getting a new job's task id into the project on the server.
 *
 * A project (library.ts) is a server-side list of Kie task ids. A job started inside
 * one is stamped `meta.projectId` so its pending tile shows there at once; its task id
 * only exists a moment later, so `fileJobs` waits for it (surfaces/track.ts) and then
 * calls `libraryApi.addToProject`. The pure functions below are what the page reads.
 */
import { firstMedia, isDone, type HistoryItem } from '../../api.ts'
import { isActive, type Job } from '../../jobs.ts'
import { libraryApi, type Project } from '../../library.ts'
import { trackJobs } from '../track.ts'

export const projectTag = (id: string) => `project:${id}`

/** The project's finished-or-not results that history knows, in the project's order (newest first). */
export function projectItems(project: Pick<Project, 'taskIds'>, byTask: Map<string, HistoryItem>): HistoryItem[] {
  const out: HistoryItem[] = []
  for (const t of project.taskIds) {
    const item = byTask.get(t)
    if (item) out.push(item)
  }
  return out
}

/**
 * Jobs to show as pending tiles in a project: stamped with it, still running or failed,
 * and not already standing in the grid as a finished result.
 */
export function projectJobs(jobs: Job[], projectId: string, shown: Set<string>): Job[] {
  return jobs.filter((j) => j.meta.projectId === projectId && (isActive(j) || j.status === 'error') && !(j.taskId && shown.has(j.taskId)))
}

/** The newest finished result in a project, as a card cover. */
export function projectCover(project: Pick<Project, 'taskIds'>, byTask: Map<string, HistoryItem>): { src: string; video: boolean } | null {
  for (const item of projectItems(project, byTask)) {
    if (!isDone(item)) continue
    const src = firstMedia(item)
    if (src) return { src, video: item.category === 'video' }
  }
  return null
}

/** Finished stills in a project: the start frames a video in it can begin from. */
export const projectStills = (project: Pick<Project, 'taskIds'>, byTask: Map<string, HistoryItem>) =>
  projectItems(project, byTask).filter((i) => isDone(i) && i.category === 'image' && Boolean(firstMedia(i)))

export const searchProjects = (list: Project[], q: string) => {
  const needle = q.trim().toLowerCase()
  return needle ? list.filter((p) => `${p.title} ${p.notes}`.toLowerCase().includes(needle)) : list
}

/** "Untitled project", then "Untitled project 2", … — the first name nobody has. */
export function untitledName(list: Pick<Project, 'title'>[], base = 'Untitled project'): string {
  const taken = new Set(list.map((p) => p.title.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/**
 * Every task in a project: the server's list, plus any this browser filed that the server
 * hasn't confirmed yet (an add that failed or is still on its way) — those are the newest,
 * so they go first.
 */
export function mergedTaskIds(server: string[], local: string[]): string[] {
  const known = new Set(server)
  return [...local.filter((t) => !known.has(t)), ...server]
}

/**
 * File new jobs into a project once each has a task id. Runs at module level, so leaving
 * the page before Kie answers still files them; the task id is also kept locally under
 * the project's tag, so a failed add is retried the next time the project is opened.
 */
export function fileJobs(projectId: string, jobIds: string[], add = libraryApi.addToProject) {
  trackJobs(jobIds, projectTag(projectId), (taskId) => {
    void add(projectId, [taskId]).catch(() => {
      // Kept under the tag; the project page retries it.
    })
  })
}
