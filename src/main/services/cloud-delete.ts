import type { CloudDeleteResult } from '@shared/types'
import { logger } from '../logger'

export interface CloudDeleteResponse {
  body?: {
    code?: unknown
    failIds?: unknown
  }
}

export type CloudDeleteRequest = (id: number) => Promise<CloudDeleteResponse>

export async function deleteCloudIds(
  cloudIds: number[],
  deleteOne: CloudDeleteRequest,
  concurrency = 3
): Promise<CloudDeleteResult> {
  const ids = Array.from(
    new Set(cloudIds.filter(id => Number.isSafeInteger(id) && id > 0))
  )
  if (!ids.length) return { deleted: [], failed: [] }

  const failed = new Set<number>()
  let firstError: unknown
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= ids.length) return
      const id = ids[index]
      try {
        const response = await deleteOne(id)
        const body = response.body ?? {}
        const code = Number(body.code ?? 200)
        const failIds = Array.isArray(body.failIds)
          ? body.failIds.map(value => Number(value))
          : []
        if (code !== 200 || failIds.includes(id)) {
          failed.add(id)
          logger.warn('云盘歌曲删除失败', {
            id,
            code,
            failIds: failIds.filter(Number.isFinite)
          })
        }
      } catch (error) {
        failed.add(id)
        if (firstError === undefined) firstError = error
        logger.warn('云盘歌曲删除请求失败', {
          id,
          error: error instanceof Error ? error.name : 'unknown'
        })
      }
    }
  }

  const workers = Math.max(1, Math.min(3, concurrency, ids.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))

  const deleted = ids.filter(id => !failed.has(id))
  if (!deleted.length && firstError !== undefined) throw firstError
  return {
    deleted,
    failed: ids.filter(id => failed.has(id))
  }
}
