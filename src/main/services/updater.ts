import { app, shell } from 'electron'
import axios from 'axios'
import type { UpdateInfo } from '@shared/types'
import { RELEASE_URL } from '@shared/constants'
import { logger } from '../logger'

function versionParts(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map(part => Number(part) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const left = versionParts(latest)
  const right = versionParts(current)
  for (let index = 0; index < 3; index++) {
    if (left[index] > right[index]) return true
    if (left[index] < right[index]) return false
  }
  return false
}

export class UpdateService {
  async check(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion()
    const checkedAt = Date.now()
    try {
      const response = await axios.get<Record<string, any>>(
        'https://api.github.com/repos/huangxd-/NetEaseHub/releases/latest',
        {
          timeout: 10_000,
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'NetEaseHub'
          }
        }
      )
      const latestVersion = String(response.data.tag_name ?? response.data.name ?? '')
        .replace(/^v/i, '')
        .trim()
      return {
        currentVersion,
        latestVersion: latestVersion || undefined,
        hasUpdate: Boolean(latestVersion && isNewer(latestVersion, currentVersion)),
        releaseUrl: String(response.data.html_url ?? RELEASE_URL),
        checkedAt
      }
    } catch (error) {
      logger.warn('检查更新失败', error)
      return {
        currentVersion,
        hasUpdate: false,
        releaseUrl: RELEASE_URL,
        checkedAt,
        error: error instanceof Error ? error.message : '检查更新失败'
      }
    }
  }

  openRelease(url = RELEASE_URL): Promise<void> {
    return shell.openExternal(url)
  }
}
