import type { TrackRef } from '@shared/types'
import { diceCoefficient } from '@shared/utils'
import axios from 'axios'
import { decodeName } from './helpers'
import { requestJson, requestText } from './http'
import { buildCustomApiUrl } from './custom-api'
import { logger } from '../logger'

const LRC_TIME = /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/
const LRCLIB_BASE = 'https://lrclib.net/api'

export interface LrclibLyrics {
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

export function isSyncedLrc(value: unknown): value is string {
  return typeof value === 'string' && LRC_TIME.test(value)
}

function decodePossibleBase64(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const text = value.trim()
  if (LRC_TIME.test(text)) return text
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) return undefined
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim()
    return LRC_TIME.test(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

export function normalizeSyncedLrc(value: unknown): string | undefined {
  const text = decodePossibleBase64(value)
  if (!text || !isSyncedLrc(text)) return undefined
  return text.replace(/\r\n?/g, '\n').trim()
}

function formatLrcTime(value: unknown): string {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

async function getTxLyric(track: TrackRef): Promise<string | undefined> {
  const songId = Number(track.native.songId)
  if (!Number.isFinite(songId) || songId <= 0) return undefined
  const body = await requestJson<Record<string, any>>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      Referer: 'https://y.qq.com/',
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        method: 'GetPlayLyricInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: {
          format: 'json',
          crypt: 0,
          ct: 19,
          cv: 1873,
          interval: 0,
          lrc_t: 0,
          qrc: 0,
          qrc_t: 0,
          roma: 0,
          roma_t: 0,
          songID: songId,
          trans: 0,
          trans_t: 0,
          type: -1
        }
      }
    })
  })
  if (body.code !== 0 || body.req?.code !== 0) return undefined
  return normalizeSyncedLrc(body.req?.data?.lyric)
}

async function getKwLyric(track: TrackRef): Promise<string | undefined> {
  const songId = String(track.native.songmid ?? '')
  if (!songId) return undefined
  const body = await requestJson<Record<string, any>>(
    `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${encodeURIComponent(songId)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X)' } }
  )
  const lines = body.data?.lrclist
  if (!Array.isArray(lines)) return undefined
  const lrc = lines
    .map(item => {
      const text = decodeName(item?.lineLyric ?? '')
      return text ? `[${formatLrcTime(item?.time)}]${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
  return normalizeSyncedLrc(lrc)
}

async function getKgLyric(track: TrackRef): Promise<string | undefined> {
  const hash = String(track.native.hash ?? '')
  if (!hash) return undefined
  const name = `${track.artists[0] ?? ''} - ${track.title}`.trim()
  const duration = Math.max(0, Math.round((track.durationSec ?? 0) * 1000))
  const search = await requestJson<Record<string, any>>(
    `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(name)}&hash=${encodeURIComponent(hash)}&timelength=${duration}&lrctxt=1`,
    {
      headers: {
        'KG-RC': '1',
        'KG-THash': 'expand_search_manager.cpp:852736169:451',
        'User-Agent': 'KuGou2012-9020-ExpandSearchManager'
      }
    }
  )
  const candidate = search.candidates?.[0]
  if (!candidate?.id || !candidate?.accesskey) return undefined
  const download = await requestJson<Record<string, any>>(
    `http://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(String(candidate.id))}&accesskey=${encodeURIComponent(String(candidate.accesskey))}&fmt=lrc&charset=utf8`,
    {
      headers: {
        'KG-RC': '1',
        'KG-THash': 'expand_search_manager.cpp:852736169:451',
        'User-Agent': 'KuGou2012-9020-ExpandSearchManager'
      }
    }
  )
  return normalizeSyncedLrc(download.content)
}

async function getWyLyric(track: TrackRef): Promise<string | undefined> {
  const songId = String(track.native.songmid ?? '')
  if (!songId) return undefined
  const body = await requestJson<Record<string, any>>(
    `https://music.163.com/api/song/lyric?id=${encodeURIComponent(songId)}&lv=-1&kv=-1&tv=-1`,
    { headers: { Referer: 'https://music.163.com/' } }
  )
  return normalizeSyncedLrc(body.lrc?.lyric)
}

async function getMgLyric(track: TrackRef): Promise<string | undefined> {
  const url = typeof track.native.lrcUrl === 'string' ? track.native.lrcUrl : ''
  if (!url) return undefined
  const text = await requestText(url, {
    headers: {
      Referer: 'https://app.c.nf.migu.cn/',
      'User-Agent': 'Mozilla/5.0'
    }
  })
  return normalizeSyncedLrc(text)
}

function lrclibParams(track: TrackRef): Record<string, string> {
  const params: Record<string, string> = {
    track_name: track.title,
    artist_name: track.artists[0] ?? ''
  }
  if (track.album) params.album_name = track.album
  if (track.durationSec && track.durationSec > 0) {
    params.duration = String(Math.round(track.durationSec))
  }
  return params
}

function lrclibScore(track: TrackRef, candidate: LrclibLyrics): number {
  if (!normalizeSyncedLrc(candidate.syncedLyrics)) return -1
  const titleScore = diceCoefficient(track.title, candidate.trackName ?? '')
  const artistScore = candidate.artistName
    ? diceCoefficient(track.artists[0] ?? '', candidate.artistName)
    : 0
  let durationScore = 0
  if (track.durationSec && candidate.duration) {
    const difference = Math.abs(track.durationSec - candidate.duration)
    if (difference > 6) return -1
    durationScore = 1 - difference / 6
  }
  return titleScore * 0.55 + artistScore * 0.3 + durationScore * 0.15
}

export async function getLrclibLyric(track: TrackRef): Promise<string | undefined> {
  const params = lrclibParams(track)
  try {
    const direct = await requestJson<LrclibLyrics>(`${LRCLIB_BASE}/get`, {
      params,
      timeout: 12_000,
      retries: 0
    })
    const synced = normalizeSyncedLrc(direct.syncedLyrics)
    if (synced) return synced
  } catch {
    // Fall through to search when the exact signature is unavailable.
  }

  try {
    const candidates = await requestJson<LrclibLyrics[]>(`${LRCLIB_BASE}/search`, {
      params: {
        track_name: params.track_name,
        artist_name: params.artist_name
      },
      timeout: 12_000,
      retries: 0
    })
    if (!Array.isArray(candidates)) return undefined
    let best: { score: number; lyrics: string } | undefined
    for (const candidate of candidates) {
      const score = lrclibScore(track, candidate)
      if (score < 0.3) continue
      const lyrics = normalizeSyncedLrc(candidate.syncedLyrics)
      if (!lyrics) continue
      if (!best || score > best.score) best = { score, lyrics }
    }
    return best?.lyrics
  } catch {
    return undefined
  }
}

function extractLrcCandidate(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value == null) return undefined
  if (typeof value === 'string') return normalizeSyncedLrc(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractLrcCandidate(item, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const preferred = ['syncedLyrics', 'lyrics', 'lyric', 'lrc', 'data', 'result']
  for (const key of preferred) {
    if (!(key in record)) continue
    const found = extractLrcCandidate(record[key], depth + 1)
    if (found) return found
  }
  for (const item of Object.values(record)) {
    const found = extractLrcCandidate(item, depth + 1)
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

export async function getCustomLyric(
  track: TrackRef,
  template: string | undefined
): Promise<string | undefined> {
  const url = buildCustomApiUrl(template, track)
  if (!url) return undefined
  try {
    const response = await axios.request<string>({
      url,
      method: 'GET',
      responseType: 'text',
      transformResponse: [value => value],
      timeout: 15_000,
      maxContentLength: 2 * 1024 * 1024,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    })
    const text = String(response.data ?? '').trim()
    if (!text) return undefined
    try {
      const parsed = JSON.parse(text) as unknown
      const fromJson = extractLrcCandidate(parsed)
      if (fromJson) return fromJson
    } catch {
      // The endpoint may return raw LRC text.
    }
    return normalizeSyncedLrc(text)
  } catch (error) {
    logger.warn('自定义歌词接口请求失败', {
      host: endpointHost(url),
      error: error instanceof Error ? error.name : 'unknown'
    })
    return undefined
  }
}

export async function getBuiltInLyric(track: TrackRef): Promise<string | undefined> {
  try {
    if (track.provider === 'tx') return await getTxLyric(track)
    if (track.provider === 'kw') return await getKwLyric(track)
    if (track.provider === 'kg') return await getKgLyric(track)
    if (track.provider === 'wy') return await getWyLyric(track)
    if (track.provider === 'mg') return await getMgLyric(track)
  } catch {
    return undefined
  }
  return undefined
}
