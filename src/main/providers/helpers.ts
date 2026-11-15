import type { Quality, SearchEntityRef, TrackRef } from '@shared/types'
import {
  formatDuration,
  parseDuration,
  splitArtists,
  trackKey
} from '@shared/utils'

export interface ProviderSongInput {
  provider: TrackRef['provider']
  native: Record<string, unknown>
  title: string
  singer: string
  album?: string
  albumId?: string
  durationSec?: number
  coverUrl?: string
  qualities?: Quality[]
  id?: unknown
}

export function makeTrack(input: ProviderSongInput): TrackRef {
  const artists = splitArtists(input.singer)
  const native: Record<string, unknown> = {
    ...input.native,
    name: input.title,
    singer: artists.join('、'),
    albumName: input.album ?? '',
    interval: input.durationSec ? formatDuration(input.durationSec) : null,
    source: input.provider,
    types: input.native.types ?? [],
    _types: input.native._types ?? {},
    typeUrl: {}
  }
  return {
    key: trackKey(input.provider, {
      ...native,
      songmid: input.id ?? native.songmid ?? native.songId ?? native.hash
    }),
    provider: input.provider,
    native,
    title: input.title || '未知歌曲',
    artists: artists.length ? artists : ['未知歌手'],
    album: input.album,
    albumId: input.albumId,
    durationSec: input.durationSec,
    coverUrl: input.coverUrl,
    availableQualities: input.qualities
  }
}

export function makeTypes(
  entries: Array<{ type: Quality; size?: string | null; hash?: string }>
): {
  types: Array<{ type: Quality; size?: string | null; hash?: string }>
  typesMap: Record<string, { size?: string | null; hash?: string }>
} {
  const types = entries
  const typesMap: Record<string, { size?: string | null; hash?: string }> = {}
  for (const entry of entries) {
    typesMap[entry.type] = {
      size: entry.size ?? null,
      ...(entry.hash ? { hash: entry.hash } : {})
    }
  }
  return { types, typesMap }
}

export function formatSize(bytes: unknown): string | null {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}G`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}M`
  return `${(value / 1024).toFixed(0)}K`
}

export function decodeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
    .replace(/\u0000/g, '')
    .trim()
}

export function parseInterval(value: unknown): number | undefined {
  const parsed = parseDuration(value)
  return parsed === undefined ? undefined : Math.round(parsed)
}

export function trimTitleSuffix(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function makeEntity(input: Omit<SearchEntityRef, 'key'>): SearchEntityRef {
  return {
    ...input,
    key: `${input.provider}:${input.kind}:${input.id}`
  }
}

export function positiveNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
