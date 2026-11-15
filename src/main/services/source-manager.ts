import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import type {
  ProviderId,
  Quality,
  QualityPreference,
  SourceRuntimeStatus,
  SourceScriptInfo,
  TrackRef
} from '@shared/types'
import { MAX_SCRIPT_BYTES, PREVIEW_QUALITY_ORDER, QUALITY_ORDER } from '@shared/constants'
import { SOURCE_RUNTIME_EVENTS } from '@shared/ipc'
import { AppError, messageOf } from '../errors'
import { logger } from '../logger'
import { SettingsService } from './settings'
import { parseSourceHeader } from '@shared/utils'

interface RuntimeResponse {
  requestKey: string
  ok: boolean
  result?: { type?: Quality; url?: string; lyric?: string }
  error?: string
}

interface ScriptSession {
  script: SourceScriptInfo
  window: BrowserWindow
  ready: Promise<Partial<Record<ProviderId, Quality[]>>>
  capabilities: Partial<Record<ProviderId, Quality[]>>
  pending: Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >
  destroy: () => void
}

export interface ResolvedAudio {
  url: string
  quality: Quality
  scriptId: string
  scriptName: string
}

function clonePublicSource(script: SourceScriptInfo): SourceScriptInfo {
  const { script: _script, ...rest } = script
  return {
    ...rest,
    capabilities: rest.capabilities ?? {}
  }
}

export class SourceManager {
  private readonly sessions = new Map<string, ScriptSession>()
  private readonly statusListeners = new Set<(status: SourceRuntimeStatus) => void>()

  constructor(private readonly settings: SettingsService) {
    ipcMain.on(SOURCE_RUNTIME_EVENTS.status, (_event, data: SourceRuntimeStatus) => {
      const script = this.settings.getSource(data.scriptId)
      if (script) {
        this.settings.upsertSource({
          ...script,
          capabilities: data.capabilities ?? script.capabilities,
          lastError: data.status === 'failed' ? data.message : undefined,
          lastCheckedAt: Date.now()
        })
      }
      const session = this.sessions.get(data.scriptId)
      if (session && data.status === 'ready') {
        session.capabilities = data.capabilities ?? {}
      }
      for (const listener of this.statusListeners) listener(data)
    })

    ipcMain.on(SOURCE_RUNTIME_EVENTS.response, (_event, data: RuntimeResponse) => {
      for (const session of this.sessions.values()) {
        const pending = session.pending.get(data.requestKey)
        if (!pending) continue
        clearTimeout(pending.timer)
        session.pending.delete(data.requestKey)
        if (data.ok) pending.resolve(data.result)
        else pending.reject(new Error(data.error ?? '音源请求失败'))
        return
      }
    })

    ipcMain.on(SOURCE_RUNTIME_EVENTS.updateAlert, (_event, data) => {
      logger.info('音源更新提示', data)
    })

    ipcMain.on(SOURCE_RUNTIME_EVENTS.openDevTools, event => {
      if (process.env.NODE_ENV === 'development') {
        BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools({ mode: 'detach' })
      }
    })
  }

  onStatus(listener: (status: SourceRuntimeStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  list(): SourceScriptInfo[] {
    return this.settings.listSources().map(clonePublicSource)
  }

  async importSource(input: {
    mode: 'url' | 'text' | 'file'
    value: string
  }): Promise<SourceScriptInfo> {
    let script: string
    let sourceUrl: string | undefined
    if (input.mode === 'url') {
      const url = input.value.trim()
      if (!/^https?:\/\//i.test(url)) {
        throw new AppError('INVALID_SOURCE_URL', '音源地址必须是 HTTP/HTTPS URL')
      }
      const response = await axios.get<string>(url, {
        responseType: 'text',
        timeout: 20_000,
        maxContentLength: MAX_SCRIPT_BYTES,
        transformResponse: [value => value]
      })
      script = String(response.data)
      sourceUrl = url
    } else if (input.mode === 'file') {
      const value = input.value.trim()
      if (!value) throw new AppError('INVALID_SOURCE_FILE', '请选择音源脚本文件')
      script = await readFile(value, 'utf8')
    } else {
      script = input.value
    }
    if (Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES) {
      throw new AppError('SOURCE_TOO_LARGE', '音源脚本不能超过 2 MB')
    }
    if (!script.includes('globalThis.lx') && !script.includes('EVENT_NAMES')) {
      throw new AppError('INVALID_SOURCE', '这不是有效的洛雪自定义音源脚本')
    }
    const header = parseSourceHeader(script)
    const current = this.settings.listSources()
    const existing = sourceUrl
      ? current.find(item => item.sourceUrl === sourceUrl)
      : undefined
    const scriptInfo: SourceScriptInfo = {
      id: existing?.id ?? randomUUID(),
      name: header.name,
      description: header.description,
      version: header.version,
      author: header.author,
      homepage: header.homepage,
      sourceUrl,
      enabled: true,
      priority: existing?.priority ?? current.length,
      script,
      capabilities: {},
      lastCheckedAt: Date.now()
    }
    this.settings.upsertSource(scriptInfo)
    await this.reload(scriptInfo.id, false).catch(error => {
      logger.warn('导入音源初始化失败', error)
      const latest = this.settings.getSource(scriptInfo.id)
      if (latest) {
        this.settings.upsertSource({
          ...latest,
          enabled: false,
          lastError: messageOf(error),
          lastCheckedAt: Date.now()
        })
      }
    })
    const result = this.settings.getSource(scriptInfo.id)
    if (!result) throw new AppError('SOURCE_IMPORT_FAILED', '音源脚本保存失败')
    return clonePublicSource(result)
  }

  remove(id: string): SourceScriptInfo[] {
    this.destroySession(id)
    return this.settings.removeSource(id).map(clonePublicSource)
  }

  toggle(id: string, enabled: boolean): SourceScriptInfo[] {
    const script = this.settings.getSource(id)
    if (!script) throw new AppError('SOURCE_NOT_FOUND', '音源脚本不存在')
    this.settings.upsertSource({ ...script, enabled })
    if (!enabled) this.destroySession(id)
    return this.list()
  }

  reorder(ids: string[]): SourceScriptInfo[] {
    return this.settings.reorderSources(ids).map(clonePublicSource)
  }

  async reload(id: string, updateError = true): Promise<SourceScriptInfo> {
    const script = this.settings.getSource(id)
    if (!script?.script) throw new AppError('SOURCE_SCRIPT_MISSING', '音源脚本内容不存在')
    this.destroySession(id)
    try {
      const session = await this.getSession(script, true)
      const capabilities = await session.ready
      const latest = this.settings.getSource(id)
      if (!latest) throw new AppError('SOURCE_NOT_FOUND', '音源脚本不存在')
      const next = {
        ...latest,
        capabilities,
        lastError: undefined,
        lastCheckedAt: Date.now()
      }
      this.settings.upsertSource(next)
      return clonePublicSource(next)
    } catch (error) {
      if (updateError) {
        const latest = this.settings.getSource(id)
        if (latest) {
          this.settings.upsertSource({
            ...latest,
            lastError: messageOf(error),
            lastCheckedAt: Date.now()
          })
        }
      }
      throw error
    }
  }

  async resolveUrl(
    track: TrackRef,
    preference: QualityPreference,
    purpose: 'upload' | 'preview'
  ): Promise<ResolvedAudio> {
    const scripts = this.settings
      .listSources()
      .filter(script => script.enabled)
      .sort((a, b) => a.priority - b.priority)
    if (!scripts.length) {
      throw new AppError('NO_SOURCE_SCRIPT', '请先在设置中导入并启用洛雪兼容音源脚本')
    }
    const errors: string[] = []
    for (const script of scripts) {
      const capabilities = script.capabilities?.[track.provider]
      if (!capabilities?.length) continue
      const candidates =
        preference === 'auto'
          ? (purpose === 'preview' ? PREVIEW_QUALITY_ORDER : QUALITY_ORDER).filter(quality =>
              capabilities.includes(quality)
            )
          : capabilities.includes(preference)
            ? [preference]
            : []
      for (const quality of candidates) {
        try {
          const session = await this.getSession(script, false)
          const result = await this.request(session, {
            source: track.provider,
            action: 'musicUrl',
            info: {
              type: quality,
              musicInfo: track.native
            }
          })
          if (typeof result?.url !== 'string' || !/^https?:\/\//i.test(result.url)) {
            throw new Error('音源返回了无效播放地址')
          }
          return {
            url: result.url,
            quality,
            scriptId: script.id,
            scriptName: script.name
          }
        } catch (error) {
          errors.push(`${script.name}/${quality}: ${messageOf(error)}`)
        }
      }
    }
    if (!errors.length) {
      throw new AppError(
        'NO_COMPATIBLE_SOURCE',
        `没有可用的音源脚本支持 ${track.provider} 或所选音质`
      )
    }
    throw new AppError('ALL_SOURCES_FAILED', '所有可用音源均获取音频地址失败', errors.slice(-8))
  }

  async requestLyric(track: TrackRef): Promise<string | undefined> {
    const scripts = this.settings
      .listSources()
      .filter(script => script.enabled && script.capabilities?.[track.provider])
    for (const script of scripts) {
      try {
        const session = await this.getSession(script, false)
        const result = await this.request(session, {
          source: track.provider,
          action: 'lyric',
          info: { musicInfo: track.native }
        })
        if (result?.lyric) return String(result.lyric)
      } catch {
        // Try next source.
      }
    }
    return undefined
  }

  async requestPic(track: TrackRef): Promise<string | undefined> {
    const scripts = this.settings
      .listSources()
      .filter(script => script.enabled && script.capabilities?.[track.provider])
    for (const script of scripts) {
      try {
        const session = await this.getSession(script, false)
        const result = await this.request(session, {
          source: track.provider,
          action: 'pic',
          info: { musicInfo: track.native }
        })
        if (typeof result?.url === 'string' && /^https?:\/\//.test(result.url)) return result.url
      } catch {
        // Some scripts do not implement pic even if advertised.
      }
    }
    return undefined
  }

  destroy(): void {
    for (const id of this.sessions.keys()) this.destroySession(id)
    this.statusListeners.clear()
  }

  private async getSession(script: SourceScriptInfo, forceNew = false): Promise<ScriptSession> {
    if (!forceNew) {
      const existing = this.sessions.get(script.id)
      if (existing) return existing
    }
    this.destroySession(script.id)
    if (!script.script) throw new AppError('SOURCE_SCRIPT_MISSING', '音源脚本内容不存在')
    const preload = fileURLToPath(new URL('../preload/sourceRuntime.cjs', import.meta.url))
    const window = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        webgl: false,
        images: false,
        autoplayPolicy: 'document-user-activation-required'
      }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false)
    )

    let resolveReady!: (value: Partial<Record<ProviderId, Quality[]>>) => void
    let rejectReady!: (error: Error) => void
    const ready = new Promise<Partial<Record<ProviderId, Quality[]>>>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    const session: ScriptSession = {
      script,
      window,
      ready,
      capabilities: {},
      pending: new Map(),
      destroy: () => {
        if (!window.isDestroyed()) window.destroy()
      }
    }
    this.sessions.set(script.id, session)

    const onStatus = (status: SourceRuntimeStatus) => {
      if (status.scriptId !== script.id) return
      if (status.status === 'ready') {
        session.capabilities = status.capabilities ?? {}
        this.settings.upsertSource({
          ...script,
          capabilities: session.capabilities,
          lastError: undefined,
          lastCheckedAt: Date.now()
        })
        resolveReady(session.capabilities)
      } else if (status.status === 'failed') {
        rejectReady(new AppError('SOURCE_INIT_FAILED', status.message ?? '音源脚本初始化失败'))
      }
    }
    const unsubscribe = this.onStatus(onStatus)
    const timeout = setTimeout(() => {
      rejectReady(new AppError('SOURCE_INIT_TIMEOUT', `音源脚本 ${script.name} 初始化超时`))
    }, 15_000)
    ready.finally(() => clearTimeout(timeout)).catch(() => undefined)
    ready.finally(() => unsubscribe()).catch(() => undefined)

    window.on('closed', () => {
      unsubscribe()
      if (this.sessions.get(script.id) === session) this.sessions.delete(script.id)
      for (const [, pending] of session.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('音源运行窗口已关闭'))
      }
      session.pending.clear()
    })

    await window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(
        '<!doctype html><html><head><meta charset="utf-8"><title>NetEaseHub Source Runtime</title></head><body></body></html>'
      )}`
    )
    window.webContents.send(SOURCE_RUNTIME_EVENTS.init, {
      script: script.script,
      info: {
        id: script.id,
        name: script.name,
        description: script.description,
        version: script.version,
        author: script.author,
        homepage: script.homepage
      }
    })
    return session
  }

  private async request(
    session: ScriptSession,
    data: {
      source: string
      action: string
      info: Record<string, unknown>
    },
    timeoutMs = 30_000
  ): Promise<{ type?: Quality; url?: string; lyric?: string }> {
    await Promise.race([
      session.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('音源尚未初始化完成')), 15_000)
      )
    ])
    if (session.window.isDestroyed()) throw new Error('音源运行窗口已关闭')
    const requestKey = randomUUID()
    const promise = new Promise<{ type?: Quality; url?: string; lyric?: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          session.pending.delete(requestKey)
          reject(new Error('音源请求超时'))
        }, timeoutMs)
        session.pending.set(requestKey, { resolve, reject, timer })
      }
    )
    try {
      session.window.webContents.send(SOURCE_RUNTIME_EVENTS.request, {
        requestKey,
        data
      })
    } catch (error) {
      const pending = session.pending.get(requestKey)
      if (pending) {
        clearTimeout(pending.timer)
        session.pending.delete(requestKey)
      }
      throw error
    }
    return promise
  }

  private destroySession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    session.destroy()
  }
}
