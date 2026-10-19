import type { Operation } from './models/types.ts'

export function parentTaskIdFor(
  operation: Operation,
  input: Record<string, unknown>,
): string | undefined {
  if (typeof input._parentTaskId === 'string' && input._parentTaskId) {
    return input._parentTaskId
  }
  if (operation !== 'generate' && typeof input.taskId === 'string' && input.taskId) {
    return input.taskId
  }
  return undefined
}
