import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import axios from 'axios'
import type {
  EditableMetadata,
  EnqueueUploadInput,
  UploadBatchSummary,
  UploadDraft,
  UploadPatch
} from '@shared/types'
import {
  MIME_BY_EXTENSION
} from '@shared/constants'
import {
  defaultMetadata,
  detectExtension,
  joinArtists,
  sanitizeFilename,
  summarizeUploads
} from '@shared/utils'
import { AppError, messageOf } from '../errors'
import { logError, logger } from '../logger'
import { DatabaseService } from './database'
import { NeteaseService } from './netease'
import { SettingsService } from './settings'
import { SourceManager } from './source-manager'
import { getDownloadsDirectory } from './paths'
import { writeTags } from './tag-writer'

interface ManagerEvents {
  updated: (draft: UploadDraft) => void
  batch: (summary: UploadBatchSummary) => void
}

class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++
      return () => this.release()
    }
    return new Promise(resolve => {
      this.waiters.push(() => {
        this.active++
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1)
    const waiter = this.waiters.shift()
    waiter?.()
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function md5File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function mergeMetadata(base: EditableMetadata, patch?: Partial<EditableMetadata>): EditableMetadata {
  if (!patch) return base
  return {
    ...base,
    ...patch,
    artists: patch.artists?.length ? patch.artists : base.artists,
    cover: patch.cover ?? base.cover
  }
}

export class UploadManager {
  private readonly active = new Set<string>()
  private readonly cancelled = new Set<string>()
  private readonly controllers = new Map<string, AbortController>()
  private started = false
  private cloudMd5Cache:
    | {
        expiresAt: number
        values: Set<string>
      }
    | undefined

  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly netease: NeteaseService,
    private readonly sourceManager: SourceManager,
    private readonly events: ManagerEvents
  ) {
    const activeStages = new Set(['resolving', 'downloading', 'tagging', 'uploading'])
    for (const draft of this.db.listUploads()) {
      if (!activeStages.has(draft.stage)) continue
      this.db.saveUpload({
        ...draft,
        stage: 'queued',
        progress: 0,
        warning: '应用上次退出时任务尚未完成，已恢复为等待中',
        updatedAt: Date.now()
      })
    }
  }

  list(): UploadDraft[] {
    return this.db.listUploads().sort((a, b) => b.createdAt - a.createdAt)
  }

  enqueue(input: EnqueueUploadInput): UploadDraft[] {
    const settings = this.settings.get()
    const batchId = randomUUID()
    const drafts = input.tracks.map(track => {
      const metadata = mergeMetadata(defaultMetadata(track), input.metadataOverrides)
      const draft: UploadDraft = {
        id: randomUUID(),
        batchId,
        track,
        requestedQuality: input.requestedQuality ?? settings.defaultQuality,
        metadata,
        writeCover: input.writeCover ?? settings.writeCover,
        writeLyrics: input.writeLyrics ?? settings.writeLyrics,
        allowDuplicate: input.allowDuplicate ?? !settings.autoSkipDuplicate,
        stage: 'queued',
        progress: 0,
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.db.saveUpload(draft)
      return draft
    })
    this.emitBatch()
    return drafts
  }

  update(id: string, patch: UploadPatch): UploadDraft {
    const draft = this.db.getUpload(id)
    if (!draft) throw new AppError('UPLOAD_NOT_FOUND', '上传任务不存在')
    if (['downloading', 'tagging', 'uploading', 'resolving'].includes(draft.stage)) {
      throw new AppError('UPLOAD_BUSY', '任务正在执行，暂时不能修改')
    }
    const next: UploadDraft = {
      ...draft,
      requestedQuality: patch.requestedQuality ?? draft.requestedQuality,
      metadata: patch.metadata
        ? mergeMetadata(draft.metadata, patch.metadata)
        : draft.metadata,
      writeCover: patch.writeCover ?? draft.writeCover,
      writeLyrics: patch.writeLyrics ?? draft.writeLyrics,
      allowDuplicate: patch.allowDuplicate ?? draft.allowDuplicate,
      updatedAt: Date.now()
    }
    this.db.saveUpload(next)
    this.events.updated(next)
    return next
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    const settings = this.settings.get()
    const downloads = new Semaphore(Math.max(1, settings.downloadConcurrency))
    const uploads = new Semaphore(Math.max(1, settings.uploadConcurrency))
    const workerCount = Math.max(1, Math.min(settings.downloadConcurrency, 3))
    this.emitBatch()
    try {
      await Promise.all(
        Array.from({ length: workerCount }, () => this.worker(downloads, uploads))
      )
    } finally {
      this.started = false
      this.emitBatch()
    }
  }

  retryFailed(): UploadDraft[] {
    const failed = this.list().filter(
      draft => draft.stage === 'failed' || draft.stage === 'cancelled'
    )
    for (const draft of failed) {
      const next: UploadDraft = {
        ...draft,
        stage: 'queued',
        progress: 0,
        error: undefined,
        warning: undefined,
        attempts: 0,
        updatedAt: Date.now()
      }
      this.cancelled.delete(next.id)
      this.db.saveUpload(next)
      this.events.updated(next)
    }
    this.emitBatch()
    return failed
  }

  cancel(ids?: string[]): void {
    const candidates = this.list().filter(
      draft =>
        (!ids || ids.includes(draft.id)) &&
        ['queued', 'resolving', 'downloading', 'tagging', 'uploading'].includes(draft.stage)
    )
    for (const draft of candidates) {
      this.cancelled.add(draft.id)
      this.controllers.get(draft.id)?.abort()
      if (!this.active.has(draft.id)) {
        const next: UploadDraft = {
          ...draft,
          stage: 'cancelled',
          error: '用户取消',
          updatedAt: Date.now()
        }
        this.db.saveUpload(next)
        this.events.updated(next)
      }
    }
    this.emitBatch()
  }

  clearFinished(): void {
    this.db.clearFinished()
    this.emitBatch()
  }

  summary(): UploadBatchSummary {
    return summarizeUploads(this.list())
  }

  private async worker(downloads: Semaphore, uploads: Semaphore): Promise<void> {
    while (true) {
      const draft = this.nextQueued()
      if (!draft) return
      const releaseDownload = await downloads.acquire()
      try {
        this.active.add(draft.id)
        await this.process(draft, uploads)
      } finally {
        releaseDownload()
        this.active.delete(draft.id)
        this.controllers.delete(draft.id)
      }
    }
  }

  private nextQueued(): UploadDraft | undefined {
    return this.list()
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .find(draft => draft.stage === 'queued' && !this.active.has(draft.id))
  }

  private async process(initial: UploadDraft, uploads: Semaphore): Promise<void> {
    let draft = this.updateDraft(initial, {
      stage: 'resolving',
      progress: 2,
      error: undefined,
      warning: undefined
    })
    let tempFile: string | undefined
    const controller = new AbortController()
    this.controllers.set(draft.id, controller)
    try {
      if (this.cancelled.has(draft.id)) throw new AppError('UPLOAD_CANCELLED', '用户取消')
      const resolved = await this.withRetry(
        () => this.sourceManager.resolveUrl(draft.track, draft.requestedQuality, 'upload'),
        3,
        draft.id
      )
      draft = this.updateDraft(draft, {
        stage: 'downloading',
        resolvedQuality: resolved.quality,
        progress: 5
      })

      const directory = join(
        getDownloadsDirectory(this.settings.get()),
        draft.batchId,
        draft.id
      )
      await mkdir(directory, { recursive: true })
      const download = await this.download(
        draft,
        resolved.url,
        directory,
        controller.signal
      )
      tempFile = download.path
      const warningParts: string[] = []
      draft = this.updateDraft(draft, {
        stage: 'tagging',
        progress: 45,
        downloadedBytes: download.size,
        totalBytes: download.size
      })

      try {
        const cover = draft.writeCover
          ? await this.fetchCover(draft)
          : undefined
        const lyrics = draft.writeLyrics
          ? draft.metadata.lyrics || (await this.sourceManager.requestLyric(draft.track))
          : undefined
        await writeTags(tempFile, draft.metadata, {
          cover,
          lyrics: lyrics || undefined
        })
      } catch (error) {
        warningParts.push(`标签写入失败，已上传原文件：${messageOf(error)}`)
        logger.warn('标签写入失败', error)
      }

      const fileStat = await stat(tempFile)
      const md5 = await md5File(tempFile)
      const cloudMd5 = await this.getCloudMd5Set()
      if (
        !draft.allowDuplicate &&
        this.settings.get().autoSkipDuplicate &&
        cloudMd5?.has(md5)
      ) {
        this.updateDraft(draft, {
          stage: 'skipped',
          progress: 100,
          warning: [...warningParts, '云盘中已存在相同 MD5 文件，已跳过'].join('；')
        })
        if (!this.settings.get().keepDownloadedFiles) {
          await rm(tempFile, { force: true })
        }
        return
      }

      const extension = extname(tempFile).slice(1).toLowerCase()
      const filename = sanitizeFilename(
        `${joinArtists(draft.metadata.artists)} - ${draft.metadata.title}`,
        extension
      )
      const releaseUpload = await uploads.acquire()
      try {
        draft = this.updateDraft(draft, {
          stage: 'uploading',
          progress: 50,
          totalBytes: fileStat.size,
          downloadedBytes: fileStat.size
        })
        const token = await this.withRetry(
          () =>
            this.netease.uploadToken({
              md5,
              fileSize: fileStat.size,
              filename
            }),
          3,
          draft.id
        )
        if (token.needUpload) {
          await this.withRetry(
            () =>
              this.uploadFile(
                draft,
                tempFile as string,
                fileStat.size,
                md5,
                token.uploadUrl,
                token.uploadToken,
                controller.signal
              ),
            3,
            draft.id
          )
        }
        const cloudSongId = await this.withRetry(
          () =>
            this.netease.completeUpload({
              songId: token.songId,
              resourceId: token.resourceId,
              md5,
              filename,
              song: draft.metadata.title,
              artist: joinArtists(draft.metadata.artists) || '未知歌手',
              album: draft.metadata.album || '未知专辑'
            }),
          3,
          draft.id
        )
        this.updateDraft(draft, {
          stage: 'completed',
          progress: 100,
          cloudSongId,
          warning: warningParts.length ? warningParts.join('；') : undefined
        })
      } finally {
        releaseUpload()
      }
      this.cloudMd5Cache = undefined
      if (!this.settings.get().keepDownloadedFiles && tempFile) {
        await rm(tempFile, { force: true })
      }
    } catch (error) {
      if (this.cancelled.has(draft.id) || controller.signal.aborted) {
        this.updateDraft(draft, {
          stage: 'cancelled',
          error: '用户取消'
        })
      } else {
        logError(`upload ${draft.id}`, error)
        this.updateDraft(draft, {
          stage: 'failed',
          error: messageOf(error)
        })
      }
      if (tempFile && !this.settings.get().keepDownloadedFiles) {
        await rm(tempFile, { force: true }).catch(() => undefined)
      }
    } finally {
      this.cancelled.delete(draft.id)
    }
  }

  private async download(
    draft: UploadDraft,
    url: string,
    directory: string,
    signal: AbortSignal
  ): Promise<{ path: string; size: number; mime?: string }> {
    const response = await axios.get<Readable>(url, {
      responseType: 'stream',
      timeout: 120_000,
      maxRedirects: 5,
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
      },
      validateStatus: status => status >= 200 && status < 400
    })
    const mime = String(response.headers['content-type'] ?? '')
    const ext = detectExtension(url, mime)
    const filename = sanitizeFilename(
      `${joinArtists(draft.metadata.artists)} - ${draft.metadata.title}`,
      ext
    )
    const target = join(directory, filename)
    const total = Number(response.headers['content-length'] ?? 0)
    let loaded = 0
    let lastUpdate = 0
    const startedAt = Date.now()
    const writer = createWriteStream(target)
    try {
      for await (const chunk of response.data) {
        if (signal.aborted) throw new AppError('UPLOAD_CANCELLED', '用户取消')
        loaded += Buffer.byteLength(chunk)
        if (!writer.write(chunk)) {
          await new Promise<void>((resolve, reject) => {
            writer.once('drain', resolve)
            writer.once('error', reject)
          })
        }
        const now = Date.now()
        if (now - lastUpdate > 300) {
          lastUpdate = now
          const elapsed = Math.max(1, now - startedAt)
          this.updateDraft(draft, {
            progress: total ? Math.min(44, 5 + Math.round((loaded / total) * 39)) : 20,
            downloadedBytes: loaded,
            totalBytes: total || undefined,
            speedBytesPerSec: Math.round((loaded * 1000) / elapsed)
          })
        }
      }
      await new Promise<void>((resolve, reject) => {
        writer.end(() => resolve())
        writer.once('error', reject)
      })
    } catch (error) {
      writer.destroy()
      await rm(target, { force: true }).catch(() => undefined)
      throw error
    }
    if (!loaded) {
      await rm(target, { force: true }).catch(() => undefined)
      throw new AppError('DOWNLOAD_EMPTY', '下载得到的音频文件为空')
    }
    this.updateDraft(draft, {
      progress: 45,
      downloadedBytes: loaded,
      totalBytes: loaded,
      speedBytesPerSec: 0
    })
    return { path: target, size: loaded, mime }
  }

  private async uploadFile(
    draft: UploadDraft,
    path: string,
    size: number,
    md5: string,
    uploadUrl: string,
    uploadToken: string,
    signal: AbortSignal
  ): Promise<void> {
    const extension = extname(path).slice(1).toLowerCase()
    const contentType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
    let lastUpdate = 0
    await axios.post(uploadUrl, createReadStream(path), {
      timeout: 10 * 60 * 1000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      signal,
      headers: {
        'x-nos-token': uploadToken,
        'Content-MD5': md5,
        'Content-Type': contentType,
        'Content-Length': String(size),
        'User-Agent': 'NetEaseHub/0.1.0'
      },
      validateStatus: status => status >= 200 && status < 400,
      onUploadProgress: progress => {
        const now = Date.now()
        if (now - lastUpdate < 300) return
        lastUpdate = now
        const ratio = progress.total ? progress.loaded / progress.total : 0
        this.updateDraft(draft, {
          progress: 50 + Math.round(Math.min(1, ratio) * 45)
        })
      }
    })
  }

  private async fetchCover(
    draft: UploadDraft
  ): Promise<{ mime: string; data: Uint8Array } | undefined> {
    if (draft.metadata.cover) {
      return {
        mime: draft.metadata.cover.mime,
        data: Buffer.from(draft.metadata.cover.dataBase64, 'base64')
      }
    }
    let url = draft.track.coverUrl
    if (!url) url = await this.sourceManager.requestPic(draft.track)
    if (!url) return undefined
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 20_000,
        maxContentLength: 10 * 1024 * 1024,
        validateStatus: status => status >= 200 && status < 400
      })
      const mime = String(response.headers['content-type'] ?? 'image/jpeg').split(';')[0]
      return {
        mime: mime.startsWith('image/') ? mime : 'image/jpeg',
        data: new Uint8Array(response.data)
      }
    } catch (error) {
      logger.warn('封面下载失败', error)
      return undefined
    }
  }

  private updateDraft(draft: UploadDraft, patch: Partial<UploadDraft>): UploadDraft {
    const next: UploadDraft = {
      ...draft,
      ...patch,
      updatedAt: Date.now()
    }
    this.db.saveUpload(next)
    this.events.updated(next)
    if (next.stage !== draft.stage) this.emitBatch()
    return next
  }

  private emitBatch(): void {
    this.events.batch(this.summary())
  }

  private async getCloudMd5Set(): Promise<Set<string> | undefined> {
    if (!this.settings.get().autoSkipDuplicate) return undefined
    if (this.cloudMd5Cache && this.cloudMd5Cache.expiresAt > Date.now()) {
      return this.cloudMd5Cache.values
    }
    try {
      const songs = await this.netease.getAllCloudSongs()
      const values = new Set(songs.map(song => song.md5).filter((value): value is string => Boolean(value)))
      this.cloudMd5Cache = {
        expiresAt: Date.now() + 10 * 60 * 1000,
        values
      }
      return values
    } catch (error) {
      logger.warn('读取云盘 MD5 失败，跳过本次查重', error)
      return undefined
    }
  }

  private async withRetry<T>(
    task: () => Promise<T>,
    attempts: number,
    draftId: string
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (this.cancelled.has(draftId)) throw new AppError('UPLOAD_CANCELLED', '用户取消')
      try {
        return await task()
      } catch (error) {
        lastError = error
        if (attempt < attempts) await sleep(attempt * 1500)
      }
    }
    throw lastError
  }
}
