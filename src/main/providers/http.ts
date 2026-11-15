import axios, { type AxiosRequestConfig } from 'axios'
import { jsonrepair } from 'jsonrepair'
import { AppError } from '../errors'

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
}

export interface HttpOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  params?: Record<string, unknown>
  data?: unknown
  form?: Record<string, string | number | boolean>
  timeout?: number
  retries?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function requestText(url: string, options: HttpOptions = {}): Promise<string> {
  const retries = options.retries ?? 2
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const config: AxiosRequestConfig = {
        url,
        method: options.method ?? 'GET',
        headers: {
          ...DEFAULT_HEADERS,
          ...options.headers
        },
        params: options.params,
        data: options.form
          ? new URLSearchParams(
              Object.entries(options.form).map(([key, value]) => [key, String(value)])
            ).toString()
          : options.data,
        timeout: options.timeout ?? 15_000,
        maxRedirects: 5,
        responseType: 'text',
        transformResponse: [value => value],
        validateStatus: status => status >= 200 && status < 400
      }
      if (options.form) {
        config.headers = {
          ...config.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
      const response = await axios.request<string>(config)
      const data = response.data
      if (typeof data !== 'string') return JSON.stringify(data)
      return data
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(300 * (attempt + 1))
    }
  }
  throw new AppError(
    'PROVIDER_NETWORK_ERROR',
    `请求音乐平台失败: ${lastError instanceof Error ? lastError.message : '网络异常'}`,
    { url, cause: lastError instanceof Error ? lastError.message : lastError }
  )
}

export async function requestJson<T = any>(url: string, options: HttpOptions = {}): Promise<T> {
  const text = (await requestText(url, options)).trim()
  if (!text) throw new AppError('PROVIDER_EMPTY_RESPONSE', '音乐平台返回空响应')
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(text)) as T
    } catch (error) {
      throw new AppError(
        'PROVIDER_INVALID_JSON',
        '音乐平台返回了无法解析的数据',
        error instanceof Error ? error.message : text.slice(0, 200)
      )
    }
  }
}

export function coverUrl(value: unknown, fallbackBase?: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const text = value.trim()
  if (/^https?:\/\//i.test(text)) return text
  if (text.startsWith('//')) return `https:${text}`
  if (fallbackBase) return `${fallbackBase.replace(/\/$/, '')}/${text.replace(/^\//, '')}`
  return undefined
}
