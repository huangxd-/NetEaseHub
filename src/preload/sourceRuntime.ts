import { contextBridge, ipcRenderer, webFrame } from 'electron'
import axios, { type AxiosRequestConfig, type CancelTokenSource } from 'axios'
import { createHash, createCipheriv, publicEncrypt, constants, randomBytes } from 'node:crypto'
import { deflate, inflate } from 'node:zlib'
import { SOURCE_RUNTIME_EVENTS } from '@shared/ipc'

interface RuntimeInit {
  script: string
  info: {
    id: string
    name: string
    description?: string
    version?: string
    author?: string
    homepage?: string
  }
}

const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert'
} as const

const eventNames = Object.values(EVENT_NAMES)
let requestHandler: ((payload: {
  source: string
  action: string
  info: Record<string, unknown>
}) => Promise<unknown>) | null = null
let isInited = false
let isShowedUpdateAlert = false
let runtimeInfo: RuntimeInit['info'] | null = null
let scriptText = ''

const SUPPORT_QUALITIES: Record<string, string[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: []
}

const SUPPORT_ACTIONS: Record<string, string[]> = {
  kw: ['musicUrl'],
  kg: ['musicUrl'],
  tx: ['musicUrl'],
  wy: ['musicUrl'],
  mg: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic']
}

function sendStatus(status: 'ready' | 'failed', message?: string, capabilities = {}) {
  ipcRenderer.send(SOURCE_RUNTIME_EVENTS.status, {
    scriptId: runtimeInfo?.id ?? '',
    status,
    message,
    capabilities
  })
}

function verifyLyricInfo(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('歌词返回值格式错误')
  const info = value as Record<string, unknown>
  if (typeof info.lyric !== 'string' || info.lyric.length > 51200) throw new Error('歌词内容无效')
  return {
    lyric: info.lyric,
    tlyric: typeof info.tlyric === 'string' && info.tlyric.length < 5120 ? info.tlyric : null,
    rlyric: typeof info.rlyric === 'string' && info.rlyric.length < 5120 ? info.rlyric : null,
    lxlyric: typeof info.lxlyric === 'string' && info.lxlyric.length < 8192 ? info.lxlyric : null
  }
}

function requestWithCallback(
  url: string,
  options: {
    method?: string
    timeout?: number
    headers?: Record<string, string>
    body?: unknown
    form?: Record<string, unknown>
    formData?: Record<string, unknown>
  },
  callback: (error: Error | null, response?: Record<string, unknown>, body?: unknown) => void
) {
  if (!/^https?:\/\//i.test(url)) {
    callback(new Error('仅允许 HTTP/HTTPS 请求'))
    return () => undefined
  }
  const cancelToken: CancelTokenSource = axios.CancelToken.source()
  let data = options.body
  const headers = { ...(options.headers ?? {}) }
  if (options.form) {
    data = new URLSearchParams(
      Object.entries(options.form).map(([key, value]) => [key, String(value)])
    ).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (options.formData) {
    const formData = new FormData()
    for (const [key, value] of Object.entries(options.formData)) {
      formData.append(key, value instanceof Blob ? value : String(value))
    }
    data = formData
  }
  const config: AxiosRequestConfig = {
    url,
    method: (options.method ?? 'GET') as AxiosRequestConfig['method'],
    headers,
    data,
    timeout: Math.min(Math.max(Number(options.timeout) || 15_000, 1_000), 60_000),
    responseType: 'arraybuffer',
    maxRedirects: 5,
    cancelToken: cancelToken.token,
    transformResponse: [value => value],
    validateStatus: status => status >= 100 && status < 600
  }
  axios
    .request<ArrayBuffer>(config)
    .then(response => {
      const raw = Buffer.from(response.data)
      const text = raw.toString()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // Keep raw text.
      }
      callback(null, {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: response.headers as Record<string, unknown>,
        bytes: raw.length,
        raw,
        body: parsed
      }, parsed)
    })
    .catch(error => {
      callback(error instanceof Error ? error : new Error(String(error)))
    })
  return () => cancelToken.cancel('request cancelled')
}

function buildLxApi() {
  return {
    EVENT_NAMES,
    version: '2.0.0',
    env: 'desktop',
    currentScriptInfo: {
      name: runtimeInfo?.name ?? '',
      description: runtimeInfo?.description ?? '',
      version: runtimeInfo?.version ?? '',
      author: runtimeInfo?.author ?? '',
      homepage: runtimeInfo?.homepage ?? '',
      rawScript: scriptText
    },
    request: requestWithCallback,
    send(eventName: string, data: Record<string, any>) {
      return new Promise<void>((resolve, reject) => {
        if (!eventNames.includes(eventName as (typeof eventNames)[number])) {
          reject(new Error(`不支持的事件: ${eventName}`))
          return
        }
        if (eventName === EVENT_NAMES.inited) {
          if (isInited) {
            reject(new Error('音源脚本已经初始化'))
            return
          }
          isInited = true
          try {
            const capabilities: Record<string, string[]> = {}
            const sources = data?.sources ?? {}
            for (const source of Object.keys(SUPPORT_QUALITIES)) {
              const input = sources[source]
              if (
                !input ||
                input.type !== 'music' ||
                !SUPPORT_ACTIONS[source].every(action => input.actions?.includes(action))
              ) {
                continue
              }
              const qualities = SUPPORT_QUALITIES[source].filter((quality: string) =>
                input.qualitys?.includes(quality)
              )
              if (qualities.length) capabilities[source] = qualities
            }
            if (data?.openDevTools === true) {
              ipcRenderer.send(SOURCE_RUNTIME_EVENTS.openDevTools)
            }
            sendStatus('ready', undefined, capabilities)
            resolve()
          } catch (error) {
            sendStatus('failed', error instanceof Error ? error.message : '初始化失败')
            reject(error)
          }
          return
        }
        if (eventName === EVENT_NAMES.updateAlert) {
          if (isShowedUpdateAlert) {
            reject(new Error('更新提示只能调用一次'))
            return
          }
          isShowedUpdateAlert = true
          ipcRenderer.send(SOURCE_RUNTIME_EVENTS.updateAlert, data)
          resolve()
        }
      })
    },
    on(eventName: string, handler: typeof requestHandler) {
      if (eventName !== EVENT_NAMES.request) {
        return Promise.reject(new Error(`不支持的事件: ${eventName}`))
      }
      requestHandler = handler
      return Promise.resolve()
    },
    utils: {
      crypto: {
        aesEncrypt(buffer: Buffer, mode: string, key: Buffer, iv: Buffer | null) {
          const cipher = createCipheriv(mode as any, key, iv ?? Buffer.alloc(0))
          return Buffer.concat([cipher.update(buffer), cipher.final()])
        },
        rsaEncrypt(buffer: Buffer, key: string) {
          const padded = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer])
          return publicEncrypt({ key, padding: constants.RSA_NO_PADDING }, padded)
        },
        randomBytes(size: number) {
          return randomBytes(size)
        },
        md5(value: string) {
          return createHash('md5').update(value).digest('hex')
        }
      },
      buffer: {
        from(...args: Parameters<typeof Buffer.from>) {
          return Buffer.from(...args)
        },
        bufToString(buffer: unknown, format: BufferEncoding) {
          return Buffer.from(buffer as any, 'binary').toString(format)
        }
      },
      zlib: {
        inflate(buffer: Buffer) {
          return new Promise<Buffer>((resolve, reject) => {
            inflate(buffer, (error, data) => (error ? reject(error) : resolve(data)))
          })
        },
        deflate(buffer: Buffer) {
          return new Promise<Buffer>((resolve, reject) => {
            deflate(buffer, (error, data) => (error ? reject(error) : resolve(data)))
          })
        }
      }
    }
  }
}

function installErrorHandlers() {
  window.addEventListener('error', event => {
    if (!isInited) sendStatus('failed', event.message)
  })
  window.addEventListener('unhandledrejection', event => {
    if (isInited) return
    const reason = event.reason
    sendStatus('failed', reason instanceof Error ? reason.message : String(reason))
  })
}

ipcRenderer.on(SOURCE_RUNTIME_EVENTS.init, (_event, data: RuntimeInit) => {
  runtimeInfo = data.info
  scriptText = data.script
  installErrorHandlers()
  const api = buildLxApi()
  contextBridge.exposeInMainWorld('lx', api)
  const wrappedScript = `(() => {
  try {
${scriptText}
  } catch (error) {
    globalThis.__neteasehubSourceError =
      error instanceof Error ? error.message : String(error)
  }
})()`
  webFrame
    .executeJavaScript(wrappedScript)
    .then(async () => {
      const error = await webFrame.executeJavaScript(
        'globalThis.__neteasehubSourceError || ""'
      )
      if (!isInited && typeof error === 'string' && error) {
        sendStatus('failed', error.slice(0, 2000))
      }
    })
    .catch(error => {
      sendStatus('failed', error instanceof Error ? error.message : String(error))
    })
})

ipcRenderer.on(SOURCE_RUNTIME_EVENTS.request, async (_event, payload: {
  requestKey: string
  data: { source: string; action: string; info: Record<string, unknown> }
}) => {
  if (!requestHandler) {
    ipcRenderer.send(SOURCE_RUNTIME_EVENTS.response, {
      requestKey: payload.requestKey,
      ok: false,
      error: '音源脚本未注册 request 处理器'
    })
    return
  }
  try {
    const response = await requestHandler(payload.data)
    let result: Record<string, unknown>
    if (payload.data.action === 'musicUrl') {
      if (typeof response !== 'string' || response.length > 2048 || !/^https?:\/\//.test(response)) {
        throw new Error('音源返回的播放地址无效')
      }
      result = { type: payload.data.info.type, url: response }
    } else if (payload.data.action === 'lyric') {
      result = verifyLyricInfo(response)
    } else if (payload.data.action === 'pic') {
      if (typeof response !== 'string' || response.length > 2048 || !/^https?:\/\//.test(response)) {
        throw new Error('音源返回的封面地址无效')
      }
      result = { url: response }
    } else {
      throw new Error(`不支持的操作: ${payload.data.action}`)
    }
    ipcRenderer.send(SOURCE_RUNTIME_EVENTS.response, {
      requestKey: payload.requestKey,
      ok: true,
      result
    })
  } catch (error) {
    ipcRenderer.send(SOURCE_RUNTIME_EVENTS.response, {
      requestKey: payload.requestKey,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})
