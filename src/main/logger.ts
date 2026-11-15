import log from 'electron-log/main'
import { sanitizeForLog } from './sanitize'

log.transports.file.maxSize = 10 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
log.hooks.push(message => {
  message.data = message.data.map(value => sanitizeForLog(value))
  return message
})

export const logger = log.scope('main')

export function logError(context: string, error: unknown): void {
  logger.error(context, error instanceof Error ? error.stack : error)
}
