import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { AppSettings } from '@shared/types'

export function ensureDirectory(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

export function getTempDirectory(settings: AppSettings): string {
  if (settings.tempDirectory) return ensureDirectory(settings.tempDirectory)
  return ensureDirectory(join(app.getPath('temp'), 'neteasehub'))
}

export function getDownloadsDirectory(settings: AppSettings): string {
  return ensureDirectory(join(getTempDirectory(settings), 'downloads'))
}
