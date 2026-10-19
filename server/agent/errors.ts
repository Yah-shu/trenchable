export class StudioAgentError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'StudioAgentError'
    this.status = status
  }
}

export class AgentModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentModelError'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
