import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, TrackRef, UploadDraft } from '@shared/types'
import { DatabaseService } from '../../src/main/services/database'
import type { NeteaseService } from '../../src/main/services/netease'
import type { SettingsService } from '../../src/main/services/settings'
import type { SourceManager } from '../../src/main/services/source-manager'
import { UploadManager } from '../../src/main/services/upload-manager'

function wavFixture(seconds = 1): Buffer {
  const sampleRate = 8_000
  const sampleCount = sampleRate * seconds
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function startUploadFixture(wav: Buffer): Promise<{
  server: Server
  baseUrl: string
  uploads: Array<{ size: number; headers: Record<string, string | string[] | undefined> }>
}> {
  const uploads: Array<{
    size: number
    headers: Record<string, string | string[] | undefined>
  }> = []
  return new Promise(resolve => {
    const server = createServer(async (request, response) => {
      if (request.method === 'GET' && request.url === '/audio.wav') {
        response.writeHead(200, {
          'content-type': 'audio/wav',
          'content-length': wav.length
        })
        response.end(wav)
        return
      }
      if (request.method === 'POST' && request.url === '/upload') {
        let size = 0
        for await (const chunk of request) size += Buffer.byteLength(chunk)
        uploads.push({ size, headers: request.headers })
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('ok')
        return
      }
      response.writeHead(404)
      response.end()
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}`, uploads })
    })
  })
}

describe('upload manager fixture integration', () => {
  const cleanup: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()?.()
  })

  it('downloads, tags, uploads and completes a task', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neteasehub-upload-test-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const fixture = await startUploadFixture(wavFixture())
    const db = new DatabaseService(root)
    cleanup.push(async () => db.close())
    cleanup.push(() => new Promise(resolve => fixture.server.close(() => resolve())))

    const settings: AppSettings = {
      defaultQuality: 'auto',
      previewQuality: '128k',
      writeCover: false,
      writeLyrics: false,
      autoMatchOnUpload: true,
      lrclibEnabled: false,
      customLyricsApiUrl: '',
      customCoverApiUrl: '',
      autoSkipDuplicate: false,
      downloadConcurrency: 1,
      uploadConcurrency: 1,
      keepDownloadedFiles: false,
      tempDirectory: root,
      theme: 'dark',
      disclaimerAccepted: true
    }
    const settingsService = {
      get: vi.fn(() => settings)
    } as unknown as SettingsService
    const track: TrackRef = {
      key: 'wy:upload-fixture',
      provider: 'wy',
      native: { name: '上传测试' },
      title: '上传测试',
      artists: ['本地歌手'],
      album: '本地专辑'
    }
    const sourceManager = {
      resolveUrl: vi.fn(async () => ({
        url: `${fixture.baseUrl}/audio.wav`,
        quality: '320k' as const,
        scriptId: 'fixture',
        scriptName: 'fixture'
      })),
      requestLyric: vi.fn(async () => undefined),
      requestPic: vi.fn(async () => undefined)
    } as unknown as SourceManager
    const netease = {
      uploadToken: vi.fn(async input => ({
        needUpload: true,
        songId: 'song-id',
        uploadToken: 'upload-token',
        uploadUrl: `${fixture.baseUrl}/upload`,
        resourceId: 'resource-id',
        md5: input.md5,
        fileSize: input.fileSize,
        filename: input.filename
      })),
      completeUpload: vi.fn(async () => 3462160013),
      resolveCloudSongIdByMd5: vi.fn(async () => 631161079838),
      autoMatchCloudSong: vi.fn(async () => ({
        songId: 999,
        title: '上传测试',
        artist: '本地歌手',
        durationSec: 1,
        score: 1
      })),
      getAllCloudSongs: vi.fn(async () => [])
    } as unknown as NeteaseService
    const updates: UploadDraft[] = []
    const manager = new UploadManager(db, settingsService, netease, sourceManager, {
      updated: draft => updates.push(draft),
      batch: () => undefined
    })

    const drafts = manager.enqueue({
      tracks: [track],
      writeCover: false,
      writeLyrics: false
    })
    expect(drafts).toHaveLength(1)
    await manager.start()

    const [result] = manager.list()
    expect(result.stage).toBe('completed')
    expect(result.cloudSongId).toBe(631161079838)
    expect(result.resolvedQuality).toBe('320k')
    expect(sourceManager.resolveUrl).toHaveBeenCalledWith(track, 'auto', 'upload')
    expect(netease.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        song: '上传测试',
        artist: '本地歌手',
        album: '本地专辑'
      })
    )
    expect(netease.resolveCloudSongIdByMd5).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{32}$/)
    )
    expect(netease.autoMatchCloudSong).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudId: 631161079838,
        title: '上传测试',
        artist: '本地歌手'
      })
    )
    expect(fixture.uploads).toHaveLength(1)
    expect(fixture.uploads[0].size).toBeGreaterThan(0)
    expect(fixture.uploads[0].headers['content-type']).toBe('audio/wav')
    expect(updates.some(update => update.stage === 'downloading')).toBe(true)
    expect(updates.some(update => update.stage === 'uploading')).toBe(true)
  })

  it('keeps a task completed but skips auto match when the cloud id cannot be verified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neteasehub-upload-no-cloud-id-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const fixture = await startUploadFixture(wavFixture())
    const db = new DatabaseService(root)
    cleanup.push(async () => db.close())
    cleanup.push(() => new Promise(resolve => fixture.server.close(() => resolve())))

    const settings: AppSettings = {
      defaultQuality: 'auto',
      previewQuality: '128k',
      writeCover: false,
      writeLyrics: false,
      autoMatchOnUpload: true,
      lrclibEnabled: false,
      customLyricsApiUrl: '',
      customCoverApiUrl: '',
      autoSkipDuplicate: false,
      downloadConcurrency: 1,
      uploadConcurrency: 1,
      keepDownloadedFiles: false,
      tempDirectory: root,
      theme: 'dark',
      disclaimerAccepted: true
    }
    const settingsService = {
      get: vi.fn(() => settings)
    } as unknown as SettingsService
    const track: TrackRef = {
      key: 'wy:upload-no-cloud-id',
      provider: 'wy',
      native: { name: '上传测试' },
      title: '上传测试',
      artists: ['本地歌手'],
      album: '本地专辑'
    }
    const sourceManager = {
      resolveUrl: vi.fn(async () => ({
        url: `${fixture.baseUrl}/audio.wav`,
        quality: '320k' as const,
        scriptId: 'fixture',
        scriptName: 'fixture'
      })),
      requestLyric: vi.fn(async () => undefined),
      requestPic: vi.fn(async () => undefined)
    } as unknown as SourceManager
    const autoMatchCloudSong = vi.fn()
    const netease = {
      uploadToken: vi.fn(async input => ({
        needUpload: true,
        songId: 'song-id',
        uploadToken: 'upload-token',
        uploadUrl: `${fixture.baseUrl}/upload`,
        resourceId: 'resource-id',
        md5: input.md5,
        fileSize: input.fileSize,
        filename: input.filename
      })),
      completeUpload: vi.fn(async () => 42),
      resolveCloudSongIdByMd5: vi.fn(async () => undefined),
      autoMatchCloudSong,
      getAllCloudSongs: vi.fn(async () => [])
    } as unknown as NeteaseService
    const manager = new UploadManager(db, settingsService, netease, sourceManager, {
      updated: () => undefined,
      batch: () => undefined
    })

    manager.enqueue({
      tracks: [track],
      writeCover: false,
      writeLyrics: false
    })
    await manager.start()

    const [result] = manager.list()
    expect(result.stage).toBe('completed')
    expect(result.cloudSongId).toBe(42)
    expect(autoMatchCloudSong).not.toHaveBeenCalled()
  })

  it('requeues tasks left active by a previous process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neteasehub-upload-recovery-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const db = new DatabaseService(root)
    cleanup.push(async () => db.close())
    const interrupted: UploadDraft = {
      id: 'interrupted',
      batchId: 'batch',
      track: {
        key: 'wy:interrupted',
        provider: 'wy',
        native: {},
        title: '中断任务',
        artists: ['本地歌手']
      },
      requestedQuality: 'auto',
      metadata: { title: '中断任务', artists: ['本地歌手'] },
      writeCover: false,
      writeLyrics: false,
      allowDuplicate: false,
      stage: 'downloading',
      progress: 24,
      attempts: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    db.saveUpload(interrupted)
    const settingsService = {
      get: () => ({ autoSkipDuplicate: false, keepDownloadedFiles: false })
    } as unknown as SettingsService
    const manager = new UploadManager(
      db,
      settingsService,
      {} as NeteaseService,
      {} as SourceManager,
      { updated: () => undefined, batch: () => undefined }
    )

    expect(manager.list()[0]).toMatchObject({
      stage: 'queued',
      progress: 0,
      warning: '应用上次退出时任务尚未完成，已恢复为等待中'
    })
  })
})
