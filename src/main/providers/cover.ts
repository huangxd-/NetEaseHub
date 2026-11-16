import axios from 'axios'
import type { TrackRef } from '@shared/types'
import { logger } from '../logger'
import { buildCustomApiUrl } from './custom-api'

const MAX_COVER_BYTES = 10 * 1024 * 1024
const COVER_KEYS = /cover|pic|image|artwork|albumart|thumb|poster/i

export interface CoverImage {
  mime: string
  data: Uint8Array
}

function normalizeImageMime(value: unknown): string | undefined {
  const mime = String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'image/x-png') return 'image/png'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return mime
  return undefined
}

function sniffImageMime(data: Uint8Array): string | undefined {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'image/webp'
  }
  return undefined
}

function imageFromBytes(data: Uint8Array, declaredMime?: unknown): CoverImage | undefined {
  if (!data.byteLength || data.byteLength > MAX_COVER_BYTES) return undefined
  const mime = sniffImageMime(data) ?? normalizeImageMime(declaredMime)
  if (!mime) return undefined
  return { mime, data }
}

function decodeDataUri(value: string): CoverImage | undefined {
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i)
  if (!match) return undefined
  const bytes = Buffer.from(match[2], 'base64')
  return imageFromBytes(new Uint8Array(bytes), match[1])
}

function extractCoverUrl(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value == null) return undefined
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('data:image/')) return text
    if (/^https?:\/\//i.test(text)) return text
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractCoverUrl(item, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const [key, item] of Object.entries(record)) {
    if (!COVER_KEYS.test(key)) continue
    const found = extractCoverUrl(item, depth + 1)
    if (found) return found
  }
  for (const item of Object.values(record)) {
    const found = extractCoverUrl(item, depth + 1)
    if (found) return found
  }
  return undefined
}

function endpointHost(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return 'invalid-url'
  }
}

export async function downloadCoverUrl(url: string): Promise<CoverImage | undefined> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined
    const response = await axios.get<ArrayBuffer>(parsed.toString(), {
      responseType: 'arraybuffer',
      timeout: 20_000,
      maxContentLength: MAX_COVER_BYTES,
      validateStatus: status => status >= 200 && status < 400,
      headers: { Accept: 'image/*' }
    })
    return imageFromBytes(
      new Uint8Array(response.data),
      response.headers['content-type']
    )
  } catch (error) {
    logger.warn('封面下载失败', {
      host: endpointHost(url),
      error: error instanceof Error ? error.name : 'unknown'
    })
    return undefined
  }
}

export async function getCustomCover(
  track: TrackRef,
  template: string | undefined
): Promise<CoverImage | undefined> {
  const url = buildCustomApiUrl(template, track)
  if (!url) return undefined
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
      maxContentLength: MAX_COVER_BYTES,
      validateStatus: status => status >= 200 && status < 400,
      headers: { Accept: 'image/*, application/json' }
    })
    const bytes = new Uint8Array(response.data)
    const sniffed = sniffImageMime(bytes)
    if (sniffed) return { mime: sniffed, data: bytes }
    const mime = normalizeImageMime(response.headers['content-type'])
    if (mime) {
      return imageFromBytes(bytes, mime)
    }

    const text = Buffer.from(response.data).toString('utf8').trim()
    if (!text) return undefined
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return undefined
    }
    const candidate = extractCoverUrl(payload)
    if (!candidate) return undefined
    if (candidate.startsWith('data:image/')) return decodeDataUri(candidate)
    return await downloadCoverUrl(new URL(candidate, url).toString())
  } catch (error) {
    logger.warn('自定义封面接口请求失败', {
      host: endpointHost(url),
      error: error instanceof Error ? error.name : 'unknown'
    })
    return undefined
  }
}
