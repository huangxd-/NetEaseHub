export class AppError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) return new AppError('INTERNAL_ERROR', error.message)
  return new AppError('INTERNAL_ERROR', String(error))
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
