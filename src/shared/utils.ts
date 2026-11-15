import {
  AUDIO_EXTENSIONS,
  PREVIEW_QUALITY_ORDER,
  PROVIDER_IDS,
  QUALITY_ORDER
} from './constants'
import type {
  CatalogInfo,
  EditableMetadata,
  ProviderId,
  Quality,
  TrackRef,
  UploadBatchSummary,
  UploadDraft,
  UploadStage
} from './types'
import { MAX_PREVIEW_SECONDS } from './constants'

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function splitArtists(value: unknown): string[] {
  const text = normalizeText(value)
  if (!text) return []
  return text
    .split(/[、,，;/&|]/u)
    .map(item => item.trim())
    .filter(Boolean)
}

export function joinArtists(artists: string[]): string {
  return artists.map(item => item.trim()).filter(Boolean).join('、')
}

export function formatDuration(totalSeconds?: number): string {
  if (!Number.isFinite(totalSeconds) || (totalSeconds ?? 0) <= 0) return '--:--'
  const seconds = Math.round(totalSeconds as number)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function parseDuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const parts = trimmed.split(':').map(Number)
  if (parts.some(part => !Number.isFinite(part))) return undefined
  return parts.reduce((acc, part) => acc * 60 + part, 0)
}

export function sanitizeFilename(value: string, extension: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  const safeExt = extension.replace(/^\./, '').toLowerCase()
  const maxBaseLength = Math.max(1, 180 - safeExt.length - 1)
  const base = (cleaned || '未命名歌曲').slice(0, maxBaseLength)
  return safeExt ? `${base}.${safeExt}` : base
}

export function detectExtension(url: string, contentType?: string): string {
  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i)
    if (match && AUDIO_EXTENSIONS.includes(match[1].toLowerCase())) return match[1].toLowerCase()
  } catch {
    // ignore malformed URL
  }
  const mime = (contentType ?? '').toLowerCase()
  if (mime.includes('flac')) return 'flac'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg'
  return 'mp3'
}

export function qualityCandidates(
  preference: Quality | 'auto',
  available?: Quality[],
  preview = false
): Quality[] {
  const base = preview ? PREVIEW_QUALITY_ORDER : QUALITY_ORDER
  const pool = available?.length ? base.filter(item => available.includes(item)) : base
  if (preference === 'auto') return pool.length ? pool : base
  return pool.includes(preference) ? [preference] : [preference]
}

export function defaultMetadata(track: TrackRef): EditableMetadata {
  return {
    title: track.title,
    artists: track.artists.length ? [...track.artists] : ['未知歌手'],
    album: track.album || '',
    albumArtist: track.artists[0] || '',
    trackNo: undefined,
    trackTotal: undefined,
    discNo: undefined,
    discTotal: undefined,
    year: undefined,
    genre: undefined,
    lyrics: undefined
  }
}

export function trackKey(provider: ProviderId, native: Record<string, unknown>): string {
  const id =
    native.songmid ??
    native.songId ??
    native.hash ??
    native.copyrightId ??
    native.audioId ??
    JSON.stringify(native).slice(0, 80)
  return `${provider}:${String(id)}`
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as ProviderId)
}

export function parseSourceHeader(script: string): {
  name: string
  description?: string
  version?: string
  author?: string
  homepage?: string
} {
  const pick = (key: string) => {
    const match = script.match(new RegExp(`@${key}\\s+([^\\n\\r*]+)`))
    return match?.[1]?.trim()
  }
  return {
    name: pick('name') || '未命名音源',
    description: pick('description'),
    version: pick('version'),
    author: pick('author'),
    homepage: pick('homepage')
  }
}

const LINK_RULES: Array<{
  provider: ProviderId
  kind: 'album' | 'playlist'
  host?: RegExp
  pattern: RegExp
}> = [
  { provider: 'wy', kind: 'album', host: /music\.163\.com|y\.music\.163\.com/, pattern: /album[^\d]*(\d+)/i },
  { provider: 'wy', kind: 'playlist', host: /music\.163\.com|y\.music\.163\.com/, pattern: /playlist[^\d]*(\d+)/i },
  { provider: 'tx', kind: 'album', host: /y\.qq\.com|i\.y\.qq\.com/, pattern: /albumDetail\/([A-Za-z0-9]+)/i },
  { provider: 'tx', kind: 'playlist', host: /y\.qq\.com|i\.y\.qq\.com/, pattern: /(?:playlist\/|id=)(\d+)/i },
  { provider: 'kw', kind: 'album', host: /kuwo\.cn/, pattern: /album_detail\/(\d+)/i },
  { provider: 'kw', kind: 'playlist', host: /kuwo\.cn/, pattern: /playlist(?:_detail)?\/(\d+)/i },
  {
    provider: 'kg',
    kind: 'album',
    host: /kugou\.com/,
    pattern: /album(?:_detail)?\/(?:single\/)?(\d+)/i
  },
  { provider: 'kg', kind: 'playlist', host: /kugou\.com/, pattern: /(?:special\/single|songlist)\/(?:id_)?(\d+)/i },
  { provider: 'mg', kind: 'album', host: /migu\.cn/, pattern: /album\/(\d+)/i },
  { provider: 'mg', kind: 'playlist', host: /migu\.cn/, pattern: /(?:playlist|playlistId=)[^\d]*(\d+)/i }
]

export function parseCatalogLink(value: string): {
  provider: ProviderId
  kind: 'album' | 'playlist'
  id: string
} | null {
  const text = value.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  for (const rule of LINK_RULES) {
    if (rule.host && !rule.host.test(url.hostname)) continue
    const match = text.match(rule.pattern)
    if (match?.[1]) return { provider: rule.provider, kind: rule.kind, id: match[1] }
  }
  return null
}

export function inferCatalogKind(provider: ProviderId, value: string): 'album' | 'playlist' {
  if (/album/i.test(value)) return 'album'
  if (/playlist|special|songlist|taoge/i.test(value)) return 'playlist'
  return provider === 'wy' ? 'playlist' : 'album'
}

export function emptyCatalog(provider: ProviderId, kind: 'album' | 'playlist', id: string): CatalogInfo {
  return { provider, kind, id, name: '未命名', total: 0, tracks: [] }
}

export function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s'"“”‘’.,，。、&()（）[\]【】!！?？~～\-_|/\\]/g, '')
    .replace(/feat\.?|ft\.?|live|remaster(ed)?|version|版/gi, '')
}

export function diceCoefficient(left: string, right: string): number {
  const a = normalizeComparable(left)
  const b = normalizeComparable(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const pairs = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2)
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2)
    const count = pairs.get(pair) ?? 0
    if (count > 0) {
      pairs.set(pair, count - 1)
      hits++
    }
  }
  return (2 * hits) / (a.length + b.length - 2)
}

export function matchScore(input: {
  title: string
  artist: string
  durationSec?: number
}, candidate: {
  title: string
  artist: string
  durationSec?: number
}): number {
  const titleScore = diceCoefficient(input.title, candidate.title)
  const artistScore = diceCoefficient(input.artist, candidate.artist)
  const durationScore =
    input.durationSec && candidate.durationSec
      ? Math.max(0, 1 - Math.abs(input.durationSec - candidate.durationSec) / 15)
      : 0.5
  return titleScore * 0.55 + artistScore * 0.3 + durationScore * 0.15
}

export function clampPreviewPosition(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_PREVIEW_SECONDS, Math.max(0, value))
}

export function isUploadActive(stage: UploadStage): boolean {
  return ['resolving', 'downloading', 'tagging', 'uploading'].includes(stage)
}

export function summarizeUploads(drafts: UploadDraft[]): UploadBatchSummary {
  return {
    batchId: drafts[0]?.batchId ?? '',
    total: drafts.length,
    success: drafts.filter(draft => draft.stage === 'completed').length,
    failed: drafts.filter(draft => draft.stage === 'failed').length,
    skipped: drafts.filter(draft => draft.stage === 'skipped').length,
    running: drafts.filter(
      draft =>
        isUploadActive(draft.stage) ||
        draft.stage === 'queued'
    ).length
  }
}
