import type {
  NormalizedTask,
  Operation,
  Provider,
} from '../types.ts'

export interface CreateProviderTaskInput {
  provider: Provider
  operation: Operation
  model: string
  input: Record<string, unknown>
  callBackUrl?: string
}

export interface CreatedProviderTask {
  taskId: string
  task?: NormalizedTask
}

export interface ProviderAdapter {
  readonly provider: Provider
  create(input: CreateProviderTaskInput): Promise<CreatedProviderTask>
  getTask(taskId: string, operation: Operation): Promise<NormalizedTask>
}
