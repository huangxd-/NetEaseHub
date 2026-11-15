import type { IpcResult } from '@shared/types'

export class BridgeError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.details = details
  }
}

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new BridgeError(result.error.code, result.error.message, result.error.details)
  return result.data
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '操作失败，请稍后重试'
}
