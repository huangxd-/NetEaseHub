import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { z } from 'zod'
import type {
  AppInfo,
  ArtistTracksRequest,
  DiagnosticResult,
  EntitySearchRequest,
  IpcResult,
  PreviewLease,
  ProviderId,
  SearchRequest,
  SourceScriptInfo,
  UploadDraft
} from '@shared/types'
import { EVENTS, IPC } from '@shared/ipc'
import {
  catalogRequestSchema,
  cloudDeleteSchema,
  cloudMatchSchema,
  cloudSuggestSchema,
  enqueueUploadSchema,
  artistTracksRequestSchema,
  entitySearchRequestSchema,
  previewCreateSchema,
  searchRequestSchema,
  settingsPatchSchema,
  sourceImportSchema,
  sourceReorderSchema,
  sourceToggleSchema,
  uploadPatchSchema
} from '@shared/schemas'
import { AppError, messageOf, toAppError } from './errors'
import { logger } from './logger'
import { NeteaseService } from './services/netease'
import { SettingsService } from './services/settings'
import { SourceManager } from './services/source-manager'
import { UploadManager } from './services/upload-manager'
import { UpdateService } from './services/updater'
import type { PreviewService } from './services/preview'
import {
  getArtistTracks,
  resolveCatalog,
  searchAllEntities,
  searchAllProviders,
  searchEntities,
  searchProvider
} from './providers'
import { parseCatalogLink } from '@shared/utils'

interface IpcServices {
  window: BrowserWindow
  settings: SettingsService
  netease: NeteaseService
  sources: SourceManager
  previews: PreviewService
  uploads: UploadManager
  updater: UpdateService
}

function success<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function failure(error: unknown): IpcResult<never> {
  const appError = toAppError(error)
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details
    }
  }
}

async function handle<T>(
  channel: string,
  handler: (...args: any[]) => Promise<T> | T
): Promise<void> {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return success(await handler(...args))
    } catch (error) {
      logger.warn(`IPC ${channel} 失败`, messageOf(error))
      return failure(error)
    }
  })
}

export function registerIpc(services: IpcServices): void {
  const { window, settings, netease, sources, previews, uploads, updater } = services

  handle(IPC.appInfo, (): AppInfo => ({
    name: 'NetEaseHub',
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    dataPath: app.getPath('userData'),
    signed: process.env.NETEASEHUB_SIGNED === '1'
  }))
  handle(IPC.appOpenExternal, async (url: unknown) => {
    const parsed = z.string().url().parse(url)
    await shell.openExternal(parsed)
    return true
  })
  handle(IPC.appShowItem, (path: unknown) => {
    shell.showItemInFolder(z.string().min(1).parse(path))
    return true
  })
  handle(IPC.appPickFile, async (filters: unknown) => {
    const parsed = z
      .array(
        z.object({
          name: z.string(),
          extensions: z.array(z.string())
        })
      )
      .optional()
      .parse(filters)
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: parsed
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IPC.appPickDirectory, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IPC.appPickImage, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const extension = extname(path).slice(1).toLowerCase()
    const mime =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg'
    return {
      path,
      mime,
      dataBase64: (await readFile(path)).toString('base64')
    }
  })

  handle(IPC.authStartQr, () => netease.startQrLogin())
  handle(IPC.authCheckQr, async (key: unknown) => {
    const result = await netease.checkQrLogin(z.string().min(1).parse(key))
    if (result.auth) window.webContents.send(EVENTS.authChanged, result.auth)
    return result
  })
  handle(IPC.authGetState, () => netease.getState(true))
  handle(IPC.authLogout, async () => {
    await netease.logout()
    window.webContents.send(EVENTS.authChanged, { loggedIn: false })
    return true
  })

  handle(IPC.searchQuery, async (raw: unknown) => {
    const request = searchRequestSchema.parse(raw) as SearchRequest
    if (request.provider === 'all') {
      return searchAllProviders(request.query, request.page ?? 1, request.limit ?? 30)
    }
    return [
      await searchProvider(
        request.provider,
        request.query,
        request.page ?? 1,
        request.limit ?? 30
      )
    ]
  })

  handle(IPC.searchEntities, async (raw: unknown) => {
    const request = entitySearchRequestSchema.parse(raw) as EntitySearchRequest
    if (request.provider === 'all') {
      return searchAllEntities(request.query, request.kind, request.page ?? 1, request.limit ?? 20)
    }
    return [
      await searchEntities(
        request.provider,
        request.kind,
        request.query,
        request.page ?? 1,
        request.limit ?? 20
      )
    ]
  })

  handle(IPC.searchArtistTracks, (raw: unknown) => {
    const request = artistTracksRequestSchema.parse(raw) as ArtistTracksRequest
    return getArtistTracks(
      request.provider,
      request.artistId,
      request.page ?? 1,
      request.limit ?? 50
    )
  })

  handle(IPC.searchCatalog, async (raw: unknown) => {
    const request = catalogRequestSchema.parse(raw)
    const parsed = parseCatalogLink(request.value)
    const provider = (parsed?.provider ?? request.provider) as ProviderId | undefined
    const kind = parsed?.kind ?? request.kind
    const id = parsed?.id ?? request.value.trim()
    if (!provider || !kind) {
      throw new AppError('INVALID_CATALOG_REQUEST', '请提供专辑/歌单链接，或选择平台和类型后输入 ID')
    }
    if (!id) throw new AppError('INVALID_CATALOG_ID', '专辑或歌单 ID 不能为空')
    return resolveCatalog(provider, kind, id)
  })

  handle(IPC.previewCreate, async (raw: unknown): Promise<PreviewLease> => {
    const { track } = previewCreateSchema.parse(raw)
    return previews.create(track)
  })
  handle(IPC.previewRelease, (id: unknown) => {
    previews.release(z.string().min(1).parse(id))
    return true
  })

  handle(IPC.sourcesList, (): SourceScriptInfo[] => sources.list())
  handle(IPC.sourcesImport, (raw: unknown) => sources.importSource(sourceImportSchema.parse(raw)))
  handle(IPC.sourcesRemove, (id: unknown) => sources.remove(z.string().min(1).parse(id)))
  handle(IPC.sourcesToggle, (raw: unknown) => {
    const input = sourceToggleSchema.parse(raw)
    return sources.toggle(input.id, input.enabled)
  })
  handle(IPC.sourcesReorder, (raw: unknown) => sources.reorder(sourceReorderSchema.parse(raw).ids))
  handle(IPC.sourcesReload, (id: unknown) => sources.reload(z.string().min(1).parse(id)))

  handle(IPC.uploadsList, (): UploadDraft[] => uploads.list())
  handle(IPC.uploadsEnqueue, (raw: unknown) => uploads.enqueue(enqueueUploadSchema.parse(raw)))
  handle(IPC.uploadsUpdate, (id: unknown, raw: unknown) =>
    uploads.update(z.string().min(1).parse(id), uploadPatchSchema.parse(raw))
  )
  handle(IPC.uploadsStart, () => {
    void uploads.start()
    return true
  })
  handle(IPC.uploadsRetryFailed, () => {
    uploads.retryFailed()
    void uploads.start()
    return true
  })
  handle(IPC.uploadsCancel, (ids: unknown) => {
    const parsed = z.array(z.string()).optional().parse(ids)
    uploads.cancel(parsed)
    return true
  })
  handle(IPC.uploadsClearFinished, () => {
    uploads.clearFinished()
    return true
  })
  handle(IPC.uploadsSummary, () => uploads.summary())

  handle(IPC.cloudList, (offset: unknown, limit: unknown) =>
    netease.getCloudPage(
      z.number().int().min(0).parse(offset ?? 0),
      z.number().int().min(1).max(500).parse(limit ?? 200)
    )
  )
  handle(IPC.cloudLoadAll, () => netease.getAllCloudSongs())
  handle(IPC.cloudDelete, (raw: unknown) =>
    netease.deleteCloudSongs(cloudDeleteSchema.parse(raw).cloudIds)
  )
  handle(IPC.cloudSearchCatalog, (query: unknown, limit: unknown) =>
    netease.searchCatalog(
      z.string().trim().min(1).parse(query),
      z.number().int().min(1).max(50).parse(limit ?? 20)
    )
  )
  handle(IPC.cloudMatch, (raw: unknown) => {
    const input = cloudMatchSchema.parse(raw)
    return netease.matchCloudSong(input.cloudId, input.songId)
  })
  handle(IPC.cloudUnmatch, (cloudId: unknown) =>
    netease.matchCloudSong(z.number().int().positive().parse(cloudId), 0)
  )
  handle(IPC.cloudSuggest, (raw: unknown) =>
    netease.suggestMatches(cloudSuggestSchema.parse(raw).songs)
  )

  handle(IPC.settingsGet, () => settings.get())
  handle(IPC.settingsUpdate, (raw: unknown) => settings.update(settingsPatchSchema.parse(raw)))
  handle(IPC.updateCheck, () => updater.check())
  handle(IPC.updateOpen, (url: unknown) =>
    updater.openRelease(typeof url === 'string' && url ? url : undefined)
  )

  handle(IPC.diagnosticsRun, async (): Promise<DiagnosticResult> => {
    const auth = await netease.getState(true)
    const providers = await Promise.all(
      (['kw', 'kg', 'tx', 'wy', 'mg'] as ProviderId[]).map(async provider => {
        try {
          const result = await searchProvider(provider, '周杰伦', 1, 1)
          return {
            provider,
            ok: result.list.length > 0,
            message: result.list.length ? '可用' : '无结果',
            count: result.list.length
          }
        } catch (error) {
          return { provider, ok: false, message: messageOf(error) }
        }
      })
    )
    const statuses = sources.list().map(script => ({
      scriptId: script.id,
      name: script.name,
      ok: script.enabled && Boolean(script.lastCheckedAt) && !script.lastError,
      message: script.lastError
    }))
    return {
      netease: auth.loggedIn
        ? { ok: true, message: `已登录：${auth.profile?.nickname ?? '未知用户'}` }
        : { ok: false, message: '尚未登录网易云音乐' },
      providers,
      sources: statuses
    }
  })

  sources.onStatus(status => {
    if (!window.isDestroyed()) window.webContents.send(EVENTS.sourceStatus, status)
  })
}
